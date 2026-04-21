"""Authenticated portal registration endpoints for logged-in users.

Thin router: parses params, resolves the applicant session, and
delegates to :mod:`app.services.cfp_portal_registration_service` (queries)
and :mod:`app.services.cfp_portal_register_service` (Stripe +
register flow).
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Query
from pydantic import BaseModel

from app.core.applicant_dependencies import CurrentApplicantDep, DbSessionDep
from app.schemas.portal_registration import PortalRegistrationRequest, PortalRegistrationResponse
from app.services import cfp_portal_register_service as write_svc
from app.services import cfp_portal_registration_service as query_svc

router = APIRouter()


# ── Query endpoints ──


@router.get("/portal/conferences/{conference_id}/alumni-check")
async def check_alumni_status(
    conference_id: UUID,
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> dict:
    """Check alumni status + whether the ALUMNI discount is available."""
    return await query_svc.check_alumni_status(
        db,
        tenant_id=current_applicant.tenant_id,
        conference_id=conference_id,
        user_email=current_applicant.applicant.email or "",
    )


@router.get("/portal/conferences/{conference_id}/public-details")
async def get_authenticated_conference_details(
    conference_id: UUID,
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> dict:
    """Conference details for authenticated portal registration."""
    return await query_svc.get_public_conference_details(
        db, tenant_id=current_applicant.tenant_id, conference_id=conference_id
    )


class VatCalculationRequest(BaseModel):
    """Request for VAT calculation preview."""

    subtotal: float
    country: str
    vat_number: str | None = None


@router.post("/portal/conferences/{conference_id}/calculate-vat")
async def calculate_vat_authenticated(
    conference_id: UUID,
    data: VatCalculationRequest,
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> dict:
    """Preview VAT for authenticated portal registration."""
    return await query_svc.calculate_vat(
        db,
        tenant_id=current_applicant.tenant_id,
        conference_id=conference_id,
        subtotal=data.subtotal,
        country=data.country,
        vat_number=data.vat_number,
    )


@router.post("/portal/conferences/{conference_id}/validate-vat")
async def validate_vat_authenticated(
    conference_id: UUID,
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
    vat_number: str = Query(..., min_length=2),
    country: str = Query(..., min_length=2, max_length=2),
) -> dict:
    """Validate a VAT number for authenticated portal users."""
    return await query_svc.validate_vat(
        db,
        tenant_id=current_applicant.tenant_id,
        conference_id=conference_id,
        vat_number=vat_number,
        country=country,
    )


@router.get("/portal/conferences/{conference_id}/validate-discount/{code}")
async def validate_discount_authenticated(
    conference_id: UUID,
    code: str,
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> dict:
    """Validate a discount code for authenticated portal registration."""
    return await query_svc.validate_discount_code(
        db,
        tenant_id=current_applicant.tenant_id,
        conference_id=conference_id,
        code=code,
        user_email=current_applicant.applicant.email or "",
    )


# ── Stripe PaymentIntent (preview) ──


class CreatePaymentIntentRequest(BaseModel):
    """Request to create Stripe PaymentIntent."""

    amount: float
    currency: str


class UpdatePaymentIntentRequest(BaseModel):
    """Request to update Stripe PaymentIntent amount."""

    amount: float


@router.post("/portal/conferences/{conference_id}/create-payment-intent")
async def create_payment_intent_authenticated(
    conference_id: UUID,
    data: CreatePaymentIntentRequest,
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> dict:
    """Create a Stripe PaymentIntent for authenticated portal registration."""
    return await write_svc.create_preview_payment_intent(
        db,
        tenant_id=current_applicant.tenant_id,
        conference_id=conference_id,
        applicant_id=current_applicant.applicant_id,
        applicant_email=current_applicant.applicant.email or "",
        amount=data.amount,
        currency=data.currency,
    )


@router.post("/portal/conferences/{conference_id}/update-payment-intent/{payment_intent_id}")
async def update_payment_intent_authenticated(
    conference_id: UUID,
    payment_intent_id: str,
    data: UpdatePaymentIntentRequest,
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> dict:
    """Update a Stripe PaymentIntent's amount."""
    return await write_svc.update_preview_payment_intent(
        db,
        tenant_id=current_applicant.tenant_id,
        conference_id=conference_id,
        payment_intent_id=payment_intent_id,
        amount=data.amount,
    )


# ── Register (mutation) ──


@router.post("/portal/conferences/{conference_id}/register")
async def create_authenticated_registration(
    conference_id: UUID,
    data: PortalRegistrationRequest,
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
    background_tasks: BackgroundTasks,
) -> PortalRegistrationResponse:
    """Create a registration for an authenticated user (with discount-code support)."""
    response, registrations, invoice, password_setup_tokens = await write_svc.create_authenticated_registration(
        db,
        tenant_id=current_applicant.tenant_id,
        conference_id=conference_id,
        applicant_id=current_applicant.applicant_id,
        applicant_email=current_applicant.applicant.email or "",
        data=data,
    )

    # Fetch conference again for the background email task (separate session OK).
    conference = await query_svc.get_active_conference(
        db, conference_id=conference_id, tenant_id=current_applicant.tenant_id
    )

    background_tasks.add_task(
        write_svc.send_registration_emails_async,
        db=db,
        registrations=registrations,
        conference=conference,
        invoice=invoice,
        password_setup_tokens=password_setup_tokens,
    )

    return response
