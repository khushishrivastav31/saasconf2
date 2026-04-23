"""Training registration email sending.

Sends invoice email (with PDF attachment) and confirmation emails
after a training registration is submitted.
"""

import base64
import html as html_mod
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.email import send_email
from app.core.exceptions import InvoiceSendConfigurationError
from app.core.invoice.email import ACCOUNTING_EMAIL_REQUIRED_MESSAGE
from app.core.training_invoice_pdf import generate_training_invoice_pdf
from app.models.tenant import Tenant
from app.models.training import Training
from app.models.training_invoice import TrainingInvoice
from app.models.training_program import ProgramYearTraining
from app.models.training_registration import TrainingRegistration

logger = logging.getLogger(__name__)

# Template key → settings path
TEMPLATES_KEY = "training_email_templates"


def _get_template(tenant: Tenant, template_type: str) -> tuple[str, str, str]:
    """Get email template (subject, body_html, body_text) from tenant settings.

    Falls back to hardcoded defaults if not customized.
    """
    from app.api.v1.trainings.email_settings import TRAINING_DEFAULT_TEMPLATES

    settings = (tenant.settings or {}).get(TEMPLATES_KEY, {})
    saved = settings.get(template_type)
    defaults = TRAINING_DEFAULT_TEMPLATES.get(template_type, {})

    if saved:
        return (
            saved.get("subject", defaults.get("subject", "")),
            saved.get("body_html", defaults.get("body_html", "")),
            saved.get("body_text", defaults.get("body_text", "")),
        )
    return (
        defaults.get("subject", ""),
        defaults.get("body_html", ""),
        defaults.get("body_text", ""),
    )


def _apply_placeholders(text: str, context: dict[str, str]) -> str:
    """Replace [Placeholder] style variables in text."""
    result = text
    for key, value in context.items():
        result = result.replace(f"[{key}]", value or "")
    return result


def _esc(value: str) -> str:
    """HTML-escape a placeholder value and strip newlines from subject safety."""
    return html_mod.escape(value).replace("\n", " ").replace("\r", "")


def _get_company_name(tenant: Tenant) -> str:
    finance = (tenant.settings or {}).get("training_finance", {})
    company = finance.get("company_info", {})
    return company.get("name", "") or tenant.name or ""


def _get_support_email(tenant: Tenant) -> str:
    finance = (tenant.settings or {}).get("training_finance", {})
    company = finance.get("company_info", {})
    return company.get("email", "") or ""


async def _resolve_training_name(db: AsyncSession, invoice: TrainingInvoice) -> str:
    """Resolve actual training name from invoice → registration → placement → training."""
    # Try via registration → placement
    if invoice.training_registration_id:
        result = await db.execute(
            select(Training.name)
            .join(ProgramYearTraining, ProgramYearTraining.training_id == Training.id)
            .join(TrainingRegistration, TrainingRegistration.placement_id == ProgramYearTraining.id)
            .where(TrainingRegistration.id == invoice.training_registration_id)
        )
        name = result.scalar_one_or_none()
        if name:
            return name

    # Try via offer → placements (first placement's training)
    if invoice.offer_id:
        from app.models.offer_placement import OfferPlacement

        result = await db.execute(
            select(Training.name)
            .join(ProgramYearTraining, ProgramYearTraining.training_id == Training.id)
            .join(OfferPlacement, OfferPlacement.placement_id == ProgramYearTraining.id)
            .where(OfferPlacement.offer_id == invoice.offer_id)
            .limit(1)
        )
        name = result.scalar_one_or_none()
        if name:
            return name

    return "Training"


async def _resolve_training_name_for_registration(db: AsyncSession, registration: TrainingRegistration) -> str:
    """Resolve training name from registration → placement → training."""
    if registration.placement_id:
        result = await db.execute(
            select(Training.name)
            .join(ProgramYearTraining, ProgramYearTraining.training_id == Training.id)
            .where(ProgramYearTraining.id == registration.placement_id)
        )
        name = result.scalar_one_or_none()
        if name:
            return name
    return "Training"


async def send_training_invoice_email(
    db: AsyncSession,
    invoice: TrainingInvoice,
    registration: TrainingRegistration | None,
    tenant: Tenant,
    payment_link_url: str | None = None,
) -> bool:
    """Send invoice email with PDF attachment.

    Args:
        db: Database session
        invoice: Training invoice to send
        registration: Linked registration (may be None for manually created invoices)
        tenant: Tenant for settings / email config
        payment_link_url: Optional Stripe payment link URL — renders as a "Pay Online" button
    """
    if not invoice.recipient_email:
        logger.warning("No recipient email for training invoice %s", invoice.id)
        return False

    # Resolve CC list up-front so the guard raises BEFORE we spend time
    # generating a PDF. Missing accounting_email surfaces as 422.
    if not tenant.accounting_email:
        raise InvoiceSendConfigurationError(ACCOUNTING_EMAIL_REQUIRED_MESSAGE)

    # Generate PDF
    pdf_bytes = await generate_training_invoice_pdf(invoice, tenant, db)

    # Build email context — fall back to invoice recipient fields when no registration
    company_name = _get_company_name(tenant)
    support_email = _get_support_email(tenant)

    # CC = tenant accounting_email + Training Company email (when set and
    # not a duplicate of the accounting address or the TO recipient).
    cc_list = [tenant.accounting_email]
    recipient_norm = invoice.recipient_email.lower()
    if support_email:
        support_norm = support_email.lower()
        if support_norm != tenant.accounting_email.lower() and support_norm != recipient_norm:
            cc_list.append(support_email)

    if registration is not None:
        first_name = registration.contact_first_name or ""
        last_name = registration.contact_last_name or ""
    else:
        # For manually created invoices without a linked registration, use the recipient name
        parts = (invoice.recipient_name or "").split(" ", 1)
        first_name = parts[0]
        last_name = parts[1] if len(parts) > 1 else ""

    # Resolve actual training name (not hardcoded)
    training_name = await _resolve_training_name(db, invoice)

    payment_link_block = (
        f'<p><a href="{html_mod.escape(payment_link_url)}" style="display: inline-block; padding: 12px 24px; '
        "background-color: #16a34a; color: white; text-decoration: none; border-radius: 6px; "
        'font-weight: bold;">Pay Online</a></p>'
        if payment_link_url
        else ""
    )

    context = {
        "First Name": _esc(first_name),
        "Last Name": _esc(last_name),
        "Invoice Number": _esc(invoice.invoice_number or "DRAFT"),
        "Training Name": _esc(training_name),
        "Amount Due": _esc(f"{invoice.currency or 'EUR'} {invoice.total or 0:.2f}"),
        "Due Date": _esc(invoice.due_date.strftime("%d.%m.%Y") if invoice.due_date else "N/A"),
        "Company Name": _esc(company_name),
        "Support Email": _esc(support_email),
        "Payment Link": payment_link_block,  # Already HTML (intentional)
    }

    # Get template
    subject, body_html, body_text = _get_template(tenant, "training_invoice_send")
    subject = _apply_placeholders(subject, context)
    body_html = _apply_placeholders(body_html, context)
    body_text = _apply_placeholders(body_text, context)

    # PDF attachment
    filename = f"Invoice-{invoice.invoice_number or 'DRAFT'}.pdf"
    attachment = {
        "filename": filename,
        "content": base64.b64encode(pdf_bytes).decode("utf-8"),
        "content_type": "application/pdf",
    }

    # Get tenant email settings
    email_settings = (tenant.settings or {}).get("training_email_settings", {})
    from_name = email_settings.get("from_name") or company_name

    success = await send_email(
        to=invoice.recipient_email,
        subject=subject,
        html=body_html,
        text=body_text,
        reply_to=support_email or None,
        attachments=[attachment],
        cc=cc_list,
        tenant_from_name=from_name,
    )

    if success:
        logger.info("Sent training invoice email %s to %s", invoice.invoice_number, invoice.recipient_email)
    else:
        logger.error("Failed to send training invoice email %s", invoice.invoice_number)

    return success


async def send_training_confirmation_email(
    db: AsyncSession,
    registration: TrainingRegistration,
    tenant: Tenant,
) -> bool:
    """Send registration confirmation email to contact person."""
    if not registration.contact_email:
        return False

    company_name = _get_company_name(tenant)
    support_email = _get_support_email(tenant)

    # Resolve actual training name
    training_name = await _resolve_training_name_for_registration(db, registration)

    context = {
        "First Name": _esc(registration.contact_first_name or ""),
        "Last Name": _esc(registration.contact_last_name or ""),
        "Training Name": _esc(training_name),
        "Company Name": _esc(company_name),
        "Support Email": _esc(support_email),
    }

    subject, body_html, body_text = _get_template(tenant, "training_registration_confirmation")
    subject = _apply_placeholders(subject, context)
    body_html = _apply_placeholders(body_html, context)
    body_text = _apply_placeholders(body_text, context)

    email_settings = (tenant.settings or {}).get("training_email_settings", {})
    from_name = email_settings.get("from_name") or company_name

    success = await send_email(
        to=registration.contact_email,
        subject=subject,
        html=body_html,
        text=body_text,
        reply_to=support_email or None,
        tenant_from_name=from_name,
    )

    if success:
        logger.info("Sent training confirmation email to %s", registration.contact_email)

    return success


async def send_offer_attendee_registered_email(
    db: AsyncSession,
    offer_attendee_id,  # UUID — imported lazily to avoid cycle
    tenant: Tenant,
) -> bool:
    """Email an offer attendee that they've been registered for their training.

    Loads the OfferAttendee fresh from the DB so background dispatch stays
    safe against the caller's session. No-ops gracefully on missing email
    or missing placement (logs and returns False).
    """
    from app.config import get_settings
    from app.models.offer_attendee import OfferAttendee

    result = await db.execute(
        select(OfferAttendee).where(
            OfferAttendee.id == offer_attendee_id,
            OfferAttendee.tenant_id == tenant.id,
        )
    )
    offer_attendee = result.scalar_one_or_none()
    if offer_attendee is None:
        logger.info("send_offer_attendee_registered_email: attendee %s not found", offer_attendee_id)
        return False

    email = (offer_attendee.email or "").strip()
    if not email:
        logger.info("send_offer_attendee_registered_email: no email on attendee %s", offer_attendee_id)
        return False

    company_name = _get_company_name(tenant)
    support_email = _get_support_email(tenant)

    training_name = "Training"
    training_date = ""
    if offer_attendee.placement_id:
        placement_q = await db.execute(
            select(Training.name, ProgramYearTraining.start_date)
            .join(ProgramYearTraining, ProgramYearTraining.training_id == Training.id)
            .where(ProgramYearTraining.id == offer_attendee.placement_id)
        )
        row = placement_q.first()
        if row:
            training_name = row[0] or "Training"
            if row[1]:
                training_date = row[1].isoformat()

    settings = get_settings()
    portal_url = f"{settings.PORTAL_BASE_URL}/{tenant.slug}/portal/login"

    context = {
        "First Name": _esc(offer_attendee.first_name or ""),
        "Last Name": _esc(offer_attendee.last_name or ""),
        "Training Name": _esc(training_name),
        "Training Date": _esc(training_date),
        "Company Name": _esc(company_name),
        "Support Email": _esc(support_email),
        "Portal URL": _esc(portal_url),
    }

    subject, body_html, body_text = _get_template(tenant, "training_attendee_registered")
    subject = _apply_placeholders(subject, context)
    body_html = _apply_placeholders(body_html, context)
    body_text = _apply_placeholders(body_text, context)

    email_settings = (tenant.settings or {}).get("training_email_settings", {})
    from_name = email_settings.get("from_name") or company_name

    success = await send_email(
        to=email,
        subject=subject,
        html=body_html,
        text=body_text,
        reply_to=support_email or None,
        tenant_from_name=from_name,
    )

    if success:
        logger.info("Sent offer-attendee registered email to %s", email)
    return success
