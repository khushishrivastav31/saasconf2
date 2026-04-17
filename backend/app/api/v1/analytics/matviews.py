"""Admin endpoint to refresh dashboard materialized views on demand.

The matviews (``mv_conference_revenue``, ``mv_daily_registrations``,
``mv_booking_option_revenue``) back the dashboard aggregates. A nightly
external cron should hit this endpoint; super-admins can also trigger it
manually for debugging.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.core.analytics.mv_refresh import refresh_all_dashboard_matviews
from app.core.dependencies import DbSessionDep, SuperAdminDep

router = APIRouter()


@router.post("/matviews/refresh")
async def refresh_matviews(
    db: DbSessionDep,
    current_user: SuperAdminDep,
) -> dict[str, list[str]]:
    """Refresh all dashboard matviews (super-admin only). Returns the list refreshed."""
    refreshed = await refresh_all_dashboard_matviews(db)
    return {"refreshed": refreshed}
