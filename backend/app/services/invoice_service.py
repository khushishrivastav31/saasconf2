"""Invoice business logic service layer.

This module contains reusable business logic extracted from API endpoints.
Functions are pure business logic with no HTTP dependencies (no Request, HTTPException, etc.).

The service layer handles:
- Invoice creation with VAT calculation
- Invoice lifecycle operations (send, cancel, replace, reopen)
- Stripe payment synchronization
- Business rule validation

API endpoints call these functions and handle HTTP concerns (auth, responses, status codes).
"""

import logging
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ValidationError
from app.core.invoice_events import InvoiceEventType, log_invoice_event
from app.core.invoice_number import generate_invoice_number
from app.core.invoice_operations import create_credit_note_for_invoice
from app.core.invoice_registration_cancellation import cancel_registrations_for_invoice
from app.core.invoice_replacement import create_replacement_invoice
from app.core.invoice_validation import validate_recipient_fields
from app.core.stripe_helper import create_payment_link
from app.models.conference import Conference
from app.models.invoice import Invoice
from app.schemas.invoice import InvoiceCreate

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════
# Invoice Creation
# ═══════════════════════════════════════════════════════════════════════


async def auto_populate_attendance_type_from_registration(
    db: AsyncSession,
    invoice_data: InvoiceCreate,
) -> str | None:
    """Auto-populate attendance_type from registration's booking option.

    Args:
        db: Database session
        invoice_data: Invoice creation data

    Returns:
        Attendance type from booking option, or None if not found
    """
    if (
        invoice_data.attendance_type  # Already set
        or invoice_data.recipient_source_type != "registration"
        or not invoice_data.recipient_source_id
    ):
        return invoice_data.attendance_type

    from app.models.booking import BookingOption
    from app.models.registration import Registration

    registration_stmt = select(Registration.booking_option_id).where(
        Registration.id == invoice_data.recipient_source_id
    )
    registration_result = await db.execute(registration_stmt)
    booking_option_id = registration_result.scalar_one_or_none()

    if not booking_option_id:
        return None

    booking_option_stmt = select(BookingOption.attendance_type).where(BookingOption.id == booking_option_id)
    booking_option_result = await db.execute(booking_option_stmt)
    return booking_option_result.scalar_one_or_none()


# ═══════════════════════════════════════════════════════════════════════
# Invoice Operations
# ═══════════════════════════════════════════════════════════════════════


async def assign_invoice_number_and_mark_sent(
    db: AsyncSession,
    invoice: Invoice,
    conference: Conference,
    tenant_id: UUID,
    user_id: UUID,
) -> Invoice:
    """Assign invoice number and update status to sent.

    Business logic for sending an invoice:
    1. Validate invoice is sendable (draft status)
    2. Assign sequential invoice number
    3. Set issue date if not set
    4. Update status to sent
    5. Log event

    Args:
        db: Database session
        invoice: Invoice to send
        conference: Conference
        tenant_id: Tenant ID for audit
        user_id: User ID for audit

    Returns:
        Updated invoice with number assigned

    Raises:
        ValidationError: If invoice already sent or cannot be sent
    """
    if invoice.status not in ["draft"]:
        raise ValidationError(f"Cannot send invoice with status '{invoice.status}'. Must be draft.")

    # Assign invoice number if not already assigned
    if not invoice.invoice_number:
        invoice.invoice_number = await generate_invoice_number(db, conference.id, invoice.tenant_id)

    # Set issue date to today if not set
    if not invoice.issue_date:
        invoice.issue_date = datetime.now(UTC).date()

    # Update status
    invoice.status = "sent"

    # Log event
    await log_invoice_event(
        db=db,
        invoice_id=invoice.id,
        tenant_id=tenant_id,
        event_type=InvoiceEventType.INVOICE_SENT,
        status="succeeded",
        metadata={"invoice_number": invoice.invoice_number},
    )

    return invoice


async def cancel_invoice_with_credit_note_creation(
    db: AsyncSession,
    invoice: Invoice,
    conference: Conference,
    tenant_id: UUID,
    user_id: UUID,
    reason: str,
    cancel_registrations: bool = False,
    cancellation_email_message: str | None = None,
) -> tuple[Invoice, Invoice, int, int]:
    """Cancel invoice and create credit note.

    Business logic for invoice cancellation:
    1. Validate invoice can be cancelled (sent/paid/overdue)
    2. Create credit note
    3. Link invoices
    4. Optionally cancel registrations
    5. Handle Stripe refund if paid
    6. Log events

    Args:
        db: Database session
        invoice: Invoice to cancel
        conference: Conference
        tenant_id: Tenant ID
        user_id: User ID
        reason: Cancellation reason
        cancel_registrations: Whether to cancel associated registrations
        cancellation_email_message: Optional message for cancellation emails

    Returns:
        Tuple of (cancelled_invoice, credit_note, registrations_cancelled, access_removed_count)

    Raises:
        ValidationError: If invoice cannot be cancelled
    """
    if invoice.status not in ["sent", "paid", "overdue"]:
        raise ValidationError(f"Cannot cancel invoice with status '{invoice.status}'")

    if invoice.template_type == "credit_note":
        raise ValidationError("Cannot cancel a credit note")

    # Generate credit note number
    credit_note_number = await generate_invoice_number(db, conference.id, tenant_id)

    # Create credit note
    credit_note = create_credit_note_for_invoice(
        invoice=invoice,
        credit_note_number=credit_note_number,
        tenant_id=tenant_id,
        conference_id=conference.id,
    )
    db.add(credit_note)

    # Update original invoice
    invoice.status = "cancelled"
    invoice.related_invoice_id = credit_note.id

    # Log cancellation event
    await log_invoice_event(
        db=db,
        invoice_id=invoice.id,
        tenant_id=tenant_id,
        event_type=InvoiceEventType.INVOICE_CANCELLED,
        status="succeeded",
        metadata={"reason": reason, "credit_note_id": str(credit_note.id)},
    )

    # Handle registration cancellation if requested
    registrations_cancelled = 0
    access_removed_count = 0
    if cancel_registrations:
        registrations_cancelled, access_removed_count, _ = await cancel_registrations_for_invoice(
            db=db,
            invoice=invoice,
            conference=conference,
            tenant_id=tenant_id,
            user_id=user_id,
            cancellation_message=cancellation_email_message,
        )

    # Handle Stripe refund if invoice was paid with credit card
    if invoice.status == "paid" and invoice.template_type == "credit_card" and invoice.stripe_payment_intent_id:
        # Refund is handled by caller (API layer) to keep service layer pure
        pass

    return invoice, credit_note, registrations_cancelled, access_removed_count


# ═══════════════════════════════════════════════════════════════════════
# Stripe Operations
# ═══════════════════════════════════════════════════════════════════════


async def create_stripe_payment_link_for_invoice(
    db: AsyncSession,
    invoice: Invoice,
    conference: Conference,
    current_user,
) -> str:
    """Create Stripe payment link for credit card invoice.

    Args:
        db: Database session
        invoice: Invoice to create payment link for
        conference: Conference with Stripe settings
        current_user: Current user for audit

    Returns:
        Payment link URL

    Raises:
        ValidationError: If Stripe not enabled or invoice not credit_card type
    """
    if invoice.template_type != "credit_card":
        raise ValidationError("Can only create payment link for credit_card invoices")

    _, payment_link_url = await create_payment_link(
        db=db,
        conference=conference,
        invoice=invoice,
        current_user=current_user,
    )

    return payment_link_url


# ═══════════════════════════════════════════════════════════════════════
# Validation Helpers
# ═══════════════════════════════════════════════════════════════════════


def validate_invoice_sendable(invoice: Invoice) -> None:
    """Validate invoice can be sent.

    Args:
        invoice: Invoice to validate

    Raises:
        ValidationError: If invoice cannot be sent
    """
    # Check status
    if invoice.status not in ["draft", "sent", "overdue"]:
        raise ValidationError(f"Cannot send invoice with status '{invoice.status}'")

    # Validate required recipient fields
    from app.schemas.invoice import InvoiceCreate

    # Create minimal schema for validation
    invoice_data = InvoiceCreate(
        invoice_number=invoice.invoice_number,
        template_type=invoice.template_type,
        status=invoice.status,
        recipient_source_type=invoice.recipient_source_type,
        recipient_name=invoice.recipient_name or "",
        recipient_email=invoice.recipient_email or "",
        recipient_address_line1=invoice.recipient_address_line1 or "",
        recipient_address_line2=invoice.recipient_address_line2,
        recipient_city=invoice.recipient_city or "",
        recipient_state=invoice.recipient_state,
        recipient_postal_code=invoice.recipient_postal_code or "",
        recipient_country=invoice.recipient_country or "",
        recipient_vat_number=invoice.recipient_vat_number,
        line_items=[],
        subtotal=float(invoice.subtotal) if invoice.subtotal is not None else 0.0,
        tax_rate=float(invoice.tax_rate) if invoice.tax_rate is not None else None,
        tax_amount=float(invoice.tax_amount) if invoice.tax_amount is not None else None,
        total=float(invoice.total) if invoice.total is not None else None,
        currency=invoice.currency,
        procurement_code=invoice.procurement_code,
        attendance_type=invoice.attendance_type,
    )
    validate_recipient_fields(invoice_data)


# ═══════════════════════════════════════════════════════════════════════
# Invoice Sending
# ═══════════════════════════════════════════════════════════════════════


async def prepare_invoice_for_sending(
    db: AsyncSession,
    invoice: Invoice,
    conference: Conference,
    current_user,
) -> tuple[bool, str | None]:
    """Prepare invoice for sending (assign number, create payment link if needed).

    Args:
        db: Database session
        invoice: Invoice to prepare
        conference: Conference
        current_user: Current user for audit

    Returns:
        Tuple of (is_first_send, payment_link_url)

    Raises:
        ValidationError: If invoice cannot be sent
    """
    # Validate invoice can be sent
    if invoice.status not in ("draft", "sent", "overdue"):
        raise ValidationError(f"Cannot send an invoice with status '{invoice.status}'")

    if not invoice.recipient_email:
        raise ValidationError("Invoice has no recipient email address")

    # Check if first send (draft) or resend
    is_first_send = invoice.status == "draft"

    if is_first_send:
        # Validate required fields for first send
        if not invoice.recipient_name:
            raise ValidationError("Recipient name is required")
        if not (invoice.line_items and len(invoice.line_items) > 0):
            raise ValidationError("At least one line item is required")

        # Assign number and mark sent
        invoice.invoice_number = await generate_invoice_number(db, conference.id, invoice.tenant_id)
        invoice.status = "sent"
        if invoice.issue_date is None:
            from datetime import date as date_type

            invoice.issue_date = date_type.today()

        # Log sent event
        await log_invoice_event(
            db=db,
            invoice_id=invoice.id,
            tenant_id=invoice.tenant_id,
            event_type=InvoiceEventType.INVOICE_SENT,
            status="succeeded",
            metadata={"invoice_number": invoice.invoice_number},
        )

    # Handle Stripe payment link for credit card invoices
    payment_link_url = None
    if invoice.template_type == "credit_card":
        if is_first_send:
            # First send: create new payment link
            payment_link_url = await create_stripe_payment_link_for_invoice(
                db=db,
                invoice=invoice,
                conference=conference,
                current_user=current_user,
            )
        else:
            # Resend: use existing payment link if available
            payment_link_url = invoice.stripe_payment_link_url

    return is_first_send, payment_link_url


# ═══════════════════════════════════════════════════════════════════════
# Invoice Replacement
# ═══════════════════════════════════════════════════════════════════════


async def replace_invoice_with_billing_correction(
    db: AsyncSession,
    old_invoice: Invoice,
    conference: Conference,
    corrected_fields: dict,
    tenant_id: UUID,
    user_id: UUID,
    current_user,
    reason: str,
) -> tuple[Invoice, Invoice, Invoice, int]:
    """Replace invoice with corrected billing information.

    Creates new invoice with corrected data, cancels old one, creates credit note.

    Args:
        db: Database session
        old_invoice: Invoice to replace
        conference: Conference
        corrected_fields: Dict of fields to update on new invoice
        tenant_id: Tenant ID
        user_id: User ID
        current_user: Current user for Stripe operations
        reason: Replacement reason

    Returns:
        Tuple of (old_invoice, credit_note, new_invoice, registrations_transferred)

    Raises:
        ValidationError: If invoice cannot be replaced
    """
    if old_invoice.status not in ["sent", "paid", "overdue"]:
        raise ValidationError(f"Cannot replace invoice with status '{old_invoice.status}'")

    if old_invoice.template_type == "credit_note":
        raise ValidationError("Cannot replace a credit note")

    # Create replacement invoice
    new_invoice = await create_replacement_invoice(
        db=db,
        old_invoice=old_invoice,
        conference=conference,
        corrected_fields=corrected_fields,
        tenant_id=tenant_id,
        user_id=user_id,
        current_user=current_user,
        replacement_reason=reason,
    )

    # Validate/transfer registrations (they auto-follow via BillingProfile)
    from app.core.invoice_registration_transfer import transfer_registrations_to_invoice

    registrations_transferred = await transfer_registrations_to_invoice(
        db=db,
        old_invoice=old_invoice,
        new_invoice=new_invoice,
        tenant_id=tenant_id,
    )

    # Generate credit note number
    credit_note_number = await generate_invoice_number(db, conference.id, tenant_id)

    # Cancel old invoice with credit note
    credit_note = create_credit_note_for_invoice(
        invoice=old_invoice,
        credit_note_number=credit_note_number,
        tenant_id=tenant_id,
        conference_id=conference.id,
    )
    db.add(credit_note)

    # Update statuses and links
    old_invoice.status = "cancelled"
    old_invoice.related_invoice_id = credit_note.id
    old_invoice.replaced_by_invoice_id = new_invoice.id
    old_invoice.replacement_reason = reason

    new_invoice.replaces_invoice_id = old_invoice.id

    # Log events
    await log_invoice_event(
        db=db,
        invoice_id=old_invoice.id,
        tenant_id=tenant_id,
        event_type=InvoiceEventType.INVOICE_CANCELLED,
        status="succeeded",
        metadata={"new_invoice_id": str(new_invoice.id), "reason": reason, "action": "replaced"},
    )
    await log_invoice_event(
        db=db,
        invoice_id=new_invoice.id,
        tenant_id=tenant_id,
        event_type=InvoiceEventType.INVOICE_SENT,
        status="succeeded",
        metadata={"replaces_invoice_id": str(old_invoice.id), "action": "replacement_created"},
    )

    return old_invoice, credit_note, new_invoice, registrations_transferred
