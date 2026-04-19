"""One-shot backfill — create portal_users for orphan cfp_applicants.

Migration 192 migrated CFP applicants to portal_users only when
``password_hash IS NOT NULL AND password_hash != ''``. Applicants who had
never set a password were left with ``portal_user_id = NULL`` and could
not log in through the unified portal.

Most of those orphans now have a password_hash (they've reset, or have
authenticated since migration and been auto-healed by the legacy login
path). This script backfills the remaining long-tail: dormant accounts
that still need the linkage so admins can impersonate, GDPR exports
resolve correctly, and password-reset flows work end-to-end.

Run once per deploy environment:

    cd backend && venv/bin/python -m scripts.backfill_orphan_portal_users

Safe to re-run: it skips rows that are already linked.
"""

from __future__ import annotations

import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings
from app.core.portal_linkage import ensure_portal_user_for_applicant
from app.models.cfp_applicants import CFPApplicant

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


async def backfill(db: AsyncSession) -> tuple[int, int, int]:
    """Backfill portal_users for orphan applicants.

    Returns ``(healed, skipped_no_password, already_linked)``.
    """
    result = await db.execute(
        select(CFPApplicant).where(
            and_(
                CFPApplicant.portal_user_id.is_(None),
                CFPApplicant.password_hash.isnot(None),
                CFPApplicant.password_hash != "",
            )
        )
    )
    orphans = result.scalars().all()

    logger.info("Found %d orphan CFP applicant(s) with a password_hash", len(orphans))

    healed = 0
    skipped = 0
    for applicant in orphans:
        linked = await ensure_portal_user_for_applicant(db, applicant)
        if linked is None:
            skipped += 1
        else:
            healed += 1

    # Count how many were already linked (informational).
    already_result = await db.execute(select(CFPApplicant).where(CFPApplicant.portal_user_id.isnot(None)))
    already_linked = len(already_result.scalars().all())

    return healed, skipped, already_linked


async def main() -> None:
    settings = get_settings()
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    Session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async with Session() as db:
        healed, skipped, already = await backfill(db)
        await db.commit()

    logger.info(
        "Backfill complete — healed=%d skipped_no_password=%d already_linked=%d",
        healed,
        skipped,
        already,
    )

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
