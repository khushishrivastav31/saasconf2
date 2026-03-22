"""
Checkout Validation API

Public endpoints for discount code validation, VAT calculation preview,
and VAT number validation during the checkout flow.
No authentication required.
"""

import logging
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import select

from app.core.dependencies import DbSessionDep
from app.core.vat_calculation import (
    classify_customer_location,
    classify_customer_type,
)
from app.core.vat_rules import get_vat_rule
from app.core.vat_validation import validate_vat_number
from app.models.booking import DiscountCode, DiscountCodeOption, DiscountCodePeriod
from app.models.vat_rate_by_country import VatRateByCountry

from .registration import resolve_tenant_and_conference

logger = logging.getLogger(__name__)
router = APIRouter()


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
    Performs 3-stage validation: stdnum -> regex -> VIES.
    """
    # Verify tenant and conference exist (basic validation)
    _tenant, _conference = await resolve_tenant_and_conference(db, tenant_slug, conference_slug)

    # Validate VAT number
    return await validate_vat_number(vat_number, country)
