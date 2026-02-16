"""CFP Applicant Portal - Authentication and profile management endpoints."""

from datetime import timedelta
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.core.applicant_dependencies import CurrentApplicantDep, DbSessionDep
from app.core.applicant_security import (
    create_applicant_access_token,
    create_applicant_refresh_token,
    decode_applicant_token,
    generate_email_verification_token,
)
from app.core.email import send_password_reset_email, send_verification_email
from app.core.exceptions import AuthenticationError, NotFoundError
from app.core.security import hash_password, hash_token, verify_password
from app.core.utils import utcnow
from app.db.session import set_rls_context
from app.models.applicant_activity import ApplicantActivityLog, ApplicantActivityType
from app.models.applicant_token import ApplicantEmailVerification, ApplicantPasswordReset, ApplicantRefreshToken
from app.models.associations import ConferenceCFP
from app.models.cfp import (
    CallForPapers,
    CFPApplicant,
    CFPCommitteeMember,
    CFPTopic,
)
from app.models.settings import PronounOption
from app.models.user import User, UserRole
from app.schemas.cfp_portal import (
    ApplicantLoginRequest,
    ApplicantProfileResponse,
    ApplicantProfileUpdate,
    ApplicantRefreshRequest,
    ApplicantRegisterRequest,
    ApplicantTokenResponse,
    PortalCFPResponse,
    PortalCommitteeMembershipListResponse,
    PortalCommitteeMembershipResponse,
    PortalCommitteeMembershipUpdate,
    PortalConferenceSummary,
    PortalLandingResponse,
    ForgotPasswordRequest,
    PortalTenantResponse,
    PortalTopicResponse,
    ResetPasswordRequest,
    VerifyEmailRequest,
)

from .shared import (
    _get_applicant_picture_url,
    _get_applicant_video_url,
    _resolve_tenant,
    _resolve_tenant_conference,
)

settings = get_settings()
router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


async def log_applicant_activity(
    db: AsyncSession,
    tenant_id: UUID,
    applicant_id: UUID | None,
    applicant_email: str,
    applicant_first_name: str,
    applicant_last_name: str,
    activity_type: ApplicantActivityType,
) -> None:
    """Log an applicant activity event."""
    log = ApplicantActivityLog(
        tenant_id=tenant_id,
        applicant_id=applicant_id,
        applicant_email=applicant_email,
        applicant_first_name=applicant_first_name,
        applicant_last_name=applicant_last_name,
        activity_type=activity_type.value,
    )
    db.add(log)


# ──────────────────────────────────────────────
#  PUBLIC ENDPOINTS (no auth required)
# ──────────────────────────────────────────────


@router.post("/portal/{tenant_slug}/register")
@limiter.limit("5/minute")
async def register_applicant(
    request: Request,
    tenant_slug: str,
    data: ApplicantRegisterRequest,
    db: DbSessionDep,
) -> dict:
    """Register a new applicant."""
    tenant = await _resolve_tenant(db, tenant_slug)

    # Set RLS context
    await set_rls_context(db, tenant_id=str(tenant.id), is_super_admin=False)

    normalized_email = data.email.strip().lower()

    # Check if email already exists for this tenant
    existing = await db.execute(
        select(CFPApplicant).where(
            CFPApplicant.tenant_id == tenant.id,
            func.lower(CFPApplicant.email) == normalized_email,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    # Create applicant
    applicant = CFPApplicant(
        tenant_id=tenant.id,
        first_name=data.first_name,
        last_name=data.last_name,
        email=normalized_email,
        password_hash=hash_password(data.password),
    )
    db.add(applicant)
    await db.flush()

    # Log registration event
    await log_applicant_activity(
        db,
        tenant_id=tenant.id,
        applicant_id=applicant.id,
        applicant_email=normalized_email,
        applicant_first_name=data.first_name,
        applicant_last_name=data.last_name,
        activity_type=ApplicantActivityType.REGISTERED,
    )

    # In debug mode, auto-verify the email so developers can log in immediately
    if settings.DEBUG:
        applicant.email_verified_at = utcnow()
        # Log auto-verification in debug mode
        await log_applicant_activity(
            db,
            tenant_id=tenant.id,
            applicant_id=applicant.id,
            applicant_email=normalized_email,
            applicant_first_name=data.first_name,
            applicant_last_name=data.last_name,
            activity_type=ApplicantActivityType.EMAIL_VERIFIED,
        )
        await db.commit()
        return {"message": "Registration successful. Email auto-verified (debug mode). You can now log in."}

    # Create email verification token
    raw_token, token_hash = generate_email_verification_token()
    verification = ApplicantEmailVerification(
        applicant_id=applicant.id,
        token_hash=token_hash,
        expires_at=utcnow() + timedelta(hours=24),
    )
    db.add(verification)

    # Log confirmation email sent event
    await log_applicant_activity(
        db,
        tenant_id=tenant.id,
        applicant_id=applicant.id,
        applicant_email=normalized_email,
        applicant_first_name=data.first_name,
        applicant_last_name=data.last_name,
        activity_type=ApplicantActivityType.CONFIRMATION_SENT,
    )
    await db.commit()

    # Send verification email
    await send_verification_email(
        db,
        email=data.email,
        token=raw_token,
        tenant_slug=tenant_slug,
        first_name=data.first_name,
        last_name=data.last_name,
        company_name=tenant.name,
    )

    return {"message": "Registration successful. Please check your email to verify your account."}


@router.post("/portal/{tenant_slug}/verify-email")
async def verify_email(
    tenant_slug: str,
    data: VerifyEmailRequest,
    db: DbSessionDep,
) -> dict:
    """Verify an applicant's email address."""
    tenant = await _resolve_tenant(db, tenant_slug)
    await set_rls_context(db, tenant_id=str(tenant.id), is_super_admin=False)

    token_hash = hash_token(data.token)

    result = await db.execute(
        select(ApplicantEmailVerification)
        .where(ApplicantEmailVerification.token_hash == token_hash)
        .where(ApplicantEmailVerification.used_at.is_(None))
    )
    verification = result.scalar_one_or_none()

    if not verification or not verification.is_valid:
        raise HTTPException(status_code=400, detail="Invalid or expired verification token")

    # Mark token as used
    verification.used_at = utcnow()

    # Verify the applicant's email
    applicant_result = await db.execute(
        select(CFPApplicant).where(CFPApplicant.id == verification.applicant_id)
    )
    applicant = applicant_result.scalar_one_or_none()
    if not applicant:
        raise HTTPException(status_code=400, detail="Applicant not found")

    applicant.email_verified_at = utcnow()

    # Log email verified event
    await log_applicant_activity(
        db,
        tenant_id=tenant.id,
        applicant_id=applicant.id,
        applicant_email=applicant.email,
        applicant_first_name=applicant.first_name,
        applicant_last_name=applicant.last_name,
        activity_type=ApplicantActivityType.EMAIL_VERIFIED,
    )
    await db.commit()

    return {"message": "Email verified successfully. You can now log in."}


@router.post("/portal/{tenant_slug}/forgot-password")
@limiter.limit("3/minute")
async def forgot_password(
    request: Request,
    tenant_slug: str,
    data: ForgotPasswordRequest,
    db: DbSessionDep,
) -> dict:
    """Request a password reset email.

    Always returns success to prevent email enumeration.
    """
    tenant = await _resolve_tenant(db, tenant_slug)
    await set_rls_context(db, tenant_id=str(tenant.id), is_super_admin=False)

    normalized_email = data.email.strip().lower()

    result = await db.execute(
        select(CFPApplicant).where(
            CFPApplicant.tenant_id == tenant.id,
            func.lower(CFPApplicant.email) == normalized_email,
        )
    )
    applicant = result.scalar_one_or_none()

    if applicant:
        raw_token, token_hash_val = generate_email_verification_token()
        reset = ApplicantPasswordReset(
            applicant_id=applicant.id,
            token_hash=token_hash_val,
            expires_at=utcnow() + timedelta(hours=1),
        )
        db.add(reset)

        await log_applicant_activity(
            db,
            tenant_id=tenant.id,
            applicant_id=applicant.id,
            applicant_email=applicant.email,
            applicant_first_name=applicant.first_name,
            applicant_last_name=applicant.last_name,
            activity_type=ApplicantActivityType.PASSWORD_RESET_REQUESTED,
        )
        await db.commit()

        await send_password_reset_email(
            db,
            email=applicant.email,
            token=raw_token,
            conference_id=None,
            company_name=tenant.name,
            first_name=applicant.first_name,
            last_name=applicant.last_name,
            tenant_slug=tenant_slug,
        )

    # Always return success to prevent email enumeration
    return {"message": "If an account with this email exists, a password reset link has been sent."}


@router.post("/portal/{tenant_slug}/reset-password")
@limiter.limit("5/minute")
async def reset_password(
    request: Request,
    tenant_slug: str,
    data: ResetPasswordRequest,
    db: DbSessionDep,
) -> dict:
    """Reset password using a valid reset token."""
    tenant = await _resolve_tenant(db, tenant_slug)
    await set_rls_context(db, tenant_id=str(tenant.id), is_super_admin=False)

    token_hash_val = hash_token(data.token)

    result = await db.execute(
        select(ApplicantPasswordReset)
        .where(ApplicantPasswordReset.token_hash == token_hash_val)
        .where(ApplicantPasswordReset.used_at.is_(None))
    )
    reset = result.scalar_one_or_none()

    if not reset or not reset.is_valid:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    # Load applicant
    applicant_result = await db.execute(
        select(CFPApplicant).where(
            CFPApplicant.id == reset.applicant_id,
            CFPApplicant.tenant_id == tenant.id,
        )
    )
    applicant = applicant_result.scalar_one_or_none()
    if not applicant:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    # Update password and mark token as used
    applicant.password_hash = hash_password(data.new_password)
    reset.used_at = utcnow()

    await log_applicant_activity(
        db,
        tenant_id=tenant.id,
        applicant_id=applicant.id,
        applicant_email=applicant.email,
        applicant_first_name=applicant.first_name,
        applicant_last_name=applicant.last_name,
        activity_type=ApplicantActivityType.PASSWORD_RESET_COMPLETED,
    )
    await db.commit()

    return {"message": "Password has been reset successfully. You can now log in."}


@router.post("/portal/{tenant_slug}/login", response_model=ApplicantTokenResponse)
@limiter.limit("5/minute")
async def login_applicant(
    request: Request,
    tenant_slug: str,
    data: ApplicantLoginRequest,
    db: DbSessionDep,
) -> ApplicantTokenResponse:
    """Authenticate an applicant and return tokens."""
    tenant = await _resolve_tenant(db, tenant_slug)

    # Check if this email belongs to a tenant admin - they should use the admin portal
    admin_result = await db.execute(
        select(User).where(
            User.tenant_id == tenant.id,
            func.lower(User.email) == data.email.strip().lower(),
            User.role == UserRole.TENANT_ADMIN.value,
            User.is_active == True,
        )
    )
    admin_user = admin_result.scalar_one_or_none()

    if admin_user and verify_password(data.password, admin_user.password_hash):
        # Admin user with correct credentials trying to use portal
        raise HTTPException(
            status_code=403,
            detail={
                "code": "TENANT_ADMIN_REDIRECT",
                "message": "You are a tenant administrator. Please use the admin portal to log in.",
            },
        )

    result = await db.execute(
        select(CFPApplicant).where(
            CFPApplicant.tenant_id == tenant.id,
            func.lower(CFPApplicant.email) == data.email.strip().lower(),
        )
    )
    applicant = result.scalar_one_or_none()

    if not applicant or not verify_password(data.password, applicant.password_hash):
        raise AuthenticationError("Invalid email or password")

    if not applicant.email_verified_at:
        raise HTTPException(
            status_code=403,
            detail="Email not verified. Please check your inbox for the verification link.",
        )

    # Create tokens
    access_token = create_applicant_access_token(
        applicant_id=applicant.id,
        tenant_id=tenant.id,
    )
    refresh_token, token_hash, expires_at = create_applicant_refresh_token(
        applicant_id=applicant.id,
    )

    # Store refresh token
    db_token = ApplicantRefreshToken(
        applicant_id=applicant.id,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    db.add(db_token)
    await db.commit()

    return ApplicantTokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/portal/{tenant_slug}/refresh", response_model=ApplicantTokenResponse)
@limiter.limit("10/minute")
async def refresh_applicant_token(
    request: Request,
    tenant_slug: str,
    data: ApplicantRefreshRequest,
    db: DbSessionDep,
) -> ApplicantTokenResponse:
    """Refresh an applicant's access token."""
    tenant = await _resolve_tenant(db, tenant_slug)

    decode_applicant_token(data.refresh_token, token_type="applicant_refresh")

    # Verify refresh token in DB
    token_hash = hash_token(data.refresh_token)
    result = await db.execute(
        select(ApplicantRefreshToken)
        .where(ApplicantRefreshToken.token_hash == token_hash)
        .where(ApplicantRefreshToken.revoked_at.is_(None))
    )
    db_token = result.scalar_one_or_none()

    if not db_token or not db_token.is_valid:
        raise AuthenticationError("Invalid or expired refresh token")

    # Load applicant
    applicant_result = await db.execute(
        select(CFPApplicant).where(CFPApplicant.id == db_token.applicant_id)
    )
    applicant = applicant_result.scalar_one_or_none()
    if not applicant:
        raise AuthenticationError("Applicant not found")

    # Create new tokens
    access_token = create_applicant_access_token(
        applicant_id=applicant.id,
        tenant_id=tenant.id,
    )
    new_refresh, new_hash, new_expires = create_applicant_refresh_token(
        applicant_id=applicant.id,
    )

    # Revoke old, store new
    db_token.revoked_at = utcnow()
    new_db_token = ApplicantRefreshToken(
        applicant_id=applicant.id,
        token_hash=new_hash,
        expires_at=new_expires,
    )
    db.add(new_db_token)
    await db.commit()

    return ApplicantTokenResponse(
        access_token=access_token,
        refresh_token=new_refresh,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


# ──────────────────────────────────────────────
#  AUTHENTICATED ENDPOINTS (applicant JWT)
# ──────────────────────────────────────────────


@router.get("/portal/me", response_model=ApplicantProfileResponse)
async def get_profile(
    current: CurrentApplicantDep,
    db: DbSessionDep,
) -> ApplicantProfileResponse:
    """Get the current applicant's profile."""
    applicant = current.applicant
    picture_url = await _get_applicant_picture_url(db, applicant.id, current.tenant_id)
    video_url = await _get_applicant_video_url(db, applicant.id, current.tenant_id)
    data = ApplicantProfileResponse.model_validate(applicant)
    data.picture_url = picture_url
    data.video_url = video_url
    return data


@router.get("/portal/pronoun-options")
async def list_portal_pronoun_options(
    current: CurrentApplicantDep,
    db: DbSessionDep,
) -> list[dict]:
    """List active pronoun options across all conferences in the applicant's tenant."""
    result = await db.execute(
        select(PronounOption.name)
        .where(
            PronounOption.tenant_id == current.tenant_id,
            PronounOption.is_active == True,
        )
        .distinct()
        .order_by(PronounOption.name)
    )
    names = result.scalars().all()
    return [{"id": n, "name": n} for n in names]


@router.put("/portal/me", response_model=ApplicantProfileResponse)
async def update_profile(
    data: ApplicantProfileUpdate,
    current: CurrentApplicantDep,
    db: DbSessionDep,
) -> ApplicantProfileResponse:
    """Update the current applicant's profile."""
    applicant = current.applicant
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(applicant, field, value)

    await db.commit()
    await db.refresh(applicant)
    picture_url = await _get_applicant_picture_url(db, applicant.id, current.tenant_id)
    video_url = await _get_applicant_video_url(db, applicant.id, current.tenant_id)
    resp = ApplicantProfileResponse.model_validate(applicant)
    resp.picture_url = picture_url
    resp.video_url = video_url
    return resp


# ──────────────────────────────────────────────
#  COMMITTEE MEMBERSHIP ENDPOINTS
# ──────────────────────────────────────────────


@router.get("/portal/me/committee-memberships", response_model=PortalCommitteeMembershipListResponse)
async def list_my_committee_memberships(
    current: CurrentApplicantDep,
    db: DbSessionDep,
) -> PortalCommitteeMembershipListResponse:
    """List all committee memberships for the current applicant."""
    query = (
        select(CFPCommitteeMember)
        .options(
            selectinload(CFPCommitteeMember.conference),
            selectinload(CFPCommitteeMember.topics),
        )
        .where(
            CFPCommitteeMember.applicant_id == current.applicant_id,
            CFPCommitteeMember.tenant_id == current.tenant_id,
        )
        .order_by(CFPCommitteeMember.created_at.desc())
    )
    result = await db.execute(query)
    members = list(result.scalars().all())

    items = [
        PortalCommitteeMembershipResponse(
            id=m.id,
            conference_id=m.conference_id,
            conference_name=m.conference.name,
            role=m.role,
            topics=[
                PortalTopicResponse(id=t.id, name=t.name, description=t.description)
                for t in m.topics
            ],
            created_at=m.created_at,
        )
        for m in members
    ]

    return PortalCommitteeMembershipListResponse(items=items, total=len(items))


@router.put("/portal/me/committee-memberships/{membership_id}", response_model=PortalCommitteeMembershipResponse)
async def update_my_committee_membership(
    membership_id: str,
    data: PortalCommitteeMembershipUpdate,
    current: CurrentApplicantDep,
    db: DbSessionDep,
) -> PortalCommitteeMembershipResponse:
    """Update a committee membership (self-service topic assignment)."""
    from uuid import UUID as UUIDType

    result = await db.execute(
        select(CFPCommitteeMember)
        .options(
            selectinload(CFPCommitteeMember.conference),
            selectinload(CFPCommitteeMember.topics),
        )
        .where(
            CFPCommitteeMember.id == UUIDType(membership_id),
            CFPCommitteeMember.applicant_id == current.applicant_id,
            CFPCommitteeMember.tenant_id == current.tenant_id,
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise NotFoundError("Committee membership not found")

    if data.topic_ids is not None:
        topic_result = await db.execute(
            select(CFPTopic).where(
                CFPTopic.id.in_(data.topic_ids),
                CFPTopic.tenant_id == current.tenant_id,
            )
        )
        member.topics = list(topic_result.scalars().all())

    await db.commit()
    await db.refresh(member)

    return PortalCommitteeMembershipResponse(
        id=member.id,
        conference_id=member.conference_id,
        conference_name=member.conference.name,
        role=member.role,
        topics=[
            PortalTopicResponse(id=t.id, name=t.name, description=t.description)
            for t in member.topics
        ],
        created_at=member.created_at,
    )


# ──────────────────────────────────────────────
#  PUBLIC TENANT INFO (for portal login page)
# ──────────────────────────────────────────────


@router.get("/portal/tenant/{tenant_slug}", response_model=PortalTenantResponse)
async def get_tenant_info(
    tenant_slug: str,
    db: DbSessionDep,
) -> PortalTenantResponse:
    """Get basic tenant info for the portal login page."""
    tenant = await _resolve_tenant(db, tenant_slug)
    # Rewrite logo_url to use the portal-accessible endpoint so the
    # frontend can fetch it without admin auth / CORS issues.
    portal_logo_url = None
    if tenant.logo_url:
        import re

        portal_logo_url = re.sub(
            r"^/admin/tenants/([^/]+)/logo",
            rf"/portal/tenant/{tenant.id}/logo",
            tenant.logo_url,
        )
    return PortalTenantResponse(
        id=tenant.id,
        name=tenant.name,
        slug=tenant.slug,
        logo_url=portal_logo_url,
    )


@router.get("/portal/tenant/{tenant_id}/logo")
async def get_tenant_logo_public(
    tenant_id: UUID,
    db: DbSessionDep,
) -> bytes:
    """Serve the tenant logo without authentication (public endpoint)."""
    from fastapi.responses import Response
    from app.core.file_validation import safe_content_disposition
    from app.models.attachment import Attachment

    await set_rls_context(db, is_super_admin=True)

    result = await db.execute(
        select(Attachment).where(
            Attachment.entity_type == "tenant_logo",
            Attachment.entity_id == tenant_id,
        )
    )
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise NotFoundError("Logo not found")

    return Response(
        content=attachment.file_data,
        media_type=attachment.content_type,
        headers={
            "Content-Disposition": safe_content_disposition(attachment.filename, "inline"),
            "Cache-Control": "public, max-age=3600",
        },
    )


# ──────────────────────────────────────────────
#  LANDING PAGE (must be AFTER specific routes
#  to avoid /{tenant_slug}/{abbreviation} catching
#  /papers/{id}, /conferences/{id}, etc.)
# ──────────────────────────────────────────────


@router.get("/portal/{tenant_slug}/{abbreviation}", response_model=PortalLandingResponse)
async def get_landing_page(
    tenant_slug: str,
    abbreviation: str,
    db: DbSessionDep,
) -> PortalLandingResponse:
    """Get landing page data for a conference CFP portal."""
    tenant, conference = await _resolve_tenant_conference(db, tenant_slug, abbreviation)

    # Load CFPs for this conference
    cfp_result = await db.execute(
        select(CallForPapers)
        .join(ConferenceCFP, ConferenceCFP.cfp_id == CallForPapers.id)
        .where(ConferenceCFP.conference_id == conference.id)
    )
    cfps = cfp_result.scalars().all()

    return PortalLandingResponse(
        conference=PortalConferenceSummary(
            id=conference.id,
            name=conference.name,
            abbreviation=conference.abbreviation,
            description=conference.description,
            start_date=conference.start_date,
            end_date=conference.end_date,
            city=conference.city,
            country=conference.country,
            venue_type=conference.venue_type,
            logo_url=conference.logo_url,
            cfps=[PortalCFPResponse.model_validate(cfp) for cfp in cfps],
        ),
        tenant_name=tenant.name,
    )
