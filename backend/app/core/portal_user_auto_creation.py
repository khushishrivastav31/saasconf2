"""Portal user auto-creation for conference registrations and co-speaker provisioning.

Creates PortalUser accounts (not admin User accounts) when a registration is
submitted through the public portal.  Emits a PortalRefreshToken with
purpose='setup' so the welcome-email link can land on the portal set-password
page rather than the admin reset-password page.
"""

import logging
import secrets
from datetime import timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.applicant_security import generate_email_verification_token
from app.core.security import hash_password
from app.core.security.pii_crypto import encrypt_pii, hash_email
from app.core.utils import utcnow
from app.models.cfp_applicants import CFPApplicant
from app.models.portal_user import PortalRefreshToken, PortalUser
from app.models.registration import Registration

logger = logging.getLogger(__name__)

_SETUP_TOKEN_TTL_DAYS = 7


async def create_portal_user_for_registration(
    db: AsyncSession,
    registration: Registration,
    tenant_id: UUID,
) -> tuple[PortalUser | None, str | None]:
    """Create (or locate) a PortalUser for a registration attendee.

    Idempotent:
    - New email → creates PortalUser + PortalRefreshToken(purpose='setup', 7 days).
    - Existing PortalUser with a password → returns existing user, no token
      (they can log in normally; no need to re-run setup).
    - Existing PortalUser without a password → returns existing user + fresh
      setup token (they never finished the first-time setup).

    Returns:
        (PortalUser, raw_token) — raw_token is None when no setup email is needed.
    """
    if not registration.email:
        logger.warning("Registration %s has no email, skipping portal user creation", registration.id)
        return (None, None)

    email_lower = registration.email.lower()
    email_hash = hash_email(email_lower)

    existing_result = await db.execute(
        select(PortalUser).where(
            PortalUser.tenant_id == tenant_id,
            PortalUser.email_hash == email_hash,
        )
    )
    existing = existing_result.scalar_one_or_none()

    if existing:
        if existing.password_hash:
            logger.info("PortalUser %s already has a password, skipping setup token", existing.id)
            return (existing, None)

        logger.info("PortalUser %s exists but has no password, issuing fresh setup token", existing.id)
        raw_token = await _create_setup_token(db, existing.id)
        return (existing, raw_token)

    portal_user = PortalUser(
        tenant_id=tenant_id,
        email_encrypted=encrypt_pii(email_lower),
        email_hash=email_hash,
        first_name=registration.first_name,
        last_name=registration.last_name or "",
    )
    db.add(portal_user)
    await db.flush()

    logger.info("PortalUser %s created for registration %s", portal_user.id, registration.id)

    raw_token = await _create_setup_token(db, portal_user.id)
    return (portal_user, raw_token)


async def _create_setup_token(db: AsyncSession, portal_user_id: UUID) -> str:
    raw_token, token_hash = generate_email_verification_token()
    expires_at = utcnow() + timedelta(days=_SETUP_TOKEN_TTL_DAYS)

    db.add(
        PortalRefreshToken(
            portal_user_id=portal_user_id,
            token_hash=token_hash,
            expires_at=expires_at,
            purpose="setup",
        )
    )
    await db.flush()
    return raw_token


async def provision_cospeaker_applicant(
    db: AsyncSession,
    *,
    tenant_id: UUID,
    first_name: str,
    email: str,
) -> tuple[CFPApplicant, str | None]:
    """Create (or locate) a PortalUser + CFPApplicant for an unregistered co-speaker.

    The applicant is created with a random unusable password so login requires
    the set-password flow. The raw setup token (or None if the account already
    has a password) drives the invite link.

    Returns:
        (CFPApplicant, raw_setup_token | None)
    """
    email_lower = email.strip().lower()
    email_hash = hash_email(email_lower)

    # Find or create the PortalUser
    existing_pu = await db.execute(
        select(PortalUser).where(
            PortalUser.tenant_id == tenant_id,
            PortalUser.email_hash == email_hash,
        )
    )
    portal_user = existing_pu.scalar_one_or_none()
    raw_token: str | None = None

    if portal_user is None:
        portal_user = PortalUser(
            tenant_id=tenant_id,
            email_encrypted=encrypt_pii(email_lower),
            email_hash=email_hash,
            first_name=first_name,
            last_name="",
        )
        db.add(portal_user)
        await db.flush()
        raw_token = await _create_setup_token(db, portal_user.id)
    elif not portal_user.password_hash:
        raw_token = await _create_setup_token(db, portal_user.id)

    # Create the CFPApplicant with an unusable placeholder password.
    # Mark email as already verified: the main speaker provided the address,
    # and the set-password link in the invitation email serves as identity proof.
    # This prevents the account from appearing in the pending-verifications queue.
    applicant = CFPApplicant(
        tenant_id=tenant_id,
        first_name=first_name,
        last_name="",
        password_hash=hash_password(secrets.token_urlsafe(32)),
        portal_user_id=portal_user.id,
        email_verified_at=utcnow(),
    )
    applicant.email = email_lower
    db.add(applicant)
    await db.flush()

    logger.info("Provisioned CFPApplicant %s for co-speaker %s", applicant.id, email_lower)
    return (applicant, raw_token)
