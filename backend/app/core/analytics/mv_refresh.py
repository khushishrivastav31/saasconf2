"""Dashboard matview refresh helpers.

The three dashboard matviews (``mv_conference_revenue``,
``mv_daily_registrations``, ``mv_booking_option_revenue``) are refreshed
on-demand via an admin endpoint and typically on a nightly cron. Each
matview has a UNIQUE index on its natural key so ``REFRESH ...
CONCURRENTLY`` can run without blocking readers.

Refreshing is idempotent and cheap to retry — if the matview hasn't been
populated yet (freshly-created), the first CONCURRENTLY call would fail,
so we populate synchronously on first run and switch to CONCURRENTLY
afterwards. ``_has_data`` probes ``pg_matviews.ispopulated``.
"""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

DASHBOARD_MATVIEWS: tuple[str, ...] = (
    "mv_conference_revenue",
    "mv_daily_registrations",
    "mv_booking_option_revenue",
)


async def _is_populated(db: AsyncSession, name: str) -> bool:
    result = await db.execute(
        text("SELECT ispopulated FROM pg_matviews WHERE matviewname = :n"),
        {"n": name},
    )
    row = result.scalar_one_or_none()
    return bool(row) if row is not None else False


async def refresh_matview(db: AsyncSession, name: str) -> None:
    """Refresh a single matview. Uses CONCURRENTLY once it has data.

    Raises :class:`sqlalchemy.exc.ProgrammingError` if ``name`` isn't a
    known matview — this is a programming error, not a runtime state.
    """
    if name not in DASHBOARD_MATVIEWS:
        raise ValueError(f"unknown dashboard matview: {name!r}")

    if await _is_populated(db, name):
        logger.info("refreshing matview %s (CONCURRENTLY)", name)
        # Identifier is whitelisted above — safe to interpolate.
        await db.execute(text(f"REFRESH MATERIALIZED VIEW CONCURRENTLY {name}"))
    else:
        logger.info("populating matview %s (initial)", name)
        await db.execute(text(f"REFRESH MATERIALIZED VIEW {name}"))
    await db.commit()


async def refresh_all_dashboard_matviews(db: AsyncSession) -> list[str]:
    """Refresh every dashboard matview. Returns the list refreshed."""
    refreshed: list[str] = []
    for name in DASHBOARD_MATVIEWS:
        await refresh_matview(db, name)
        refreshed.append(name)
    return refreshed
