"""Deadline management endpoints (conference-scoped)."""

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Request
from sqlalchemy import select

from app.constants import ResourceType
from app.core.conference_helpers import check_conference_admin
from app.core.dependencies import CurrentUserDep, DbSessionDep, get_client_ip
from app.models.audit import AuditAction, AuditLog
from app.models.deadline import Deadline
from app.schemas.deadline import (
    DeadlineCreate,
    DeadlineListResponse,
    DeadlineResponse,
    DeadlineUpdate,
)
from app.services.conference import ConferenceService

router = APIRouter()

svc = ConferenceService


def _build_response(deadline: Deadline) -> DeadlineResponse:
    return DeadlineResponse.model_validate(deadline)


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------


@router.get("", response_model=DeadlineListResponse)
async def list_deadlines(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> DeadlineListResponse:
    """List all deadlines for a conference, ordered by due date."""
    await svc.resolve_conference(db, conference_id, current_user.require_tenant_id())

    result = await db.execute(
        select(Deadline)
        .where(
            Deadline.conference_id == conference_id,
            Deadline.tenant_id == current_user.require_tenant_id(),
        )
        .order_by(Deadline.due_date.asc())
    )
    deadlines = list(result.scalars().all())

    return DeadlineListResponse(
        items=[_build_response(d) for d in deadlines],
        total=len(deadlines),
    )


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


@router.post("", response_model=DeadlineResponse, status_code=201)
async def create_deadline(
    conference_id: UUID,
    data: DeadlineCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> DeadlineResponse:
    """Create a new deadline."""
    await check_conference_admin(conference_id, current_user, db)
    await svc.resolve_conference(db, conference_id, current_user.require_tenant_id())

    deadline = Deadline(
        tenant_id=current_user.require_tenant_id(),
        conference_id=conference_id,
        title=data.title,
        description=data.description,
        due_date=data.due_date,
        created_by=current_user.user_id,
    )

    audit = AuditLog(
        tenant_id=current_user.require_tenant_id(),
        user_id=current_user.user_id,
        action=AuditAction.DEADLINE_CREATE,
        resource_type=ResourceType.DEADLINE,
        resource_id=deadline.id,
        details={"conference_id": str(conference_id), "title": data.title},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    deadline = await svc.create_resource(db, deadline, audit_log=audit)
    return _build_response(deadline)


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------


@router.put("/{deadline_id}", response_model=DeadlineResponse)
async def update_deadline(
    conference_id: UUID,
    deadline_id: UUID,
    data: DeadlineUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> DeadlineResponse:
    """Update a deadline. Resets reminder flags if due date is pushed back."""
    await check_conference_admin(conference_id, current_user, db)

    deadline = await svc.get_resource(
        db,
        Deadline,
        deadline_id,
        conference_id=conference_id,
        tenant_id=current_user.require_tenant_id(),
        label="Deadline",
    )

    update_data = data.model_dump(exclude_unset=True)
    if not update_data:
        return _build_response(deadline)

    # If due_date is changing, reset reminder flags where the window hasn't passed yet
    new_due = update_data.get("due_date")
    if new_due is not None:
        now = datetime.now(UTC)
        from datetime import timedelta

        if new_due - timedelta(days=7) > now:
            update_data["reminder_7d_sent"] = False
        if new_due - timedelta(days=1) > now:
            update_data["reminder_1d_sent"] = False
        if new_due > now:
            update_data["reminder_due_sent"] = False

    audit = AuditLog(
        tenant_id=current_user.require_tenant_id(),
        user_id=current_user.user_id,
        action=AuditAction.DEADLINE_UPDATE,
        resource_type=ResourceType.DEADLINE,
        resource_id=deadline.id,
        details={"conference_id": str(conference_id), "changes": list(update_data.keys())},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    await svc.update_resource(db, deadline, update_data, audit_log=audit)
    return _build_response(deadline)


# ---------------------------------------------------------------------------
# Toggle active/inactive
# ---------------------------------------------------------------------------


@router.patch("/{deadline_id}/toggle", response_model=DeadlineResponse)
async def toggle_deadline(
    conference_id: UUID,
    deadline_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> DeadlineResponse:
    """Toggle a deadline between active and resolved."""
    await check_conference_admin(conference_id, current_user, db)

    deadline = await svc.get_resource(
        db,
        Deadline,
        deadline_id,
        conference_id=conference_id,
        tenant_id=current_user.require_tenant_id(),
        label="Deadline",
    )

    new_active = not deadline.is_active
    audit = AuditLog(
        tenant_id=current_user.require_tenant_id(),
        user_id=current_user.user_id,
        action=AuditAction.DEADLINE_UPDATE,
        resource_type=ResourceType.DEADLINE,
        resource_id=deadline.id,
        details={
            "conference_id": str(conference_id),
            "toggled": "activated" if new_active else "deactivated",
        },
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    await svc.update_resource(db, deadline, {"is_active": new_active}, audit_log=audit)
    return _build_response(deadline)


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------


@router.delete("/{deadline_id}")
async def delete_deadline(
    conference_id: UUID,
    deadline_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> dict[str, str]:
    """Delete a deadline."""
    await check_conference_admin(conference_id, current_user, db)

    deadline = await svc.get_resource(
        db,
        Deadline,
        deadline_id,
        conference_id=conference_id,
        tenant_id=current_user.require_tenant_id(),
        label="Deadline",
    )

    title = deadline.title
    audit = AuditLog(
        tenant_id=current_user.require_tenant_id(),
        user_id=current_user.user_id,
        action=AuditAction.DEADLINE_DELETE,
        resource_type=ResourceType.DEADLINE,
        resource_id=deadline.id,
        details={"conference_id": str(conference_id), "title": title},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    await svc.delete_resource(db, deadline, audit_log=audit)
    return {"message": f"Deadline '{title}' deleted successfully"}
