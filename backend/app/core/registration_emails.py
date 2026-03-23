"""Registration email sending functions.

Sends invoice and welcome emails when registrations are created.
"""

import logging
from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.email import send_email
from app.core.email_templates import (
    build_attendee_welcome_context,
    build_registration_invoice_context,
    render_email,
)
from app.core.invoice_email import build_pdf_attachment
from app.core.invoice_pdf import generate_invoice_pdf
from app.models.booking import BookingOption
from app.schemas.email_template import EmailTemplateType

if TYPE_CHECKING:
    from app.models.conference import Conference
    from app.models.invoice import Invoice
    from app.models.registration import Registration

logger = logging.getLogger(__name__)

settings = get_settings()


async def send_registration_invoice_email(
    db: AsyncSession,
    invoice: "Invoice",
    conference: "Conference",
) -> bool:
    """Send invoice email with PDF attachment to billing contact.

    Uses the REGISTRATION_INVOICE email template and sends the generated
    invoice PDF as an attachment.

    Args:
        db: Database session
        invoice: Invoice instance
        conference: Conference instance

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

        # Get conference support email (fallback to settings)
        support_email = conference.support_email or conference.contact_email or settings.RESEND_FROM_EMAIL

        # Build context for email template
        context = build_registration_invoice_context(
            recipient_name=invoice.recipient_name,
            conference_name=conference.name,
            invoice_number=invoice.invoice_number or "DRAFT",
            total_amount=f"{invoice.currency or 'EUR'} {invoice.total or 0:.2f}",
            due_date=invoice.due_date.strftime("%B %d, %Y") if invoice.due_date else "N/A",
            support_email=support_email,
        )

        # Render email template
        rendered = await render_email(
            db,
            EmailTemplateType.REGISTRATION_INVOICE,
            context,
            conference_id=conference.id,
            tenant_id=conference.tenant_id,
        )

        # Send email
        success = await send_email(
            to=invoice.recipient_email,
            subject=rendered.subject,
            html=rendered.body_html,
            text=rendered.body_text,
            reply_to=support_email,
            attachments=[attachment],
            db=db,
            tenant_id=conference.tenant_id,
            conference_id=conference.id,
            email_type="registration_invoice",
        )

        if success:
            logger.info(f"Invoice email sent to {invoice.recipient_email} for invoice {invoice.invoice_number}")
        else:
            logger.error(f"Failed to send invoice email to {invoice.recipient_email} for invoice {invoice.id}")

        return success

    except Exception as e:
        logger.error(f"Failed to send invoice email for invoice {invoice.id}: {e}", exc_info=True)
        return False


async def send_attendee_welcome_email(
    db: AsyncSession,
    registration: "Registration",
    conference: "Conference",
    password_setup_token: str,
) -> bool:
    """Send welcome email with password setup link to attendee.

    Uses the ATTENDEE_WELCOME email template and includes a 7-day
    password setup link for portal access.

    Args:
        db: Database session
        registration: Registration instance
        conference: Conference instance
        password_setup_token: Raw password setup token (not hashed)

    Returns:
        True if email sent successfully, False otherwise
    """
    if not registration.email:
        logger.warning(f"Cannot send welcome email for registration {registration.id}: no email")
        return False

    try:
        # Build password setup URL
        frontend_base = settings.FRONTEND_BASE_URL
        password_setup_url = f"{frontend_base}/reset-password?token={password_setup_token}"

        # Get booking option name
        booking_option_name = "Conference Registration"
        if registration.booking_option_id:
            stmt = select(BookingOption.name).where(BookingOption.id == registration.booking_option_id)
            result = await db.execute(stmt)
            option_name = result.scalar_one_or_none()
            if option_name:
                booking_option_name = option_name

        # Get conference support email (fallback to settings)
        support_email = conference.support_email or conference.contact_email or settings.RESEND_FROM_EMAIL

        # Build context for email template
        context = build_attendee_welcome_context(
            first_name=registration.first_name,
            last_name=registration.last_name,
            email=registration.email,
            conference_name=conference.name,
            booking_option_name=booking_option_name,
            password_setup_link=password_setup_url,
            support_email=support_email,
        )

        # Render email template
        rendered = await render_email(
            db,
            EmailTemplateType.ATTENDEE_WELCOME,
            context,
            conference_id=conference.id,
            tenant_id=conference.tenant_id,
        )

        # Send email
        success = await send_email(
            to=registration.email,
            subject=rendered.subject,
            html=rendered.body_html,
            text=rendered.body_text,
            reply_to=support_email,
            db=db,
            tenant_id=conference.tenant_id,
            conference_id=conference.id,
            email_type="attendee_welcome",
        )

        if success:
            logger.info(
                f"Welcome email sent to {registration.email} for registration {registration.id} "
                f"(token expires in 7 days)"
            )
        else:
            logger.error(f"Failed to send welcome email to {registration.email} for registration {registration.id}")

        return success

    except Exception as e:
        logger.error(f"Failed to send welcome email for registration {registration.id}: {e}", exc_info=True)
        return False
