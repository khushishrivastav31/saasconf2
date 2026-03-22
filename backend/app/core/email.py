"""Email sending with Resend.

Uses Resend API when RESEND_API_KEY is configured,
otherwise falls back to console logging for development.
"""

import asyncio
import logging
import os
from collections.abc import Awaitable, Callable
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.email_templates import (
    build_conference_team_invitation_context,
    build_cospeaker_context,
    build_deadline_reminder_context,
    build_direct_message_context,
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

# Store references to background email tasks so they aren't garbage-collected.
_background_tasks: set[asyncio.Task[None]] = set()


async def _send_with_retry(
    send_fn: Callable[..., Awaitable[bool]],
    *args: Any,
    max_retries: int = 3,
    **kwargs: Any,
) -> None:
    """Retry an async email send with exponential backoff.

    Logs warnings on transient failures and an error after all retries are exhausted.
    Never raises — designed for fire-and-forget usage.
    """
    for attempt in range(max_retries):
        try:
            await send_fn(*args, **kwargs)
            return
        except Exception as e:
            if attempt < max_retries - 1:
                delay = 2**attempt  # 1s, 2s, 4s
                logger.warning(f"Email send attempt {attempt + 1}/{max_retries} failed, retrying in {delay}s: {e}")
                await asyncio.sleep(delay)
            else:
                logger.error(f"Email send failed after {max_retries} attempts: {e}", exc_info=True)


def send_email_background(
    send_fn: Callable[..., Awaitable[bool]],
    *args: Any,
    max_retries: int = 3,
    **kwargs: Any,
) -> None:
    """Fire-and-forget email with retry. Schedules the send as a background task.

    Use this instead of ``await send_fn(...)`` for non-critical emails where
    the caller does not need to know whether the email succeeded (e.g.
    notifications, confirmations).  Password-reset and verification emails
    should still be awaited directly so the user gets immediate feedback.
    """
    if os.environ.get("TESTING") == "true":
        return
    task = asyncio.create_task(
        _send_with_retry(send_fn, *args, max_retries=max_retries, **kwargs),
        name=f"email-retry-{send_fn.__name__}",
    )
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


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
    base_url: str = "",
) -> bool:
    """Send an email verification link to a new applicant or committee member."""
    # NOTE: Verification emails are always sent regardless of the email_sending_enabled setting
    settings = get_settings()
    base_url = base_url or settings.PORTAL_BASE_URL
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
    base_url: str = "",
) -> bool:
    """Send a submission confirmation email."""
    if not await _is_email_enabled_for_conference(db, conference_id):
        logger.info(
            f"Email sending disabled for conference {conference_id}, skipping submission confirmation to {email}"
        )
        return False

    settings = get_settings()
    base_url = base_url or settings.PORTAL_BASE_URL
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
    base_url: str = "",
) -> bool:
    """Send a co-speaker invitation email."""
    if not await _is_email_enabled_for_conference(db, conference_id):
        logger.info(f"Email sending disabled for conference {conference_id}, skipping co-speaker invitation to {email}")
        return False

    settings = get_settings()
    base_url = base_url or settings.PORTAL_BASE_URL
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
    base_url: str = "",
    reset_url: str | None = None,
) -> bool:
    """Send a password reset email."""
    settings = get_settings()
    base_url = base_url or settings.PORTAL_BASE_URL
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
    base_url: str = "",
    from_email: str | None = None,
) -> bool:
    """Send a welcome/invite email to a new tenant user with a setup-password link."""
    settings = get_settings()
    base_url = base_url or settings.FRONTEND_BASE_URL
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


async def send_conference_team_invitation_email(
    db: AsyncSession,
    *,
    email: str,
    first_name: str,
    last_name: str,
    conference_name: str,
    company_name: str,
    access_level: str,
    conference_id: UUID,
    tenant_id: UUID,
    support_email: str = "",
    base_url: str = "",
) -> bool:
    """Send an email notifying a user they've been added to a conference team."""
    settings = get_settings()
    base_url = base_url or settings.FRONTEND_BASE_URL
    dashboard_link = f"{base_url}/conferences/{conference_id}"

    context = build_conference_team_invitation_context(
        first_name=first_name,
        last_name=last_name,
        email=email,
        conference_name=conference_name,
        company_name=company_name,
        access_level=access_level,
        dashboard_link=dashboard_link,
        support_email=support_email or settings.RESEND_FROM_EMAIL,
    )

    rendered = await render_email(
        db,
        EmailTemplateType.CONFERENCE_TEAM_INVITATION,
        context,
        conference_id=conference_id,
        tenant_id=tenant_id,
    )

    return await send_email(email, rendered.subject, rendered.body_html, rendered.body_text)


async def send_deadline_reminder(
    db: AsyncSession,
    *,
    to: str,
    conference_name: str,
    conference_id: UUID | None = None,
    tenant_id: UUID | None = None,
    deadline_title: str,
    description: str | None,
    due_date_formatted: str,
    reminder_type: str,
) -> bool:
    """Send a deadline reminder email.

    Args:
        to: Recipient email address (conference contact email).
        conference_name: Name of the conference.
        conference_id: Conference ID for template lookup.
        tenant_id: Tenant ID for template lookup.
        deadline_title: Title of the deadline.
        description: Optional description.
        due_date_formatted: Human-readable due date string.
        reminder_type: One of "7 days", "1 day", "today".
    """
    if reminder_type == "today":
        badge_text = "Due today"
    elif reminder_type == "1 day":
        badge_text = "Due tomorrow"
    else:
        badge_text = "Due in 7 days"

    context = build_deadline_reminder_context(
        conference_name=conference_name,
        deadline_title=deadline_title,
        deadline_description=description or "",
        due_date=due_date_formatted,
        reminder_status=badge_text,
    )

    rendered = await render_email(
        db,
        EmailTemplateType.DEADLINE_REMINDER,
        context,
        conference_id=conference_id,
        tenant_id=tenant_id,
    )

    return await send_email(to, rendered.subject, rendered.body_html, rendered.body_text)


async def send_direct_message_email(
    db: AsyncSession,
    *,
    email: str,
    first_name: str = "",
    subject: str = "",
    body_html: str = "",
    conference_name: str = "",
    conference_id: UUID | None = None,
    tenant_id: UUID | None = None,
    sender_name: str = "",
    reply_to: str | None = None,
) -> bool:
    """Send a direct message as email (for email-only messaging mode).

    Unlike send_new_message_notification which sends a notification with a link,
    this sends the actual message content directly.
    The reply_to address is typically the conference's contact email.
    """
    context = build_direct_message_context(
        first_name=first_name,
        conference_name=conference_name,
        sender_name=sender_name,
        message_subject=subject,
        message_content=body_html,
    )

    rendered = await render_email(
        db,
        EmailTemplateType.DIRECT_MESSAGE,
        context,
        conference_id=conference_id,
        tenant_id=tenant_id,
    )

    return await send_email(email, rendered.subject, rendered.body_html, rendered.body_text, reply_to=reply_to)


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
