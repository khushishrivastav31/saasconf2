"""Tenant-level portal user history — unified ``customer_events`` reader.

Reads exclusively from the canonical ``customer_events`` table (added
in migration 205, dual-written in phases 3 + 4). Each row carries a
namespaced ``event_type`` (``portal.activated``, ``training.parked``,
``cfp.submitted``, ``messaging.received``, ...) and a ``domain`` chip
so the UI can group events without a second query.

Lookup strategy: ``portal_user_id`` is the primary key, but a merged
portal user has its row SET NULL'd. ``subject_email_hash`` is always
set and is the stable identity across merges/deletes — we OR both
conditions so a merged subject's full history still surfaces on the
surviving account.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import or_, select

from app.core.dependencies import DbSessionDep, TenantAdminDep
from app.models.customer_event import CustomerEvent

from ._helpers import get_portal_user

router = APIRouter(prefix="/portal-users", tags=["Portal Users"])


@router.get("/{user_id}/history")
async def get_portal_user_history(
    user_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    limit: int = 100,
) -> dict[str, Any]:
    """Return the chronological customer-event stream for a portal user."""
    user = await get_portal_user(db, user_id, current_user.tenant_id)

    limit = max(1, min(limit, 500))

    conds = [CustomerEvent.portal_user_id == user_id]
    if user.email_hash:
        conds.append(CustomerEvent.subject_email_hash == user.email_hash)

    result = await db.execute(
        select(CustomerEvent)
        .where(
            CustomerEvent.tenant_id == current_user.tenant_id,
            or_(*conds),
        )
        .order_by(CustomerEvent.created_at.desc())
        .limit(limit)
    )
    rows = result.scalars().all()

    items = [
        {
            "id": str(r.id),
            "domain": r.domain,
            "event_type": r.event_type,
            "notes": r.notes,
            "meta": r.meta or {},
            "created_by": str(r.created_by) if r.created_by else None,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]

    return {"items": items, "total": len(items)}
