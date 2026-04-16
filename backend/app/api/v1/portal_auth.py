"""Unified portal auth endpoints — login, refresh, forgot/reset password, profile.

Works with portal_users table (unified across conferences + trainings).
Uses portal_access / portal_refresh JWT token types.
"""

import hashlib
import logging
from datetime import timedelta
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import func, select

from app.config import get_settings
from app.core.dependencies import DbSessionDep
from app.core.exceptions import AuthenticationError
from app.core.portal_security import (
    create_portal_access_token,
    create_portal_refresh_token,
    decode_portal_token,
    generate_password_reset_token,
)
from app.core.security import hash_password, verify_password
from app.core.utils import utcnow
from app.db.session import set_rls_context
from app.models.portal_user import PortalRefreshToken, PortalUser
from app.models.tenant import Tenant

logger = logging.getLogger(__name__)

router = APIRouter(tags=["portal-auth"])
limiter = Limiter(key_func=get_remote_address)

portal_settings = get_settings()


# ── Schemas ──────────────────────────────────────────────────────────────────


class PortalLoginRequest(BaseModel):
    email: str
    password: str


class PortalTokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class PortalRefreshRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    password: str


class SetPasswordRequest(BaseModel):
    token: str
    password: str


# ── Helpers ──────────────────────────────────────────────────────────────────


async def _resolve_tenant(db: DbSessionDep, tenant_slug: str) -> Tenant:
    result = await db.execute(select(Tenant).where(Tenant.slug == tenant_slug, Tenant.is_active.is_(True)))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Organization not found")
    return tenant


async def _issue_tokens(db: DbSessionDep, portal_user: PortalUser) -> PortalTokenResponse:
    """Create access + refresh tokens and store refresh hash in DB."""
    access_token = create_portal_access_token(portal_user.id, portal_user.tenant_id)
    raw_refresh, refresh_hash, refresh_expires = create_portal_refresh_token(portal_user.id)

    # Store refresh token hash
    db.add(
        PortalRefreshToken(
            portal_user_id=portal_user.id,
            token_hash=refresh_hash,
            expires_at=refresh_expires,
        )
    )

    # Update last login
    portal_user.last_login_at = utcnow()

    return PortalTokenResponse(
        access_token=access_token,
        refresh_token=raw_refresh,
        expires_in=portal_settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.post("/portal/{tenant_slug}/login")
@limiter.limit("5/minute")
async def portal_login(
    request: Request,
    tenant_slug: str,
    data: PortalLoginRequest,
    db: DbSessionDep,
) -> PortalTokenResponse:
    """Authenticate a portal user and return JWT tokens."""
    tenant = await _resolve_tenant(db, tenant_slug)
    await set_rls_context(db, tenant_id=str(tenant.id), is_super_admin=False)

    normalized_email = data.email.strip().lower()

    result = await db.execute(
        select(PortalUser).where(
            PortalUser.tenant_id == tenant.id,
            func.lower(PortalUser.email) == normalized_email,
        )
    )
    user = result.scalar_one_or_none()

    if not user or not user.password_hash:
        raise AuthenticationError("Invalid email or password")

    if not verify_password(data.password, user.password_hash):
        raise AuthenticationError("Invalid email or password")

    if not user.is_active:
        raise AuthenticationError("Your account has been deactivated")

    tokens = await _issue_tokens(db, user)
    await db.commit()

    logger.info("Portal login: %s (tenant %s)", normalized_email, tenant.slug)
    return tokens


@router.post("/portal/{tenant_slug}/refresh")
@limiter.limit("10/minute")
async def portal_refresh(
    request: Request,
    tenant_slug: str,
    data: PortalRefreshRequest,
    db: DbSessionDep,
) -> PortalTokenResponse:
    """Refresh an access token using a valid refresh token."""
    tenant = await _resolve_tenant(db, tenant_slug)

    # Decode refresh token
    payload = decode_portal_token(data.refresh_token, token_type="portal_refresh")
    portal_user_id = UUID(payload["sub"])

    # Verify refresh token hash exists in DB
    token_hash = hashlib.sha256(data.refresh_token.encode()).hexdigest()
    result = await db.execute(
        select(PortalRefreshToken).where(
            PortalRefreshToken.portal_user_id == portal_user_id,
            PortalRefreshToken.token_hash == token_hash,
            PortalRefreshToken.expires_at > utcnow(),
        )
    )
    stored_token = result.scalar_one_or_none()
    if not stored_token:
        raise AuthenticationError("Invalid or expired refresh token")

    # Revoke old refresh token
    await db.delete(stored_token)

    # Get user
    user = await db.get(PortalUser, portal_user_id)
    if not user or not user.is_active or user.tenant_id != tenant.id:
        raise AuthenticationError("Account not found or deactivated")

    tokens = await _issue_tokens(db, user)
    await db.commit()

    return tokens


@router.post("/portal/{tenant_slug}/forgot-password")
@limiter.limit("3/minute")
async def portal_forgot_password(
    request: Request,
    tenant_slug: str,
    data: ForgotPasswordRequest,
    db: DbSessionDep,
) -> dict:
    """Request a password reset email. Always returns success (prevents enumeration)."""
    tenant = await _resolve_tenant(db, tenant_slug)
    await set_rls_context(db, tenant_id=str(tenant.id), is_super_admin=False)

    normalized_email = data.email.strip().lower()

    result = await db.execute(
        select(PortalUser).where(
            PortalUser.tenant_id == tenant.id,
            func.lower(PortalUser.email) == normalized_email,
        )
    )
    user = result.scalar_one_or_none()

    if user:
        raw_token, token_hash = generate_password_reset_token()
        # Store token as a refresh token with short expiry (reuse table)
        db.add(
            PortalRefreshToken(
                portal_user_id=user.id,
                token_hash=token_hash,
                expires_at=utcnow() + timedelta(hours=1),
            )
        )
        await db.commit()

        # Send password reset email (best-effort)
        try:
            from app.core.email import send_email

            reset_url = f"{portal_settings.PORTAL_BASE_URL}/{tenant_slug}/portal/reset-password?token={raw_token}"
            await send_email(
                to=user.email,
                subject="Reset your password",
                html=f"""<p>Hi {user.first_name},</p>
<p>Click the link below to reset your password:</p>
<p><a href="{reset_url}" style="display: inline-block; padding: 12px 24px;
background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px;
font-weight: bold;">Reset Password</a></p>
<p>This link expires in 1 hour.</p>
<p>If you didn't request this, please ignore this email.</p>""",
                tenant_from_name=tenant.name,
            )
        except Exception as exc:
            logger.warning("Failed to send portal password reset email to %s: %s", user.email, exc)

    return {"message": "If an account with this email exists, a password reset link has been sent."}


@router.post("/portal/{tenant_slug}/reset-password")
@limiter.limit("5/minute")
async def portal_reset_password(
    request: Request,
    tenant_slug: str,
    data: ResetPasswordRequest,
    db: DbSessionDep,
) -> dict:
    """Reset password using a valid reset token."""
    tenant = await _resolve_tenant(db, tenant_slug)
    await set_rls_context(db, tenant_id=str(tenant.id), is_super_admin=False)

    token_hash = hashlib.sha256(data.token.encode()).hexdigest()

    # Find valid token
    result = await db.execute(
        select(PortalRefreshToken).where(
            PortalRefreshToken.token_hash == token_hash,
            PortalRefreshToken.expires_at > utcnow(),
        )
    )
    stored_token = result.scalar_one_or_none()
    if not stored_token:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    # Get user
    user = await db.get(PortalUser, stored_token.portal_user_id)
    if not user or user.tenant_id != tenant.id:
        raise HTTPException(status_code=400, detail="Invalid reset token")

    # Update password
    user.password_hash = hash_password(data.password)
    if not user.email_verified_at:
        user.email_verified_at = utcnow()

    # Revoke the token
    await db.delete(stored_token)
    await db.commit()

    logger.info("Portal password reset: %s (tenant %s)", user.email, tenant.slug)
    return {"message": "Password reset successfully. You can now log in."}


# ── Authenticated Endpoints ──────────────────────────────────────────────────


async def _get_current_portal_user(request: Request, db: DbSessionDep) -> PortalUser:
    """Extract and validate portal user from Authorization header."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise AuthenticationError("Missing or invalid authorization header")

    token = auth_header[7:]
    payload = decode_portal_token(token, token_type="portal_access")
    portal_user_id = UUID(payload["sub"])

    user = await db.get(PortalUser, portal_user_id)
    if not user or not user.is_active:
        raise AuthenticationError("Account not found or deactivated")

    # Set RLS context
    await set_rls_context(db, tenant_id=str(user.tenant_id), is_super_admin=False)

    return user


@router.get("/portal/me")
async def get_portal_profile(
    request: Request,
    db: DbSessionDep,
) -> dict:
    """Get current portal user profile with linked conference + training data."""
    user = await _get_current_portal_user(request, db)

    # Get linked training attendee info
    from app.models.training_attendee import TrainingAttendee

    ta_result = await db.execute(select(TrainingAttendee).where(TrainingAttendee.portal_user_id == user.id))
    training_attendee = ta_result.scalar_one_or_none()

    # Get linked CFP applicant info
    from app.models.cfp_applicants import CFPApplicant

    cfp_result = await db.execute(select(CFPApplicant).where(CFPApplicant.portal_user_id == user.id))
    cfp_applicant = cfp_result.scalar_one_or_none()

    return {
        "id": str(user.id),
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "phone": user.phone,
        "is_active": user.is_active,
        "email_verified": user.email_verified_at is not None,
        "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "has_training_account": training_attendee is not None,
        "has_conference_account": cfp_applicant is not None,
        "training_attendee_id": str(training_attendee.id) if training_attendee else None,
        "training_attendee_status": training_attendee.status if training_attendee else None,
        "cfp_applicant_id": str(cfp_applicant.id) if cfp_applicant else None,
    }
