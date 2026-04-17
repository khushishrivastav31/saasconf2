"""Invoice replacement service for billing corrections."""

from datetime import date as date_type
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentUser
from app.core.exceptions import ValidationError
from app.core.invoice.number import generate_invoice_number
from app.core.stripe_helper import create_payment_link
from app.models.conference import Conference
from app.models.invoice import Invoice
from app.models.user import User


async def create_replacement_invoice(
    db: AsyncSession,
    old_invoice: Invoice,
    conference: Conference,
    corrected_fields: dict,
    tenant_id: UUID,
    user_id: UUID,
    current_user: User | CurrentUser,
    replacement_reason: str,
) -> Invoice:
    """Create replacement invoice with corrected billing information.

    This creates a new invoice copying all data from the old invoice but with
    corrected billing details. The new invoice inherits the payment status:
    - paid → paid (customer already paid)
    - sent/overdue → sent (customer still needs to pay)

    For sent invoices with credit_card template, a new Stripe payment link is created.

    Args:
        db: Database session
        old_invoice: Invoice being replaced
        conference: Conference the invoice belongs to
        corrected_fields: Dict of corrected billing fields (only non-None values are updated)
        tenant_id: Tenant ID
        user_id: User ID performing the replacement
        current_user: Current user or CurrentUser
        replacement_reason: Reason for replacement

    Returns:
        New invoice with corrected billing information

    Raises:
        ValidationError: If no fields were actually changed
    """
    # Validate that at least one billing field is different
    has_changes = any(
        corrected_fields.get(field) is not None and corrected_fields.get(field) != getattr(old_invoice, field)
        for field in [
            "recipient_name",
            "recipient_email",
            "recipient_address_line1",
            "recipient_address_line2",
            "recipient_city",
            "recipient_state",
            "recipient_postal_code",
            "recipient_country",
            "recipient_vat_number",
            "procurement_code",
        ]
    )

    if not has_changes:
        raise ValidationError("At least one billing field must be different from the original invoice")

    # Generate new invoice number
    new_invoice_number = await generate_invoice_number(db, conference.id, tenant_id)

    # Determine new invoice status based on old invoice status
    # paid → paid (customer already paid)
    # sent/overdue → sent (customer still needs to pay)
    if old_invoice.status == "paid":
        new_status = "paid"
        new_issue_date = old_invoice.issue_date  # Keep original issue date
        new_due_date = old_invoice.due_date  # Keep original due date
    else:
        # sent or overdue → sent
        new_status = "sent"
        new_issue_date = date_type.today()
        new_due_date = old_invoice.due_date

    # Build corrected recipient fields (apply corrections over old values)
    recipient_data = {
        "recipient_name": corrected_fields.get("recipient_name") or old_invoice.recipient_name,
        "recipient_email": corrected_fields.get("recipient_email") or old_invoice.recipient_email,
        "recipient_address_line1": corrected_fields.get("recipient_address_line1")
        or old_invoice.recipient_address_line1,
        "recipient_address_line2": corrected_fields.get("recipient_address_line2")
        or old_invoice.recipient_address_line2,
        "recipient_city": corrected_fields.get("recipient_city") or old_invoice.recipient_city,
        "recipient_state": corrected_fields.get("recipient_state") or old_invoice.recipient_state,
        "recipient_postal_code": corrected_fields.get("recipient_postal_code") or old_invoice.recipient_postal_code,
        "recipient_country": corrected_fields.get("recipient_country") or old_invoice.recipient_country,
        "recipient_vat_number": corrected_fields.get("recipient_vat_number") or old_invoice.recipient_vat_number,
        "procurement_code": corrected_fields.get("procurement_code") or old_invoice.procurement_code,
    }

    # Create replacement invoice (copy everything, apply corrections)
    new_invoice = Invoice(
        tenant_id=tenant_id,
        conference_id=conference.id,
        invoice_number=new_invoice_number,
        template_type=old_invoice.template_type,
        status=new_status,
        issue_date=new_issue_date,
        due_date=new_due_date,
        recipient_source_type=old_invoice.recipient_source_type,
        recipient_source_id=old_invoice.recipient_source_id,
        **recipient_data,
        payment_method=old_invoice.payment_method,
        discount_code=old_invoice.discount_code,
        discount_amount=old_invoice.discount_amount,
        line_items=old_invoice.line_items,
        subtotal=old_invoice.subtotal,
        tax_rate=old_invoice.tax_rate,
        tax_amount=old_invoice.tax_amount,
        total=old_invoice.total,
        currency=old_invoice.currency,
        vat_auto_calculated=old_invoice.vat_auto_calculated,
        attendance_type=old_invoice.attendance_type,
        notes=old_invoice.notes,
        internal_comment=f"Replacement for {old_invoice.invoice_number}. Reason: {replacement_reason}",
        contact_persons=old_invoice.contact_persons,
        # Link to old invoice
        replaces_invoice_id=old_invoice.id,
        replacement_reason=replacement_reason[:50],  # Truncate to 50 chars
    )

    # If sent status + credit_card template, create new Stripe payment link
    # (paid invoices don't need a new link - customer already paid)
    if new_status == "sent" and old_invoice.template_type == "credit_card":
        # Add to database first so invoice has an ID for Stripe metadata
        db.add(new_invoice)
        await db.flush()

        # Create new payment link
        _, payment_link_url = await create_payment_link(db, conference, new_invoice, current_user)
        new_invoice.stripe_payment_link_url = payment_link_url

    return new_invoice
