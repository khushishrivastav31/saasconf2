"""Email sending with Resend.

Uses Resend API when RESEND_API_KEY is configured,
otherwise falls back to console logging for development.
"""

import asyncio
import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.email_templates import (
    build_cospeaker_context,
    build_new_message_context,
    build_password_reset_context,
    build_submission_context,
    build_tenant_welcome_context,
    build_verification_context,
    render_email,
)
from app.schemas.email_template import EmailTemplateType

logger = logging.getLogger(__name__)

# Lazy initialization of Resend client
_resend_client = None


def _get_resend():
    """Get or initialize the Resend client."""
    global _resend_client
    settings = get_settings()

    if not settings.RESEND_API_KEY:
        return None

    if _resend_client is None:
        import resend

        resend.api_key = settings.RESEND_API_KEY
        _resend_client = resend

    return _resend_client


def _log_email(to: str, subject: str, body: str) -> None:
    """Log email to console for development."""
    logger.info(f"=== EMAIL ===\nTo: {to}\nSubject: {subject}\nBody:\n{body}\n=============")


async def send_email(
    to: str,
    subject: str,
    html: str,
    text: str | None = None,
    reply_to: str | None = None,
    attachments: list[dict] | None = None,
    from_email: str | None = None,
) -> bool:
    """
    Send an email using Resend.

    Returns True if sent successfully, False otherwise.
    Falls back to console logging if Resend is not configured.

    Args:
        attachments: Optional list of dicts with 'filename' and 'content' (base64-encoded).
        from_email: Optional override for the sender address (e.g. per-tenant domain).
    """
    settings = get_settings()
    resend = _get_resend()

    if resend is None:
        _log_email(to, subject, text or html)
        return True

    sender = from_email or settings.RESEND_FROM_EMAIL
    try:
        payload: dict = {
            "from": f"{settings.RESEND_FROM_NAME} <{sender}>",
            "to": [to],
            "subject": subject,
            "html": html,
            "text": text,
        }
        if reply_to:
            payload["reply_to"] = reply_to
        if attachments:
            payload["attachments"] = attachments
        await asyncio.to_thread(resend.Emails.send, payload)
        logger.info(f"Email sent to {to}: {subject}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email to {to}: {e}")
        return False


async def _get_tenant_from_email(db: AsyncSession, tenant_id: UUID | None) -> str | None:
    """Get noreply@domain for tenant if email_domain is configured."""
    if not tenant_id:
        return None
    from app.models.tenant import Tenant

    result = await db.execute(select(Tenant.email_domain).where(Tenant.id == tenant_id))
    domain = result.scalar_one_or_none()
    return f"noreply@{domain}" if domain else None


async def _is_email_enabled_for_conference(db: AsyncSession, conference_id: UUID | None) -> bool:
    """Check if email sending is enabled for this conference."""
    if conference_id is None:
        return True
    from app.models.conference import Conference

    result = await db.execute(select(Conference.settings).where(Conference.id == conference_id))
    settings = result.scalar_one_or_none()
    if settings is None:
        return True
    return settings.get("email_sending_enabled", True)


async def send_verification_email(
    db: AsyncSession,
    *,
    email: str,
    token: str,
    tenant_slug: str,
    conference_id: UUID | None = None,
    conference_name: str = "",
    company_name: str = "",
    first_name: str = "",
    last_name: str = "",
    is_committee: bool = False,
    support_email: str = "",
    base_url: str = "http://localhost:3002",
) -> bool:
    """Send an email verification link to a new applicant or committee member."""
    # NOTE: Verification emails are always sent regardless of the email_sending_enabled setting
    settings = get_settings()
    verification_url = f"{base_url}/{tenant_slug}/portal/user/verify-email?token={token}"

    template_type = (
        EmailTemplateType.COMMITTEE_VERIFICATION if is_committee else EmailTemplateType.APPLICANT_VERIFICATION
    )

    context = build_verification_context(
        first_name=first_name,
        last_name=last_name,
        email=email,
        conference_name=conference_name,
        company_name=company_name,
        verify_link=verification_url,
        support_email=support_email or settings.RESEND_FROM_EMAIL,
    )

    rendered = await render_email(
        db,
        template_type,
        context,
        conference_id=conference_id,
    )

    return await send_email(email, rendered.subject, rendered.body_html, rendered.body_text)


async def send_submission_confirmation_email(
    db: AsyncSession,
    *,
    email: str,
    conference_id: UUID,
    conference_name: str,
    company_name: str = "",
    paper_title: str,
    speakers: str,
    first_name: str = "",
    last_name: str = "",
    tenant_slug: str,
    support_email: str = "",
    base_url: str = "http://localhost:3002",
) -> bool:
    """Send a submission confirmation email."""
    if not await _is_email_enabled_for_conference(db, conference_id):
        logger.info(
            f"Email sending disabled for conference {conference_id}, skipping submission confirmation to {email}"
        )
        return False

    settings = get_settings()
    portal_url = f"{base_url}/{tenant_slug}/portal/dashboard"

    context = build_submission_context(
        first_name=first_name,
        last_name=last_name,
        email=email,
        conference_name=conference_name,
        company_name=company_name,
        paper_title=paper_title,
        speakers=speakers,
        portal_link=portal_url,
        support_email=support_email or settings.RESEND_FROM_EMAIL,
    )

    rendered = await render_email(
        db,
        EmailTemplateType.SUBMISSION_CONFIRMATION,
        context,
        conference_id=conference_id,
    )

    return await send_email(email, rendered.subject, rendered.body_html, rendered.body_text)


async def send_cospeaker_invitation_email(
    db: AsyncSession,
    *,
    email: str,
    paper_title: str,
    conference_id: UUID,
    conference_name: str,
    company_name: str = "",
    main_speaker_name: str,
    first_name: str = "",
    last_name: str = "",
    tenant_slug: str,
    support_email: str = "",
    base_url: str = "http://localhost:3002",
) -> bool:
    """Send a co-speaker invitation email."""
    if not await _is_email_enabled_for_conference(db, conference_id):
        logger.info(f"Email sending disabled for conference {conference_id}, skipping co-speaker invitation to {email}")
        return False

    settings = get_settings()
    portal_url = f"{base_url}/{tenant_slug}/portal/invitations"

    context = build_cospeaker_context(
        first_name=first_name,
        last_name=last_name,
        email=email,
        conference_name=conference_name,
        company_name=company_name,
        paper_title=paper_title,
        main_speaker_name=main_speaker_name,
        portal_link=portal_url,
        support_email=support_email or settings.RESEND_FROM_EMAIL,
    )

    rendered = await render_email(
        db,
        EmailTemplateType.CO_SPEAKER_INVITATION,
        context,
        conference_id=conference_id,
    )

    return await send_email(email, rendered.subject, rendered.body_html, rendered.body_text)


async def send_password_reset_email(
    db: AsyncSession,
    *,
    email: str,
    token: str,
    conference_id: UUID | None = None,
    conference_name: str = "",
    company_name: str = "",
    first_name: str = "",
    last_name: str = "",
    tenant_slug: str = "",
    support_email: str = "",
    base_url: str = "http://localhost:3002",
    reset_url: str | None = None,
) -> bool:
    """Send a password reset email."""
    settings = get_settings()
    if not reset_url:
        reset_url = f"{base_url}/{tenant_slug}/portal/user/reset-password?token={token}"

    context = build_password_reset_context(
        first_name=first_name,
        last_name=last_name,
        email=email,
        conference_name=conference_name,
        company_name=company_name,
        reset_link=reset_url,
        support_email=support_email or settings.RESEND_FROM_EMAIL,
    )

    rendered = await render_email(
        db,
        EmailTemplateType.PASSWORD_RESET,
        context,
        conference_id=conference_id,
    )

    return await send_email(email, rendered.subject, rendered.body_html, rendered.body_text)


async def send_tenant_user_welcome_email(
    db: AsyncSession,
    *,
    email: str,
    token: str,
    company_name: str,
    user_type: str,
    first_name: str = "",
    last_name: str = "",
    support_email: str = "",
    base_url: str = "http://localhost:3000",
    from_email: str | None = None,
) -> bool:
    """Send a welcome/invite email to a new tenant user with a setup-password link."""
    settings = get_settings()
    setup_url = f"{base_url}/setup-password?token={token}"

    context = build_tenant_welcome_context(
        first_name=first_name,
        last_name=last_name,
        email=email,
        company_name=company_name,
        user_type=user_type,
        verify_link=setup_url,
        support_email=support_email or settings.RESEND_FROM_EMAIL,
    )

    rendered = await render_email(
        db,
        EmailTemplateType.TENANT_USER_WELCOME,
        context,
    )

    return await send_email(email, rendered.subject, rendered.body_html, rendered.body_text, from_email=from_email)


async def send_deadline_reminder(
    *,
    to: str,
    conference_name: str,
    deadline_title: str,
    description: str | None,
    due_date_formatted: str,
    reminder_type: str,
) -> bool:
    """Send a deadline reminder email.

    Args:
        to: Recipient email address (conference contact email).
        conference_name: Name of the conference.
        deadline_title: Title of the deadline.
        description: Optional description.
        due_date_formatted: Human-readable due date string.
        reminder_type: One of "7 days", "1 day", "today".
    """
    from html import escape as html_escape

    safe_conf = html_escape(conference_name)
    safe_title = html_escape(deadline_title)
    safe_desc = html_escape(description) if description else ""

    if reminder_type == "today":
        badge_color = "#dc2626"
        badge_text = "Due today"
    elif reminder_type == "1 day":
        badge_color = "#d97706"
        badge_text = "Due tomorrow"
    else:
        badge_color = "#2563eb"
        badge_text = "Due in 7 days"

    desc_block = ""
    if safe_desc:
        desc_block = f"""
        <p style="color: #374151; margin: 8px 0;">{safe_desc}</p>"""

    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #111827;">Deadline Reminder</h2>
        <span style="display: inline-block; padding: 4px 12px; border-radius: 12px;
                      background-color: {badge_color}; color: white; font-size: 13px;
                      font-weight: 600; margin-bottom: 12px;">{badge_text}</span>
        <div style="padding: 16px; background-color: #f9fafb; border-radius: 8px;
                    border-left: 4px solid {badge_color}; margin: 12px 0;">
            <h3 style="color: #111827; margin: 0 0 8px 0;">{safe_title}</h3>{desc_block}
            <p style="color: #6b7280; font-size: 14px; margin: 8px 0 0 0;">
                Due: {html_escape(due_date_formatted)}
            </p>
        </div>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
        <p style="color: #6b7280; font-size: 13px;">
            This is an automated reminder from {safe_conf}.
        </p>
    </div>
    """

    text = (
        f"Deadline Reminder - {badge_text}\n\n"
        f"{deadline_title}\n"
        f"{description or ''}\n\n"
        f"Due: {due_date_formatted}\n\n"
        f"This is an automated reminder from {conference_name}."
    )

    subject = f"[{conference_name}] Deadline Reminder: {deadline_title} ({badge_text})"
    return await send_email(to, subject, html, text)


async def send_direct_message_email(
    *,
    email: str,
    first_name: str = "",
    subject: str = "",
    body_html: str = "",
    conference_name: str = "",
    sender_name: str = "",
    reply_to: str | None = None,
) -> bool:
    """Send a direct message as email (for email-only messaging mode).

    Unlike send_new_message_notification which sends a notification with a link,
    this sends the actual message content directly.
    The reply_to address is typically the conference's contact email.
    """
    import re
    from html import escape as html_escape

    body_text = re.sub(r"<[^>]+>", "", body_html)
    body_text = re.sub(r"\s+", " ", body_text).strip()

    safe_first = html_escape(first_name) if first_name else "there"
    safe_conf = html_escape(conference_name)
    safe_sender = html_escape(sender_name)

    full_html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <p>Hi {safe_first},</p>
        <p>You have received a message regarding <strong>{safe_conf}</strong> from {safe_sender}:</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
        <div style="padding: 16px; background-color: #f9fafb; border-radius: 8px;">
            {body_html}
        </div>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
        <p style="color: #6b7280; font-size: 14px;">
            This message was sent via email because in-app messaging is disabled for this conference.
            Please reply directly to this email if needed.
        </p>
    </div>
    """

    full_text = (
        f"Hi {first_name or 'there'},\n\n"
        f"You have received a message regarding {conference_name} from {sender_name}:\n\n"
        f"---\n{body_text}\n---\n\n"
        f"This message was sent via email because in-app messaging is disabled for this conference."
    )

    email_subject = f"[{conference_name}] {subject}" if conference_name else subject
    return await send_email(email, email_subject, full_html, full_text, reply_to=reply_to)


async def send_new_message_notification(
    db: AsyncSession,
    *,
    email: str,
    first_name: str = "",
    conference_id: UUID,
    conference_name: str = "",
    message_subject: str = "",
    messages_link: str = "",
) -> bool:
    """Send a notification email about a new platform message."""
    if not await _is_email_enabled_for_conference(db, conference_id):
        logger.info(f"Email sending disabled for conference {conference_id}, skipping message notification to {email}")
        return False

    context = build_new_message_context(
        first_name=first_name,
        conference_name=conference_name,
        message_subject=message_subject,
        messages_link=messages_link,
    )

    rendered = await render_email(
        db,
        EmailTemplateType.NEW_MESSAGE_NOTIFICATION,
        context,
        conference_id=conference_id,
    )

    return await send_email(email, rendered.subject, rendered.body_html, rendered.body_text)
