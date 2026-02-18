"""Shared helper for conference-scoped settings endpoints."""

from uuid import UUID

from sqlalchemy import select

from app.core.conference_helpers import check_conference_admin as _check_conference_admin  # noqa: F401 — re-exported
from app.core.dependencies import CurrentUserDep, DbSessionDep
from app.core.exceptions import NotFoundError
from app.models.conference import Conference


async def _resolve_conference(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> Conference:
    """Resolve and verify the conference belongs to the user's tenant."""
    result = await db.execute(select(Conference).where(Conference.id == conference_id))
    conference = result.scalar_one_or_none()
    if not conference:
        raise NotFoundError(f"Conference with ID '{conference_id}' not found")

    # Verify tenant ownership
    if current_user.tenant_id is not None and conference.tenant_id != current_user.tenant_id:
        raise NotFoundError(f"Conference with ID '{conference_id}' not found")

    return conference
