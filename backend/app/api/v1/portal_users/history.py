"""Tenant-level portal user history — chronological unified timeline.

Merges two sources newest-first:

* ``portal_user_history`` — admin actions on the portal user itself
  (toggle-access, invite/password emails, impersonate, merge).
* ``training_attendee_history`` — training-side events (registered, parked,
  reassigned, cancelled, offer_assigned, offer_removed) from every
  ``TrainingAttendee`` row linked to the portal user.

Conference-side rows (registrations, CFP papers) do not have a dedicated
history table today, so they are not included here — the *Linkages* tab on
the detail panel still surfaces counts for those.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.core.dependencies import DbSessionDep, TenantAdminDep
from app.models.portal_user_history import PortalUserHistory
from app.models.training_attendee import TrainingAttendee
from app.models.training_attendee_history import TrainingAttendeeHistory

from ._helpers import get_portal_user

router = APIRouter(prefix="/portal-users", tags=["Portal Users"])


@router.get("/{user_id}/history")
async def get_portal_user_history(
    user_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    limit: int = 100,
) -> dict[str, Any]:
    """Return the merged chronological action log for a portal user."""
    await get_portal_user(db, user_id, current_user.tenant_id)

    limit = max(1, min(limit, 500))

    admin_result = await db.execute(
        select(PortalUserHistory)
        .options(joinedload(PortalUserHistory.portal_user))
        .where(
            PortalUserHistory.portal_user_id == user_id,
            PortalUserHistory.tenant_id == current_user.tenant_id,
        )
        .order_by(PortalUserHistory.created_at.desc())
        .limit(limit)
    )
    admin_rows = admin_result.unique().scalars().all()

    attendee_result = await db.execute(
        select(TrainingAttendeeHistory)
        .join(TrainingAttendee, TrainingAttendeeHistory.attendee_id == TrainingAttendee.id)
        .where(
            TrainingAttendee.portal_user_id == user_id,
            TrainingAttendee.tenant_id == current_user.tenant_id,
            TrainingAttendeeHistory.tenant_id == current_user.tenant_id,
        )
        .order_by(TrainingAttendeeHistory.created_at.desc())
        .limit(limit)
    )
    attendee_rows = attendee_result.scalars().all()

    combined: list[dict[str, Any]] = []

    for r in admin_rows:
        combined.append(
            {
                "id": str(r.id),
                "source": "admin",
                "event_type": r.event_type,
                "notes": r.notes,
                "meta": r.meta or {},
                "created_by": str(r.created_by) if r.created_by else None,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
        )

    for a in attendee_rows:
        combined.append(
            {
                "id": str(a.id),
                "source": "training",
                "event_type": a.event_type,
                "notes": a.notes,
                "meta": {
                    "placement_id": str(a.placement_id) if a.placement_id else None,
                    "source_type": a.source_type,
                    "source_id": str(a.source_id) if a.source_id else None,
                },
                "created_by": str(a.created_by) if a.created_by else None,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
        )

    combined.sort(key=lambda e: e["created_at"] or "", reverse=True)
    combined = combined[:limit]

    return {"items": combined, "total": len(combined)}
