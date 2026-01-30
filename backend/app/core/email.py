"""Email sending stubs for the applicant portal.

These functions log to console for now. Replace with a real email
service (SendGrid, SES, etc.) when ready for production.
"""

import logging

logger = logging.getLogger(__name__)


async def send_verification_email(
    email: str,
    token: str,
    tenant_slug: str,
    base_url: str = "http://localhost:3002",
) -> None:
    """Send an email verification link to a new applicant."""
    verification_url = f"{base_url}/{tenant_slug}/portal/user/verify-email?token={token}"

    logger.info(
        "=== EMAIL VERIFICATION ===\n"
        f"To: {email}\n"
        f"Subject: Verify your email address\n"
        f"Link: {verification_url}\n"
        "=========================="
    )
    # Print to stdout as well for development visibility
    print(
        f"\n{'='*50}\n"
        f"EMAIL VERIFICATION\n"
        f"To: {email}\n"
        f"Verification link: {verification_url}\n"
        f"{'='*50}\n"
    )


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

    logger.info(
        "=== CO-SPEAKER INVITATION ===\n"
        f"To: {email}\n"
        f"Subject: You've been invited as a co-speaker\n"
        f"Paper: {paper_title}\n"
        f"Conference: {conference_name}\n"
        f"Invited by: {main_speaker_name}\n"
        f"View invitations: {portal_url}\n"
        "=============================="
    )
    print(
        f"\n{'='*50}\n"
        f"CO-SPEAKER INVITATION\n"
        f"To: {email}\n"
        f"Paper: {paper_title}\n"
        f"Conference: {conference_name}\n"
        f"Invited by: {main_speaker_name}\n"
        f"Portal: {portal_url}\n"
        f"{'='*50}\n"
    )
