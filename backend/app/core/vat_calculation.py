"""VAT calculation engine for automatic invoice VAT calculation."""

import logging
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.address import _resolve_country_code
from app.core.default_settings import DEFAULT_EU_COUNTRIES, DEFAULT_VAT_RULES
from app.core.vat_rules import get_vat_rule
from app.models.booking import BookingOption
from app.models.invoice import Invoice
from app.models.registration import Registration
from app.models.vat_rate_by_country import VatRateByCountry

logger = logging.getLogger(__name__)


def classify_customer_type(vat_number: str | None) -> str:
    """
    Classify customer as B2B or B2C based on VAT number presence.

    Args:
        vat_number: Customer VAT number (may be None or empty)

    Returns:
        "b2b" if VAT number exists (non-empty), "b2c" otherwise
    """
    return "b2b" if vat_number and vat_number.strip() else "b2c"


def classify_customer_location(recipient_country: str, conference_country: str, eu_countries: list[str]) -> str:
    """
    Classify customer location as domestic, EU, or non-EU.

    Args:
        recipient_country: Customer country ISO code (e.g. "DE", "FR")
        conference_country: Conference country ISO code
        eu_countries: List of EU country ISO codes

    Returns:
        "domestic" if customer is in same country as conference
        "eu" if customer is in different EU country
        "non_eu" if customer is outside EU
    """
    recipient_iso = recipient_country.strip().upper()
    conference_iso = conference_country.strip().upper()
    eu_upper = [c.upper() for c in eu_countries]

    if recipient_iso == conference_iso:
        return "domestic"
    if recipient_iso in eu_upper:
        return "eu"
    return "non_eu"


async def infer_attendance_type_from_registration(invoice: Invoice, db: AsyncSession) -> str | None:
    """
    Infer attendance type from linked registration's booking option.

    Args:
        invoice: Invoice instance (may or may not be linked to registration)
        db: Database session

    Returns:
        Attendance type string if found, None otherwise
    """
    if invoice.recipient_source_type != "registration":
        return None

    if not invoice.recipient_source_id:
        return None

    # Query registration to get booking_option_id
    registration_stmt = select(Registration.booking_option_id).where(Registration.id == invoice.recipient_source_id)
    registration_result = await db.execute(registration_stmt)
    booking_option_id = registration_result.scalar_one_or_none()

    if not booking_option_id:
        logger.warning(
            f"Invoice {invoice.id} linked to registration {invoice.recipient_source_id} but registration not found or has no booking option"
        )
        return None

    # Query booking option to get attendance_type
    booking_option_stmt = select(BookingOption.attendance_type).where(BookingOption.id == booking_option_id)
    booking_option_result = await db.execute(booking_option_stmt)
    attendance_type = booking_option_result.scalar_one_or_none()

    return attendance_type


async def calculate_vat_for_invoice(
    invoice: Invoice,
    conference,  # Conference model instance
    db: AsyncSession,
) -> tuple[Decimal, Decimal, str | None]:
    """
    Calculate VAT rate, tax amount, and notes text for an invoice.

    Main auto-calculation logic implementing the VAT Decision Table (24 rules).
    Based on attendance type, customer type (B2B/B2C), and customer location
    (domestic/EU/non-EU), determines:
    - Whether to charge VAT
    - Which VAT rate to use (conference, customer country, or none)
    - Whether reverse charge or OSS applies (with appropriate notes text)

    Args:
        invoice: Invoice instance with recipient data populated
        conference: Conference instance with country and settings
        db: Database session

    Returns:
        Tuple of (tax_rate, tax_amount, notes_text):
        - tax_rate: Decimal VAT rate percentage (0-100)
        - tax_amount: Decimal tax amount (subtotal * rate / 100, rounded to 2 decimals)
        - notes_text: Optional text to append to invoice notes (reverse charge/OSS)
    """
    # Step 1: Classify customer type (B2B vs B2C)
    customer_type = classify_customer_type(invoice.recipient_vat_number)

    # Step 2: Classify customer location (domestic/EU/non-EU)
    eu_countries = (conference.settings or {}).get("eu_countries", DEFAULT_EU_COUNTRIES)
    customer_location = classify_customer_location(
        invoice.recipient_country or "",
        conference.country or "",
        eu_countries,
    )

    # Step 3: Determine attendance type (priority: direct field → infer from registration → conference venue)
    attendance_type = invoice.attendance_type
    if not attendance_type:
        attendance_type = await infer_attendance_type_from_registration(invoice, db)
    if not attendance_type:
        # Fall back to conference venue_type
        venue_type = conference.venue_type
        if venue_type == "virtual":
            attendance_type = "virtual"
        elif venue_type == "in_person":
            attendance_type = "in_person"
        elif venue_type == "hybrid":
            # For hybrid conferences without explicit attendance type, default to in_person
            logger.warning(
                f"Invoice {invoice.id}: hybrid conference but no attendance type specified, defaulting to in_person"
            )
            attendance_type = "in_person"
        else:
            logger.warning(f"Invoice {invoice.id}: unknown venue type '{venue_type}', defaulting to in_person")
            attendance_type = "in_person"

    # Step 4: Lookup VAT rule from decision table
    vat_rules = (conference.settings or {}).get("vat_rules", DEFAULT_VAT_RULES)
    rule = get_vat_rule(vat_rules, attendance_type, customer_type, customer_location)
    if not rule:
        logger.error(f"No VAT rule found for {attendance_type}/{customer_type}/{customer_location}")
        return (Decimal("0.00"), Decimal("0.00"), None)

    # Step 5: Determine tax rate based on rule
    rate = Decimal("0.00")

    if not rule.get("charge_vat"):
        # No VAT charged
        rate = Decimal("0.00")
    elif rule.get("vat_rate_source") == "conference":
        # Use conference country VAT rate (from country rates table)
        # Priority: tenant-specific rate first, then global fallback
        # Resolve country name to ISO code (e.g., "Germany" → "DE")
        conference_country_iso = _resolve_country_code(conference.country)

        if not conference_country_iso:
            logger.warning(f"Could not resolve conference country '{conference.country}' to ISO code, using 0%")
            rate = Decimal("0.00")
        else:
            # Try tenant-specific rate first
            stmt = select(VatRateByCountry.standard_rate).where(
                VatRateByCountry.tenant_id == conference.tenant_id,
                VatRateByCountry.country_code == conference_country_iso,
            )
            result = await db.execute(stmt)
            fetched_rate = result.scalar_one_or_none()

            # Fall back to global rate if no tenant-specific rate found
            if fetched_rate is None:
                stmt = select(VatRateByCountry.standard_rate).where(
                    VatRateByCountry.tenant_id.is_(None),
                    VatRateByCountry.country_code == conference_country_iso,
                )
                result = await db.execute(stmt)
                fetched_rate = result.scalar_one_or_none()

            if fetched_rate is None:
                logger.warning(
                    f"No VAT rate found for conference country {conference.country} (ISO: {conference_country_iso}), using 0%"
                )
                rate = Decimal("0.00")
            else:
                rate = fetched_rate
    elif rule.get("vat_rate_source") == "customer":
        # Use customer country VAT rate
        # Priority: tenant-specific rate first, then global fallback
        # Resolve country name to ISO code (e.g., "Germany" → "DE")
        recipient_iso = _resolve_country_code(invoice.recipient_country)

        if not recipient_iso:
            logger.warning(f"Could not resolve customer country '{invoice.recipient_country}' to ISO code, using 0%")
            rate = Decimal("0.00")
        else:
            # Try tenant-specific rate first
            stmt = select(VatRateByCountry.standard_rate).where(
                VatRateByCountry.tenant_id == conference.tenant_id,
                VatRateByCountry.country_code == recipient_iso,
            )
            result = await db.execute(stmt)
            fetched_rate = result.scalar_one_or_none()

            # Fall back to global rate if no tenant-specific rate found
            if fetched_rate is None:
                stmt = select(VatRateByCountry.standard_rate).where(
                    VatRateByCountry.tenant_id.is_(None),
                    VatRateByCountry.country_code == recipient_iso,
                )
                result = await db.execute(stmt)
                fetched_rate = result.scalar_one_or_none()

            if fetched_rate is None:
                logger.warning(
                    f"No VAT rate found for customer country {invoice.recipient_country} (ISO: {recipient_iso}), using 0%"
                )
                rate = Decimal("0.00")
            else:
                rate = fetched_rate
    else:
        # vat_rate_source == "none"
        rate = Decimal("0.00")

    # Step 6: Calculate tax amount
    subtotal = Decimal(str(invoice.subtotal)) if invoice.subtotal else Decimal("0.00")
    tax_amount = (subtotal * rate / Decimal("100")).quantize(Decimal("0.01"))

    # Step 7: Generate notes text (reverse charge or OSS)
    notes_text = None
    if rule.get("reverse_charge"):
        notes_text = (
            "VAT Reverse Charge: In accordance with Article 196 of the VAT Directive 2006/112/EC, "
            "the customer is liable for VAT in their country of establishment."
        )
    elif rule.get("oss_applicable"):
        notes_text = (
            f"VAT charged under the EU One-Stop Shop (OSS) scheme at the rate applicable in your country ({rate}%)."
        )

    logger.info(
        f"Invoice {invoice.id} VAT calculated: {attendance_type}/{customer_type}/{customer_location} "
        f"→ {rate}% ({tax_amount})"
    )

    return (rate, tax_amount, notes_text)
