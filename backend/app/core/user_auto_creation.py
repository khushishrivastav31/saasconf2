"""User auto-creation for registrations.

Automatically creates user accounts when registrations are created, with
7-day password setup tokens for attendees to activate their accounts.
"""

import logging
import secrets
from datetime import timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.applicant_security import generate_email_verification_token
from app.core.security import hash_password
from app.core.utils import utcnow
from app.models.registration import Registration
from app.models.user import User, UserRole
from app.models.user_password_reset import UserPasswordReset

logger = logging.getLogger(__name__)


async def create_user_for_registration(
    db: AsyncSession,
    registration: Registration,
    tenant_id: UUID,
) -> tuple[User | None, str | None]:
    """Create user account for registration attendee.

    Idempotent: returns existing user if email already exists within tenant.
    Creates passwordless user with 7-day password setup token.

    Args:
        db: Database session
        registration: Registration instance with attendee email
        tenant_id: Tenant ID

    Returns:
        Tuple of (User, raw_token):
        - User: Created or existing User instance
        - raw_token: Password setup token (None if user already exists)

    The password setup token allows the attendee to set their password
    via the welcome email link. Token expires after 7 days.
    """
    if not registration.email:
        logger.warning(f"Registration {registration.id} has no email, cannot create user")
        return (None, None)

    # Step 1: Check for existing user (case-insensitive email lookup)
    existing_user_stmt = select(User).where(
        User.tenant_id == tenant_id,
        User.email.ilike(registration.email),  # Case-insensitive
    )
    existing_user_result = await db.execute(existing_user_stmt)
    existing_user = existing_user_result.scalar_one_or_none()

    if existing_user:
        logger.info(f"User {existing_user.id} already exists for email {registration.email}, skipping user creation")
        return (existing_user, None)  # No new token for existing users

    # Step 2: Create passwordless user with random password hash
    # User will set their password via the welcome email token
    random_password = secrets.token_urlsafe(32)  # Unrecoverable random password
    password_hash = hash_password(random_password)

    user = User(
        tenant_id=tenant_id,
        email=registration.email.lower(),  # Normalize to lowercase
        password_hash=password_hash,
        first_name=registration.first_name,
        last_name=registration.last_name,
        role=UserRole.USER.value,
        is_active=True,
        has_all_conference_access=False,  # Portal user, not admin
    )

    db.add(user)
    await db.flush()  # Flush to get user ID

    logger.info(f"User {user.id} created for registration {registration.id} ({registration.email})")

    # Step 3: Generate 7-day password setup token
    raw_token, token_hash = generate_email_verification_token()
    expires_at = utcnow() + timedelta(days=7)

    password_reset = UserPasswordReset(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=expires_at,
        used_at=None,  # Token not yet used
    )

    db.add(password_reset)
    await db.flush()

    logger.info(f"Password setup token created for user {user.id}, expires at {expires_at}")

    return (user, raw_token)
