"""Admin endpoints for managing unverified applicant email verifications."""

from datetime import datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.applicant_security import generate_email_verification_token
from app.core.dependencies import DbSessionDep, TenantAdminDep, require_module
from app.core.email import send_verification_email
from app.core.exceptions import NotFoundError
from app.core.utils import utcnow
from app.models.applicant_token import ApplicantEmailVerification
from app.models.cfp import CFPApplicant
from app.models.tenant import Tenant

from .shared import MODULE_CODE

router = APIRouter()


class UnverifiedApplicantItem(BaseModel):
    id: UUID
    first_name: str
    last_name: str
    email: str
    created_at: datetime


class UnverifiedApplicantsResponse(BaseModel):
    items: list[UnverifiedApplicantItem]
    total: int


class ResendBulkRequest(BaseModel):
    applicant_ids: list[UUID]


class ResendResult(BaseModel):
    sent: int
    failed: int


@router.get(
    "/pending-verifications",
    response_model=UnverifiedApplicantsResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def list_unverified_applicants(
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> UnverifiedApplicantsResponse:
    """List all applicants who have not yet verified their email."""
    result = await db.execute(
        select(CFPApplicant)
        .where(
            CFPApplicant.tenant_id == current_user.tenant_id,
            CFPApplicant.email_verified_at.is_(None),
        )
        .order_by(CFPApplicant.created_at.desc())
    )
    applicants = list(result.scalars().all())

    items = [
        UnverifiedApplicantItem(
            id=a.id,
            first_name=a.first_name,
            last_name=a.last_name,
            email=a.email,
            created_at=a.created_at,
        )
        for a in applicants
    ]
    return UnverifiedApplicantsResponse(items=items, total=len(items))


async def _resend_verification_for_applicant(
    db: AsyncSession,
    applicant: CFPApplicant,
    tenant_slug: str,
    tenant_name: str,
) -> bool:
    """Generate a new verification token and send the verification email."""
    settings = get_settings()

    raw_token, token_hash = generate_email_verification_token()
    verification = ApplicantEmailVerification(
        applicant_id=applicant.id,
        token_hash=token_hash,
        expires_at=utcnow() + timedelta(hours=24),
    )
    db.add(verification)
    await db.flush()

    return await send_verification_email(
        db,
        email=applicant.email,
        token=raw_token,
        tenant_slug=tenant_slug,
        first_name=applicant.first_name,
        last_name=applicant.last_name,
        company_name=tenant_name,
        base_url=settings.PORTAL_BASE_URL,
    )


@router.post(
    "/pending-verifications/{applicant_id}/resend",
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def resend_verification(
    applicant_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Resend verification email to a single unverified applicant."""
    result = await db.execute(
        select(CFPApplicant).where(
            CFPApplicant.id == applicant_id,
            CFPApplicant.tenant_id == current_user.tenant_id,
            CFPApplicant.email_verified_at.is_(None),
        )
    )
    applicant = result.scalar_one_or_none()
    if not applicant:
        raise NotFoundError("Unverified applicant not found")

    # Get tenant slug
    tenant_result = await db.execute(select(Tenant.slug, Tenant.name).where(Tenant.id == current_user.tenant_id))
    tenant_row = tenant_result.one()

    sent = await _resend_verification_for_applicant(db, applicant, tenant_row[0], tenant_row[1])
    await db.commit()

    if sent:
        return {"message": f"Verification email resent to {applicant.email}"}
    return {"message": "Failed to send verification email"}


@router.post(
    "/pending-verifications/resend-all",
    response_model=ResendResult,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def resend_all_verifications(
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> ResendResult:
    """Resend verification emails to all unverified applicants."""
    result = await db.execute(
        select(CFPApplicant).where(
            CFPApplicant.tenant_id == current_user.tenant_id,
            CFPApplicant.email_verified_at.is_(None),
        )
    )
    applicants = list(result.scalars().all())

    if not applicants:
        return ResendResult(sent=0, failed=0)

    # Get tenant slug
    tenant_result = await db.execute(select(Tenant.slug, Tenant.name).where(Tenant.id == current_user.tenant_id))
    tenant_row = tenant_result.one()

    sent = 0
    failed = 0
    for applicant in applicants:
        success = await _resend_verification_for_applicant(db, applicant, tenant_row[0], tenant_row[1])
        if success:
            sent += 1
        else:
            failed += 1

    await db.commit()
    return ResendResult(sent=sent, failed=failed)
