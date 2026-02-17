"""Shared helpers for conference tenant ownership and admin-access checks."""

from uuid import UUID

from sqlalchemy import select

from app.core.dependencies import check_conference_admin_access
from app.core.exceptions import AuthorizationError, NotFoundError
from app.models.conference import Conference


async def get_conference_for_tenant(
    db, conference_id: UUID, tenant_id: UUID
) -> Conference:
    """Fetch a conference and verify it belongs to the given tenant.

    Raises ``NotFoundError`` when no matching conference exists.
    """
    result = await db.execute(
        select(Conference).where(
            Conference.id == conference_id,
            Conference.tenant_id == tenant_id,
        )
    )
    conference = result.scalar_one_or_none()
    if not conference:
        raise NotFoundError("Conference not found")
    return conference


async def check_conference_admin(
    conference_id: UUID, current_user, db
) -> None:
    """Verify *current_user* has admin access to the conference.

    Super-admins and tenant-admins pass automatically.  For other users
    the ``UserConferenceAccess`` table is checked.

    Raises ``AuthorizationError`` when the user lacks access.
    """
    if not current_user.is_super_admin and not current_user.is_tenant_admin:
        has_access = await check_conference_admin_access(
            db, current_user.user_id, conference_id
        )
        if not has_access:
            raise AuthorizationError("Admin access to this conference required")
