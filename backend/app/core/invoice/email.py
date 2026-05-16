"""Invoice email helpers."""

import base64
import logging
from collections.abc import Callable
from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.email import send_email
from app.core.email_templates import build_invoice_send_context, render_email
from app.core.exceptions import InvoiceSendConfigurationError
from app.core.invoice.pdf import generate_invoice_pdf
from app.core.security.pii_crypto import read_pii
from app.models.tenant import Tenant
from app.schemas.email_template import EmailTemplateType

if TYPE_CHECKING:
    from app.models.conference import Conference
    from app.models.invoice import Invoice


ACCOUNTING_EMAIL_REQUIRED_MESSAGE = "Set Accounting Email on My Company before sending invoices or credit notes."


async def _resolve_invoice_cc(
    db: AsyncSession,
    tenant_id: UUID,
    recipient_email: str,
    scope_contact_email: str | None,
) -> list[str]:
    """Return the CC list for an invoice/credit-note send.

    Always includes the tenant ``accounting_email`` (raises
    :class:`InvoiceSendConfigurationError` if unset), plus the scope's own
    contact email (conference ``contact_email`` or Training Company email)
    when it is set and not a duplicate of either the accounting address or
    the TO recipient.
    """
    row = await db.execute(select(Tenant.accounting_email).where(Tenant.id == tenant_id))
    accounting_email = row.scalar_one_or_none()
    if not accounting_email:
        raise InvoiceSendConfigurationError(ACCOUNTING_EMAIL_REQUIRED_MESSAGE)

    cc_list = [accounting_email]
    recipient_norm = recipient_email.lower()
    if scope_contact_email:
        scope_norm = scope_contact_email.lower()
        if scope_norm != accounting_email.lower() and scope_norm != recipient_norm:
            cc_list.append(scope_contact_email)
    return cc_list


logger = logging.getLogger(__name__)


def build_pdf_attachment(pdf_bytes: bytes, invoice: "Invoice", conference: "Any | None" = None) -> dict:
    """Build email attachment dict from PDF bytes.

    Args:
        pdf_bytes: PDF file content
        invoice: Invoice model
        conference: Pre-loaded conference (avoids DetachedInstanceError when invoice is detached)

    Returns:
        Dict with filename and base64-encoded content
    """
    is_credit_note = invoice.template_type == "credit_note"
    filename_prefix = "credit_note" if is_credit_note else "invoice"

    # Check if ZUGFeRD is enabled (add "zugferd_" prefix to filename)
    # Use pre-loaded conference when provided; fall back to invoice.conference
    # but catch DetachedInstanceError when invoice is detached from its session.
    zugferd_enabled = False
    conf = conference
    if conf is None:
        try:
            conf = invoice.conference
        except Exception:
            conf = None
    if conf and conf.settings:
        zugferd_config = conf.settings.get("zugferd_settings", {})
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
    recipient_email = read_pii(invoice, "recipient_email")
    if not recipient_email:
        logger.warning(f"Cannot send email for invoice {invoice.id}: no recipient email")
        return False

    # Resolve CC list up-front so the guard raises BEFORE we spend time
    # generating a PDF. Missing accounting_email surfaces as a 422 to the
    # API caller via the InvoiceSendConfigurationError handler.
    cc_list = await _resolve_invoice_cc(
        db,
        tenant_id=conference.tenant_id,
        recipient_email=recipient_email,
        scope_contact_email=conference.contact_email,
    )

    try:
        # Generate PDF
        pdf_bytes = await generate_invoice_pdf(invoice, conference, db)

        # Build attachment
        attachment = build_pdf_attachment(pdf_bytes, invoice)

        # Get conference support email
        settings = get_settings()
        support_email = conference.support_email or conference.contact_email or settings.RESEND_FROM_EMAIL

        # Build template context
        is_credit_note = invoice.template_type == "credit_note"
        doc_label = "Credit Note" if is_credit_note else "Invoice"
        total_str = f"{invoice.currency or 'EUR'} {invoice.total or 0:.2f}"
        due_str = invoice.due_date.strftime("%B %d, %Y") if invoice.due_date else "N/A"

        context = build_invoice_send_context(
            recipient_name=invoice.recipient_name or "",
            conference_name=conference.name,
            invoice_number=invoice.invoice_number or "DRAFT",
            total_amount=total_str,
            due_date=due_str,
            support_email=support_email,
            custom_message=custom_message or f"Please find attached {doc_label.lower()} {invoice.invoice_number}.",
            payment_link=payment_link_url or "",
        )

        rendered = await render_email(
            db,
            EmailTemplateType.INVOICE_SEND,
            context,
            conference_id=conference.id,
            tenant_id=conference.tenant_id,
        )

        subject = custom_subject or rendered.subject

        # Send email
        return await send_email(
            to=recipient_email,
            subject=subject,
            html=rendered.body_html,
            text=rendered.body_text,
            attachments=[attachment],
            cc=cc_list,
            db=db,
            tenant_id=conference.tenant_id,
            conference_id=conference.id,
            email_type="invoice",
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

    # Send credit note email.
    # InvoiceSendConfigurationError (e.g. missing accounting_email) has to
    # escape so the caller can surface it as 422 — swallowing it here would
    # silently produce an invoice with no CC.
    try:
        credit_note_sent = await send_invoice_email(
            db=db,
            invoice=credit_note,
            conference=conference,
            custom_message=custom_message,
        )
    except InvoiceSendConfigurationError:
        raise
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
    except InvoiceSendConfigurationError:
        raise
    except Exception as e:
        logger.error(f"Failed to send new invoice email for {new_invoice.invoice_number}: {e}")

    return credit_note_sent, new_invoice_sent


async def send_registration_cancellation_email(
    db: AsyncSession,
    registration_email: str,
    registration_name: str,
    conference_name: str,
    invoice_number: str,
    conference_id: UUID,
    tenant_id: UUID,
    cancellation_message: str | None = None,
) -> bool:
    """Send cancellation email to attendee using customizable template.

    Args:
        db: Database session
        registration_email: Email address of the attendee
        registration_name: Name of the attendee
        conference_name: Name of the conference
        invoice_number: Invoice number that was cancelled
        conference_id: Conference ID for template lookup
        tenant_id: Tenant ID for template lookup
        cancellation_message: Optional custom message from admin

    Returns:
        True if email sent successfully, False otherwise
    """
    try:
        from app.core.email_templates import build_registration_cancellation_context, render_email
        from app.schemas.email_template import EmailTemplateType

        # Build context for email template
        context = build_registration_cancellation_context(
            registration_name=registration_name,
            conference_name=conference_name,
            invoice_number=invoice_number,
            cancellation_message=cancellation_message or "",
        )

        # Render email template
        rendered = await render_email(
            db,
            EmailTemplateType.REGISTRATION_CANCELLATION,
            context,
            conference_id=conference_id,
            tenant_id=tenant_id,
        )

        # Send email
        return await send_email(
            to=registration_email,
            subject=rendered.subject,
            html=rendered.body_html,
            text=rendered.body_text,
            db=db,
            tenant_id=tenant_id,
            conference_id=conference_id,
            email_type="cancellation",
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
