"""Authentication endpoints."""

import hashlib
from datetime import timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.core.applicant_security import generate_email_verification_token
from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    get_client_ip,
    get_token_from_header,
)
from app.core.email import send_password_reset_email
from app.core.exceptions import AuthenticationError
from app.core.mfa import decrypt_secret, verify_recovery_code, verify_totp_code
from app.core.rate_limiter import limiter
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.core.token_blacklist import blacklist_token, clear_failed_logins, is_account_locked, record_failed_login
from app.core.utils import utcnow
from app.models.audit import AuditAction, AuditLog
from app.models.module import TenantModule
from app.models.tenant import Tenant
from app.models.token import RefreshToken
from app.models.user import User
from app.models.user_password_reset import UserPasswordReset
from app.models.user_tenant_role import UserTenantRole
from app.models.user_totp import UserTOTP
from app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    MFALoginResponse,
    MFAVerifyRequest,
    RefreshRequest,
    ResetPasswordRequest,
    TenantRoleResponse,
    TokenResponse,
    UserPreferencesUpdate,
    UserResponse,
)

settings = get_settings()
router = APIRouter()


async def _load_tenant_roles(db: AsyncSession, user_id: UUID) -> list[dict[str, str]]:
    """Load user's tenant roles as a list of {scope, level} dicts for JWT embedding."""
    result = await db.execute(select(UserTenantRole).where(UserTenantRole.user_id == user_id))
    return [{"scope": r.scope, "level": r.level} for r in result.scalars().all()]


@router.post("/login", response_model=TokenResponse)
@limiter.limit("30/minute")
async def login(
    request: Request,
    login_data: LoginRequest,
    db: DbSessionDep,
) -> TokenResponse:
    """
    Authenticate user and return access/refresh tokens.

    Rate limited to prevent brute force attacks.
    Account locked for 15 minutes after 5 consecutive failures.
    """
    client_ip = get_client_ip(request)
    user_agent = request.headers.get("User-Agent")

    # Check account lockout before expensive password verification
    if await is_account_locked(login_data.email):
        raise AuthenticationError("Account temporarily locked due to too many failed login attempts. Try again later.")

    # Find user by email
    result = await db.execute(select(User).where(func.lower(User.email) == login_data.email.strip().lower()))
    user = result.scalar_one_or_none()

    if not user or not verify_password(login_data.password, user.password_hash):
        # Track failed attempt for lockout
        await record_failed_login(login_data.email)

        # Log failed login attempt
        audit_log = AuditLog(
            tenant_id=None,
            user_id=None,
            action=AuditAction.USER_LOGIN_FAILED,
            details={"email": login_data.email, "reason": "invalid_credentials"},
            ip_address=client_ip,
            user_agent=user_agent,
        )
        db.add(audit_log)
        await db.commit()

        raise AuthenticationError("Invalid email or password")

    if not user.is_active:
        raise AuthenticationError("User account is deactivated")

    # Check if the user's tenant is active and if user is tenant super user
    is_tenant_super_user = False
    if user.tenant_id:
        tenant_result = await db.execute(select(Tenant).where(Tenant.id == user.tenant_id))
        tenant = tenant_result.scalar_one_or_none()
        if not tenant or not tenant.is_active:
            raise AuthenticationError("Your company account has been deactivated")
        # Check if user is the designated tenant super user
        is_tenant_super_user = tenant.super_user_id == user.id

    # Clear lockout counter on successful authentication
    await clear_failed_logins(login_data.email)

    # Get user's modules if they belong to a tenant
    modules: list[str] = []
    if user.tenant_id:
        result = await db.execute(
            select(TenantModule)
            .where(TenantModule.tenant_id == user.tenant_id)
            .where(TenantModule.is_enabled == True)
            .options(selectinload(TenantModule.module))
        )
        tenant_modules = result.scalars().all()
        for tm in tenant_modules:
            if tm.module:
                modules.append(tm.module.code)

    # Load tenant roles for JWT
    tenant_roles = await _load_tenant_roles(db, user.id)

    # Check if MFA is enabled — if so, return a temporary MFA token
    totp_result = await db.execute(select(UserTOTP).where(UserTOTP.user_id == user.id, UserTOTP.is_verified.is_(True)))
    if totp_result.scalar_one_or_none():
        mfa_token = create_access_token(
            user_id=user.id,
            tenant_id=user.tenant_id,
            role=user.role,
            modules=modules,
            is_tenant_super_user=is_tenant_super_user,
            tenant_roles=tenant_roles,
            token_type="mfa_pending",
            expires_minutes=5,
        )
        return MFALoginResponse(mfa_token=mfa_token)  # type: ignore[return-value]

    # Create tokens (no MFA)
    access_token = create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role,
        modules=modules,
        is_tenant_super_user=is_tenant_super_user,
        tenant_roles=tenant_roles,
    )

    refresh_token, token_hash, expires_at = create_refresh_token(user_id=user.id)

    # Store refresh token
    db_refresh_token = RefreshToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    db.add(db_refresh_token)

    # Update last login
    user.last_login = utcnow()

    # Log successful login
    audit_log = AuditLog(
        tenant_id=user.tenant_id,
        user_id=user.id,
        action=AuditAction.USER_LOGIN,
        resource_type="user",
        resource_id=user.id,
        ip_address=client_ip,
        user_agent=user_agent,
    )
    db.add(audit_log)

    await db.commit()

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/mfa/verify-login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def mfa_verify_login(
    request: Request,
    data: MFAVerifyRequest,
    db: DbSessionDep,
) -> TokenResponse:
    """Complete login by verifying a TOTP code (or recovery code).

    Accepts the ``mfa_token`` returned by ``/auth/login`` when MFA is required.
    """
    # Decode the mfa_pending token
    try:
        payload = decode_token(data.mfa_token, token_type="mfa_pending")
    except Exception as exc:
        raise AuthenticationError("Invalid or expired MFA token. Please log in again.") from exc

    user_id = payload["sub"]
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise AuthenticationError("Invalid MFA token")

    # Load TOTP record
    totp_result = await db.execute(select(UserTOTP).where(UserTOTP.user_id == user.id, UserTOTP.is_verified.is_(True)))
    totp_record = totp_result.scalar_one_or_none()
    if not totp_record:
        raise AuthenticationError("MFA is not enabled for this account")

    # Try TOTP code first, then recovery code
    raw_secret = decrypt_secret(totp_record.encrypted_secret)
    code_valid = verify_totp_code(raw_secret, data.code)

    if not code_valid and totp_record.recovery_codes:
        matched, remaining = verify_recovery_code(data.code, totp_record.recovery_codes)
        if matched:
            code_valid = True
            totp_record.recovery_codes = remaining

    if not code_valid:
        raise AuthenticationError("Invalid MFA code")

    # MFA verified — issue full tokens
    access_token = create_access_token(
        user_id=user.id,
        tenant_id=payload.get("tenant_id"),
        role=payload["role"],
        modules=payload.get("modules", []),
        is_tenant_super_user=payload.get("is_tenant_super_user", False),
        tenant_roles=payload.get("tenant_roles", []),
    )

    refresh_tok, tok_hash, expires_at = create_refresh_token(user_id=user.id)
    db.add(RefreshToken(user_id=user.id, token_hash=tok_hash, expires_at=expires_at))

    user.last_login = utcnow()

    client_ip = get_client_ip(request)
    db.add(
        AuditLog(
            tenant_id=user.tenant_id,
            user_id=user.id,
            action=AuditAction.USER_LOGIN,
            resource_type="user",
            resource_id=user.id,
            details={"mfa": True},
            ip_address=client_ip,
            user_agent=request.headers.get("User-Agent"),
        )
    )

    await db.commit()

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_tok,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("10/minute")
async def refresh_token(
    request: Request,
    refresh_data: RefreshRequest,
    db: DbSessionDep,
) -> TokenResponse:
    """
    Refresh access token using refresh token.

    The refresh token is validated and a new access token is issued.
    """
    # Decode refresh token (validates token; raises on invalid)
    decode_token(refresh_data.refresh_token, token_type="refresh")

    # Verify refresh token exists and is valid
    token_hash = hash_token(refresh_data.refresh_token)
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash).where(RefreshToken.revoked_at.is_(None))
    )
    db_token = result.scalar_one_or_none()

    if not db_token or not db_token.is_valid:
        raise AuthenticationError("Invalid or expired refresh token")

    # Get user
    result = await db.execute(select(User).where(User.id == db_token.user_id))
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise AuthenticationError("User not found or deactivated")

    # Check if the user's tenant is active and if user is tenant super user
    is_tenant_super_user = False
    if user.tenant_id:
        tenant_result = await db.execute(select(Tenant).where(Tenant.id == user.tenant_id))
        tenant = tenant_result.scalar_one_or_none()
        if not tenant or not tenant.is_active:
            raise AuthenticationError("Your company account has been deactivated")
        # Check if user is the designated tenant super user
        is_tenant_super_user = tenant.super_user_id == user.id

    # Get user's modules
    modules: list[str] = []
    if user.tenant_id:
        result = await db.execute(
            select(TenantModule)
            .where(TenantModule.tenant_id == user.tenant_id)
            .where(TenantModule.is_enabled == True)
            .options(selectinload(TenantModule.module))
        )
        tenant_modules = result.scalars().all()
        for tm in tenant_modules:
            if tm.module:
                modules.append(tm.module.code)

    # Load fresh tenant roles
    tenant_roles = await _load_tenant_roles(db, user.id)

    # Create new access token
    access_token = create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role,
        modules=modules,
        is_tenant_super_user=is_tenant_super_user,
        tenant_roles=tenant_roles,
    )

    # Optionally rotate refresh token (for enhanced security)
    new_refresh_token, new_token_hash, expires_at = create_refresh_token(user_id=user.id)

    # Revoke old refresh token
    db_token.revoked_at = utcnow()

    # Store new refresh token
    new_db_token = RefreshToken(
        user_id=user.id,
        token_hash=new_token_hash,
        expires_at=expires_at,
    )
    db.add(new_db_token)

    await db.commit()

    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/logout")
async def logout(
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
    token: Annotated[str, Depends(get_token_from_header)],
) -> dict:
    """
    Logout user by revoking their refresh tokens.
    """
    # Revoke all refresh tokens for this user
    result = await db.execute(
        select(RefreshToken)
        .where(RefreshToken.user_id == current_user.user_id)
        .where(RefreshToken.revoked_at.is_(None))
    )
    tokens = result.scalars().all()

    for tk in tokens:
        tk.revoked_at = utcnow()

    # Blacklist the current access token
    try:
        payload = decode_token(token, token_type="access")
        jti = payload.get("jti")
        if jti:
            exp = payload.get("exp", 0)
            remaining = int(exp - utcnow().timestamp())
            if remaining > 0:
                await blacklist_token(jti, remaining)
    except Exception:
        pass  # Don't fail logout if blacklisting fails

    # Log logout
    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action=AuditAction.USER_LOGOUT,
        resource_type="user",
        resource_id=current_user.user_id,
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()

    return {"message": "Successfully logged out"}


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> UserResponse:
    """
    Get current user information.
    """
    result = await db.execute(select(User).where(User.id == current_user.user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise AuthenticationError("User not found")

    # Check MFA status
    totp_result = await db.execute(select(UserTOTP).where(UserTOTP.user_id == user.id, UserTOTP.is_verified.is_(True)))
    mfa_enabled = totp_result.scalar_one_or_none() is not None

    # Get tenant name, super user status, and fresh modules from database
    tenant_name = None
    is_tenant_super_user = False
    modules: list[str] = []
    if user.tenant_id:
        await db.refresh(user, ["tenant"])
        if user.tenant:
            tenant_name = user.tenant.name
            # Check if user is the designated tenant super user
            is_tenant_super_user = user.tenant.super_user_id == user.id

        # Load modules from DB so assignments are reflected immediately
        result = await db.execute(
            select(TenantModule)
            .where(TenantModule.tenant_id == user.tenant_id)
            .where(TenantModule.is_enabled == True)
            .options(selectinload(TenantModule.module))
        )
        tenant_modules = result.scalars().all()
        for tm in tenant_modules:
            if tm.module:
                modules.append(tm.module.code)

    # Load fresh tenant roles from DB
    tenant_roles = await _load_tenant_roles(db, user.id)

    return UserResponse(
        id=user.id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        pronouns=user.pronouns,
        role=user.role,
        tenant_id=user.tenant_id,
        tenant_name=tenant_name,
        modules=modules,
        is_active=user.is_active,
        is_tenant_super_user=is_tenant_super_user,
        tenant_roles=[TenantRoleResponse(scope=r["scope"], level=r["level"]) for r in tenant_roles],
        mfa_enabled=mfa_enabled,
        message_notifications_enabled=user.message_notifications_enabled,
        theme_preference=user.theme_preference,
        last_login=user.last_login,
        created_at=user.created_at,
    )


@router.patch("/me/preferences", response_model=UserResponse)
async def update_user_preferences(
    data: UserPreferencesUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> UserResponse:
    """Update current user's preferences (notification settings, theme)."""
    result = await db.execute(select(User).where(User.id == current_user.user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise AuthenticationError("User not found")

    if data.message_notifications_enabled is not None:
        user.message_notifications_enabled = data.message_notifications_enabled

    if "theme_preference" in data.model_fields_set:
        user.theme_preference = data.theme_preference if data.theme_preference in ("light", "dark") else None

    await db.commit()
    await db.refresh(user)

    return await get_current_user_info(current_user, db)


@router.patch("/me/password")
async def change_password(
    data: ChangePasswordRequest,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Change password for the currently authenticated user.

    Requires the current password for verification.
    Revokes all refresh tokens on success (force re-login on other devices).
    """
    result = await db.execute(select(User).where(User.id == current_user.user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise AuthenticationError("User not found")

    # Verify current password
    if not verify_password(data.current_password, user.password_hash):
        raise AuthenticationError("Current password is incorrect")

    # Prevent setting the same password
    if verify_password(data.new_password, user.password_hash):
        raise AuthenticationError("New password must be different from current password")

    # Update password
    user.password_hash = hash_password(data.new_password)

    # Revoke all refresh tokens (force re-login on other devices)
    active_tokens_result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.user_id == user.id,
            RefreshToken.revoked_at.is_(None),
        )
    )
    for rt in active_tokens_result.scalars().all():
        rt.revoked_at = utcnow()

    # Audit log
    db.add(
        AuditLog(
            tenant_id=user.tenant_id,
            user_id=user.id,
            action=AuditAction.USER_PASSWORD_CHANGED,
            resource_type="user",
            resource_id=user.id,
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent"),
        )
    )

    await db.commit()
    return {"message": "Password changed successfully"}


@router.post("/forgot-password")
@limiter.limit("1/minute")
async def forgot_password(
    request: Request,
    data: ForgotPasswordRequest,
    db: DbSessionDep,
) -> dict:
    """Request a password reset email.

    Always returns success to prevent email enumeration.
    Rate limited to 3 requests per minute.
    """
    # Always return the same message regardless of whether user exists
    success_message = "If an account with this email exists, a password reset link has been sent."

    result = await db.execute(select(User).where(func.lower(User.email) == data.email.strip().lower()))
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        return {"message": success_message}

    # Invalidate any previous unused reset tokens for this user
    prev_tokens = await db.execute(
        select(UserPasswordReset).where(
            UserPasswordReset.user_id == user.id,
            UserPasswordReset.used_at.is_(None),
        )
    )
    for prev in prev_tokens.scalars().all():
        prev.used_at = utcnow()

    # Generate token
    raw_token, token_hash = generate_email_verification_token()

    # Store reset token (1 hour expiry)
    reset = UserPasswordReset(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=utcnow() + timedelta(hours=1),
    )
    db.add(reset)

    # Build admin reset URL
    frontend_base = settings.FRONTEND_BASE_URL
    admin_reset_url = f"{frontend_base}/reset-password?token={raw_token}"

    # Get tenant name for email context
    tenant_name = "SaaSConf"
    if user.tenant_id:
        tenant_result = await db.execute(select(Tenant.name).where(Tenant.id == user.tenant_id))
        row = tenant_result.scalar_one_or_none()
        if row:
            tenant_name = row

    # Send email
    await send_password_reset_email(
        db,
        email=user.email,
        token=raw_token,
        company_name=tenant_name,
        first_name=user.first_name or "",
        last_name=user.last_name or "",
        reset_url=admin_reset_url,
    )

    # Audit log
    db.add(
        AuditLog(
            tenant_id=user.tenant_id,
            user_id=user.id,
            action=AuditAction.USER_PASSWORD_RESET_REQUESTED,
            resource_type="user",
            resource_id=user.id,
            details={"email": user.email},
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent"),
        )
    )

    await db.commit()
    return {"message": success_message}


@router.post("/reset-password")
@limiter.limit("5/minute")
async def reset_password(
    request: Request,
    data: ResetPasswordRequest,
    db: DbSessionDep,
) -> dict:
    """Reset password using a valid reset token."""
    # Hash the provided token to find it in the database
    token_hash = hashlib.sha256(data.token.encode()).hexdigest()

    result = await db.execute(
        select(UserPasswordReset).where(
            UserPasswordReset.token_hash == token_hash,
            UserPasswordReset.used_at.is_(None),
        )
    )
    reset = result.scalar_one_or_none()

    if not reset or not reset.is_valid:
        raise AuthenticationError("Invalid or expired reset token")

    # Load user
    user_result = await db.execute(select(User).where(User.id == reset.user_id))
    user = user_result.scalar_one_or_none()

    if not user:
        raise AuthenticationError("Invalid or expired reset token")

    # Update password and mark token as used
    user.password_hash = hash_password(data.new_password)
    reset.used_at = utcnow()

    # Invalidate all other pending reset tokens for this user
    other_tokens_result = await db.execute(
        select(UserPasswordReset).where(
            UserPasswordReset.user_id == user.id,
            UserPasswordReset.used_at.is_(None),
            UserPasswordReset.id != reset.id,
        )
    )
    for other_token in other_tokens_result.scalars().all():
        other_token.used_at = utcnow()

    # Revoke all active refresh tokens (force re-login everywhere)
    active_tokens_result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.user_id == user.id,
            RefreshToken.revoked_at.is_(None),
        )
    )
    for rt in active_tokens_result.scalars().all():
        rt.revoked_at = utcnow()

    # Audit log
    db.add(
        AuditLog(
            tenant_id=user.tenant_id,
            user_id=user.id,
            action=AuditAction.USER_PASSWORD_RESET_COMPLETED,
            resource_type="user",
            resource_id=user.id,
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent"),
        )
    )

    await db.commit()
    return {"message": "Password has been reset successfully. You can now log in."}
