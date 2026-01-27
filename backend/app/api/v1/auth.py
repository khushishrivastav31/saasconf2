"""Authentication endpoints."""

from datetime import datetime

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    get_client_ip,
)
from app.core.exceptions import AuthenticationError
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.models.audit import AuditAction, AuditLog
from app.models.module import TenantModule
from app.models.token import RefreshToken
from app.models.user import User
from app.schemas.auth import LoginRequest, RefreshRequest, TokenResponse, UserResponse

settings = get_settings()
router = APIRouter()


@router.post("/login", response_model=TokenResponse)
async def login(
    request: Request,
    login_data: LoginRequest,
    db: DbSessionDep,
) -> TokenResponse:
    """
    Authenticate user and return access/refresh tokens.

    Rate limited to prevent brute force attacks.
    """
    # Find user by email
    result = await db.execute(select(User).where(User.email == login_data.email))
    user = result.scalar_one_or_none()

    client_ip = get_client_ip(request)
    user_agent = request.headers.get("User-Agent")

    if not user or not verify_password(login_data.password, user.password_hash):
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

    # Get user's modules if they belong to a tenant
    modules: list[str] = []
    if user.tenant_id:
        result = await db.execute(
            select(TenantModule)
            .where(TenantModule.tenant_id == user.tenant_id)
            .where(TenantModule.is_enabled == True)
        )
        tenant_modules = result.scalars().all()
        # We need to load the module codes
        for tm in tenant_modules:
            await db.refresh(tm, ["module"])
            if tm.module:
                modules.append(tm.module.code)

    # Create tokens
    access_token = create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role,
        modules=modules,
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
    user.last_login = datetime.utcnow()

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


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    refresh_data: RefreshRequest,
    db: DbSessionDep,
) -> TokenResponse:
    """
    Refresh access token using refresh token.

    The refresh token is validated and a new access token is issued.
    """
    # Decode refresh token
    payload = decode_token(refresh_data.refresh_token, token_type="refresh")
    user_id = payload["sub"]

    # Verify refresh token exists and is valid
    token_hash = hash_token(refresh_data.refresh_token)
    result = await db.execute(
        select(RefreshToken)
        .where(RefreshToken.token_hash == token_hash)
        .where(RefreshToken.revoked_at.is_(None))
    )
    db_token = result.scalar_one_or_none()

    if not db_token or not db_token.is_valid:
        raise AuthenticationError("Invalid or expired refresh token")

    # Get user
    result = await db.execute(select(User).where(User.id == db_token.user_id))
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise AuthenticationError("User not found or deactivated")

    # Get user's modules
    modules: list[str] = []
    if user.tenant_id:
        result = await db.execute(
            select(TenantModule)
            .where(TenantModule.tenant_id == user.tenant_id)
            .where(TenantModule.is_enabled == True)
        )
        tenant_modules = result.scalars().all()
        for tm in tenant_modules:
            await db.refresh(tm, ["module"])
            if tm.module:
                modules.append(tm.module.code)

    # Create new access token
    access_token = create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role,
        modules=modules,
    )

    # Optionally rotate refresh token (for enhanced security)
    new_refresh_token, new_token_hash, expires_at = create_refresh_token(
        user_id=user.id
    )

    # Revoke old refresh token
    db_token.revoked_at = datetime.utcnow()

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

    for token in tokens:
        token.revoked_at = datetime.utcnow()

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

    # Get tenant name and fresh modules from database
    tenant_name = None
    modules: list[str] = []
    if user.tenant_id:
        await db.refresh(user, ["tenant"])
        if user.tenant:
            tenant_name = user.tenant.name

        # Load modules from DB so assignments are reflected immediately
        result = await db.execute(
            select(TenantModule)
            .where(TenantModule.tenant_id == user.tenant_id)
            .where(TenantModule.is_enabled == True)
        )
        tenant_modules = result.scalars().all()
        for tm in tenant_modules:
            await db.refresh(tm, ["module"])
            if tm.module:
                modules.append(tm.module.code)

    return UserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        tenant_id=user.tenant_id,
        tenant_name=tenant_name,
        modules=modules,
        is_active=user.is_active,
        last_login=user.last_login,
        created_at=user.created_at,
    )
