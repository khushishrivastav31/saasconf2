"""One-shot backfill: create TrainingAttendee identity rows for every
existing TrainingRegistrationAttendee that's missing one.

Historically the public training registration flow only created
``TrainingRegistrationAttendee`` rows and never the unified
``TrainingAttendee`` identity. Attendees registered before the fix
therefore never appeared in the admin Attendee list and their portal
``/my-trainings`` view was empty.

The forward fix is in-place in ``app/api/v1/portal/training_portal.py``;
this script heals the back-catalog. Idempotent: calling
``resolve_or_create_training_attendee`` skips rows that already exist
and only reactivates ``parked`` rows.

Usage:

    cd backend && venv/bin/python -m scripts.backfill_training_attendees_from_registrations
"""

from __future__ import annotations

import asyncio
import logging
import sys
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.sql import text

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings
from app.core.training_attendee_resolver import resolve_or_create_training_attendee
from app.models.portal_user import PortalUser
from app.models.tenant import Tenant
from app.models.training_attendee import TrainingAttendee
from app.models.training_registration import TrainingRegistrationAttendee

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


async def backfill_tenant(db: AsyncSession, tenant_id) -> dict[str, int]:
    """Process every TrainingRegistrationAttendee for a tenant."""
    await db.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
    await db.execute(text("SELECT set_config('app.current_tenant_id', :tid, true)").bindparams(tid=str(tenant_id)))

    result = await db.execute(
        select(TrainingRegistrationAttendee).where(
            TrainingRegistrationAttendee.tenant_id == tenant_id,
        )
    )
    rows = list(result.scalars().all())
    created = 0
    linked = 0
    skipped_no_email = 0

    for row in rows:
        if not row.email:
            skipped_no_email += 1
            continue
        attendee = await resolve_or_create_training_attendee(
            db,
            tenant_id=tenant_id,
            email=row.email,
            first_name=row.first_name,
            last_name=row.last_name,
        )
        if row.attendee_id != attendee.id:
            row.attendee_id = attendee.id
            linked += 1
        if attendee.created_at is None:
            # Newly created within this session (flushed but no server-side default read).
            created += 1

    # Second pass: link each TrainingAttendee to an existing PortalUser that
    # shares tenant + email_hash. This heals rows whose portal_user existed
    # already (e.g. from a conference flow) but whose training-identity link
    # was never populated.
    unlinked = await db.execute(
        select(TrainingAttendee).where(
            TrainingAttendee.tenant_id == tenant_id,
            TrainingAttendee.portal_user_id.is_(None),
        )
    )
    portal_links = 0
    for ta in unlinked.scalars().all():
        if not ta.email_hash:
            continue
        pu = await db.execute(
            select(PortalUser).where(
                PortalUser.tenant_id == tenant_id,
                PortalUser.email_hash == ta.email_hash,
            )
        )
        portal_user = pu.scalar_one_or_none()
        if portal_user is not None:
            ta.portal_user_id = portal_user.id
            portal_links += 1

    await db.commit()
    return {
        "scanned": len(rows),
        "linked_or_created": linked,
        "portal_user_links": portal_links,
        "skipped_no_email": skipped_no_email,
    }


async def main() -> None:
    settings = get_settings()
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    Session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async with Session() as db:
        await db.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        tenants = (await db.execute(select(Tenant.id, Tenant.name))).all()

    totals = {"scanned": 0, "linked_or_created": 0, "portal_user_links": 0, "skipped_no_email": 0}

    for tenant_id, tenant_name in tenants:
        async with Session() as db:
            stats = await backfill_tenant(db, tenant_id)
        logger.info(
            "tenant=%s scanned=%d linked_or_created=%d portal_user_links=%d skipped_no_email=%d",
            tenant_name,
            stats["scanned"],
            stats["linked_or_created"],
            stats["portal_user_links"],
            stats["skipped_no_email"],
        )
        for key in totals:
            totals[key] += stats[key]

    logger.info(
        "Backfill complete — scanned=%d linked_or_created=%d portal_user_links=%d skipped_no_email=%d",
        totals["scanned"],
        totals["linked_or_created"],
        totals["portal_user_links"],
        totals["skipped_no_email"],
    )

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
