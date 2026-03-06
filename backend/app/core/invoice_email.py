"""Invoice email helpers."""

import base64
import logging
from typing import TYPE_CHECKING

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.email import send_email
from app.core.invoice_pdf import generate_invoice_pdf

if TYPE_CHECKING:
    from app.models.conference import Conference
    from app.models.invoice import Invoice

logger = logging.getLogger(__name__)


def build_pdf_attachment(pdf_bytes: bytes, invoice: "Invoice") -> dict:
    """Build email attachment dict from PDF bytes.

    Args:
        pdf_bytes: PDF file content
        invoice: Invoice model

    Returns:
        Dict with filename and base64-encoded content
    """
    is_credit_note = invoice.template_type == "credit_note"
    filename_prefix = "credit_note" if is_credit_note else "invoice"

    return {
        "filename": f"{filename_prefix}_{invoice.invoice_number}.pdf",
        "content": base64.b64encode(pdf_bytes).decode("ascii"),
    }


def build_invoice_email_html(
    invoice: "Invoice",
    payment_link_url: str | None = None,
    custom_message: str | None = None,
) -> str:
    """Build HTML email content for invoice/credit note.

    Args:
        invoice: Invoice model
        payment_link_url: Optional Stripe payment link URL
        custom_message: Optional custom message (overrides default)

    Returns:
        HTML string for email body
    """
    is_credit_note = invoice.template_type == "credit_note"
    doc_label = "Credit Note" if is_credit_note else "Invoice"

    if custom_message:
        html = f"<p>{custom_message}</p>"
    else:
        html = f"<p>Please find attached {doc_label.lower()} {invoice.invoice_number}.</p>"

    # Add payment link button for credit card invoices
    if payment_link_url:
        html += (
            f'<p><a href="{payment_link_url}" '
            'style="display: inline-block; padding: 10px 20px; background-color: #0066cc; '
            'color: white; text-decoration: none; border-radius: 5px; margin-top: 10px;">'
            "Pay Online</a></p>"
        )

    return html


async def send_invoice_email(
    db: AsyncSession,
    invoice: "Invoice",
    conference: "Conference",
    payment_link_url: str | None = None,
    custom_subject: str | None = None,
    custom_message: str | None = None,
) -> bool:
    """Send invoice/credit note email with PDF attachment.

    Args:
        db: Database session
        invoice: Invoice model
        conference: Conference model
        payment_link_url: Optional Stripe payment link URL
        custom_subject: Optional custom subject (overrides default)
        custom_message: Optional custom message (overrides default)

    Returns:
        True if email sent successfully, False otherwise
    """
    if not invoice.recipient_email:
        logger.warning(f"Cannot send email for invoice {invoice.id}: no recipient email")
        return False

    try:
        # Generate PDF
        pdf_bytes = await generate_invoice_pdf(invoice, conference, db)

        # Build attachment
        attachment = build_pdf_attachment(pdf_bytes, invoice)

        # Build email content
        is_credit_note = invoice.template_type == "credit_note"
        doc_label = "Credit Note" if is_credit_note else "Invoice"

        subject = custom_subject or f"{doc_label} {invoice.invoice_number}"
        html = build_invoice_email_html(invoice, payment_link_url, custom_message)

        # Send email
        return await send_email(
            to=invoice.recipient_email,
            subject=subject,
            html=html,
            attachments=[attachment],
        )

    except Exception as e:
        logger.error(f"Failed to send email for invoice {invoice.id}: {e}")
        return False
