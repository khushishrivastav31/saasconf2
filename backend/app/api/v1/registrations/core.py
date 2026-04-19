"""Core registration endpoints: CRUD, bookable sessions, create, and VAT validation."""

import logging
import math
from datetime import date
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Query, Request
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.conference_helpers import check_conference_admin, get_conference_for_tenant
from app.core.dependencies import CurrentUserDep, DbSessionDep
from app.core.exceptions import NotFoundError
from app.core.invoice_auto_generation import create_invoice_for_registrations
from app.core.security.pii_crypto import hash_email
from app.core.user_auto_creation import create_user_for_registration
from app.core.vat_validation import validate_vat_number
from app.models.audit import AuditAction
from app.models.booking import BookingOption, BookingPeriod
from app.models.customer_event import ACTOR_ADMIN, DOMAIN_REGISTRATION, CustomerEventType
from app.models.invoice import Invoice
from app.models.registration import (
    BillingProfile,
    Registration,
    RegistrationMode,
    RegistrationStatus,
)
from app.schemas.registration import (
    RegistrationListResponse,
    RegistrationResponse,
    RegistrationUpdate,
    ReplaceAttendeeRequest,
    ReplaceAttendeeResponse,
    UnifiedRegistrationCreate,
    UnifiedRegistrationResponse,
)
from app.services.base import BaseService
from app.services.customer_event_service import CustomerEventService

from ._helpers import (
    _auto_add_alumni,
    _build_response,
    _check_email_unique,
    _create_items,
    _get_option_name_map,
    _send_registration_emails,
    _validate_booking_option,
    _validate_session_capacity,
    limiter,
)
from ._query_builders import get_bookable_sessions_for_option

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# Bookable sessions for a booking option
# ---------------------------------------------------------------------------


@router.get("/bookable-sessions/{booking_option_id}")
async def get_bookable_sessions(
    conference_id: UUID,
    booking_option_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> dict:
    """Return separately-bookable sessions grouped by session type for a booking option's day."""
    tenant_id = current_user.tenant_id
    await get_conference_for_tenant(db, conference_id, tenant_id)
    return await get_bookable_sessions_for_option(db, conference_id, tenant_id, booking_option_id)


# ---------------------------------------------------------------------------
# List & Get
# ---------------------------------------------------------------------------


@router.get("", response_model=RegistrationListResponse)
async def list_registrations(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = Query(None, max_length=200),
    status: Literal["registered_pending_invoice", "invoiced", "paid", "cancelled"] | None = None,
) -> RegistrationListResponse:
    """List registrations for a conference with pagination and filtering."""
    tenant_id = current_user.tenant_id
    await get_conference_for_tenant(db, conference_id, tenant_id)

    # Count query
    count_q = select(func.count(Registration.id)).where(
        Registration.tenant_id == tenant_id,
        Registration.conference_id == conference_id,
    )
    # Data query
    data_q = (
        select(Registration)
        .where(
            Registration.tenant_id == tenant_id,
            Registration.conference_id == conference_id,
        )
        .options(
            selectinload(Registration.billing_profile),
            selectinload(Registration.items),
            selectinload(Registration.main_session),
        )
    )

    if search:
        search_filter = (
            Registration.first_name.ilike(f"%{search}%")
            | Registration.last_name.ilike(f"%{search}%")
            | Registration.email.ilike(f"%{search}%")
        )
        count_q = count_q.where(search_filter)
        data_q = data_q.where(search_filter)

    if status:
        count_q = count_q.where(Registration.status == status)
        data_q = data_q.where(Registration.status == status)
    else:
        # Cancelled registrations are not attendees — exclude by default.
        # A cancelled person's record is preserved on invoices/credit notes only.
        count_q = count_q.where(Registration.status != RegistrationStatus.CANCELLED)
        data_q = data_q.where(Registration.status != RegistrationStatus.CANCELLED)

    total = (await db.execute(count_q)).scalar() or 0
    pages = max(1, math.ceil(total / page_size))

    data_q = data_q.order_by(Registration.created_at.desc())
    data_q = data_q.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(data_q)
    registrations = result.scalars().all()

    # Batch-fetch booking option names
    opt_map = await _get_option_name_map(db, conference_id, tenant_id)

    items = [_build_response(reg, option_name=opt_map.get(reg.booking_option_id)) for reg in registrations]

    return RegistrationListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


@router.get("/{registration_id}", response_model=RegistrationResponse)
async def get_registration(
    conference_id: UUID,
    registration_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> RegistrationResponse:
    """Get a single registration by ID."""
    tenant_id = current_user.tenant_id
    result = await db.execute(
        select(Registration)
        .where(
            Registration.id == registration_id,
            Registration.conference_id == conference_id,
            Registration.tenant_id == tenant_id,
        )
        .options(
            selectinload(Registration.billing_profile),
            selectinload(Registration.items),
            selectinload(Registration.main_session),
        )
    )
    reg = result.scalar_one_or_none()
    if not reg:
        raise NotFoundError(f"Registration '{registration_id}' not found")

    db.add(
        BaseService.create_audit_log(
            tenant_id=tenant_id,
            user_id=current_user.user_id,
            action=AuditAction.REGISTRATION_VIEW,
            resource_type="registration",
            resource_id=reg.id,
            subject_email_hash=hash_email(reg.email),
        )
    )
    await db.commit()

    opt_map = await _get_option_name_map(db, conference_id, tenant_id)
    return _build_response(reg, option_name=opt_map.get(reg.booking_option_id))


# ---------------------------------------------------------------------------
# Unified registration (1 or more attendees, shared billing)
# ---------------------------------------------------------------------------


@router.post("", response_model=UnifiedRegistrationResponse, status_code=201)
@limiter.limit("10/minute")
async def create_registration(
    request: Request,
    conference_id: UUID,
    data: UnifiedRegistrationCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    background_tasks: BackgroundTasks,
) -> UnifiedRegistrationResponse:
    """Register one or more attendees with shared billing."""
    tenant_id = current_user.tenant_id
    conference = await get_conference_for_tenant(db, conference_id, tenant_id)
    await check_conference_admin(conference_id, current_user, db)

    # Validate all emails are unique for this conference
    for att in data.attendees:
        await _check_email_unique(db, conference_id, att.email)

    # Validate all referenced booking options
    option_ids = {att.booking_option_id for att in data.attendees}
    opt_map: dict[UUID, BookingOption] = {}
    for oid in option_ids:
        opt_map[oid] = await _validate_booking_option(db, oid, conference_id, tenant_id)

    # Validate session capacity (with row-level locking to prevent overselling)
    for att in data.attendees:
        if att.main_session_id:
            await _validate_session_capacity(db, att.main_session_id, conference_id, tenant_id)
        for item in att.items:
            if item.program_session_id:
                await _validate_session_capacity(db, item.program_session_id, conference_id, tenant_id)

    # Create shared billing profile
    billing = BillingProfile(
        tenant_id=tenant_id,
        conference_id=conference_id,
        **data.billing.model_dump(exclude={"payment_intent_id", "vat_validated"}),
    )
    db.add(billing)
    await db.flush()

    # Unified endpoint always uses company_bulk mode
    # (This is the new unified flow that replaces individual/company/bulk)
    registration_mode = RegistrationMode.COMPANY_BULK.value

    # Create registrations
    responses: list[RegistrationResponse] = []
    registrations: list[Registration] = []
    for att in data.attendees:
        reg = Registration(
            tenant_id=tenant_id,
            conference_id=conference_id,
            billing_profile_id=billing.id,
            first_name=att.first_name,
            last_name=att.last_name,
            email=att.email.lower(),
            pronouns=att.pronouns,
            job_title=att.job_title,
            department=att.department,
            phone=att.phone,
            booking_option_id=att.booking_option_id,
            main_session_id=att.main_session_id,
            registration_mode=registration_mode,
            status=RegistrationStatus.REGISTERED_PENDING_INVOICE.value,
            notes=att.notes,
            created_by=current_user.user_id,
        )
        db.add(reg)
        await db.flush()

        items = await _create_items(db, reg, att.items, conference_id, tenant_id, conference)
        if items:
            await db.flush()
        reg.billing_profile = billing
        registrations.append(reg)
        responses.append(
            _build_response(
                reg,
                option_name=opt_map[att.booking_option_id].name,
                items=items,
            )
        )

        assert reg.email_hash is not None  # @validates("email") populates this
        CustomerEventService.record(
            db,
            tenant_id=tenant_id,
            portal_user_id=None,
            subject_email_hash=reg.email_hash,
            domain=DOMAIN_REGISTRATION,
            event_type=CustomerEventType.REGISTRATION_REGISTERED,
            actor_kind=ACTOR_ADMIN,
            created_by=current_user.user_id,
            related_entity_type="registration",
            related_entity_id=reg.id,
            meta={
                "registration_id": str(reg.id),
                "conference_name": conference.name,
                "booking_option_name": opt_map[att.booking_option_id].name,
                "company_name": billing.company_name,
            },
        )

    # Auto-generate invoice for all registrations
    invoice = await create_invoice_for_registrations(db, registrations, billing, conference, tenant_id, current_user)

    # Create user accounts and collect password tokens
    user_tokens: list[tuple[Registration, str]] = []
    for reg in registrations:
        _user, raw_token = await create_user_for_registration(db, reg, tenant_id)
        if raw_token:  # Only add if new user with token
            user_tokens.append((reg, raw_token))

    # Update registration status to INVOICED if invoice was created
    if invoice:
        for reg in registrations:
            reg.status = RegistrationStatus.INVOICED.value

    await db.commit()

    # Send emails in background (post-response) for faster registration flow
    password_setup_tokens = {reg.id: token for reg, token in user_tokens}
    background_tasks.add_task(
        _send_registration_emails,
        db=db,
        registrations=registrations,
        conference=conference,
        invoice=invoice,
        password_setup_tokens=password_setup_tokens,
    )

    return UnifiedRegistrationResponse(
        billing_profile_id=billing.id,
        registrations=responses,
        total_created=len(responses),
    )


@router.get("/validate-discount/{code}")
async def validate_discount_code_admin(
    conference_id: UUID,
    code: str,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> dict:
    """Validate discount code for admin registration (authenticated endpoint)."""
    from app.core.discount_code_validation import (
        ValidationError,
        get_applicable_option_ids,
        get_applicable_period_ids,
        validate_and_get_discount_code,
    )

    tenant_id = current_user.tenant_id
    conference = await get_conference_for_tenant(db, conference_id, tenant_id)

    # Get active booking period
    today = date.today()
    active_period_stmt = select(BookingPeriod).where(
        BookingPeriod.conference_id == conference.id,
        BookingPeriod.tenant_id == tenant_id,
        BookingPeriod.is_active == True,
        BookingPeriod.start_date <= today,
        BookingPeriod.end_date >= today,
    )
    active_period_result = await db.execute(active_period_stmt)
    active_period = active_period_result.scalar_one_or_none()

    try:
        discount = await validate_and_get_discount_code(db, code, conference.id, tenant_id, registration_date=today)

        # Get applicable options and periods
        option_ids = await get_applicable_option_ids(db, discount.id)
        period_ids = await get_applicable_period_ids(db, discount.id)

        # Check if applies to current period
        period_applies = True
        if period_ids and active_period:
            period_applies = active_period.id in period_ids

        return {
            "valid": period_applies,
            "message": "Valid discount code" if period_applies else "Discount not valid for current booking period",
            "discount_type": discount.discount_type,
            "discount_value": float(discount.discount_value),
            "currency": discount.currency,
            "description": discount.description,
            "applicable_option_ids": [str(opt_id) for opt_id in option_ids] if option_ids else None,
            "applicable_period_ids": [str(per_id) for per_id in period_ids] if period_ids else None,
            "is_combinable": discount.is_combinable,
        }
    except ValidationError as e:
        return {
            "valid": False,
            "message": str(e),
        }


# ---------------------------------------------------------------------------
# Update & Delete registration
# ---------------------------------------------------------------------------


@router.put("/{registration_id}", response_model=RegistrationResponse)
async def update_registration(
    conference_id: UUID,
    registration_id: UUID,
    data: RegistrationUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> RegistrationResponse:
    """Update a registration (person data, booking option, status)."""
    tenant_id = current_user.tenant_id
    await check_conference_admin(conference_id, current_user, db)

    result = await db.execute(
        select(Registration)
        .where(
            Registration.id == registration_id,
            Registration.conference_id == conference_id,
            Registration.tenant_id == tenant_id,
        )
        .options(
            selectinload(Registration.billing_profile),
            selectinload(Registration.items),
            selectinload(Registration.main_session),
        )
    )
    reg = result.scalar_one_or_none()
    if not reg:
        raise NotFoundError(f"Registration '{registration_id}' not found")

    update_data = data.model_dump(exclude_unset=True)
    old_status = reg.status

    # Validate email uniqueness if changed
    if "email" in update_data:
        await _check_email_unique(db, conference_id, update_data["email"], exclude_id=registration_id)

    # Validate booking option if changed
    if "booking_option_id" in update_data:
        await _validate_booking_option(db, update_data["booking_option_id"], conference_id, tenant_id)

    for field, value in update_data.items():
        setattr(reg, field, value)

    # Auto-add to alumni when status changes to PAID
    if "status" in update_data and update_data["status"] == RegistrationStatus.PAID.value:
        await _auto_add_alumni(db, reg)

    # Emit customer event when a registration is cancelled.
    if (
        "status" in update_data
        and update_data["status"] == RegistrationStatus.CANCELLED.value
        and old_status != RegistrationStatus.CANCELLED.value
    ):
        conference = await get_conference_for_tenant(db, conference_id, tenant_id)
        opt_map_for_meta = await _get_option_name_map(db, conference_id, tenant_id)
        assert reg.email_hash is not None
        CustomerEventService.record(
            db,
            tenant_id=tenant_id,
            portal_user_id=None,
            subject_email_hash=reg.email_hash,
            domain=DOMAIN_REGISTRATION,
            event_type=CustomerEventType.REGISTRATION_CANCELLED,
            actor_kind=ACTOR_ADMIN,
            created_by=current_user.user_id,
            related_entity_type="registration",
            related_entity_id=reg.id,
            meta={
                "registration_id": str(reg.id),
                "conference_name": conference.name,
                "booking_option_name": opt_map_for_meta.get(reg.booking_option_id),
                "company_name": reg.billing_profile.company_name if reg.billing_profile else None,
            },
        )

    await db.commit()
    await db.refresh(reg)

    opt_map = await _get_option_name_map(db, conference_id, tenant_id)
    return _build_response(reg, option_name=opt_map.get(reg.booking_option_id))


@router.delete("/{registration_id}")
async def delete_registration(
    conference_id: UUID,
    registration_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> dict:
    """Delete a registration."""
    tenant_id = current_user.tenant_id
    await check_conference_admin(conference_id, current_user, db)

    result = await db.execute(
        select(Registration).where(
            Registration.id == registration_id,
            Registration.conference_id == conference_id,
            Registration.tenant_id == tenant_id,
        )
    )
    reg = result.scalar_one_or_none()
    if not reg:
        raise NotFoundError(f"Registration '{registration_id}' not found")

    name = f"{reg.first_name} {reg.last_name}"
    await db.delete(reg)
    await db.commit()

    return {"message": f"Registration for '{name}' deleted successfully"}


# ---------------------------------------------------------------------------
# Replace Attendee
# ---------------------------------------------------------------------------


@router.post("/{registration_id}/replace")
async def replace_attendee_endpoint(
    conference_id: UUID,
    registration_id: UUID,
    data: "ReplaceAttendeeRequest",
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> "ReplaceAttendeeResponse":
    """
    Replace one attendee with another on an existing registration.

    Scenario A (no additional_items): Simple replacement, no invoice changes
    Scenario B (with additional_items): Create new invoice for delta items only
    """
    from app.core.exceptions import ValidationError
    from app.core.registration_replacement import replace_attendee

    tenant_id = current_user.tenant_id
    await check_conference_admin(conference_id, current_user, db)

    # Load conference
    conference = await get_conference_for_tenant(db, conference_id, tenant_id)

    # Load old registration
    result = await db.execute(
        select(Registration)
        .where(
            Registration.id == registration_id,
            Registration.conference_id == conference_id,
            Registration.tenant_id == tenant_id,
        )
        .options(
            selectinload(Registration.billing_profile),
            selectinload(Registration.items),
            selectinload(Registration.main_session),
        )
    )
    old_reg = result.scalar_one_or_none()
    if not old_reg:
        raise NotFoundError(f"Registration '{registration_id}' not found")

    # Validate old registration is not already cancelled
    if old_reg.status == RegistrationStatus.CANCELLED:
        raise ValidationError("Cannot replace a cancelled registration")

    # Validate new email is unique
    await _check_email_unique(db, conference_id, data.new_attendee.email)

    # Validate additional items
    for item in data.additional_items:
        if item.booking_option_id:
            await _validate_booking_option(db, item.booking_option_id, conference_id, tenant_id)

    # Build old registration response BEFORE replacement (it will be deleted)
    opt_map = await _get_option_name_map(db, conference_id, tenant_id)
    old_reg_response = _build_response(old_reg, option_name=opt_map.get(old_reg.booking_option_id))

    # Perform replacement (old registration is hard-deleted inside)
    _old_registration, new_registration, replacement_record, additional_invoice = await replace_attendee(
        db=db,
        old_registration=old_reg,
        new_attendee_data=data.new_attendee,
        additional_items=data.additional_items,
        conference=conference,
        tenant_id=tenant_id,
        user_id=current_user.user_id,
        replacement_reason=data.replacement_reason,
        cancellation_message=data.cancellation_message,
    )

    # Refresh surviving objects from DB after commit
    await db.refresh(new_registration)
    await db.refresh(replacement_record)
    if additional_invoice:
        # Re-query invoice with events loaded for build_invoice_response
        result = await db.execute(
            select(Invoice).where(Invoice.id == additional_invoice.id).options(selectinload(Invoice.events))
        )
        additional_invoice = result.scalar_one()

    # Build responses
    from app.api.v1.invoices.crud import build_invoice_response

    # Convert invoice response to dict for schema
    invoice_dict = None
    if additional_invoice:
        invoice_response = build_invoice_response(additional_invoice)
        invoice_dict = invoice_response.model_dump()

    return ReplaceAttendeeResponse(
        old_registration=old_reg_response,
        new_registration=_build_response(new_registration, option_name=opt_map.get(new_registration.booking_option_id)),
        replacement_id=replacement_record.id,
        has_additional_items=replacement_record.has_additional_items,
        additional_items_invoice=invoice_dict,
        emails_sent={"old_attendee": True, "new_attendee": True, "invoice": bool(additional_invoice)},
    )


# ---------------------------------------------------------------------------
# VAT Validation
# ---------------------------------------------------------------------------


class VatCalculationRequest(BaseModel):
    """Request to calculate VAT for registration preview."""

    country: str
    vat_number: str | None = None
    subtotal: float


@router.post("/validate-vat")
@limiter.limit("5/minute")
async def validate_vat(
    request: Request,
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    vat_number: str = Query(..., min_length=2),
    country: str = Query(..., min_length=2, max_length=2),
) -> dict:  # type: ignore[type-arg]
    """Validate a VAT number using stdnum, regex fallback, and VIES API."""
    tenant_id = current_user.tenant_id
    await get_conference_for_tenant(db, conference_id, tenant_id)
    return await validate_vat_number(vat_number, country)


@router.post("/calculate-vat")
async def calculate_vat_admin(
    conference_id: UUID,
    data: VatCalculationRequest,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> dict:
    """Calculate VAT for admin registration (preview before submission)."""
    from decimal import Decimal

    from app.core.address import _resolve_country_code
    from app.core.default_settings import DEFAULT_EU_COUNTRIES, DEFAULT_VAT_RULES
    from app.core.vat_calculation import classify_customer_location, classify_customer_type
    from app.core.vat_rules import get_vat_rule
    from app.models.vat_rate_by_country import VatRateByCountry

    tenant_id = current_user.tenant_id
    conference = await get_conference_for_tenant(db, conference_id, tenant_id)

    # Step 1: Classify customer type (B2B vs B2C)
    customer_type = classify_customer_type(data.vat_number)

    # Step 2: Classify customer location (domestic/EU/non-EU)
    eu_countries = (conference.settings or {}).get("eu_countries", DEFAULT_EU_COUNTRIES)
    customer_location = classify_customer_location(
        data.country,
        conference.country or "",
        eu_countries,
    )

    # Step 3: Determine attendance type (default to conference venue type)
    venue_type = conference.venue_type
    if venue_type == "virtual":
        attendance_type = "virtual"
    elif venue_type == "in_person" or venue_type == "hybrid":
        attendance_type = "in_person"
    else:
        attendance_type = "in_person"

    # Step 4: Lookup VAT rule from decision table
    vat_rules = (conference.settings or {}).get("vat_rules", DEFAULT_VAT_RULES)
    rule = get_vat_rule(vat_rules, attendance_type, customer_type, customer_location)

    if not rule:
        return {
            "vat_rate": 0.0,
            "vat_amount": 0.0,
            "total": data.subtotal,
            "notes": None,
        }

    # Step 5: Determine tax rate based on rule
    rate = Decimal("0.00")

    if not rule.get("charge_vat"):
        rate = Decimal("0.00")
    elif rule.get("vat_rate_source") == "conference":
        # Use conference country VAT rate
        conference_country_iso = _resolve_country_code(conference.country)
        if conference_country_iso:
            # Try tenant-specific rate first
            stmt = select(VatRateByCountry.standard_rate).where(
                VatRateByCountry.tenant_id == conference.tenant_id,
                VatRateByCountry.country_code == conference_country_iso,
            )
            result = await db.execute(stmt)
            fetched_rate = result.scalar_one_or_none()

            # Fall back to global rate
            if fetched_rate is None:
                stmt = select(VatRateByCountry.standard_rate).where(
                    VatRateByCountry.tenant_id.is_(None),
                    VatRateByCountry.country_code == conference_country_iso,
                )
                result = await db.execute(stmt)
                fetched_rate = result.scalar_one_or_none()

            if fetched_rate is not None:
                rate = fetched_rate
    elif rule.get("vat_rate_source") == "customer":
        # Use customer country VAT rate
        customer_country_iso = _resolve_country_code(data.country)
        if customer_country_iso:
            # Try tenant-specific rate first
            stmt = select(VatRateByCountry.standard_rate).where(
                VatRateByCountry.tenant_id == conference.tenant_id,
                VatRateByCountry.country_code == customer_country_iso,
            )
            result = await db.execute(stmt)
            fetched_rate = result.scalar_one_or_none()

            # Fall back to global rate
            if fetched_rate is None:
                stmt = select(VatRateByCountry.standard_rate).where(
                    VatRateByCountry.tenant_id.is_(None),
                    VatRateByCountry.country_code == customer_country_iso,
                )
                result = await db.execute(stmt)
                fetched_rate = result.scalar_one_or_none()

            if fetched_rate is not None:
                rate = fetched_rate

    # Step 6: Calculate tax amount
    subtotal = Decimal(str(data.subtotal))
    vat_amount = (subtotal * rate / Decimal("100")).quantize(Decimal("0.01"))
    total = subtotal + vat_amount

    # Step 7: Generate notes text
    notes = None
    if rule.get("reverse_charge"):
        notes = (
            "VAT Reverse Charge: In accordance with Article 196 of the VAT Directive 2006/112/EC, "
            "the customer is liable for VAT in their country of establishment."
        )
    elif rule.get("oss_applicable"):
        notes = f"VAT charged under the EU One-Stop Shop (OSS) scheme at the rate applicable in your country ({rate}%)."

    return {
        "vat_rate": float(rate),
        "vat_amount": float(vat_amount),
        "total": float(total),
        "notes": notes,
    }


# ── Booking history by email ─────────────────────────────────────────────────


@router.get("/history/by-email/{email}")
async def get_booking_history_by_email(
    conference_id: UUID,
    email: str,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> dict:
    """Get all registrations for an email address across ALL conferences for this tenant.

    Used by admin to see a user's full booking history (which conferences,
    tickets, discounts, dates, amounts).
    """
    from app.models.conference import Conference

    tenant_id = current_user.tenant_id
    await check_conference_admin(conference_id, current_user, db)

    # Join invoice by recipient_email_hash rather than plaintext so the query
    # survives phase (f.2) dropping Invoice.recipient_email. Registration.email
    # is not a PII-encrypted column, so we hash its Python-side value once.
    email_hash = hash_email(email)
    result = await db.execute(
        select(
            Registration.id,
            Registration.conference_id,
            Registration.first_name,
            Registration.last_name,
            Registration.status,
            Registration.created_at,
            Conference.name.label("conference_name"),
            BookingOption.name.label("booking_option_name"),
            BillingProfile.discount_code,
            BillingProfile.payment_method,
            Invoice.total,
            Invoice.currency,
            Invoice.status.label("invoice_status"),
        )
        .join(Conference, Registration.conference_id == Conference.id)
        .outerjoin(BillingProfile, Registration.billing_profile_id == BillingProfile.id)
        .outerjoin(BookingOption, Registration.booking_option_id == BookingOption.id)
        .outerjoin(
            Invoice,
            (Invoice.conference_id == Registration.conference_id)
            & (Invoice.tenant_id == Registration.tenant_id)
            & (Invoice.recipient_email_hash == email_hash)
            & (Invoice.status != "cancelled"),
        )
        .where(
            Registration.tenant_id == tenant_id,
            func.lower(Registration.email) == email.lower(),
        )
        .order_by(Registration.created_at.desc())
    )

    items = []
    for row in result.all():
        items.append(
            {
                "registration_id": str(row.id),
                "conference_id": str(row.conference_id),
                "conference_name": row.conference_name,
                "first_name": row.first_name,
                "last_name": row.last_name,
                "booking_option_name": row.booking_option_name,
                "status": row.status,
                "discount_code": row.discount_code,
                "payment_method": row.payment_method,
                "invoice_total": str(row.total) if row.total else None,
                "invoice_currency": row.currency,
                "invoice_status": row.invoice_status,
                "registered_at": row.created_at.isoformat() if row.created_at else None,
            }
        )

    return {"email": email, "items": items}
