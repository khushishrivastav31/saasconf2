"""Portal user auto-creation service.

Ensures a portal_user exists when someone registers for a training.
Links portal_user to training_attendee(s). Sends password-set invite email.
"""

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.portal_security import generate_password_reset_token
from app.core.security.pii_crypto import hash_email, read_pii
from app.core.utils import utcnow
from app.models.portal_user import PortalRefreshToken, PortalUser
from app.models.tenant import Tenant
from app.models.training_attendee import TrainingAttendee
from app.models.training_registration import TrainingRegistration

logger = logging.getLogger(__name__)


async def ensure_portal_user_for_registration(
    db: AsyncSession,
    registration: TrainingRegistration,
    tenant: Tenant,
) -> PortalUser | None:
    """Ensure a portal_user exists for the registration's contact email.

    - If portal_user already exists for this email+tenant → link and return
    - If not → create portal_user (no password), link, send invite email
    - Also links any matching training_attendee records

    Returns the portal_user or None if email is missing.
    """
    email = (registration.contact_email or "").strip().lower()
    if not email:
        return None

    # Check if portal_user already exists
    result = await db.execute(
        select(PortalUser).where(
            PortalUser.tenant_id == tenant.id,
            PortalUser.email_hash == hash_email(email),
        )
    )
    portal_user = result.scalar_one_or_none()

    created = False
    if not portal_user:
        # Create new portal user (no password — will receive invite to set one)
        portal_user = PortalUser(
            tenant_id=tenant.id,
            email=email,
            first_name=registration.contact_first_name or "",
            last_name=registration.contact_last_name or "",
            phone=registration.contact_phone,
            is_active=True,
        )
        db.add(portal_user)
        await db.flush()
        created = True
        logger.info("Created portal user for %s (tenant %s)", email, tenant.slug)

    # Link matching training_attendees to portal_user
    att_result = await db.execute(
        select(TrainingAttendee).where(
            TrainingAttendee.tenant_id == tenant.id,
            TrainingAttendee.email_hash == hash_email(email),
            TrainingAttendee.portal_user_id.is_(None),
        )
    )
    for att in att_result.scalars().all():
        att.portal_user_id = portal_user.id

    await db.commit()

    # Send invite email for new users (no password set yet)
    if created:
        await _send_portal_invite_email(db, portal_user, tenant)

    return portal_user


async def _send_portal_invite_email(
    db: AsyncSession,
    portal_user: PortalUser,
    tenant: Tenant,
) -> None:
    """Send an email inviting the user to set their portal password."""
    from datetime import timedelta

    from app.config import get_settings
    from app.core.email import send_email

    settings = get_settings()

    # Create a password-set token (reuse reset token mechanism)
    raw_token, token_hash = generate_password_reset_token()
    db.add(
        PortalRefreshToken(
            portal_user_id=portal_user.id,
            token_hash=token_hash,
            expires_at=utcnow() + timedelta(days=7),  # 7 days for initial invite
        )
    )
    await db.commit()

    set_password_url = f"{settings.PORTAL_BASE_URL}/{tenant.slug}/portal/set-password?token={raw_token}"

    portal_user_email = read_pii(portal_user, "email") or ""
    try:
        await send_email(
            to=portal_user_email,
            subject=f"Set up your training portal account — {tenant.name}",
            html=f"""<p>Hi {portal_user.first_name},</p>
<p>Your training registration was successful! You can now access your personal
training portal to view training details, materials, and more.</p>
<p><a href="{set_password_url}" style="display: inline-block; padding: 12px 24px;
background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px;
font-weight: bold;">Set Your Password</a></p>
<p>This link is valid for 7 days.</p>
<p>Best regards,<br/>{tenant.name}</p>""",
            tenant_from_name=tenant.name,
        )
        logger.info("Sent portal invite email to %s", portal_user_email)
    except Exception as exc:
        logger.warning("Failed to send portal invite email to %s: %s", portal_user_email, exc)
