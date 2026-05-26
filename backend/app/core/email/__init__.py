"""Email sending.

Primary path: per-tenant Resend API key (configured in My Company → Email).
System fallback: Mailgun (MAILGUN_API_KEY + MAILGUN_DOMAIN env vars).

Flow:
  1. Tenant has a Resend key → send via Resend.
  2. Tenant key missing or invalid → send via Mailgun system account.
  3. Mailgun also unconfigured → console-log (development only).

Failures are logged to the email_logs table for admin visibility.
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
from app.core.email.templates import (
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


async def _send_with_fresh_session(
    send_fn: Callable[..., Awaitable[bool]],
    *args: Any,
    max_retries: int = 3,
    **kwargs: Any,
) -> None:
    """Run email send with a fresh DB session to avoid concurrent connection usage.

    Background email tasks must not share the request-scoped DB session because
    asyncpg forbids concurrent operations on the same connection. This wrapper
    replaces any AsyncSession positional arg with a fresh session.
    """
    from app.db.session import async_session_maker

    # Replace AsyncSession args/kwargs with a fresh session.
    # Callers pass db= as a keyword arg, so we must check both.
    args_list = list(args)
    kwargs_copy = dict(kwargs)

    session_idx: int | None = None
    for i, arg in enumerate(args_list):
        if isinstance(arg, AsyncSession):
            session_idx = i
            break

    session_kwarg: str | None = None
    for key, val in kwargs_copy.items():
        if isinstance(val, AsyncSession):
            session_kwarg = key
            break

    if session_idx is not None or session_kwarg is not None:
        async with async_session_maker() as fresh_db:
            if session_idx is not None:
                args_list[session_idx] = fresh_db
            if session_kwarg is not None:
                kwargs_copy[session_kwarg] = fresh_db
            await _send_with_retry(send_fn, *args_list, max_retries=max_retries, **kwargs_copy)
    else:
        await _send_with_retry(send_fn, *args, max_retries=max_retries, **kwargs)


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

    Creates a fresh DB session for the background task to avoid sharing the
    request-scoped session (which causes asyncpg InterfaceError).
    """
    if os.environ.get("TESTING") == "true":
        return
    task = asyncio.create_task(
        _send_with_fresh_session(send_fn, *args, max_retries=max_retries, **kwargs),
        name=f"email-retry-{send_fn.__name__}",
    )
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


def _get_resend(api_key: str) -> Any:
    """Configure and return the Resend module for a per-tenant key.

    Always sets resend_mod.api_key immediately before use so a stale key
    from a previous call can never bleed into the next send.
    """
    import resend as resend_mod

    resend_mod.api_key = api_key
    return resend_mod


async def _send_via_mailgun(
    *,
    to: str,
    subject: str,
    html: str,
    text: str | None,
    from_addr: str,
    reply_to: str | None = None,
    cc: list[str] | None = None,
    attachments: list[dict] | None = None,
) -> None:
    """Send via the Mailgun system account. Raises on failure."""
    import base64

    import httpx

    settings = get_settings()
    url = f"{settings.MAILGUN_BASE_URL}/v3/{settings.MAILGUN_DOMAIN}/messages"

    data: dict[str, Any] = {
        "from": from_addr,
        "to": to,
        "subject": subject,
        "html": html,
    }
    if text:
        data["text"] = text
    if reply_to:
        data["h:Reply-To"] = reply_to
    if cc:
        data["cc"] = ",".join(cc)

    files: list[tuple[str, Any]] = []
    if attachments:
        for att in attachments:
            content = base64.b64decode(att["content"])
            files.append(("attachment", (att["filename"], content)))

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            url,
            auth=("api", settings.MAILGUN_API_KEY),
            data=data,
            files=files or None,
        )
        resp.raise_for_status()


def _log_email(to: str, subject: str, body: str) -> None:
    """Log email to console for development."""
    logger.info(f"=== EMAIL ===\nTo: {to}\nSubject: {subject}\nBody:\n{body}\n=============")


async def _log_email_failure(
    db: AsyncSession,
    *,
    tenant_id: UUID | None,
    conference_id: UUID | None,
    recipient: str,
    subject: str,
    email_type: str,
    status: str,
    error: str | None,
) -> None:
    """Persist an email delivery failure to the email_logs table."""
    if not tenant_id:
        return  # Cannot log without a tenant
    try:
        from app.models.email_log import EmailLog

        log_entry = EmailLog(
            tenant_id=tenant_id,
            conference_id=conference_id,
            recipient_email=recipient,
            subject=subject[:500],
            email_type=email_type,
            status=status,
            error_message=error,
        )
        db.add(log_entry)
        await db.flush()
    except Exception:
        logger.warning("Failed to persist email failure log", exc_info=True)


class _TenantEmailSettings:
    """Resolved email settings for a tenant."""

    __slots__ = ("api_key", "from_email", "from_name")

    def __init__(self, api_key: str | None, from_email: str | None, from_name: str | None):
        self.api_key = api_key
        self.from_email = from_email
        self.from_name = from_name


async def _get_tenant_email_settings(db: AsyncSession, tenant_id: UUID | None) -> _TenantEmailSettings:
    """Load per-tenant Resend settings. Returns empty settings if not configured."""
    if not tenant_id:
        return _TenantEmailSettings(None, None, None)
    from app.models.tenant import Tenant

    result = await db.execute(
        select(
            Tenant.email_domain,
            Tenant.resend_api_key,
            Tenant.resend_from_email,
            Tenant.resend_from_name,
        ).where(Tenant.id == tenant_id)
    )
    row = result.one_or_none()
    if not row:
        return _TenantEmailSettings(None, None, None)

    domain, api_key, from_email, from_name = row
    # Derive from_email from email_domain if not explicitly set
    if not from_email and domain:
        from_email = f"noreply@{domain}"
    return _TenantEmailSettings(api_key, from_email, from_name)


async def _send_via_smtp(
    *,
    to: str,
    subject: str,
    html: str,
    text: str | None,
    from_email: str,
    from_name: str,
    settings: Any,
) -> bool:
    """Send email via SMTP (MailHog in dev). Never raises."""
    import email.mime.multipart
    import email.mime.text

    import aiosmtplib

    msg = email.mime.multipart.MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{from_name} <{from_email}>"
    msg["To"] = to
    if text:
        msg.attach(email.mime.text.MIMEText(text, "plain"))
    msg.attach(email.mime.text.MIMEText(html, "html"))

    try:
        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            use_tls=settings.SMTP_USE_TLS,
        )
        logger.info(f"Email sent via SMTP to {to}: {subject}")
        return True
    except Exception as e:
        logger.error(f"SMTP send failed to {to}: {e}")
        return False


async def send_email(
    to: str,
    subject: str,
    html: str,
    text: str | None = None,
    reply_to: str | None = None,
    attachments: list[dict] | None = None,
    from_email: str | None = None,
    *,
    cc: list[str] | None = None,
    tenant_api_key: str | None = None,
    tenant_from_name: str | None = None,
    db: AsyncSession | None = None,
    tenant_id: UUID | None = None,
    conference_id: UUID | None = None,
    email_type: str = "general",
) -> bool:
    """
    Send an email using Resend.

    Returns True if sent successfully, False otherwise.
    When no API key is configured, logs the failure to email_logs (if db is available)
    and falls back to console logging.

    Args:
        attachments: Optional list of dicts with 'filename' and 'content' (base64-encoded).
        from_email: Optional override for the sender address (e.g. per-tenant domain).
        cc: Optional CC list. Empty lists are treated the same as None.
        tenant_api_key: Per-tenant Resend API key (overrides global key).
        tenant_from_name: Per-tenant sender display name (overrides global name).
        db: Database session — when provided with tenant_id, auto-loads per-tenant settings.
        tenant_id: Tenant UUID — used with db to load per-tenant Resend config.
        conference_id: Conference UUID — stored in failure logs for context.
        email_type: Descriptive type for failure logs (e.g. "invoice", "verification").
    """
    # Auto-load per-tenant settings when db + tenant_id are provided
    if db is not None and tenant_id is not None and not tenant_api_key:
        ts = await _get_tenant_email_settings(db, tenant_id)
        tenant_api_key = ts.api_key
        if not from_email and ts.from_email:
            from_email = ts.from_email
        if not tenant_from_name and ts.from_name:
            tenant_from_name = ts.from_name

    settings = get_settings()

    # SMTP is a dev-only escape hatch (MailHog). Refuse it in prod/staging.
    if settings.SMTP_HOST:
        env = settings.SENTRY_ENVIRONMENT.lower()
        if env in ("production", "staging"):
            logger.error(
                "SMTP_HOST is set in %s — refusing to route mail through SMTP. "
                "Unset SMTP_HOST or remove it from the environment.",
                env,
            )
            # Fall through to the Resend/Mailgun path instead of dropping.
        else:
            return await _send_via_smtp(
                to=to,
                subject=subject,
                html=html,
                text=text,
                from_email=from_email or settings.RESEND_FROM_EMAIL,
                from_name=tenant_from_name or settings.RESEND_FROM_NAME,
                settings=settings,
            )

    # ── Step 1: try the tenant's own Resend key ───────────────────────────────
    use_mailgun_fallback = True  # assume fallback until Resend succeeds or errors non-auth

    if tenant_api_key:
        sender = from_email or settings.RESEND_FROM_EMAIL
        sender_name = tenant_from_name or settings.RESEND_FROM_NAME
        resend = _get_resend(api_key=tenant_api_key)
        payload: dict = {
            "from": f"{sender_name} <{sender}>",
            "to": [to],
            "subject": subject,
            "html": html,
            "text": text,
        }
        if reply_to:
            payload["reply_to"] = reply_to
        if cc:
            payload["cc"] = cc
        if attachments:
            payload["attachments"] = attachments
        try:
            await asyncio.to_thread(resend.Emails.send, payload)
            logger.info(f"Email sent to {to} via tenant Resend key: {subject}")
            return True
        except Exception as e:
            if "API key is invalid" in str(e):
                logger.warning(
                    "Tenant Resend API key invalid (tenant %s); falling back to Mailgun for %s",
                    tenant_id,
                    to,
                )
                # use_mailgun_fallback stays True → continue below
            else:
                # Transient / non-auth error — don't silently swap provider
                use_mailgun_fallback = False
                logger.error(f"Failed to send email to {to} via tenant Resend key: {e}")
                if db is not None:
                    await _log_email_failure(
                        db,
                        tenant_id=tenant_id,
                        conference_id=conference_id,
                        recipient=to,
                        subject=subject,
                        email_type=email_type,
                        status="failed",
                        error=str(e),
                    )
                return False

    # ── Step 2: Mailgun system fallback (no tenant key, or tenant key invalid) ─
    if use_mailgun_fallback:
        if not settings.MAILGUN_API_KEY or not settings.MAILGUN_DOMAIN:
            _log_email(to, subject, text or html)
            if db is not None:
                await _log_email_failure(
                    db,
                    tenant_id=tenant_id,
                    conference_id=conference_id,
                    recipient=to,
                    subject=subject,
                    email_type=email_type,
                    status="not_configured",
                    error="No Mailgun config — set MAILGUN_API_KEY and MAILGUN_DOMAIN",
                )
            return False

        mailgun_from = f"{settings.MAILGUN_FROM_NAME} <{settings.MAILGUN_FROM_EMAIL}>"
        try:
            await _send_via_mailgun(
                to=to,
                subject=subject,
                html=html,
                text=text,
                from_addr=mailgun_from,
                reply_to=reply_to,
                cc=cc,
                attachments=attachments,
            )
            logger.info(f"Email sent to {to} via Mailgun: {subject}")
            return True
        except Exception as e:
            logger.error(f"Failed to send email to {to} via Mailgun: {e}")
            if db is not None:
                await _log_email_failure(
                    db,
                    tenant_id=tenant_id,
                    conference_id=conference_id,
                    recipient=to,
                    subject=subject,
                    email_type=email_type,
                    status="failed",
                    error=str(e),
                )
            return False

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


async def _is_email_enabled_for_training(db: AsyncSession, tenant_id: UUID | None) -> bool:
    """Check if email sending is enabled for training notifications in this tenant.

    Mirrors the conference toggle but reads from
    ``tenant.settings['training_email_settings']`` (per the trainings module's
    Email Settings tab). Defaults to enabled when missing.
    """
    if tenant_id is None:
        return True
    from app.models.tenant import Tenant

    result = await db.execute(select(Tenant.settings).where(Tenant.id == tenant_id))
    settings = result.scalar_one_or_none()
    if settings is None:
        return True
    training_settings = settings.get("training_email_settings", {}) or {}
    return bool(training_settings.get("email_sending_enabled", True))


async def send_verification_email(
    db: AsyncSession,
    *,
    email: str,
    token: str,
    tenant_slug: str,
    conference_id: UUID | None = None,
    tenant_id: UUID | None = None,
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

    return await send_email(
        email,
        rendered.subject,
        rendered.body_html,
        rendered.body_text,
        db=db,
        tenant_id=tenant_id,
        conference_id=conference_id,
        email_type="verification",
    )


async def send_submission_confirmation_email(
    db: AsyncSession,
    *,
    email: str,
    conference_id: UUID,
    tenant_id: UUID | None = None,
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

    return await send_email(
        email,
        rendered.subject,
        rendered.body_html,
        rendered.body_text,
        db=db,
        tenant_id=tenant_id,
        conference_id=conference_id,
        email_type="submission_confirmation",
    )


async def send_cospeaker_invitation_email(
    db: AsyncSession,
    *,
    email: str,
    paper_title: str,
    conference_id: UUID,
    tenant_id: UUID | None = None,
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

    return await send_email(
        email,
        rendered.subject,
        rendered.body_html,
        rendered.body_text,
        db=db,
        tenant_id=tenant_id,
        conference_id=conference_id,
        email_type="cospeaker_invitation",
    )


async def send_password_reset_email(
    db: AsyncSession,
    *,
    email: str,
    token: str,
    conference_id: UUID | None = None,
    tenant_id: UUID | None = None,
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

    return await send_email(
        email,
        rendered.subject,
        rendered.body_html,
        rendered.body_text,
        db=db,
        tenant_id=tenant_id,
        conference_id=conference_id,
        email_type="password_reset",
    )


async def send_tenant_user_welcome_email(
    db: AsyncSession,
    *,
    email: str,
    token: str,
    tenant_id: UUID | None = None,
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
        tenant_id=tenant_id,
    )

    return await send_email(
        email,
        rendered.subject,
        rendered.body_html,
        rendered.body_text,
        from_email=from_email,
        db=db,
        tenant_id=tenant_id,
        email_type="tenant_welcome",
    )


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

    return await send_email(
        email,
        rendered.subject,
        rendered.body_html,
        rendered.body_text,
        db=db,
        tenant_id=tenant_id,
        conference_id=conference_id,
        email_type="team_invitation",
    )


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

    return await send_email(
        to,
        rendered.subject,
        rendered.body_html,
        rendered.body_text,
        db=db,
        tenant_id=tenant_id,
        conference_id=conference_id,
        email_type="deadline_reminder",
    )


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

    ``body_html`` is rich content authored in-app (e.g. news article body)
    and must NOT be HTML-escaped during placeholder substitution — that
    was Brandon's QA 6.2.1 where recipients saw ``<p>article 1</p>`` as
    text. We sanitize it through ``nh3`` first as defense-in-depth, then
    pass ``Message Content`` in ``raw_html_keys`` so the template
    renderer leaves the tags intact.
    """
    from app.core.html_sanitize import sanitize_html

    safe_body_html = sanitize_html(body_html) if body_html else ""

    context = build_direct_message_context(
        first_name=first_name,
        conference_name=conference_name,
        sender_name=sender_name,
        message_subject=subject,
        message_content=safe_body_html,
    )

    rendered = await render_email(
        db,
        EmailTemplateType.DIRECT_MESSAGE,
        context,
        conference_id=conference_id,
        tenant_id=tenant_id,
        raw_html_keys={"Message Content"},
    )

    return await send_email(
        email,
        rendered.subject,
        rendered.body_html,
        rendered.body_text,
        reply_to=reply_to,
        db=db,
        tenant_id=tenant_id,
        conference_id=conference_id,
        email_type="direct_message",
    )


async def send_new_message_notification(
    db: AsyncSession,
    *,
    email: str,
    first_name: str = "",
    conference_id: UUID | None = None,
    tenant_id: UUID | None = None,
    conference_name: str = "",
    message_subject: str = "",
    messages_link: str = "",
    domain: str = "conference",
) -> bool:
    """Send a notification email about a new platform message.

    ``domain`` selects the email-enabled gate: ``"conference"`` reads
    ``Conference.settings.email_sending_enabled`` (existing behavior),
    ``"training"`` reads
    ``Tenant.settings.training_email_settings.email_sending_enabled``.
    The ``conference_name`` slot doubles as the training name on the
    training path so the rendered template stays a single source of truth.
    """
    if domain == "training":
        if not await _is_email_enabled_for_training(db, tenant_id):
            logger.info(f"Email sending disabled for training in tenant {tenant_id}, skipping notification to {email}")
            return False
    else:
        if not await _is_email_enabled_for_conference(db, conference_id):
            logger.info(
                f"Email sending disabled for conference {conference_id}, skipping message notification to {email}"
            )
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

    return await send_email(
        email,
        rendered.subject,
        rendered.body_html,
        rendered.body_text,
        db=db,
        tenant_id=tenant_id,
        conference_id=conference_id,
        email_type="message_notification",
    )
