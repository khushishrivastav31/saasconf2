"""Email sending with Resend.

Uses Resend API when RESEND_API_KEY is configured,
otherwise falls back to console logging for development.
"""

import logging

from app.config import get_settings

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
    logger.info(
        f"=== EMAIL ===\n"
        f"To: {to}\n"
        f"Subject: {subject}\n"
        f"Body:\n{body}\n"
        f"============="
    )
    print(
        f"\n{'='*50}\n"
        f"EMAIL (development mode)\n"
        f"To: {to}\n"
        f"Subject: {subject}\n"
        f"{'='*50}\n"
    )


async def send_email(
    to: str,
    subject: str,
    html: str,
    text: str | None = None,
) -> bool:
    """
    Send an email using Resend.

    Returns True if sent successfully, False otherwise.
    Falls back to console logging if Resend is not configured.
    """
    settings = get_settings()
    resend = _get_resend()

    if resend is None:
        _log_email(to, subject, text or html)
        return True

    try:
        resend.Emails.send({
            "from": f"{settings.RESEND_FROM_NAME} <{settings.RESEND_FROM_EMAIL}>",
            "to": [to],
            "subject": subject,
            "html": html,
            "text": text,
        })
        logger.info(f"Email sent to {to}: {subject}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email to {to}: {e}")
        return False


async def send_verification_email(
    email: str,
    token: str,
    tenant_slug: str,
    base_url: str = "http://localhost:3002",
) -> None:
    """Send an email verification link to a new applicant."""
    verification_url = f"{base_url}/{tenant_slug}/portal/user/verify-email?token={token}"

    subject = "Verify your email address"
    html = f"""
    <h2>Welcome to SaaSConf!</h2>
    <p>Please verify your email address by clicking the link below:</p>
    <p><a href="{verification_url}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 6px;">Verify Email</a></p>
    <p>Or copy and paste this link into your browser:</p>
    <p><a href="{verification_url}">{verification_url}</a></p>
    <p>This link will expire in 24 hours.</p>
    <p>If you didn't create an account, you can safely ignore this email.</p>
    """
    text = f"""
Welcome to SaaSConf!

Please verify your email address by visiting:
{verification_url}

This link will expire in 24 hours.

If you didn't create an account, you can safely ignore this email.
"""

    await send_email(email, subject, html, text)


async def send_cospeaker_invitation_email(
    email: str,
    paper_title: str,
    conference_name: str,
    main_speaker_name: str,
    tenant_slug: str,
    base_url: str = "http://localhost:3002",
) -> None:
    """Send a co-speaker invitation email."""
    portal_url = f"{base_url}/{tenant_slug}/portal/invitations"

    subject = f"You've been invited as a co-speaker for '{paper_title}'"
    html = f"""
    <h2>Co-Speaker Invitation</h2>
    <p>Hi there!</p>
    <p><strong>{main_speaker_name}</strong> has invited you to be a co-speaker for their presentation:</p>
    <div style="margin: 20px 0; padding: 16px; background-color: #f3f4f6; border-radius: 8px;">
        <p style="margin: 0; font-size: 18px; font-weight: 600;">{paper_title}</p>
        <p style="margin: 8px 0 0 0; color: #6b7280;">{conference_name}</p>
    </div>
    <p>To view and respond to this invitation:</p>
    <p><a href="{portal_url}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 6px;">View Invitation</a></p>
    <p>Or copy and paste this link into your browser:</p>
    <p><a href="{portal_url}">{portal_url}</a></p>
    """
    text = f"""
Co-Speaker Invitation

Hi there!

{main_speaker_name} has invited you to be a co-speaker for their presentation:

"{paper_title}"
{conference_name}

To view and respond to this invitation, visit:
{portal_url}
"""

    await send_email(email, subject, html, text)


async def send_password_reset_email(
    email: str,
    token: str,
    tenant_slug: str,
    base_url: str = "http://localhost:3002",
) -> None:
    """Send a password reset email."""
    reset_url = f"{base_url}/{tenant_slug}/portal/user/reset-password?token={token}"

    subject = "Reset your password"
    html = f"""
    <h2>Password Reset Request</h2>
    <p>You requested to reset your password. Click the button below to set a new password:</p>
    <p><a href="{reset_url}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 6px;">Reset Password</a></p>
    <p>Or copy and paste this link into your browser:</p>
    <p><a href="{reset_url}">{reset_url}</a></p>
    <p>This link will expire in 1 hour.</p>
    <p>If you didn't request a password reset, you can safely ignore this email.</p>
    """
    text = f"""
Password Reset Request

You requested to reset your password. Visit the link below to set a new password:
{reset_url}

This link will expire in 1 hour.

If you didn't request a password reset, you can safely ignore this email.
"""

    await send_email(email, subject, html, text)
