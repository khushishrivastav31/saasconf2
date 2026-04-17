"""CFP-portal *query* services for authenticated registrations.

Read-only endpoints the portal uses to drive the registration UI:
alumni status, public conference details, VAT preview / validation,
and discount-code validation.

The write-side (Stripe PaymentIntent + final ``POST /register``)
lives in :mod:`app.services.cfp_portal_register_service` to keep each
module under the 600-LOC guardrail.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.address import _resolve_country_code
from app.core.alumni_discount import validate_alumni_discount
from app.core.default_settings import DEFAULT_EU_COUNTRIES, DEFAULT_VAT_RULES
from app.core.exceptions import NotFoundError
from app.core.vat_calculation import classify_customer_location, classify_customer_type
from app.core.vat_rules import get_vat_rule
from app.core.vat_validation import validate_vat_number
from app.models.booking import (
    BookingOption,
    BookingPeriod,
    DiscountCode,
    DiscountCodeOption,
    DiscountCodePeriod,
)
from app.models.conference import Conference
from app.models.registration import Registration, RegistrationStatus
from app.models.vat_rate_by_country import VatRateByCountry
from app.schemas.portal_registration import PublicBookingOption, PublicBookingPeriod, PublicConference

# =============================================================================
# Shared helper (also used by cfp_portal_register_service)
# =============================================================================


async def get_active_conference(db: AsyncSession, *, conference_id: UUID, tenant_id: UUID) -> Conference:
    """Fetch an *active* conference owned by the caller's tenant."""
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
    return conference


# =============================================================================
# Alumni check
# =============================================================================


async def check_alumni_status(db: AsyncSession, *, tenant_id: UUID, conference_id: UUID, user_email: str) -> dict:
    await get_active_conference(db, conference_id=conference_id, tenant_id=tenant_id)

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


# =============================================================================
# Public conference details
# =============================================================================


async def get_public_conference_details(db: AsyncSession, *, tenant_id: UUID, conference_id: UUID) -> dict:
    conference = await get_active_conference(db, conference_id=conference_id, tenant_id=tenant_id)

    all_periods_result = await db.execute(
        select(BookingPeriod)
        .where(
            BookingPeriod.conference_id == conference.id,
            BookingPeriod.is_active == True,
        )
        .order_by(BookingPeriod.sort_order)
    )
    all_periods = all_periods_result.scalars().all()

    today = date.today()
    current_period: BookingPeriod | None = None
    for period in all_periods:
        if period.start_date <= today <= period.end_date:
            current_period = period
            break

    options_result = await db.execute(
        select(BookingOption)
        .where(
            BookingOption.conference_id == conference.id,
            BookingOption.is_active == True,
        )
        .order_by(BookingOption.sort_order)
    )
    booking_options_db = options_result.scalars().all()

    booking_options: list[PublicBookingOption] = []
    for option in booking_options_db:
        price = 0.0
        if current_period and current_period.prices:
            option_price = current_period.prices.get(str(option.id))
            if option_price is not None:
                price = float(option_price)
        if price <= 0:
            continue

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

    location = conference.venue_name or conference.city or None
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

    portal_settings = conference.settings.get("public_registration_portal", {}) if conference.settings else {}
    all_policies = (conference.settings or {}).get("policies", {})
    public_policies: dict = {}
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
        registration_start_date=portal_settings.get("registration_start_date"),
        registration_end_date=portal_settings.get("registration_end_date"),
        success_message=portal_settings.get("success_message"),
        policies=public_policies or None,
        stripe_enabled=(conference.settings or {}).get("stripe", {}).get("is_enabled", False),
        stripe_publishable_key=(conference.settings or {}).get("stripe", {}).get("publishable_key"),
        bank_transfer_countries=(conference.settings or {}).get("bank_transfer_countries"),
    ).model_dump()


# =============================================================================
# VAT calculation / validation
# =============================================================================


async def _lookup_country_rate(db: AsyncSession, *, tenant_id: UUID, country_iso: str) -> Decimal | None:
    """Tenant-specific rate with fallback to system defaults (tenant_id IS NULL)."""
    stmt = select(VatRateByCountry.standard_rate).where(
        VatRateByCountry.tenant_id == tenant_id,
        VatRateByCountry.country_code == country_iso,
    )
    result = await db.execute(stmt)
    rate = result.scalar_one_or_none()
    if rate is not None:
        return rate

    stmt = select(VatRateByCountry.standard_rate).where(
        VatRateByCountry.tenant_id.is_(None),
        VatRateByCountry.country_code == country_iso,
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def calculate_vat(
    db: AsyncSession,
    *,
    tenant_id: UUID,
    conference_id: UUID,
    subtotal: float,
    country: str,
    vat_number: str | None,
) -> dict:
    conference = await get_active_conference(db, conference_id=conference_id, tenant_id=tenant_id)

    customer_type = classify_customer_type(vat_number)

    eu_countries = (conference.settings or {}).get("eu_countries", DEFAULT_EU_COUNTRIES)
    customer_location = classify_customer_location(country, conference.country or "", eu_countries)

    venue_type = conference.venue_type
    if venue_type == "virtual":
        attendance_type = "virtual"
    elif venue_type == "in_person":
        attendance_type = "in_person"
    else:
        attendance_type = "in_person"

    vat_rules = (conference.settings or {}).get("vat_rules", DEFAULT_VAT_RULES)
    rule = get_vat_rule(vat_rules, attendance_type, customer_type, customer_location)

    if not rule:
        return {"vat_rate": 0.0, "vat_amount": 0.0, "total": subtotal, "notes": None}

    rate = Decimal("0.00")
    if not rule.get("charge_vat"):
        rate = Decimal("0.00")
    elif rule.get("vat_rate_source") == "conference":
        iso = _resolve_country_code(conference.country)
        if iso:
            fetched = await _lookup_country_rate(db, tenant_id=conference.tenant_id, country_iso=iso)
            if fetched is not None:
                rate = fetched
    elif rule.get("vat_rate_source") == "customer":
        iso = _resolve_country_code(country)
        if iso:
            fetched = await _lookup_country_rate(db, tenant_id=conference.tenant_id, country_iso=iso)
            if fetched is not None:
                rate = fetched

    subtotal_d = Decimal(str(subtotal))
    vat_amount = (subtotal_d * rate / Decimal("100")).quantize(Decimal("0.01"))
    total = subtotal_d + vat_amount

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


async def validate_vat(
    db: AsyncSession, *, tenant_id: UUID, conference_id: UUID, vat_number: str, country: str
) -> dict:
    await get_active_conference(db, conference_id=conference_id, tenant_id=tenant_id)
    return await validate_vat_number(vat_number, country)


# =============================================================================
# Discount code validation
# =============================================================================


async def validate_discount_code(
    db: AsyncSession, *, tenant_id: UUID, conference_id: UUID, code: str, user_email: str
) -> dict:
    conference = await get_active_conference(db, conference_id=conference_id, tenant_id=tenant_id)

    result = await db.execute(
        select(DiscountCode).where(
            DiscountCode.conference_id == conference.id,
            DiscountCode.code == code.upper(),
            DiscountCode.is_active == True,
        )
    )
    discount = result.scalar_one_or_none()
    if not discount:
        return {"valid": False, "message": "Invalid discount code"}

    if code.upper() == "ALUMNI":
        is_alumni, alumni_discount, _ = await validate_alumni_discount(
            db=db,
            tenant_id=tenant_id,
            conference_id=conference.id,
            user_email=user_email,
        )
        if not is_alumni:
            return {"valid": False, "message": "ALUMNI discount is only available to past attendees"}
        if not alumni_discount:
            return {
                "valid": False,
                "message": "ALUMNI discount is not currently available for this conference",
            }

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
    if discount.max_uses > 0 and discount.usage_count >= discount.max_uses:
        return {
            "valid": False,
            "message": "This discount code has reached its maximum usage limit",
        }

    option_result = await db.execute(
        select(DiscountCodeOption.booking_option_id).where(DiscountCodeOption.discount_code_id == discount.id)
    )
    applicable_option_ids = [str(row[0]) for row in option_result.all()]

    period_result = await db.execute(
        select(DiscountCodePeriod.booking_period_id).where(DiscountCodePeriod.discount_code_id == discount.id)
    )
    applicable_period_ids = [str(row[0]) for row in period_result.all()]

    if not applicable_period_ids:
        all_periods_result = await db.execute(
            select(BookingPeriod).where(
                BookingPeriod.conference_id == conference.id,
                BookingPeriod.is_active == True,
            )
        )
        for period in all_periods_result.scalars().all():
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
