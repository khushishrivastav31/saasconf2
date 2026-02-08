"""Shared helper for conference-scoped settings endpoints."""

from uuid import UUID

from sqlalchemy import select

from app.core.dependencies import CurrentUserDep, DbSessionDep, check_conference_admin_access
from app.core.exceptions import AuthorizationError, NotFoundError
from app.models.conference import Conference


async def _resolve_conference(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> Conference:
    """Resolve and verify the conference belongs to the user's tenant."""
    result = await db.execute(
        select(Conference).where(Conference.id == conference_id)
    )
    conference = result.scalar_one_or_none()
    if not conference:
        raise NotFoundError(f"Conference with ID '{conference_id}' not found")

    # Verify tenant ownership
    if current_user.tenant_id is not None and conference.tenant_id != current_user.tenant_id:
        raise NotFoundError(f"Conference with ID '{conference_id}' not found")

    return conference


async def _check_conference_admin(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> None:
    """Check if user has admin access to the conference (tenant admin or conference-specific)."""
    if not current_user.is_super_admin and not current_user.is_tenant_admin:
        has_access = await check_conference_admin_access(db, current_user.user_id, conference_id)
        if not has_access:
            raise AuthorizationError("Admin access to this conference required")
