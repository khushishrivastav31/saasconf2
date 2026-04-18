"""Invoice business operation helpers."""

from datetime import date as date_type
from uuid import UUID

from app.core.security.pii_crypto import read_pii
from app.models.invoice import Invoice


def create_credit_note_for_invoice(
    invoice: Invoice,
    credit_note_number: str,
    tenant_id: UUID,
    conference_id: UUID,
) -> Invoice:
    """Create a credit note invoice for a cancelled invoice.

    Copies recipient data and line items from the original invoice,
    negating all financial amounts.

    Args:
        invoice: Original invoice to create credit note for
        credit_note_number: Generated credit note number
        tenant_id: Tenant ID
        conference_id: Conference ID

    Returns:
        New Invoice model with template_type='credit_note' and negated amounts
    """
    # Build negated line items
    credit_line_items = []
    for li in invoice.line_items or []:
        credit_li = dict(li)
        credit_li["total"] = -abs(float(li.get("total", 0)))
        credit_line_items.append(credit_li)

    # Create credit note invoice
    credit_note = Invoice(
        tenant_id=tenant_id,
        conference_id=conference_id,
        invoice_number=credit_note_number,
        template_type="credit_note",
        status="sent",
        issue_date=date_type.today(),
        due_date=None,
        related_invoice_id=invoice.id,
        recipient_source_type=invoice.recipient_source_type,
        recipient_source_id=invoice.recipient_source_id,
        recipient_name=invoice.recipient_name,
        recipient_email=read_pii(invoice, "recipient_email"),
        recipient_address_line1=invoice.recipient_address_line1,
        recipient_address_line2=invoice.recipient_address_line2,
        recipient_city=invoice.recipient_city,
        recipient_state=invoice.recipient_state,
        recipient_postal_code=invoice.recipient_postal_code,
        recipient_country=invoice.recipient_country,
        recipient_vat_number=read_pii(invoice, "recipient_vat_number"),
        line_items=credit_line_items,
        subtotal=-abs(float(invoice.subtotal)) if invoice.subtotal else None,
        tax_rate=invoice.tax_rate,
        tax_amount=-abs(float(invoice.tax_amount)) if invoice.tax_amount else None,
        total=-abs(float(invoice.total)) if invoice.total else None,
        currency=invoice.currency,
        notes=f"Credit note for invoice {invoice.invoice_number}",
        contact_persons=invoice.contact_persons,
    )

    return credit_note
