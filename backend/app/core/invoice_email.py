"""Invoice email helpers."""

import base64
import logging
from collections.abc import Callable
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

    # Check if ZUGFeRD is enabled (add "zugferd_" prefix to filename)
    zugferd_enabled = False
    if invoice.conference and invoice.conference.settings:
        zugferd_config = invoice.conference.settings.get("zugferd_settings", {})
        zugferd_enabled = zugferd_config.get("enabled", False)

    if zugferd_enabled:
        filename_prefix = f"zugferd_{filename_prefix}"

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


async def send_replacement_invoice_emails(
    db: AsyncSession,
    credit_note: "Invoice",
    new_invoice: "Invoice",
    conference: "Conference",
    payment_link_url: str | None = None,
    custom_message: str | None = None,
) -> tuple[bool, bool]:
    """Send both credit note and replacement invoice emails.

    Used when replacing an invoice due to billing corrections. Sends:
    1. Credit note for the cancelled original invoice
    2. New invoice with corrected billing information

    Args:
        db: Database session
        credit_note: Credit note invoice
        new_invoice: New replacement invoice
        conference: Conference model
        payment_link_url: Optional Stripe payment link URL for new invoice
        custom_message: Optional custom message for both emails

    Returns:
        Tuple of (credit_note_sent, new_invoice_sent)
    """
    credit_note_sent = False
    new_invoice_sent = False

    # Send credit note email
    try:
        credit_note_sent = await send_invoice_email(
            db=db,
            invoice=credit_note,
            conference=conference,
            custom_message=custom_message,
        )
    except Exception as e:
        logger.error(f"Failed to send credit note email for {credit_note.invoice_number}: {e}")

    # Send new invoice email
    try:
        if custom_message:
            new_invoice_message = custom_message
        else:
            original_number = (
                credit_note.related_invoice.invoice_number if credit_note.related_invoice else "previous invoice"
            )
            new_invoice_message = f"This invoice replaces {original_number} due to billing information correction."
        new_invoice_sent = await send_invoice_email(
            db=db,
            invoice=new_invoice,
            conference=conference,
            payment_link_url=payment_link_url,
            custom_message=new_invoice_message,
        )
    except Exception as e:
        logger.error(f"Failed to send new invoice email for {new_invoice.invoice_number}: {e}")

    return credit_note_sent, new_invoice_sent


async def send_registration_cancellation_email(
    registration_email: str,
    registration_name: str,
    conference_name: str,
    invoice_number: str,
    cancellation_message: str | None = None,
) -> bool:
    """Send cancellation email to attendee.

    Args:
        registration_email: Email address of the attendee
        registration_name: Name of the attendee
        conference_name: Name of the conference
        invoice_number: Invoice number that was cancelled
        cancellation_message: Optional custom message from admin

    Returns:
        True if email sent successfully, False otherwise
    """
    try:
        subject = f"Registration Cancellation - {conference_name}"

        # Build email body
        html = f"""
        <p>Dear {registration_name},</p>

        <p>We regret to inform you that your registration for <strong>{conference_name}</strong> has been cancelled
        due to invoice cancellation (Invoice: {invoice_number}).</p>
        """

        if cancellation_message:
            html += f"<p><strong>Message from organizers:</strong><br>{cancellation_message}</p>"

        html += """
        <p>Your user account remains active. If you believe this cancellation was made in error,
        please contact the conference organizers.</p>

        <p>Best regards,<br>
        Conference Team</p>
        """

        return await send_email(
            to=registration_email,
            subject=subject,
            html=html,
        )

    except Exception as e:
        logger.error(f"Failed to send cancellation email to {registration_email}: {e}")
        return False


async def send_email_best_effort(
    email_func: Callable,
    *args,
    operation_name: str,
    invoice_number: str | None = None,
    **kwargs,
) -> bool:
    """Send email with proper error logging (best-effort).

    Use this helper instead of contextlib.suppress(Exception) to ensure
    email failures are logged for monitoring and debugging, while still
    allowing operations to complete successfully.

    Args:
        email_func: Async email function to call
        *args: Positional arguments for email function
        operation_name: Human-readable operation name for logging
        invoice_number: Optional invoice number for logging context
        **kwargs: Keyword arguments for email function

    Returns:
        True if email sent successfully, False if failed

    Example:
        success = await send_email_best_effort(
            send_invoice_email,
            invoice, conference, db,
            operation_name="invoice_send",
            invoice_number=invoice.invoice_number,
        )
    """
    try:
        await email_func(*args, **kwargs)
        logger.info(f"Email sent successfully: {operation_name} (invoice: {invoice_number or 'N/A'})")
        return True
    except Exception as e:
        logger.warning(
            f"Failed to send email: {operation_name} (invoice: {invoice_number or 'N/A'}): {e}",
            exc_info=True,
        )
        return False
