"""Invoice auto-generation for registrations.

Automatically creates invoices when registrations are created, with automatic
line item generation, VAT calculation, and invoice number assignment.
"""

import logging
from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.booking_helpers import get_active_booking_period
from app.core.dependencies import CurrentUser
from app.core.discount_code_validation import (
    check_discount_applies_to_period,
    increment_discount_usage,
    validate_and_get_discount_code,
)
from app.core.exceptions import ValidationError
from app.core.invoice_line_items import (
    generate_line_items_for_bulk_registrations,
    generate_line_items_from_registration,
)
from app.core.invoice_number import generate_invoice_number
from app.core.stripe_helper import create_payment_link
from app.core.vat_calculation import calculate_vat_for_invoice
from app.models.booking import BookingOption
from app.models.conference import Conference
from app.models.invoice import Invoice
from app.models.program import ProgramSession
from app.models.registration import BillingProfile, Registration, RegistrationItem
from app.models.user import User
from app.schemas.invoice import InvoiceLineItem

logger = logging.getLogger(__name__)


async def _build_attendee_notes(db: AsyncSession, registrations: list[Registration]) -> str:
    """Build notes section with attendee names, packages, and sessions.

    Format (one line per attendee):
    Attendees:
    Name, Package: Session, Add-on 1, Add-on 2, Add-on 3

    Example:
    Hans Müller, Tutorial Day: Back to Testing Basics, Conference Day 1, Conference Day 2

    Args:
        db: Database session
        registrations: List of Registration instances

    Returns:
        Formatted notes string
    """
    if not registrations:
        return ""

    notes_lines = ["Attendees:"]

    for reg in registrations:
        # Build the line components
        parts = []

        # 1. Name
        attendee_name = f"{reg.first_name} {reg.last_name}"
        parts.append(attendee_name)

        # 2. Main package (with session if applicable)
        booking_option_stmt = select(BookingOption).where(BookingOption.id == reg.booking_option_id)
        booking_option_result = await db.execute(booking_option_stmt)
        booking_option = booking_option_result.scalar_one_or_none()
        package_name = booking_option.name if booking_option else "Unknown"

        # Get main session if present
        session_name = None
        if reg.main_session_id:
            session_stmt = select(ProgramSession).where(ProgramSession.id == reg.main_session_id)
            session_result = await db.execute(session_stmt)
            session = session_result.scalar_one_or_none()
            if session:
                session_name = session.title

        # Format: "Package: Session" or just "Package"
        if session_name:
            parts.append(f"{package_name}: {session_name}")
        else:
            parts.append(package_name)

        # 3. Get and sort add-on items by booking option sort_order
        items_stmt = (
            select(RegistrationItem, BookingOption)
            .join(BookingOption, RegistrationItem.booking_option_id == BookingOption.id)
            .where(RegistrationItem.registration_id == reg.id)
            .order_by(BookingOption.sort_order)
        )
        items_result = await db.execute(items_stmt)
        items_with_options = items_result.all()

        for item, _option in items_with_options:
            # Skip duplicate items (backward compatibility)
            if item.booking_option_id == reg.booking_option_id:
                continue
            if item.item_name:
                parts.append(item.item_name)

        # Join all parts with ", "
        notes_lines.append(", ".join(parts))

    return "\n".join(notes_lines)


async def create_invoice_for_registrations(
    db: AsyncSession,
    registrations: list[Registration],
    billing_profile: BillingProfile,
    conference: Conference,
    tenant_id: UUID,
    current_user: User | CurrentUser | None = None,
) -> Invoice | None:
    """Create invoice for one or more registrations.

    Idempotent: checks for existing invoice by billing_profile_id.
    Generates line items from booking options, calculates VAT automatically,
    assigns invoice number, and sets status to 'sent' immediately.
    Creates Stripe payment link for credit card invoices if Stripe is enabled.

    Args:
        db: Database session
        registrations: List of Registration instances (1+ items)
        billing_profile: BillingProfile instance with billing/address data
        conference: Conference instance
        tenant_id: Tenant ID
        current_user: User or CurrentUser creating the invoice (optional, needed for Stripe)

    Returns:
        Invoice instance if created/found, None if creation failed

    Raises:
        ValueError: If no registrations provided or billing profile missing
    """
    if not registrations:
        raise ValueError("At least one registration required to create invoice")

    if not billing_profile:
        raise ValueError("Billing profile required to create invoice")

    # Step 1: Idempotency check - check for existing invoice by billing_profile_id
    # For bulk registrations, single invoice per billing profile
    existing_invoice_stmt = select(Invoice).where(
        Invoice.recipient_source_type == "registration",
        Invoice.recipient_source_id == billing_profile.id,
        Invoice.conference_id == conference.id,
        Invoice.tenant_id == tenant_id,
        Invoice.is_active == True,
    )
    existing_invoice_result = await db.execute(existing_invoice_stmt)
    existing_invoice = existing_invoice_result.scalar_one_or_none()

    if existing_invoice:
        logger.info(
            f"Invoice {existing_invoice.id} already exists for billing profile {billing_profile.id}, "
            f"returning existing invoice"
        )
        return existing_invoice

    # Step 2: Get active booking period for pricing
    booking_period = await get_active_booking_period(
        db,
        conference.id,
        tenant_id,
        registration_date=date.today(),
    )

    if not booking_period:
        logger.error(f"No active booking period found for conference {conference.id}, cannot generate invoice")
        return None

    # Step 2.5: Validate and get discount code if provided
    discount_code = None
    total_discount = Decimal("0.00")

    if billing_profile.discount_code:
        try:
            discount_code = await validate_and_get_discount_code(
                db, billing_profile.discount_code, conference.id, tenant_id, registration_date=date.today()
            )

            # Check if discount applies to current booking period
            period_applies = await check_discount_applies_to_period(db, discount_code.id, booking_period.id)

            if not period_applies:
                logger.warning(
                    f"Discount code '{billing_profile.discount_code}' does not apply "
                    f"to current booking period {booking_period.name}"
                )
                discount_code = None

        except ValidationError as e:
            logger.warning(f"Discount code validation failed: {e}. Invoice will be created without discount.")
            discount_code = None

    # Step 3: Generate line items (single or consolidated for bulk) WITH discount application
    line_items: list[InvoiceLineItem] = []
    subtotal = Decimal("0.00")

    if len(registrations) == 1:
        # Single registration: individual line items
        line_items, subtotal, total_discount = await generate_line_items_from_registration(
            db, registrations[0], booking_period, discount_code
        )
    else:
        # Bulk registrations: consolidated line items grouped by (description, unit_price, discount)
        line_items, subtotal, total_discount = await generate_line_items_for_bulk_registrations(
            db, registrations, booking_period, discount_code
        )

    if not line_items:
        logger.warning(
            f"No line items generated for registrations {[r.id for r in registrations]}, "
            f"invoice will have empty line items"
        )

    # Step 4: Create invoice instance (not yet persisted)
    # Build recipient name from billing profile
    if billing_profile.company_name:
        recipient_name = billing_profile.company_name
    else:
        recipient_name = f"{billing_profile.contact_first_name} {billing_profile.contact_last_name}"

    # Determine payment method and template type
    payment_method = billing_profile.payment_method or "bank_transfer"
    template_type = "credit_card" if payment_method == "credit_card" else "bank_transfer"

    invoice = Invoice(
        tenant_id=tenant_id,
        conference_id=conference.id,
        template_type=template_type,
        status="sent",  # Set to sent immediately (not draft)
        issue_date=date.today(),
        due_date=date.today() + timedelta(days=30),  # 30-day payment term
        recipient_source_type="registration",
        recipient_source_id=billing_profile.id,  # Link to billing profile, not individual registration
        recipient_name=recipient_name,
        recipient_email=billing_profile.contact_email,
        recipient_address_line1=billing_profile.street,
        recipient_address_line2=None,
        recipient_city=billing_profile.city,
        recipient_state=None,
        recipient_postal_code=billing_profile.postal_code,
        recipient_country=billing_profile.country,
        recipient_vat_number=billing_profile.vat_number,
        procurement_code=billing_profile.procurement_code,
        payment_method=payment_method,
        discount_code=billing_profile.discount_code,
        line_items=[item.model_dump() for item in line_items],
        subtotal=subtotal,
        currency=booking_period.currency or "EUR",
        is_active=True,
    )

    # Store discount amount on invoice
    invoice.discount_amount = total_discount

    # Step 5: Auto-calculate VAT on discounted subtotal
    discounted_subtotal = subtotal - total_discount
    tax_rate, tax_amount, notes_text = await calculate_vat_for_invoice(invoice, conference, db)
    invoice.tax_rate = tax_rate
    invoice.tax_amount = tax_amount
    invoice.total = discounted_subtotal + tax_amount
    invoice.vat_auto_calculated = True

    # Increment discount usage counter
    if discount_code:
        await increment_discount_usage(db, discount_code)
        logger.info(
            f"Applied discount code '{discount_code.code}' ({discount_code.discount_type}: "
            f"{discount_code.discount_value}), total discount: {total_discount}"
        )

    if billing_profile.discount_code and not discount_code:
        logger.info(
            f"Discount code '{billing_profile.discount_code}' stored but not yet validated/applied "
            f"(future enhancement: per-line-item discounts)"
        )

    # Build attendee notes (names, packages, sessions)
    attendee_notes = await _build_attendee_notes(db, registrations)
    if attendee_notes:
        invoice.notes = attendee_notes

    # Append VAT notes (reverse charge/OSS) if applicable
    if notes_text:
        if invoice.notes:
            invoice.notes = f"{invoice.notes}\n\n{notes_text}"
        else:
            invoice.notes = notes_text

    # Step 6: Assign invoice number
    invoice.invoice_number = await generate_invoice_number(db, conference.id, tenant_id)

    # Step 7: Persist invoice
    db.add(invoice)
    await db.flush()  # Flush to get invoice ID but don't commit yet

    logger.info(
        f"Invoice {invoice.invoice_number} created for {len(registrations)} registration(s), "
        f"subtotal={subtotal}, VAT={tax_amount} ({tax_rate}%), total={invoice.total}"
    )

    # Step 8: Create Stripe payment link for credit card invoices
    if invoice.template_type == "credit_card" and current_user:
        try:
            _payment_intent_id, payment_link_url = await create_payment_link(db, conference, invoice, current_user)
            invoice.stripe_payment_link_url = payment_link_url
            logger.info(f"Created Stripe payment link for invoice {invoice.invoice_number}: {payment_link_url}")
        except Exception as e:
            # Log error but don't fail invoice creation
            logger.warning(
                f"Failed to create Stripe payment link for invoice {invoice.invoice_number}: {e}. "
                "Invoice created successfully but payment link unavailable."
            )

    return invoice
