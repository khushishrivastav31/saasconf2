"""Portal user linkage helpers — bridge legacy CFP applicants and the unified portal_users table.

Migration 192 left ``cfp_applicants.portal_user_id = NULL`` for any applicant row that
had an empty ``password_hash`` at migration time (applicants who started the register
flow but never chose a password). Those orphans can't log in through the unified
portal until someone creates a ``portal_users`` row for them — we do that lazily the
next time the applicant logs in through the legacy CFP endpoint, so no ops ticket
is needed.

The heal is idempotent and only creates a portal_user when none exists for the same
(tenant_id, email_hash). If an existing portal_user is found (e.g. the applicant
already has a training-side portal account under the same email), we simply link to
it — preserving "one email = one portal account" per tenant.
"""

from __future__ import annotations

import logging
import uuid as _uuid

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security.pii_crypto import encrypt_pii, hash_email, hash_phone
from app.models.cfp_applicants import CFPApplicant
from app.models.portal_user import PortalUser

logger = logging.getLogger(__name__)


async def ensure_portal_user_for_applicant(
    db: AsyncSession,
    applicant: CFPApplicant,
) -> PortalUser | None:
    """Ensure the given CFP applicant has a linked portal_user row.

    Returns the linked PortalUser, or None if the applicant has no usable credentials
    (no password_hash — can't serve as a portal login anchor). Called after a
    successful legacy CFP login so orphans self-heal without operator action.

    This does NOT commit — the caller's transaction controls persistence.

    Uses INSERT ... ON CONFLICT DO NOTHING so concurrent verify-email requests
    (e.g. email client pre-fetch + user click) are handled atomically without
    savepoints, which asyncpg does not recover from cleanly.
    """
    if applicant.portal_user_id:
        return await db.get(PortalUser, applicant.portal_user_id)

    if not applicant.password_hash:
        return None

    if not applicant.email:
        return None

    email_hash = hash_email(applicant.email)

    # Use INSERT ... ON CONFLICT DO NOTHING so that concurrent requests for the
    # same email (e.g. email-client pre-fetch + real click) don't race into a
    # UniqueViolationError.  The final SELECT always retrieves the authoritative
    # row — whether we just inserted it or a concurrent request beat us to it.
    stmt = (
        pg_insert(PortalUser)
        .values(
            id=_uuid.uuid4(),
            tenant_id=applicant.tenant_id,
            email_encrypted=encrypt_pii(applicant.email),
            email_hash=email_hash,
            password_hash=applicant.password_hash,
            first_name=applicant.first_name,
            last_name=applicant.last_name or "",
            phone_encrypted=encrypt_pii(applicant.phone) if applicant.phone else None,
            phone_hash=hash_phone(applicant.phone) if applicant.phone else None,
            pronouns=applicant.pronouns,
            title=applicant.title,
            company=applicant.company,
            bio=applicant.bio,
            social_links=applicant.social_links or {},
            address_line_1=applicant.address_line_1,
            address_line_2=applicant.address_line_2,
            city=applicant.city,
            postal_code=applicant.postal_code,
            country=applicant.country,
            email_verified_at=applicant.email_verified_at,
            is_active=True,
            theme_preference=applicant.theme_preference,
        )
        .on_conflict_do_nothing(index_elements=["tenant_id", "email_hash"])
    )
    await db.execute(stmt)

    result = await db.execute(
        select(PortalUser).where(
            PortalUser.tenant_id == applicant.tenant_id,
            PortalUser.email_hash == email_hash,
        )
    )
    portal_user = result.scalar_one()

    applicant.portal_user_id = portal_user.id
    logger.info(
        "Ensured portal_user %s for CFP applicant %s (tenant %s)",
        portal_user.id,
        applicant.id,
        applicant.tenant_id,
    )
    return portal_user
