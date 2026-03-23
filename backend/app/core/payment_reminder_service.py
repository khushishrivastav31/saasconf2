"""Payment reminder service — core logic for generating and sending reminders."""

import logging
from datetime import UTC, date, datetime, tzinfo
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.default_settings import DEFAULT_PAYMENT_REMINDER_SETTINGS
from app.core.email import send_email
from app.core.email_templates import build_payment_overdue_admin_context, build_payment_reminder_context, render_email
from app.models.conference import Conference
from app.models.invoice import Invoice
from app.models.invoice_event import InvoiceEvent, InvoiceEventType
from app.models.payment_reminder import PaymentReminder
from app.schemas.email_template import EmailTemplateType

logger = logging.getLogger(__name__)


def _get_reminder_settings(conference: Conference) -> dict:
    """Get payment reminder settings for a conference, with defaults."""
    conf_settings = conference.settings or {}
    reminder_settings = conf_settings.get("payment_reminders", {})
    return {key: reminder_settings.get(key, default) for key, default in DEFAULT_PAYMENT_REMINDER_SETTINGS.items()}


def _format_amount(invoice: Invoice) -> str:
    """Format invoice total for display."""
    if invoice.total is not None:
        return f"{invoice.total:,.2f}"
    return "0.00"


async def generate_and_send_reminders(
    db: AsyncSession,
    conference: Conference,
) -> dict:
    """Generate and send payment reminders for a single conference.

    Returns dict with counts: {sent: int, errors: int, skipped: int}.
    """
    settings = _get_reminder_settings(conference)
    if not settings.get("payment_reminders_enabled", True):
        return {"sent": 0, "errors": 0, "skipped": 0}

    # Check email sending is enabled
    conf_settings = conference.settings or {}
    if not conf_settings.get("email_sending_enabled", True):
        return {"sent": 0, "errors": 0, "skipped": 0}

    first_days = settings.get("first_reminder_days", 2)
    second_days = settings.get("second_reminder_days", 17)
    today = date.today()

    # Fetch overdue/sent invoices with due dates
    result = await db.execute(
        select(Invoice).where(
            Invoice.conference_id == conference.id,
            Invoice.tenant_id == conference.tenant_id,
            Invoice.status.in_(["sent", "overdue"]),
            Invoice.due_date.isnot(None),
            Invoice.is_active.is_(True),
            Invoice.template_type != "credit_note",
        )
    )
    invoices = list(result.scalars().all())

    # Fetch existing reminders for these invoices
    invoice_ids = [inv.id for inv in invoices]
    if not invoice_ids:
        return {"sent": 0, "errors": 0, "skipped": 0}

    existing_result = await db.execute(
        select(PaymentReminder).where(
            PaymentReminder.invoice_id.in_(invoice_ids),
        )
    )
    existing_reminders = list(existing_result.scalars().all())

    # Build lookup: invoice_id -> set of reminder_numbers
    existing_map: dict[UUID, dict[int, PaymentReminder]] = {}
    for r in existing_reminders:
        existing_map.setdefault(r.invoice_id, {})[r.reminder_number] = r

    sent = 0
    errors = 0
    skipped = 0

    # Get conference timezone for formatting
    tz = ZoneInfo(conference.timezone) if conference.timezone else UTC

    # Get support email
    support_email = conference.support_email or conference.contact_email or ""

    for invoice in invoices:
        if not invoice.due_date:
            continue

        days_overdue = (today - invoice.due_date).days
        if days_overdue < 0:
            continue  # Not yet due

        # Auto-transition from "sent" to "overdue"
        if invoice.status == "sent" and days_overdue > 0:
            invoice.status = "overdue"

        inv_reminders = existing_map.get(invoice.id, {})

        # Check 1st reminder
        if days_overdue >= first_days and 1 not in inv_reminders:
            result_1 = await _create_and_send_reminder(
                db=db,
                invoice=invoice,
                conference=conference,
                reminder_number=1,
                scheduled_date=invoice.due_date,
                days_overdue=days_overdue,
                template_type=EmailTemplateType.PAYMENT_REMINDER_FIRST,
                support_email=support_email,
                tz=tz,
            )
            if result_1 == "sent":
                sent += 1
            elif result_1 == "error":
                errors += 1
            else:
                skipped += 1

        # Check 2nd reminder
        if days_overdue >= second_days and 2 not in inv_reminders:
            result_2 = await _create_and_send_reminder(
                db=db,
                invoice=invoice,
                conference=conference,
                reminder_number=2,
                scheduled_date=invoice.due_date,
                days_overdue=days_overdue,
                template_type=EmailTemplateType.PAYMENT_REMINDER_SECOND,
                support_email=support_email,
                tz=tz,
            )
            if result_2 == "sent":
                sent += 1
                # Send admin notification after 2nd reminder
                if settings.get("notify_admin_after_second", True):
                    await _notify_admin(db, conference, invoice, support_email)
            elif result_2 == "error":
                errors += 1
            else:
                skipped += 1

    await db.commit()
    return {"sent": sent, "errors": errors, "skipped": skipped}


async def _create_and_send_reminder(
    *,
    db: AsyncSession,
    invoice: Invoice,
    conference: Conference,
    reminder_number: int,
    scheduled_date: date,
    days_overdue: int,
    template_type: str,
    support_email: str,
    tz: tzinfo,
) -> str:
    """Create a reminder record and send the email.

    Returns "sent", "error", or "skipped".
    """
    if not invoice.recipient_email:
        logger.warning("Skipping reminder for invoice %s: no recipient email", invoice.id)
        return "skipped"

    # Format due date in conference timezone
    due_formatted = invoice.due_date.strftime("%B %d, %Y") if invoice.due_date else ""

    # Create reminder record
    reminder = PaymentReminder(
        tenant_id=conference.tenant_id,
        conference_id=conference.id,
        invoice_id=invoice.id,
        reminder_number=reminder_number,
        status="pending",
        scheduled_date=scheduled_date,
        recipient_name=invoice.recipient_name,
        recipient_email=invoice.recipient_email,
        invoice_number=invoice.invoice_number,
        invoice_amount=_format_amount(invoice),
        currency=invoice.currency,
    )
    db.add(reminder)
    await db.flush()

    try:
        # Render email template
        context = build_payment_reminder_context(
            recipient_name=invoice.recipient_name or "",
            conference_name=conference.name or "",
            invoice_number=invoice.invoice_number or "",
            invoice_amount=_format_amount(invoice),
            currency=invoice.currency or "",
            due_date=due_formatted,
            days_overdue=str(days_overdue),
            support_email=support_email,
        )

        rendered = await render_email(
            db,
            template_type,
            context,
            conference_id=conference.id,
            tenant_id=conference.tenant_id,
        )

        # Send email
        email_sent = await send_email(
            to=invoice.recipient_email,
            subject=rendered.subject,
            html=rendered.body_html,
            text=rendered.body_text,
            db=db,
            tenant_id=conference.tenant_id,
            conference_id=conference.id,
            email_type="payment_reminder",
        )

        if email_sent:
            reminder.status = "sent"
            reminder.sent_at = datetime.now(UTC)

            # Log audit event
            event_type = (
                InvoiceEventType.PAYMENT_REMINDER_1_SENT
                if reminder_number == 1
                else InvoiceEventType.PAYMENT_REMINDER_2_SENT
            )
            db.add(
                InvoiceEvent(
                    tenant_id=conference.tenant_id,
                    invoice_id=invoice.id,
                    event_type=event_type,
                    status="succeeded",
                    event_metadata={"reminder_number": reminder_number, "days_overdue": days_overdue},
                )
            )
            return "sent"
        else:
            reminder.status = "failed"
            reminder.error_message = "Email sending returned False"
            db.add(
                InvoiceEvent(
                    tenant_id=conference.tenant_id,
                    invoice_id=invoice.id,
                    event_type=InvoiceEventType.PAYMENT_REMINDER_FAILED,
                    status="failed",
                    event_metadata={"reminder_number": reminder_number},
                    error_message="Email sending returned False",
                )
            )
            return "error"

    except Exception as e:
        logger.error("Failed to send reminder #%d for invoice %s: %s", reminder_number, invoice.id, e)
        reminder.status = "failed"
        reminder.error_message = str(e)[:500]
        db.add(
            InvoiceEvent(
                tenant_id=conference.tenant_id,
                invoice_id=invoice.id,
                event_type=InvoiceEventType.PAYMENT_REMINDER_FAILED,
                status="failed",
                event_metadata={"reminder_number": reminder_number},
                error_message=str(e)[:500],
            )
        )
        return "error"


async def _notify_admin(db: AsyncSession, conference: Conference, invoice: Invoice, support_email: str) -> None:
    """Send admin notification that invoice remains unpaid after 2nd reminder."""
    admin_email = conference.contact_email or conference.support_email
    if not admin_email:
        return

    # Calculate days overdue
    days_overdue = 0
    if invoice.due_date:
        due = invoice.due_date.date() if hasattr(invoice.due_date, "date") else invoice.due_date
        days_overdue = (date.today() - due).days if isinstance(due, date) else 0

    context = build_payment_overdue_admin_context(
        conference_name=conference.name or "Conference",
        recipient_name=invoice.recipient_name or "",
        invoice_number=invoice.invoice_number or "N/A",
        invoice_amount=_format_amount(invoice),
        currency=invoice.currency or "",
        days_overdue=str(max(days_overdue, 0)),
        support_email=support_email,
    )

    rendered = await render_email(
        db,
        EmailTemplateType.PAYMENT_OVERDUE_ADMIN,
        context,
        conference_id=conference.id,
        tenant_id=conference.tenant_id,
    )

    try:
        await send_email(
            to=admin_email,
            subject=rendered.subject,
            html=rendered.body_html,
            text=rendered.body_text,
            db=db,
            tenant_id=conference.tenant_id,
            conference_id=conference.id,
            email_type="admin_notification",
        )
    except Exception as e:
        logger.error("Failed to send admin notification for invoice %s: %s", invoice.id, e)


async def resend_reminder(
    db: AsyncSession,
    reminder: PaymentReminder,
    conference: Conference,
) -> bool:
    """Manually resend a payment reminder.

    Returns True if sent successfully.
    """
    invoice_result = await db.execute(select(Invoice).where(Invoice.id == reminder.invoice_id))
    invoice = invoice_result.scalar_one_or_none()
    if not invoice or not invoice.recipient_email:
        return False

    # Skip if invoice is no longer overdue/sent
    if invoice.status not in ("sent", "overdue"):
        return False

    support_email = conference.support_email or conference.contact_email or ""
    due_formatted = invoice.due_date.strftime("%B %d, %Y") if invoice.due_date else ""
    days_overdue = (date.today() - invoice.due_date).days if invoice.due_date else 0

    template_type = (
        EmailTemplateType.PAYMENT_REMINDER_FIRST
        if reminder.reminder_number == 1
        else EmailTemplateType.PAYMENT_REMINDER_SECOND
    )

    context = build_payment_reminder_context(
        recipient_name=invoice.recipient_name or "",
        conference_name=conference.name or "",
        invoice_number=invoice.invoice_number or "",
        invoice_amount=_format_amount(invoice),
        currency=invoice.currency or "",
        due_date=due_formatted,
        days_overdue=str(max(days_overdue, 0)),
        support_email=support_email,
    )

    rendered = await render_email(
        db,
        template_type,
        context,
        conference_id=conference.id,
        tenant_id=conference.tenant_id,
    )

    email_sent = await send_email(
        to=invoice.recipient_email,
        subject=rendered.subject,
        html=rendered.body_html,
        text=rendered.body_text,
        db=db,
        tenant_id=conference.tenant_id,
        conference_id=conference.id,
        email_type="payment_reminder",
    )

    if email_sent:
        reminder.status = "sent"
        reminder.sent_at = datetime.now(UTC)
        reminder.error_message = None
        await db.commit()
        return True

    return False
