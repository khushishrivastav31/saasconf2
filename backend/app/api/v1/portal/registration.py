"""
Public Registration API

Public endpoint for conference registration (no authentication required).
Implements comprehensive security measures for public-facing forms.
"""

import logging
from collections import OrderedDict
from datetime import date
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import DbSessionDep
from app.core.exceptions import ValidationError
from app.core.invoice_auto_generation import create_invoice_for_registrations
from app.core.recaptcha import validate_recaptcha
from app.core.registration_security import validate_registration_security
from app.core.stripe_helper import create_payment_intent
from app.core.user_auto_creation import create_user_for_registration
from app.core.vat_calculation import (
    classify_customer_location,
    classify_customer_type,
)
from app.core.vat_rules import get_vat_rule
from app.core.vat_validation import validate_vat_number
from app.models.booking import BookingOption, DiscountCode, DiscountCodeOption, DiscountCodePeriod
from app.models.cfp import CFPApplicant, CFPPaper
from app.models.conference import Conference
from app.models.program import ProgramDay, ProgramSession, ProgramTimeSlot
from app.models.registration import (
    BillingProfile,
    Registration,
    RegistrationItem,
    RegistrationMode,
    RegistrationStatus,
)
from app.models.settings import SessionType
from app.models.tenant import Tenant
from app.models.vat_rate_by_country import VatRateByCountry
from app.schemas.portal_registration import (
    PortalRegistrationRequest,
    PortalRegistrationResponse,
    PublicBookingOption,
    PublicConference,
)
from app.schemas.registration import RegistrationResponse

from ..registrations._helpers import (
    _build_response,
    _check_email_unique,
    _create_items,
    _send_registration_emails,
    _validate_booking_option,
)

logger = logging.getLogger(__name__)
router = APIRouter()


async def resolve_tenant_and_conference(
    db: AsyncSession,
    tenant_slug: str,
    conference_slug: str,
) -> tuple[Tenant, Conference]:
    """
    Resolve tenant and conference from slugs.

    Args:
        db: Database session
        tenant_slug: Tenant's URL slug
        conference_slug: Conference's abbreviation/slug

    Returns:
        Tuple of (tenant, conference)

    Raises:
        HTTPException: If tenant or conference not found
    """
    # Find tenant (case-insensitive slug lookup)
    result = await db.execute(select(Tenant).where(func.lower(Tenant.slug) == tenant_slug.lower()))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail=f"Tenant '{tenant_slug}' not found")

    # Find conference (case-insensitive abbreviation lookup)
    result = await db.execute(
        select(Conference).where(
            Conference.tenant_id == tenant.id,
            func.lower(Conference.abbreviation) == conference_slug.lower(),
        )
    )
    conference = result.scalar_one_or_none()
    if not conference:
        raise HTTPException(
            status_code=404,
            detail=f"Conference '{conference_slug}' not found",
        )

    # Check if public registration is enabled
    portal_settings = conference.settings.get("public_registration_portal", {})
    if not portal_settings.get("enabled"):
        raise HTTPException(
            status_code=403,
            detail="Public registration is not enabled for this conference",
        )

    return tenant, conference


@router.get("/{tenant_slug}/conferences/{conference_slug}")
async def get_public_conference(
    tenant_slug: str,
    conference_slug: str,
    db: DbSessionDep,
) -> PublicConference:
    """
    Get public conference details for registration portal.

    No authentication required - publicly accessible endpoint.
    """
    from datetime import date

    from app.models.booking import BookingPeriod

    _tenant, conference = await resolve_tenant_and_conference(db, tenant_slug, conference_slug)

    # Fetch ALL booking periods (for period name display)
    all_periods_result = await db.execute(
        select(BookingPeriod)
        .where(
            BookingPeriod.conference_id == conference.id,
            BookingPeriod.is_active == True,
        )
        .order_by(BookingPeriod.sort_order)
    )
    all_periods = all_periods_result.scalars().all()

    # Find current active period for pricing
    today = date.today()
    current_period = None
    for period in all_periods:
        if period.start_date <= today <= period.end_date:
            current_period = period
            break

    # Fetch booking options with availability
    result = await db.execute(
        select(BookingOption)
        .where(
            BookingOption.conference_id == conference.id,
            BookingOption.is_active == True,
        )
        .order_by(BookingOption.sort_order)
    )
    booking_options_db = result.scalars().all()

    # Build public booking options with availability
    booking_options = []
    for option in booking_options_db:
        # Get price from current period
        price = 0.0
        if current_period and current_period.prices:
            option_price = current_period.prices.get(str(option.id))
            if option_price is not None:
                price = float(option_price)

        # Skip options with no price (not available in current period)
        if price <= 0:
            continue

        # Count current registrations (all non-cancelled)
        registrations_result = await db.execute(
            select(Registration).where(
                Registration.booking_option_id == option.id,
                Registration.status != RegistrationStatus.CANCELLED,
            )
        )
        current_count = len(registrations_result.scalars().all())

        # Note: BookingOption doesn't have capacity tracking yet
        # Always show as available (not sold out)
        booking_options.append(
            PublicBookingOption(
                id=option.id,
                name=option.name,
                description=option.description,
                price=price,
                capacity=None,  # Not implemented yet
                current_registrations=current_count,
                is_sold_out=False,  # No capacity limits yet
                conference_day_id=option.conference_day_id,
            )
        )

    # Build location string
    location = conference.venue_name or conference.city or None

    # Build public booking periods
    from app.schemas.portal_registration import PublicBookingPeriod

    booking_periods = [
        PublicBookingPeriod(
            id=period.id,
            name=period.name,
            start_date=period.start_date.isoformat(),
            end_date=period.end_date.isoformat(),
            prices=period.prices or {},
            sort_order=period.sort_order or 0,
        )
        for period in all_periods
    ]

    # Extract registration portal settings
    portal_settings = conference.settings.get("public_registration_portal", {}) if conference.settings else {}
    registration_start = portal_settings.get("registration_start_date")
    registration_end = portal_settings.get("registration_end_date")
    success_message = portal_settings.get("success_message")

    # Extract enabled policies (only expose enabled ones to public)
    all_policies = (conference.settings or {}).get("policies", {})
    public_policies = {}
    for key, entry in all_policies.items():
        if isinstance(entry, dict) and entry.get("enabled"):
            public_policies[key] = {
                "type": entry.get("type"),
                "url": entry.get("url"),
                "content": entry.get("content"),
            }

    return PublicConference(
        id=conference.id,
        name=conference.name,
        abbreviation=conference.abbreviation or "",
        description=conference.description,
        start_date=conference.start_date.isoformat() if conference.start_date else None,
        end_date=conference.end_date.isoformat() if conference.end_date else None,
        location=location,
        website=conference.website,
        logo_url=conference.logo_url,
        booking_options=booking_options,
        booking_periods=booking_periods,
        currency=conference.currency or "EUR",
        country=conference.country,
        venue_type=conference.venue_type,
        registration_start_date=registration_start,
        registration_end_date=registration_end,
        success_message=success_message,
        policies=public_policies or None,
        stripe_enabled=(conference.settings or {}).get("stripe", {}).get("is_enabled", False),
        stripe_publishable_key=(conference.settings or {}).get("stripe", {}).get("publishable_key"),
        bank_transfer_countries=(conference.settings or {}).get("bank_transfer_countries"),
    )


@router.get("/{tenant_slug}/conferences/{conference_slug}/bookable-sessions/{booking_option_id}")
async def get_public_bookable_sessions(
    tenant_slug: str,
    conference_slug: str,
    booking_option_id: UUID,
    db: DbSessionDep,
) -> dict:
    """
    Get separately-bookable sessions for a booking option (public endpoint).

    No authentication required - publicly accessible for registration portal.
    Returns sessions grouped by session type and time slot.
    """
    # Resolve tenant and conference from slugs
    tenant, conference = await resolve_tenant_and_conference(db, tenant_slug, conference_slug)

    # Look up the booking option and its linked day
    result = await db.execute(
        select(BookingOption).where(
            BookingOption.id == booking_option_id,
            BookingOption.conference_id == conference.id,
            BookingOption.tenant_id == tenant.id,
        )
    )
    option = result.scalar_one_or_none()
    if not option or not option.conference_day_id:
        return {"day_name": None, "groups": []}

    # Get the day name
    day_result = await db.execute(select(ProgramDay).where(ProgramDay.id == option.conference_day_id))
    day = day_result.scalar_one_or_none()
    day_name = day.name if day else None

    # Pre-fetch all time slots for this day (ordered) so we can compute
    # the actual end time for sessions that span multiple slots.
    all_slots_result = await db.execute(
        select(ProgramTimeSlot)
        .where(ProgramTimeSlot.program_day_id == option.conference_day_id)
        .order_by(ProgramTimeSlot.start_time)
    )
    all_slots = all_slots_result.scalars().all()
    slot_index = {s.id: idx for idx, s in enumerate(all_slots)}

    # Get all separately-bookable sessions for that day, joined with their time slot,
    # session type, and speaker info
    result = await db.execute(
        select(
            ProgramSession,
            ProgramTimeSlot,
            SessionType.id.label("st_id"),
            SessionType.name.label("st_name"),
            SessionType.max_attendees.label("st_max_attendees"),
            CFPApplicant.first_name.label("speaker_first"),
            CFPApplicant.last_name.label("speaker_last"),
        )
        .join(ProgramTimeSlot, ProgramTimeSlot.id == ProgramSession.start_slot_id)
        .outerjoin(SessionType, SessionType.id == ProgramSession.session_type_id)
        .outerjoin(CFPPaper, CFPPaper.id == ProgramSession.paper_id)
        .outerjoin(CFPApplicant, CFPApplicant.id == CFPPaper.main_speaker_id)
        .where(
            ProgramSession.conference_id == conference.id,
            ProgramSession.tenant_id == tenant.id,
            ProgramTimeSlot.program_day_id == option.conference_day_id,
            ProgramSession.separately_bookable == True,
        )
        .order_by(ProgramTimeSlot.sort_order, ProgramTimeSlot.start_time)
    )
    rows = result.all()

    if not rows:
        return {"day_name": day_name, "groups": []}

    # Count registrations for each session (both main_session_id and registration_items)
    session_ids = [str(session.id) for session, *_ in rows]

    # Count main sessions
    main_session_counts = await db.execute(
        select(
            Registration.main_session_id,
            func.count(Registration.id).label("count"),
        )
        .where(
            Registration.conference_id == conference.id,
            Registration.tenant_id == tenant.id,
            Registration.main_session_id.in_(session_ids),
            Registration.status != "cancelled",
        )
        .group_by(Registration.main_session_id)
    )
    main_counts = {str(row[0]): row[1] for row in main_session_counts}

    # Count items with program_session_id
    item_session_counts = await db.execute(
        select(
            RegistrationItem.program_session_id,
            func.count(RegistrationItem.id).label("count"),
        )
        .join(Registration, Registration.id == RegistrationItem.registration_id)
        .where(
            Registration.conference_id == conference.id,
            Registration.tenant_id == tenant.id,
            Registration.status != "cancelled",
            RegistrationItem.program_session_id.in_(session_ids),
        )
        .group_by(RegistrationItem.program_session_id)
    )
    item_counts = {str(row[0]): row[1] for row in item_session_counts}

    # Combine counts
    session_capacity = {}
    for session_id in session_ids:
        current_count = main_counts.get(session_id, 0) + item_counts.get(session_id, 0)
        session_capacity[session_id] = current_count

    # Group by session type, then by time slot within each type
    type_map: OrderedDict[str, dict] = OrderedDict()
    for session, slot, st_id, st_name, st_max_attendees, speaker_first, speaker_last in rows:
        type_key = str(st_id) if st_id else "untyped"
        type_label = st_name if st_name else "Other"

        if type_key not in type_map:
            type_map[type_key] = {
                "session_type_id": str(st_id) if st_id else None,
                "session_type_name": type_label,
                "slots": OrderedDict(),
            }

        # Compute actual end time: if the session spans multiple slots,
        # use the end_time of the last spanned slot.
        start_idx = slot_index.get(slot.id, 0)
        end_idx = min(start_idx + session.slot_span - 1, len(all_slots) - 1)
        end_slot = all_slots[end_idx]

        slot_key = str(slot.id)
        slots = type_map[type_key]["slots"]
        if slot_key not in slots:
            start = slot.start_time.strftime("%H:%M")
            end = end_slot.end_time.strftime("%H:%M")
            slots[slot_key] = {
                "slot_id": slot_key,
                "start_time": start,
                "end_time": end,
                "label": f"{start} – {end}",
                "sessions": [],
            }
        else:
            # If another session in the same slot spans further, extend the label
            existing_end = slots[slot_key]["end_time"]
            new_end = end_slot.end_time.strftime("%H:%M")
            if new_end > existing_end:
                slots[slot_key]["end_time"] = new_end
                slots[slot_key]["label"] = f"{slots[slot_key]['start_time']} – {new_end}"

        speaker_name = f"{speaker_first} {speaker_last}".strip() if speaker_first else None
        current_count = session_capacity.get(str(session.id), 0)
        max_attendees = st_max_attendees
        available_spots = max_attendees - current_count if max_attendees is not None else None
        is_full = max_attendees is not None and current_count >= max_attendees

        # Skip fully booked sessions
        if is_full:
            continue

        slots[slot_key]["sessions"].append(
            {
                "id": str(session.id),
                "title": session.title,
                "description": session.description,
                "speaker_name": speaker_name,
                "has_paper": session.paper_id is not None,
                "max_attendees": max_attendees,
                "current_count": current_count,
                "available_spots": available_spots,
                "is_full": is_full,
            }
        )

    # Convert OrderedDicts to lists
    groups = []
    for type_data in type_map.values():
        groups.append(
            {
                "session_type_id": type_data["session_type_id"],
                "session_type_name": type_data["session_type_name"],
                "slots": list(type_data["slots"].values()),
            }
        )

    return {"day_name": day_name, "groups": groups}


@router.get("/{tenant_slug}/conferences/{conference_slug}/validate-discount/{code}")
async def validate_discount_code(
    tenant_slug: str,
    conference_slug: str,
    code: str,
    db: DbSessionDep,
) -> dict:
    """
    Validate a discount code for the public registration portal.

    No authentication required - publicly accessible endpoint.
    Returns discount details if valid, or error details if invalid.
    """
    from app.models.booking import BookingPeriod

    # Resolve tenant and conference
    _tenant, conference = await resolve_tenant_and_conference(db, tenant_slug, conference_slug)

    # Look up the discount code
    result = await db.execute(
        select(DiscountCode).where(
            DiscountCode.conference_id == conference.id,
            DiscountCode.code == code.upper(),  # Case-insensitive lookup
            DiscountCode.is_active == True,
        )
    )
    discount = result.scalar_one_or_none()

    if not discount:
        return {
            "valid": False,
            "message": "Invalid discount code",
        }

    # Check date range
    today = date.today()
    if discount.start_date and today < discount.start_date:
        return {
            "valid": False,
            "message": f"This discount code is not valid until {discount.start_date.strftime('%Y-%m-%d')}",
        }

    if discount.end_date and today > discount.end_date:
        return {
            "valid": False,
            "message": f"This discount code expired on {discount.end_date.strftime('%Y-%m-%d')}",
        }

    # Check usage limit
    if discount.max_uses > 0 and discount.usage_count >= discount.max_uses:
        return {
            "valid": False,
            "message": "This discount code has reached its maximum usage limit",
        }

    # Get applicable booking options (if restricted)
    option_result = await db.execute(
        select(DiscountCodeOption.booking_option_id).where(DiscountCodeOption.discount_code_id == discount.id)
    )
    applicable_option_ids = [str(row[0]) for row in option_result.all()]

    # Get applicable periods (if restricted)
    period_result = await db.execute(
        select(DiscountCodePeriod.booking_period_id).where(DiscountCodePeriod.discount_code_id == discount.id)
    )
    applicable_period_ids = [str(row[0]) for row in period_result.all()]

    # If no period restrictions, find current active period
    if not applicable_period_ids:
        all_periods_result = await db.execute(
            select(BookingPeriod).where(
                BookingPeriod.conference_id == conference.id,
                BookingPeriod.is_active == True,
            )
        )
        all_periods = all_periods_result.scalars().all()
        for period in all_periods:
            if period.start_date <= today <= period.end_date:
                applicable_period_ids = [str(period.id)]
                break

    return {
        "valid": True,
        "discount_type": discount.discount_type,  # "fixed" or "percentage"
        "discount_value": float(discount.discount_value),
        "currency": discount.currency or conference.currency,
        "description": discount.description,
        "applicable_option_ids": applicable_option_ids or None,  # None = applies to all
        "applicable_period_ids": applicable_period_ids or None,  # None = applies to all periods
        "is_combinable": discount.is_combinable,
    }


class VatCalculationRequest(BaseModel):
    """Request for VAT calculation preview."""

    country: str
    vat_number: str | None = None
    subtotal: float


@router.post("/{tenant_slug}/conferences/{conference_slug}/calculate-vat")
async def calculate_vat_preview(
    tenant_slug: str,
    conference_slug: str,
    data: VatCalculationRequest,
    db: DbSessionDep,
) -> dict:
    """
    Calculate VAT for public registration portal (preview before submission).

    No authentication required - publicly accessible endpoint.
    Calculates VAT based on VAT decision table rules.
    """
    from app.core.address import _resolve_country_code
    from app.core.default_settings import DEFAULT_EU_COUNTRIES, DEFAULT_VAT_RULES

    # Resolve tenant and conference
    _tenant, conference = await resolve_tenant_and_conference(db, tenant_slug, conference_slug)

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
    elif venue_type == "in_person":
        attendance_type = "in_person"
    elif venue_type == "hybrid":
        # For hybrid, we need to infer from booking options
        # For preview purposes, default to in_person (safest assumption for VAT calculation)
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


class CreatePaymentIntentRequest(BaseModel):
    """Request to create PaymentIntent before registration."""

    total: float


class CreatePaymentIntentResponse(BaseModel):
    """Response with PaymentIntent details."""

    payment_intent_id: str
    client_secret: str
    publishable_key: str


@router.post("/{tenant_slug}/conferences/{conference_slug}/create-payment-intent")
async def create_payment_intent_preview(
    tenant_slug: str,
    conference_slug: str,
    data: CreatePaymentIntentRequest,
    db: DbSessionDep,
) -> CreatePaymentIntentResponse:
    """
    Create Stripe PaymentIntent immediately (before registration submission).

    Used for payment-first flow: user selects credit card → Stripe form appears immediately.
    This creates the PaymentIntent with the current order total, which can be updated
    if the user changes their order.

    No authentication required - publicly accessible endpoint.

    Args:
        tenant_slug: Tenant URL slug
        conference_slug: Conference abbreviation
        data: Payment intent request with total amount
        db: Database session

    Returns:
        CreatePaymentIntentResponse with client_secret for Stripe Elements

    Raises:
        HTTPException: If Stripe not configured or validation fails
    """
    # Resolve tenant and conference
    _tenant, conference = await resolve_tenant_and_conference(db, tenant_slug, conference_slug)

    # Validate Stripe is enabled
    stripe_settings = conference.settings.get("stripe", {})
    if not stripe_settings.get("is_enabled"):
        raise HTTPException(status_code=400, detail="Stripe is not enabled for this conference")

    publishable_key = stripe_settings.get("publishable_key")
    secret_key = stripe_settings.get("secret_key")

    if not secret_key or not publishable_key:
        raise HTTPException(status_code=400, detail="Stripe keys not configured")

    # Validate amount
    if data.total <= 0:
        raise HTTPException(status_code=400, detail="Total must be greater than 0")

    # Create PaymentIntent
    try:
        import stripe

        stripe.api_key = secret_key

        payment_intent = stripe.PaymentIntent.create(
            amount=int(data.total * 100),  # Convert to cents
            currency=(conference.currency or "EUR").lower(),
            metadata={
                "system": "saasconf",
                "tenant_id": str(conference.tenant_id),
                "conference_id": str(conference.id),
                "preview": "true",  # Mark as preview (not linked to invoice yet)
            },
        )

        if not payment_intent.client_secret:
            raise HTTPException(status_code=500, detail="Failed to create payment intent")

        logger.info(f"Created preview PaymentIntent {payment_intent.id} for {data.total} {conference.currency}")

        return CreatePaymentIntentResponse(
            payment_intent_id=payment_intent.id,
            client_secret=payment_intent.client_secret,
            publishable_key=publishable_key,
        )

    except stripe.error.StripeError as e:
        logger.error(f"Stripe PaymentIntent creation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Stripe error: {e!s}") from e


class UpdatePaymentIntentRequest(BaseModel):
    """Request to update PaymentIntent amount."""

    total: float


@router.put("/{tenant_slug}/conferences/{conference_slug}/update-payment-intent/{payment_intent_id}")
async def update_payment_intent_amount(
    tenant_slug: str,
    conference_slug: str,
    payment_intent_id: str,
    data: UpdatePaymentIntentRequest,
    db: DbSessionDep,
) -> dict:
    """
    Update PaymentIntent amount when order total changes.

    Used when user modifies their order (adds/removes attendees) after PaymentIntent
    was created. Stripe allows updating the amount as long as payment hasn't been confirmed.

    No authentication required - publicly accessible endpoint.

    Args:
        tenant_slug: Tenant URL slug
        conference_slug: Conference abbreviation
        payment_intent_id: Stripe PaymentIntent ID
        data: Update request with new total
        db: Database session

    Returns:
        Success confirmation

    Raises:
        HTTPException: If Stripe not configured or update fails
    """
    # Resolve tenant and conference
    _tenant, conference = await resolve_tenant_and_conference(db, tenant_slug, conference_slug)

    # Validate Stripe is enabled
    stripe_settings = conference.settings.get("stripe", {})
    if not stripe_settings.get("is_enabled"):
        raise HTTPException(status_code=400, detail="Stripe is not enabled for this conference")

    secret_key = stripe_settings.get("secret_key")
    if not secret_key:
        raise HTTPException(status_code=400, detail="Stripe secret key not configured")

    # Validate amount
    if data.total <= 0:
        raise HTTPException(status_code=400, detail="Total must be greater than 0")

    # Update PaymentIntent
    try:
        import stripe

        stripe.api_key = secret_key

        payment_intent = stripe.PaymentIntent.modify(
            payment_intent_id,
            amount=int(data.total * 100),  # Convert to cents
        )

        logger.info(f"Updated PaymentIntent {payment_intent_id} to {data.total} {conference.currency}")

        return {
            "success": True,
            "payment_intent_id": payment_intent.id,
            "amount": data.total,
            "currency": conference.currency,
        }

    except stripe.error.StripeError as e:
        logger.error(f"Stripe PaymentIntent update failed for {payment_intent_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Stripe error: {e!s}") from e


@router.post("/{tenant_slug}/conferences/{conference_slug}/register")
async def create_public_registration(
    request: Request,
    tenant_slug: str,
    conference_slug: str,
    data: PortalRegistrationRequest,
    db: DbSessionDep,
) -> PortalRegistrationResponse:
    """
    Create public conference registration (no authentication required).

    Security measures:
    - reCAPTCHA v3 validation (score ≥ 0.5)
    - Honeypot field check
    - Form timestamp validation
    - Disposable email blocking
    - Rate limiting (3 registrations per hour per IP)

    Flow:
    1. Validate security checks
    2. Create billing profile + registrations
    3. Generate invoice
    4. Create PaymentIntent (if credit card)
    5. Create user accounts with password setup tokens
    6. Send emails (invoice + welcome)

    Args:
        request: FastAPI request
        tenant_slug: Tenant URL slug
        conference_slug: Conference abbreviation
        data: Registration request data
        db: Database session

    Returns:
        PortalRegistrationResponse with payment details

    Raises:
        HTTPException: If validation fails or errors occur
    """
    # Resolve tenant and conference (public-safe)
    tenant, conference = await resolve_tenant_and_conference(db, tenant_slug, conference_slug)
    tenant_id = tenant.id
    conference_id = conference.id

    # Check if registration is currently open based on portal settings
    portal_settings = conference.settings.get("public_registration_portal", {}) if conference.settings else {}
    if not portal_settings.get("enabled", False):
        raise HTTPException(status_code=403, detail="Registration portal is not enabled for this conference")

    # Validate registration dates
    today = date.today()
    reg_start = portal_settings.get("registration_start_date")
    reg_end = portal_settings.get("registration_end_date")

    if reg_start:
        try:
            start_date = date.fromisoformat(reg_start)
            if today < start_date:
                raise HTTPException(
                    status_code=403,
                    detail=f"Registration opens on {start_date.isoformat()}",
                )
        except (ValueError, TypeError):
            pass  # Ignore invalid dates

    if reg_end:
        try:
            end_date = date.fromisoformat(reg_end)
            if today > end_date:
                raise HTTPException(
                    status_code=403,
                    detail=f"Registration closed on {end_date.isoformat()}",
                )
        except (ValueError, TypeError):
            pass  # Ignore invalid dates

    # Set RLS context for multi-tenant isolation
    await db.execute(text("SET app.current_tenant_id = :tid"), {"tid": str(tenant_id)})

    # Security validations
    recaptcha_settings = conference.settings.get("recaptcha", {})
    if recaptcha_settings.get("enabled") and data.recaptcha_token:
        secret_key = recaptcha_settings.get("secret_key", "")
        threshold = recaptcha_settings.get("score_threshold", 0.5)
        await validate_recaptcha(data.recaptcha_token, secret_key, threshold)

    await validate_registration_security(
        request=request,
        billing_email=data.billing.contact_email,
        honeypot_field=data.honeypot_field,
        form_start_timestamp=data.form_start_timestamp,
    )

    # Validate all emails are unique for this conference
    for att in data.attendees:
        await _check_email_unique(db, conference_id, att.email)

    # Validate all referenced booking options
    option_ids = {att.booking_option_id for att in data.attendees}
    opt_map: dict[UUID, BookingOption] = {}
    for oid in option_ids:
        opt_map[oid] = await _validate_booking_option(db, oid, conference_id, tenant_id)

    # Enforce: bank transfer only for countries enabled in conference settings
    from app.core.default_settings import BANK_TRANSFER_COUNTRIES

    conf_settings = conference.settings or {}
    stripe_conf = conf_settings.get("stripe", {})
    stripe_enabled = stripe_conf.get("is_enabled", False)

    if stripe_enabled and data.billing.payment_method == "bank_transfer":
        allowed_countries = conf_settings.get("bank_transfer_countries", BANK_TRANSFER_COUNTRIES)
        billing_country = (data.billing.country or "").strip().upper()
        if billing_country not in allowed_countries:
            raise HTTPException(
                status_code=400,
                detail="Bank transfer is not available for your billing country. Please use credit card payment.",
            )

    # Create shared billing profile
    # Extract payment_intent_id before creating billing profile (not stored in BillingProfile model)
    payment_intent_id = data.billing.payment_intent_id

    billing = BillingProfile(
        tenant_id=tenant_id,
        conference_id=conference_id,
        **data.billing.model_dump(exclude={"payment_method", "payment_intent_id"}),
        payment_method=data.billing.payment_method or "credit_card",
    )
    db.add(billing)
    await db.flush()

    # Create registrations
    registrations: list[Registration] = []
    responses: list[RegistrationResponse] = []

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
            registration_mode=RegistrationMode.PORTAL.value,
            status=RegistrationStatus.REGISTERED_PENDING_INVOICE.value,
            notes=att.notes,
            # No created_by for public registrations
        )
        db.add(reg)
        await db.flush()

        # Create items (tutorials, add-ons)
        items = await _create_items(db, reg, att.items or [], conference_id, tenant_id, conference)
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

    # Auto-generate invoice
    try:
        invoice = await create_invoice_for_registrations(
            db=db,
            registrations=registrations,
            billing_profile=billing,
            conference=conference,
            tenant_id=tenant_id,
            current_user=None,  # Public registration (no user context)
        )
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    # Handle payment based on payment_intent_id
    payment_client_secret: str | None = None
    stripe_publishable_key: str | None = None
    payment_required = False

    if billing.payment_method == "credit_card":
        if payment_intent_id:
            # Payment-first flow: Payment already confirmed by frontend
            # Mark invoice as PAID
            if invoice:
                invoice.status = "paid"
                invoice.stripe_payment_intent_id = payment_intent_id

                # Update PaymentIntent metadata in Stripe with invoice_id
                # This ensures future sync operations can find this payment
                try:
                    import stripe

                    stripe_settings = conference.settings.get("stripe", {})
                    secret_key = stripe_settings.get("secret_key")
                    if secret_key:
                        stripe.api_key = secret_key
                        stripe.PaymentIntent.modify(
                            payment_intent_id,
                            metadata={
                                "invoice_id": str(invoice.id),
                                "system": "saasconf",
                                "tenant_id": str(conference.tenant_id),
                                "conference_id": str(conference.id),
                            },
                        )
                        logger.info(f"Updated PaymentIntent {payment_intent_id} metadata with invoice_id {invoice.id}")
                except Exception as e:
                    logger.error(f"Failed to update PaymentIntent metadata: {e}")
                    # Don't fail registration if metadata update fails

                # Update registration statuses to PAID
                for reg in registrations:
                    reg.status = RegistrationStatus.PAID.value
                logger.info(f"Marked invoice {invoice.id} as paid with PaymentIntent {payment_intent_id}")
        else:
            # Legacy flow: Create PaymentIntent for frontend to confirm
            # This shouldn't happen in the new payment-first flow
            payment_required = True
            stripe_settings = conference.settings.get("stripe", {})
            if stripe_settings.get("is_enabled") and invoice:
                stripe_publishable_key = stripe_settings.get("publishable_key")
                try:
                    new_payment_intent_id, client_secret = await create_payment_intent(
                        db=db,
                        conference=conference,
                        invoice=invoice,
                    )
                    payment_client_secret = client_secret
                    logger.info(f"Created PaymentIntent {new_payment_intent_id} for invoice {invoice.id}")
                except ValidationError as e:
                    logger.error(f"Failed to create PaymentIntent for invoice {invoice.id}: {e}")
                    raise HTTPException(status_code=500, detail="Failed to initialize payment") from e
    else:
        # Bank transfer or other payment methods - mark as INVOICED
        if invoice:
            for reg in registrations:
                reg.status = RegistrationStatus.INVOICED.value

    await db.commit()

    # Post-commit operations (emails, user creation)
    # Create user accounts and collect password tokens
    user_tokens: list[tuple[Registration, str]] = []
    for reg in registrations:
        try:
            _user, raw_token = await create_user_for_registration(
                db=db,
                tenant_id=tenant_id,
                registration=reg,
            )
            if raw_token:  # Only add if new user with token
                user_tokens.append((reg, raw_token))
        except Exception as e:
            logger.error(f"Failed to create user for registration {reg.id}: {e}")

    # Build password_setup_tokens dict and send emails
    password_setup_tokens = {reg.id: token for reg, token in user_tokens}
    await _send_registration_emails(
        db=db,
        registrations=registrations,
        conference=conference,
        invoice=invoice,
        password_setup_tokens=password_setup_tokens,
    )

    # Build success URL
    success_url = f"/{tenant_slug}/register/{conference_slug}/success"

    return PortalRegistrationResponse(
        billing_profile_id=billing.id,
        registrations=responses,
        payment_required=payment_required,
        payment_client_secret=payment_client_secret,
        stripe_publishable_key=stripe_publishable_key,
        success_url=success_url,
    )


@router.post("/{tenant_slug}/conferences/{conference_slug}/validate-vat")
async def validate_vat_public(
    tenant_slug: str,
    conference_slug: str,
    db: DbSessionDep,
    vat_number: str = Query(..., min_length=2),
    country: str = Query(..., min_length=2, max_length=2),
) -> dict:  # type: ignore[type-arg]
    """
    Public VAT validation endpoint (no authentication required).

    Used by public registration form to validate VAT numbers in real-time.
    Performs 3-stage validation: stdnum → regex → VIES.
    """
    # Verify tenant and conference exist (basic validation)
    _tenant, _conference = await resolve_tenant_and_conference(db, tenant_slug, conference_slug)

    # Validate VAT number
    return await validate_vat_number(vat_number, country)
