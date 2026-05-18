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
from app.core.rate_limiter import limiter
from app.core.security import hash_password, verify_password
from app.core.security.pii_crypto import hash_email, read_pii
from app.core.utils import utcnow
from app.db.session import set_rls_context
from app.models.portal_user import PortalRefreshToken, PortalUser
from app.models.tenant import Tenant

logger = logging.getLogger(__name__)

router = APIRouter(tags=["portal-auth"])

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


@router.post("/portal/{tenant_slug}/unified/login")
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
            PortalUser.email_hash == hash_email(data.email),
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


@router.post("/portal/{tenant_slug}/unified/refresh")
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


@router.post("/portal/{tenant_slug}/unified/forgot-password")
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

    result = await db.execute(
        select(PortalUser).where(
            PortalUser.tenant_id == tenant.id,
            PortalUser.email_hash == hash_email(data.email),
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
            user_email = read_pii(user, "email") or ""
            await send_email(
                to=user_email,
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
            logger.warning("Failed to send portal password reset email to %s: %s", user_email, exc)

    return {"message": "If an account with this email exists, a password reset link has been sent."}


@router.post("/portal/{tenant_slug}/unified/setup-password")
@limiter.limit("5/minute")
async def portal_setup_password(
    request: Request,
    tenant_slug: str,
    data: SetPasswordRequest,
    db: DbSessionDep,
) -> dict:
    """Set password for the first time using a welcome-email setup token.

    Only accepts PortalRefreshToken rows with purpose='setup'. A purpose='reset'
    token (from forgot-password flow) is explicitly rejected so the two flows
    cannot be crossed.
    """
    tenant = await _resolve_tenant(db, tenant_slug)
    await set_rls_context(db, tenant_id=str(tenant.id), is_super_admin=False)

    token_hash = hashlib.sha256(data.token.encode()).hexdigest()

    result = await db.execute(
        select(PortalRefreshToken).where(
            PortalRefreshToken.token_hash == token_hash,
            PortalRefreshToken.purpose == "setup",
            PortalRefreshToken.expires_at > utcnow(),
        )
    )
    stored_token = result.scalar_one_or_none()
    if not stored_token:
        raise HTTPException(status_code=400, detail="Invalid or expired setup link")

    user = await db.get(PortalUser, stored_token.portal_user_id)
    if not user or user.tenant_id != tenant.id:
        raise HTTPException(status_code=400, detail="Invalid setup link")

    user.password_hash = hash_password(data.password)
    if not user.email_verified_at:
        user.email_verified_at = utcnow()

    await db.delete(stored_token)
    await db.commit()

    logger.info("Portal password setup complete: user %s (tenant %s)", user.id, tenant.slug)
    return {"message": "Password set successfully. You can now log in."}


@router.post("/portal/{tenant_slug}/unified/reset-password")
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

    logger.info("Portal password reset: %s (tenant %s)", read_pii(user, "email"), tenant.slug)
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


@router.get("/portal/unified/me")
async def get_portal_profile(
    request: Request,
    db: DbSessionDep,
) -> dict:
    """Get current portal user profile with linked conference + training data.

    The unified frontend layout treats this as the single source of truth for
    "who am I" — hence the flattened profile fields (theme, address, bio) that
    the old cfp-only ``/portal/me`` used to return.

    Role flags drive the portal sidebar's per-section visibility — see the
    role matrix in ``.claude/plans``. Each flag is a single SQL ``EXISTS``
    so the response stays fast even for users with many relationships.
    """
    user = await _get_current_portal_user(request, db)

    from sqlalchemy import exists

    from app.core.security.pii_crypto import hash_email
    from app.models.cfp import CFPCommitteeMember
    from app.models.cfp_applicants import CFPApplicant
    from app.models.cfp_papers import CFPPaper, CFPPaperCospeaker, CospeakerInvitationStatus
    from app.models.invoice import Invoice
    from app.models.registration import Registration, RegistrationStatus
    from app.models.training_attendee import TrainingAttendee

    ta_result = await db.execute(select(TrainingAttendee).where(TrainingAttendee.portal_user_id == user.id))
    training_attendee = ta_result.scalar_one_or_none()

    cfp_result = await db.execute(select(CFPApplicant).where(CFPApplicant.portal_user_id == user.id))
    cfp_applicant = cfp_result.scalar_one_or_none()

    # Per-role EXISTS queries. CFP-side flags require a CFPApplicant (the
    # row that owns the papers / committee assignment / invoices). The
    # conference-attendee flag matches against the PortalUser's email so a
    # training-only user who's also been registered for a conference still
    # gets the role.
    is_committee_member = False
    has_papers = False
    has_invoices = False
    if cfp_applicant is not None:
        is_committee_member = bool(
            await db.scalar(
                select(
                    exists().where(
                        CFPCommitteeMember.applicant_id == cfp_applicant.id,
                        CFPCommitteeMember.tenant_id == cfp_applicant.tenant_id,
                    )
                )
            )
        )
        has_papers = bool(
            await db.scalar(
                select(
                    exists().where(
                        CFPPaper.main_speaker_id == cfp_applicant.id,
                    )
                )
            )
        ) or bool(
            await db.scalar(
                select(
                    exists().where(
                        CFPPaperCospeaker.applicant_id == cfp_applicant.id,
                        CFPPaperCospeaker.invitation_status == CospeakerInvitationStatus.ACCEPTED.value,
                    )
                )
            )
        )
        has_invoices = bool(
            await db.scalar(
                select(
                    exists().where(
                        Invoice.tenant_id == cfp_applicant.tenant_id,
                        Invoice.recipient_source_id == cfp_applicant.id,
                        Invoice.recipient_source_type.in_(["speaker", "committee"]),
                        Invoice.status.in_(["sent", "paid", "overdue"]),
                        Invoice.is_active.is_(True),
                    )
                )
            )
        )

    user_email = (read_pii(user, "email") or "").lower()
    is_conference_attendee = False
    if user_email:
        is_conference_attendee = bool(
            await db.scalar(
                select(
                    exists().where(
                        Registration.tenant_id == user.tenant_id,
                        Registration.email_hash == hash_email(user_email),
                        Registration.status != RegistrationStatus.CANCELLED.value,
                    )
                )
            )
        )

    has_any_role = bool(training_attendee is not None or is_conference_attendee or has_papers or is_committee_member)

    return {
        "id": str(user.id),
        "email": read_pii(user, "email"),
        "first_name": user.first_name,
        "last_name": user.last_name,
        "phone": read_pii(user, "phone"),
        "pronouns": user.pronouns,
        "title": user.title,
        "company": user.company,
        "bio": user.bio,
        "social_links": user.social_links or {},
        "address_line_1": user.address_line_1,
        "address_line_2": user.address_line_2,
        "city": user.city,
        "postal_code": user.postal_code,
        "country": user.country,
        "theme_preference": user.theme_preference,
        "is_active": user.is_active,
        "email_verified": user.email_verified_at is not None,
        "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "has_training_account": training_attendee is not None,
        "has_conference_account": cfp_applicant is not None,
        "training_attendee_id": str(training_attendee.id) if training_attendee else None,
        "training_attendee_status": training_attendee.status if training_attendee else None,
        "cfp_applicant_id": str(cfp_applicant.id) if cfp_applicant else None,
        # Role flags — drive sidebar / route-guard visibility.
        "is_conference_attendee": is_conference_attendee,
        "is_committee_member": is_committee_member,
        "has_papers": has_papers,
        "has_invoices": has_invoices,
        "has_any_role": has_any_role,
    }


class PortalMePatch(BaseModel):
    """Partial update for portal profile.

    All fields are optional — only provided (non-None) values are applied.
    Phone uses the PortalUser.phone property setter which handles encryption
    and hashing automatically.
    """

    theme_preference: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None
    pronouns: str | None = None
    title: str | None = None
    company: str | None = None
    bio: str | None = None
    address_line_1: str | None = None
    address_line_2: str | None = None
    city: str | None = None
    postal_code: str | None = None
    country: str | None = None


@router.patch("/portal/unified/me")
async def patch_portal_profile(
    data: PortalMePatch,
    request: Request,
    db: DbSessionDep,
) -> dict:
    """Update the current portal user's profile."""
    user = await _get_current_portal_user(request, db)

    if data.theme_preference is not None and data.theme_preference not in ("light", "dark"):
        raise HTTPException(status_code=422, detail="theme_preference must be 'light' or 'dark'")

    if data.theme_preference is not None:
        user.theme_preference = data.theme_preference
    if data.first_name is not None:
        user.first_name = data.first_name
    if data.last_name is not None:
        user.last_name = data.last_name
    if data.phone is not None:
        user.phone = data.phone
    if data.pronouns is not None:
        user.pronouns = data.pronouns
    if data.title is not None:
        user.title = data.title
    if data.company is not None:
        user.company = data.company
    if data.bio is not None:
        user.bio = data.bio
    if data.address_line_1 is not None:
        user.address_line_1 = data.address_line_1
    if data.address_line_2 is not None:
        user.address_line_2 = data.address_line_2
    if data.city is not None:
        user.city = data.city
    if data.postal_code is not None:
        user.postal_code = data.postal_code
    if data.country is not None:
        user.country = data.country

    await db.commit()
    await db.refresh(user)

    return {"id": str(user.id), "theme_preference": user.theme_preference}


@router.get("/portal/unified/my-trainings")
async def get_my_training_registrations(
    request: Request,
    db: DbSessionDep,
) -> dict:
    """Get training registrations for the current portal user.

    UNIONs two sources: ``TrainingRegistration`` rows via
    ``TrainingRegistrationAttendee``, and ``OfferAttendee`` rows on
    accepted offers. The build logic lives in
    ``app.core.portal_training_listing`` to keep this file under the
    600 LOC ceiling.
    """
    from app.core.portal_training_listing import build_my_trainings_payload

    user = await _get_current_portal_user(request, db)
    return await build_my_trainings_payload(db, user)


@router.get("/portal/unified/my-trainings/{registration_id}/files")
async def get_training_files_for_portal(
    registration_id: str,
    request: Request,
    db: DbSessionDep,
) -> dict:
    """Get downloadable files for a training (portal user must be registered)."""
    from app.models.attachment import Attachment
    from app.models.training_program import ProgramYearTraining
    from app.models.training_registration import TrainingRegistration

    user = await _get_current_portal_user(request, db)

    # Verify user has access to this registration
    reg_result = await db.execute(
        select(TrainingRegistration).where(
            TrainingRegistration.id == registration_id,
            TrainingRegistration.tenant_id == user.tenant_id,
        )
    )
    reg = reg_result.scalar_one_or_none()
    if not reg:
        raise HTTPException(status_code=404, detail="Registration not found")

    # Verify this user is linked to an attendee in this registration
    from app.models.training_attendee import TrainingAttendee
    from app.models.training_registration import TrainingRegistrationAttendee

    att_result = await db.execute(
        select(TrainingRegistrationAttendee).where(
            TrainingRegistrationAttendee.registration_id == reg.id,
            TrainingRegistrationAttendee.attendee_id.in_(
                select(TrainingAttendee.id).where(
                    TrainingAttendee.portal_user_id == user.id,
                )
            ),
        )
    )
    if not att_result.scalar_one_or_none():
        # Fallback: check by email
        user_email_pt = (read_pii(user, "email") or "").lower()
        att_email_result = await db.execute(
            select(TrainingRegistrationAttendee).where(
                TrainingRegistrationAttendee.registration_id == reg.id,
                func.lower(TrainingRegistrationAttendee.email) == user_email_pt,
            )
        )
        if not att_email_result.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Not authorized to access this training")

    # Get placement → training_id
    placement_result = await db.execute(
        select(ProgramYearTraining.training_id).where(ProgramYearTraining.id == reg.placement_id)
    )
    training_id = placement_result.scalar_one_or_none()
    if not training_id:
        return {"items": []}

    # Get files for this training
    files_result = await db.execute(
        select(Attachment)
        .where(
            Attachment.entity_type == "training",
            Attachment.entity_id == training_id,
            Attachment.tenant_id == user.tenant_id,
        )
        .order_by(Attachment.created_at.desc())
    )
    files = files_result.scalars().all()

    return {
        "items": [
            {
                "id": str(f.id),
                "filename": f.filename,
                "content_type": f.content_type,
                "file_size": f.file_size,
                "description": f.description,
                "created_at": f.created_at.isoformat() if f.created_at else None,
            }
            for f in files
        ]
    }
