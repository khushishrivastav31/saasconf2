"""Authenticated portal registration endpoints for logged-in users."""

import logging
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select

from app.api.v1.registrations._helpers import (
    _build_response,
    _check_email_unique,
    _create_items,
    _send_registration_emails,
)
from app.core.alumni_discount import validate_alumni_discount
from app.core.applicant_dependencies import CurrentApplicantDep, DbSessionDep
from app.core.exceptions import NotFoundError, ValidationError
from app.core.invoice_auto_generation import create_invoice_for_registrations
from app.core.stripe_helper import create_payment_intent as create_stripe_payment_intent
from app.core.user_auto_creation import create_user_for_registration
from app.core.vat_calculation import classify_customer_location, classify_customer_type
from app.core.vat_rules import get_vat_rule
from app.models.booking import BookingOption
from app.models.conference import Conference
from app.models.registration import BillingProfile, Registration, RegistrationMode, RegistrationStatus
from app.models.tenant import Tenant
from app.models.vat_rate_by_country import VatRateByCountry
from app.schemas.portal_registration import PortalRegistrationRequest, PortalRegistrationResponse
from app.schemas.registration import RegistrationResponse

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/portal/conferences/{conference_id}/alumni-check")
async def check_alumni_status(
    conference_id: UUID,
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> dict:
    """Check if current user is alumni and if ALUMNI discount exists.

    Returns:
        {
            "is_alumni": bool,
            "has_discount": bool,
            "discount_id": UUID | null,
            "alumni_conferences": list[dict],  # Conferences user attended
            "warning_message": str | null  # If alumni but no discount
        }
    """
    tenant_id = current_applicant.tenant_id
    user_email = current_applicant.applicant.email

    # Verify conference exists and belongs to tenant
    result = await db.execute(
        select(Conference).where(
            Conference.id == conference_id,
            Conference.tenant_id == tenant_id,
            Conference.is_active.is_(True),
        )
    )
    conference = result.scalar_one_or_none()
    if not conference:
        raise NotFoundError("Conference not found")

    # Check alumni status and discount
    is_alumni, discount, alumni_conferences = await validate_alumni_discount(
        db=db,
        tenant_id=tenant_id,
        conference_id=conference_id,
        user_email=user_email,
    )

    warning_message = None
    if is_alumni and not discount:
        conf_names = [c["conference_name"] for c in alumni_conferences]
        warning_message = (
            f"You are an alumnus from {', '.join(conf_names[:3])}"
            f"{' and others' if len(conf_names) > 3 else ''}, "
            "but the ALUMNI discount code is not currently available for this conference."
        )

    return {
        "is_alumni": is_alumni,
        "has_discount": discount is not None,
        "discount_id": str(discount.id) if discount else None,
        "alumni_conferences": alumni_conferences,
        "warning_message": warning_message,
    }


@router.get("/portal/conferences/{conference_id}/public-details")
async def get_authenticated_conference_details(
    conference_id: UUID,
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> dict:
    """Get conference details for authenticated portal registration.

    Returns conference data including booking options, periods, and pricing.
    Same schema as public endpoint but requires authentication.
    """
    from datetime import date

    from app.models.booking import BookingOption, BookingPeriod
    from app.models.registration import Registration, RegistrationStatus
    from app.schemas.portal_registration import PublicBookingOption, PublicBookingPeriod, PublicConference

    tenant_id = current_applicant.tenant_id

    # Verify conference exists and belongs to user's tenant
    result = await db.execute(
        select(Conference).where(
            Conference.id == conference_id,
            Conference.tenant_id == tenant_id,
            Conference.is_active.is_(True),
        )
    )
    conference = result.scalar_one_or_none()
    if not conference:
        raise NotFoundError("Conference not found")

    # Fetch ALL booking periods
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

        # Skip options with no price
        if price <= 0:
            continue

        # Count current registrations
        registrations_result = await db.execute(
            select(Registration).where(
                Registration.booking_option_id == option.id,
                Registration.status != RegistrationStatus.CANCELLED,
            )
        )
        current_count = len(registrations_result.scalars().all())

        booking_options.append(
            PublicBookingOption(
                id=option.id,
                name=option.name,
                description=option.description,
                price=price,
                capacity=None,
                current_registrations=current_count,
                is_sold_out=False,
                conference_day_id=option.conference_day_id,
            )
        )

    # Build location string
    location = conference.venue_name or conference.city or None

    # Build public booking periods
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

    # Extract enabled policies (only expose enabled ones to portal)
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
    ).model_dump()


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
    """Calculate VAT for authenticated portal registration (preview before submission)."""
    from app.core.address import _resolve_country_code
    from app.core.default_settings import DEFAULT_EU_COUNTRIES, DEFAULT_VAT_RULES

    tenant_id = current_applicant.tenant_id

    # Verify conference exists and belongs to user's tenant
    result = await db.execute(
        select(Conference).where(
            Conference.id == conference_id,
            Conference.tenant_id == tenant_id,
            Conference.is_active.is_(True),
        )
    )
    conference = result.scalar_one_or_none()
    if not conference:
        raise NotFoundError("Conference not found")

    # Step 1: Classify customer type (B2B vs B2C)
    customer_type = classify_customer_type(data.vat_number)

    # Step 2: Classify customer location (domestic/EU/non-EU)
    eu_countries = (conference.settings or {}).get("eu_countries", DEFAULT_EU_COUNTRIES)
    customer_location = classify_customer_location(
        data.country,
        conference.country or "",
        eu_countries,
    )

    # Step 3: Determine attendance type
    venue_type = conference.venue_type
    if venue_type == "virtual":
        attendance_type = "virtual"
    elif venue_type == "in_person":
        attendance_type = "in_person"
    else:  # hybrid
        attendance_type = "in_person"  # safest assumption

    # Step 4: Lookup VAT rule
    vat_rules = (conference.settings or {}).get("vat_rules", DEFAULT_VAT_RULES)
    rule = get_vat_rule(vat_rules, attendance_type, customer_type, customer_location)

    if not rule:
        return {
            "vat_rate": 0.0,
            "vat_amount": 0.0,
            "total": data.subtotal,
            "notes": None,
        }

    # Step 5: Determine tax rate
    rate = Decimal("0.00")

    if not rule.get("charge_vat"):
        rate = Decimal("0.00")
    elif rule.get("vat_rate_source") == "conference":
        conference_country_iso = _resolve_country_code(conference.country)
        if conference_country_iso:
            stmt = select(VatRateByCountry.standard_rate).where(
                VatRateByCountry.tenant_id == conference.tenant_id,
                VatRateByCountry.country_code == conference_country_iso,
            )
            result = await db.execute(stmt)
            fetched_rate = result.scalar_one_or_none()

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
        customer_country_iso = _resolve_country_code(data.country)
        if customer_country_iso:
            stmt = select(VatRateByCountry.standard_rate).where(
                VatRateByCountry.tenant_id == conference.tenant_id,
                VatRateByCountry.country_code == customer_country_iso,
            )
            result = await db.execute(stmt)
            fetched_rate = result.scalar_one_or_none()

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

    # Step 7: Generate notes
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
    """Create Stripe PaymentIntent for authenticated portal registration."""
    from app.config import get_settings

    settings = get_settings()
    tenant_id = current_applicant.tenant_id

    # Verify conference
    result = await db.execute(
        select(Conference).where(
            Conference.id == conference_id,
            Conference.tenant_id == tenant_id,
            Conference.is_active.is_(True),
        )
    )
    conference = result.scalar_one_or_none()
    if not conference:
        raise NotFoundError("Conference not found")

    # Check Stripe configuration
    stripe_settings = (conference.settings or {}).get("stripe", {})
    if not stripe_settings.get("is_enabled"):
        raise ValidationError("Credit card payments are not enabled for this conference")

    publishable_key = stripe_settings.get("publishable_key") or settings.STRIPE_PUBLISHABLE_KEY
    secret_key = stripe_settings.get("secret_key") or settings.STRIPE_SECRET_KEY

    if not secret_key or not publishable_key:
        raise ValidationError("Stripe is not properly configured")

    # Validate amount
    if data.amount <= 0:
        raise ValidationError("Amount must be greater than 0")

    # Create PaymentIntent using Stripe API
    try:
        import stripe

        stripe.api_key = secret_key

        payment_intent = stripe.PaymentIntent.create(
            amount=int(data.amount),  # Already in cents from frontend
            currency=data.currency.lower(),
            metadata={
                "system": "saasconf",
                "tenant_id": str(tenant_id),
                "conference_id": str(conference_id),
                "applicant_id": str(current_applicant.applicant_id),
                "preview": "true",  # Mark as preview (not linked to invoice yet)
            },
        )

        if not payment_intent.client_secret:
            raise HTTPException(status_code=500, detail="Failed to create payment intent")

        logger.info(
            f"Created preview PaymentIntent {payment_intent.id} for authenticated user {current_applicant.applicant.email}"
        )

        return {
            "payment_intent_id": payment_intent.id,
            "client_secret": payment_intent.client_secret,
            "publishable_key": publishable_key,
        }

    except stripe.error.StripeError as e:
        logger.error(f"Stripe PaymentIntent creation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Stripe error: {e!s}") from e


@router.post("/portal/conferences/{conference_id}/update-payment-intent/{payment_intent_id}")
async def update_payment_intent_authenticated(
    conference_id: UUID,
    payment_intent_id: str,
    data: UpdatePaymentIntentRequest,
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> dict:
    """Update Stripe PaymentIntent amount for authenticated portal registration."""
    from app.config import get_settings

    settings = get_settings()
    tenant_id = current_applicant.tenant_id

    # Verify conference
    result = await db.execute(
        select(Conference).where(
            Conference.id == conference_id,
            Conference.tenant_id == tenant_id,
            Conference.is_active.is_(True),
        )
    )
    conference = result.scalar_one_or_none()
    if not conference:
        raise NotFoundError("Conference not found")

    # Get Stripe settings
    stripe_settings = (conference.settings or {}).get("stripe", {})
    secret_key = stripe_settings.get("secret_key") or settings.STRIPE_SECRET_KEY
    publishable_key = stripe_settings.get("publishable_key") or settings.STRIPE_PUBLISHABLE_KEY

    if not secret_key or not publishable_key:
        raise ValidationError("Stripe is not properly configured")

    # Validate amount
    if data.amount <= 0:
        raise ValidationError("Amount must be greater than 0")

    # Update PaymentIntent using Stripe API
    try:
        import stripe

        stripe.api_key = secret_key

        payment_intent = stripe.PaymentIntent.modify(
            payment_intent_id,
            amount=int(data.amount),  # Already in cents from frontend
        )

        if not payment_intent.client_secret:
            raise HTTPException(status_code=500, detail="Failed to update payment intent")

        logger.info(f"Updated PaymentIntent {payment_intent_id} to {data.amount / 100}")

        return {
            "client_secret": payment_intent.client_secret,
            "publishable_key": publishable_key,
        }

    except stripe.error.StripeError as e:
        logger.error(f"Stripe PaymentIntent update failed for {payment_intent_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Stripe error: {e!s}") from e


@router.post("/portal/conferences/{conference_id}/validate-vat")
async def validate_vat_authenticated(
    conference_id: UUID,
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
    vat_number: str = Query(..., min_length=2),
    country: str = Query(..., min_length=2, max_length=2),
) -> dict:  # type: ignore[type-arg]
    """Validate a VAT number for authenticated portal users."""
    from app.core.vat_validation import validate_vat_number

    tenant_id = current_applicant.tenant_id

    # Verify conference exists
    result = await db.execute(
        select(Conference).where(
            Conference.id == conference_id,
            Conference.tenant_id == tenant_id,
            Conference.is_active.is_(True),
        )
    )
    if not result.scalar_one_or_none():
        raise NotFoundError("Conference not found")

    return await validate_vat_number(vat_number, country)


@router.get("/portal/conferences/{conference_id}/validate-discount/{code}")
async def validate_discount_authenticated(
    conference_id: UUID,
    code: str,
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> dict:
    """Validate discount code for authenticated portal registration.

    For authenticated users, primarily used to validate ALUMNI discount.
    """
    from datetime import date

    from app.models.booking import BookingPeriod, DiscountCode, DiscountCodeOption, DiscountCodePeriod

    tenant_id = current_applicant.tenant_id
    user_email = current_applicant.applicant.email

    # Verify conference
    result = await db.execute(
        select(Conference).where(
            Conference.id == conference_id,
            Conference.tenant_id == tenant_id,
            Conference.is_active.is_(True),
        )
    )
    conference = result.scalar_one_or_none()
    if not conference:
        raise NotFoundError("Conference not found")

    # Look up the discount code
    result = await db.execute(
        select(DiscountCode).where(
            DiscountCode.conference_id == conference.id,
            DiscountCode.code == code.upper(),
            DiscountCode.is_active == True,
        )
    )
    discount = result.scalar_one_or_none()

    if not discount:
        return {
            "valid": False,
            "message": "Invalid discount code",
        }

    # For ALUMNI discount, check if user is actually alumni
    if code.upper() == "ALUMNI":
        is_alumni, alumni_discount, _ = await validate_alumni_discount(
            db=db,
            tenant_id=tenant_id,
            conference_id=conference.id,
            user_email=user_email,
        )

        if not is_alumni:
            return {
                "valid": False,
                "message": "ALUMNI discount is only available to past attendees",
            }

        if not alumni_discount:
            return {
                "valid": False,
                "message": "ALUMNI discount is not currently available for this conference",
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
        "discount_type": discount.discount_type,
        "discount_value": float(discount.discount_value),
        "currency": discount.currency or conference.currency,
        "description": discount.description,
        "applicable_option_ids": applicable_option_ids or None,
        "applicable_period_ids": applicable_period_ids or None,
        "is_combinable": discount.is_combinable,
    }


@router.post("/portal/conferences/{conference_id}/register")
async def create_authenticated_registration(
    conference_id: UUID,
    data: PortalRegistrationRequest,
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
    background_tasks: BackgroundTasks,
) -> PortalRegistrationResponse:
    """Create registration for authenticated user with discount code support.

    Business Rules:
    - User must be logged in (CurrentApplicantDep)
    - If user is alumni, ALUMNI discount auto-applies (if exists and valid)
    - Any valid discount code can be applied via the discount_code field
    - Pre-filled billing from user profile (frontend responsibility)
    - Same payment flow as public registration (Stripe Elements or bank transfer)
    """
    tenant_id = current_applicant.tenant_id
    user_email = current_applicant.applicant.email

    # Verify conference exists and is active
    result = await db.execute(
        select(Conference).where(
            Conference.id == conference_id,
            Conference.tenant_id == tenant_id,
            Conference.is_active.is_(True),
        )
    )
    conference = result.scalar_one_or_none()
    if not conference:
        raise NotFoundError("Conference not found")

    # Eagerly resolve tenant slug before session commit (avoids MissingGreenlet)
    tenant_result = await db.execute(select(Tenant.slug).where(Tenant.id == tenant_id))
    tenant_slug = tenant_result.scalar_one()

    # Check alumni status and auto-apply discount
    is_alumni, alumni_discount, alumni_conferences = await validate_alumni_discount(
        db=db,
        tenant_id=tenant_id,
        conference_id=conference_id,
        user_email=user_email,
    )

    # Validate discount code in request
    discount_code_str = None
    if data.discount_code:
        if data.discount_code.upper() == "ALUMNI":
            # Special ALUMNI discount: verify user is actually alumni
            if not is_alumni:
                raise ValidationError("ALUMNI discount code is only for past attendees")
            if not alumni_discount:
                raise ValidationError("ALUMNI discount code is not currently available")
            discount_code_str = "ALUMNI"
        else:
            # Regular discount code — validate it exists and is active
            from datetime import date as date_type

            from app.models.booking import DiscountCode

            dc_result = await db.execute(
                select(DiscountCode).where(
                    DiscountCode.conference_id == conference_id,
                    DiscountCode.code == data.discount_code.upper(),
                    DiscountCode.is_active == True,
                )
            )
            dc = dc_result.scalar_one_or_none()
            if not dc:
                raise ValidationError(f"Invalid discount code: {data.discount_code}")

            # Check date range
            today = date_type.today()
            if dc.start_date and today < dc.start_date:
                raise ValidationError("This discount code is not valid yet")
            if dc.end_date and today > dc.end_date:
                raise ValidationError("This discount code has expired")

            # Check usage limit
            if dc.max_uses > 0 and dc.usage_count >= dc.max_uses:
                raise ValidationError("This discount code has reached its maximum usage limit")

            discount_code_str = dc.code
    elif is_alumni and alumni_discount:
        # Auto-apply ALUMNI discount if user is alumni
        discount_code_str = "ALUMNI"
        logger.info(f"Auto-applying ALUMNI discount for user {user_email} at conference {conference_id}")

    # Validate all referenced booking options
    option_ids = {att.booking_option_id for att in data.attendees}
    opt_map: dict[UUID, BookingOption] = {}
    for oid in option_ids:
        result = await db.execute(
            select(BookingOption).where(
                BookingOption.id == oid,
                BookingOption.conference_id == conference_id,
                BookingOption.tenant_id == tenant_id,
                BookingOption.is_active.is_(True),
            )
        )
        opt = result.scalar_one_or_none()
        if not opt:
            raise ValidationError(f"Invalid booking option: {oid}")
        opt_map[oid] = opt

    # Create billing profile
    payment_intent_id = data.billing.payment_intent_id

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

    billing = BillingProfile(
        tenant_id=tenant_id,
        conference_id=conference_id,
        **data.billing.model_dump(exclude={"payment_method", "payment_intent_id", "discount_code"}),
        payment_method=data.billing.payment_method or "credit_card",
        discount_code=discount_code_str,
    )
    db.add(billing)
    await db.flush()

    # Create registrations
    registrations: list[Registration] = []
    responses: list[RegistrationResponse] = []

    for att in data.attendees:
        # Check for duplicate registration (matches DB unique constraint)
        await _check_email_unique(db, conference_id, att.email)

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
        )
        db.add(reg)
        await db.flush()

        # Create items (tutorials, add-ons) using shared helper
        items = await _create_items(db, reg, att.items or [], conference_id, tenant_id, conference)
        if items:
            await db.flush()

        registrations.append(reg)
        option_name = opt_map[att.booking_option_id].name if att.booking_option_id in opt_map else None
        responses.append(_build_response(reg, option_name=option_name, items=items))

    # Create invoice
    try:
        invoice = await create_invoice_for_registrations(
            db=db,
            registrations=registrations,
            billing_profile=billing,
            conference=conference,
            tenant_id=tenant_id,
            current_user=None,  # No user context for portal registrations
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
            if invoice:
                invoice.status = "paid"
                invoice.stripe_payment_intent_id = payment_intent_id

                # Update PaymentIntent metadata
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

                # Update registration statuses to PAID
                for reg in registrations:
                    reg.status = RegistrationStatus.PAID.value
                logger.info(f"Marked invoice {invoice.id} as paid with PaymentIntent {payment_intent_id}")
        else:
            # Legacy flow: Create PaymentIntent for frontend to confirm
            payment_required = True
            stripe_settings = conference.settings.get("stripe", {})
            if stripe_settings.get("is_enabled") and invoice:
                stripe_publishable_key = stripe_settings.get("publishable_key")
                try:
                    new_payment_intent_id, client_secret = await create_stripe_payment_intent(
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
        # Bank transfer - mark as INVOICED
        if invoice:
            for reg in registrations:
                reg.status = RegistrationStatus.INVOICED.value

    await db.commit()

    # Post-commit: create users and send emails
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

    # Build response
    success_url = f"/{tenant_slug}/portal/{conference.abbreviation}/registration-success"

    return PortalRegistrationResponse(
        billing_profile_id=billing.id,
        registrations=responses,
        payment_required=payment_required,
        payment_client_secret=payment_client_secret,
        stripe_publishable_key=stripe_publishable_key,
        success_url=success_url,
        is_alumni=is_alumni,
        alumni_conferences=alumni_conferences if is_alumni else None,
    )
