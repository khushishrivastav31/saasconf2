"""Public training-registration endpoint — creates a TrainingRegistration
with attendees, computes VAT per the tenant's decision table, issues the
invoice, and queues confirmation + invoice emails. Unauthenticated but
gated by the tenant's ``training_portal.enabled`` flag.
"""

from __future__ import annotations

import uuid as _uuid
from datetime import date
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, EmailStr
from sqlalchemy import func, select, text
from sqlalchemy.orm import joinedload

from app.config import get_settings
from app.core.dependencies import DbSessionDep
from app.core.rate_limiter import limiter
from app.core.security.recaptcha import validate_recaptcha
from app.core.security.registrations import validate_registration_security
from app.models.training import Training
from app.models.training_program import ProgramYearTraining, TrainingProgramYear
from app.models.training_registration import TrainingRegistration, TrainingRegistrationAttendee

from ._helpers import get_tenant_city, resolve_location_display, resolve_tenant

router = APIRouter()


class TrainingAttendeeInput(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    exam_mode: str = "none"  # "none" | "onsite" | "online"
    exam_language: str | None = None
    extra_time: bool = False


class TrainingBillingInput(BaseModel):
    company_name: str | None = None
    street: str
    postal_code: str
    city: str
    country: str
    vat_number: str | None = None
    contact_first_name: str
    contact_last_name: str
    contact_email: EmailStr
    contact_phone: str | None = None
    payment_method: str = "bank_transfer"
    payment_intent_id: str | None = None
    po_number: str | None = None


class TrainingRegistrationRequest(BaseModel):
    placement_id: UUID
    billing: TrainingBillingInput
    attendees: list[TrainingAttendeeInput]
    language: str = "en"
    discount_code: str | None = None
    recaptcha_token: str | None = None
    honeypot_field: str | None = None
    form_start_timestamp: float | None = None


@router.post("/{tenant_slug}/trainings/register")
@limiter.limit("3/hour")
async def register_for_training(
    request: Request,
    tenant_slug: str,
    data: TrainingRegistrationRequest,
    db: DbSessionDep,
) -> dict:
    """Submit a public training registration.

    Creates a TrainingRegistration with attendees. Validates that the
    placement exists, is public (open/hybrid), and is in the future.
    """
    tenant = await resolve_tenant(db, tenant_slug)

    # Bot protection — same defense in depth used on conference registration:
    # reCAPTCHA v3 (no-ops if RECAPTCHA_SECRET_KEY is empty), then honeypot,
    # form-time-trap, disposable-email blocklist, and an in-memory IP rate
    # limit (the slowapi decorator above is the Redis-backed primary).
    settings = get_settings()
    await validate_recaptcha(
        data.recaptcha_token or "",
        settings.RECAPTCHA_SECRET_KEY,
        settings.RECAPTCHA_SCORE_THRESHOLD,
    )
    await validate_registration_security(
        request=request,
        billing_email=data.billing.contact_email,
        honeypot_field=data.honeypot_field,
        form_start_timestamp=data.form_start_timestamp,
    )

    # Check registration period
    portal_settings = (tenant.settings or {}).get("training_portal", {})
    today = date.today()
    reg_start = portal_settings.get("registration_start_date")
    reg_end = portal_settings.get("registration_end_date")

    if reg_start:
        try:
            if today < date.fromisoformat(reg_start):
                raise HTTPException(status_code=403, detail=f"Registration opens on {reg_start}")
        except (ValueError, TypeError):
            pass

    if reg_end:
        try:
            if today > date.fromisoformat(reg_end):
                raise HTTPException(status_code=403, detail=f"Registration closed on {reg_end}")
        except (ValueError, TypeError):
            pass

    # Validate placement
    placement_query = (
        select(ProgramYearTraining)
        .join(Training, ProgramYearTraining.training_id == Training.id)
        .join(TrainingProgramYear, ProgramYearTraining.program_year_id == TrainingProgramYear.id)
        .options(
            joinedload(ProgramYearTraining.training).joinedload(Training.syllabus),
            joinedload(ProgramYearTraining.location),
        )
        .where(
            ProgramYearTraining.id == data.placement_id,
            ProgramYearTraining.tenant_id == tenant.id,
            ProgramYearTraining.placement_type.in_(["open", "hybrid"]),
            ProgramYearTraining.start_date >= today,
            TrainingProgramYear.status == "published",
            Training.is_active.is_(True),
        )
    )
    result = await db.execute(placement_query)
    placement = result.scalars().unique().first()

    if not placement:
        raise HTTPException(status_code=404, detail="Training not found or not available for registration")

    if not data.attendees:
        raise HTTPException(status_code=422, detail="At least one attendee is required")

    if len(data.attendees) > 100:
        raise HTTPException(status_code=422, detail="Maximum 100 attendees per registration")

    # Honeypot check
    if data.honeypot_field:
        raise HTTPException(status_code=422, detail="Invalid submission")

    # Set RLS context
    await db.execute(text("SELECT set_config('app.current_tenant_id', :tid, true)"), {"tid": str(tenant.id)})

    # Calculate pricing
    training = placement.training
    price_per_person = float(training.regular_price or 0) if training else 0
    num_attendees = len(data.attendees)

    # Exam fee — per attendee who opts in
    exam_unit_price = (
        float(training.syllabus.price) if training and training.syllabus and training.syllabus.price else 0
    )
    exam_attendees = sum(1 for a in data.attendees if a.exam_mode != "none") if exam_unit_price else 0
    training_subtotal = price_per_person * num_attendees
    exam_subtotal = exam_unit_price * exam_attendees
    subtotal = training_subtotal + exam_subtotal
    currency = training.currency or "EUR" if training else "EUR"

    # VAT calculation — apply VAT Decision Table rules
    finance_settings = (tenant.settings or {}).get("training_finance", {})
    vat_rates = finance_settings.get("vat_rates", {})
    vat_rules: list[dict] = finance_settings.get("vat_rules", [])
    eu_countries: list[str] = finance_settings.get("eu_countries", [])
    company_info = finance_settings.get("company_info", {})
    tenant_country = (company_info.get("country", "") or "").upper()

    # Location country — fall back to tenant country if not set on location
    location_country = ""
    if placement.location and placement.location.country:
        location_country = placement.location.country.upper()
    if not location_country:
        location_country = tenant_country

    billing_country = (data.billing.country or "").upper()

    # Determine attendance type — check resolved city (includes tenant city fallback)
    resolved_city = resolve_location_display(placement.location, get_tenant_city(tenant)) or ""
    is_virtual = "online" in resolved_city.lower() or "virtual" in resolved_city.lower()
    attendance_type = "virtual" if is_virtual else "in_person"

    # Determine customer type: B2B if company + VAT number, else B2C
    customer_type = "b2b" if data.billing.company_name and data.billing.vat_number else "b2c"

    # Determine customer location relative to tenant
    if billing_country == tenant_country:
        customer_location = "domestic"
    elif billing_country.upper() in [c.upper() for c in eu_countries]:
        customer_location = "eu"
    else:
        customer_location = "non_eu"

    # Find matching VAT rule
    vat_rate = 0.0
    charge_vat = False
    for rule in vat_rules:
        if (
            rule.get("attendance_type", "") == attendance_type
            and rule.get("customer_type", "") == customer_type
            and rule.get("customer_location", "") == customer_location
        ):
            charge_vat = rule.get("charge_vat", False)
            if charge_vat:
                source = rule.get("vat_rate_source", "")
                if source in ("training_country", "conference"):
                    vat_rate = float(vat_rates.get(location_country, 0))
                elif source in ("customer_country", "customer"):
                    vat_rate = float(vat_rates.get(billing_country, 0))
            break

    # Fallback: if no rules configured, use training location country rate
    if not vat_rules and location_country:
        vat_rate = float(vat_rates.get(location_country, 0))

    vat_amount = 0.0
    if vat_rate:
        vat_amount = round(subtotal * vat_rate / 100, 2)
    total = round(subtotal + vat_amount, 2)

    # Create registration
    registration = TrainingRegistration(
        id=_uuid.uuid4(),
        tenant_id=tenant.id,
        placement_id=data.placement_id,
        status="paid"
        if data.billing.payment_method == "credit_card" and data.billing.payment_intent_id
        else "registered",
        language=data.language,
        company_name=data.billing.company_name,
        street=data.billing.street,
        postal_code=data.billing.postal_code,
        city=data.billing.city,
        country=data.billing.country,
        vat_number=data.billing.vat_number,
        contact_first_name=data.billing.contact_first_name,
        contact_last_name=data.billing.contact_last_name,
        contact_email=data.billing.contact_email,
        contact_phone=data.billing.contact_phone,
        payment_method=data.billing.payment_method,
        payment_intent_id=data.billing.payment_intent_id,
        po_number=data.billing.po_number,
        discount_code=data.discount_code,
        subtotal=subtotal,
        vat_amount=vat_amount,
        total=total,
        currency=currency,
        originating_ip=request.client.host if request.client else None,
    )
    db.add(registration)

    # Create attendees (per-registration rows) + the shared TrainingAttendee
    # identity row for each. The identity row is what the admin Attendee list
    # queries and what /portal/unified/my-trainings joins through; skipping it
    # used to silently drop newly-registered people from both views. See
    # app/core/training_attendee_resolver.py for the dedup rules.
    from app.core.training_attendee_resolver import resolve_or_create_training_attendee

    attendee_records = []
    for att in data.attendees:
        attendee = TrainingRegistrationAttendee(
            id=_uuid.uuid4(),
            tenant_id=tenant.id,
            registration_id=registration.id,
            first_name=att.first_name,
            last_name=att.last_name,
            email=att.email,
            language=data.language,
            include_exam=att.exam_mode != "none",
            exam_language=att.exam_language if att.exam_mode != "none" else None,
            exam_mode=att.exam_mode if att.exam_mode != "none" else None,
            extra_time=att.extra_time,
        )
        db.add(attendee)
        attendee_records.append(attendee)

        if att.email:
            training_attendee = await resolve_or_create_training_attendee(
                db,
                tenant_id=tenant.id,
                email=att.email,
                first_name=att.first_name,
                last_name=att.last_name,
            )
            attendee.attendee_id = training_attendee.id

    await db.commit()
    await db.refresh(registration)

    # Auto-guarantee: check if attendee count meets threshold
    auto_threshold = portal_settings.get("auto_guarantee_threshold")
    if auto_threshold and not placement.is_guaranteed:
        from app.models.training_registration import TrainingRegistrationAttendee as TRAModel

        count_q = (
            select(func.count(TRAModel.id))
            .join(
                TrainingRegistration,
                TRAModel.registration_id == TrainingRegistration.id,
            )
            .where(
                TrainingRegistration.placement_id == placement.id,
                TrainingRegistration.tenant_id == tenant.id,
            )
        )
        total_attendees = (await db.execute(count_q)).scalar() or 0
        if total_attendees >= int(auto_threshold):
            placement.is_guaranteed = True
            await db.commit()

    # Create invoice
    from app.core.training_invoice_generation import create_invoice_for_training_registration

    invoice = await create_invoice_for_training_registration(db, registration, tenant)
    await db.commit()

    # Send emails as background tasks
    from app.core.email import send_email_background
    from app.core.training_registration_emails import (
        send_training_confirmation_email,
        send_training_invoice_email,
    )

    if invoice:
        send_email_background(
            send_training_invoice_email,
            invoice=invoice,
            registration=registration,
            tenant=tenant,
        )

    send_email_background(
        send_training_confirmation_email,
        registration=registration,
        tenant=tenant,
    )

    # Auto-create unified portal user account for the contact person
    from app.core.portal_user_service import ensure_portal_user_for_registration

    await ensure_portal_user_for_registration(db, registration, tenant)

    return {
        "registration_id": str(registration.id),
        "status": registration.status,
        "training_name": training.name if training else "Unknown",
        "attendee_count": len(attendee_records),
        "total": str(registration.total),
        "currency": registration.currency,
        "payment_method": registration.payment_method,
        "invoice_number": invoice.invoice_number if invoice else None,
    }
