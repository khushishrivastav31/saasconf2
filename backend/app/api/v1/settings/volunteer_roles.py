"""Volunteer Roles CRUD endpoints."""

from uuid import UUID

from fastapi import APIRouter, Request
from sqlalchemy import select

from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    TenantAdminDep,
    get_client_ip,
)
from app.core.exceptions import NotFoundError, ValidationError
from app.models.audit import AuditLog
from app.models.settings import VolunteerRole
from app.schemas.settings import (
    VolunteerRoleCreate,
    VolunteerRoleListResponse,
    VolunteerRoleResponse,
    VolunteerRoleUpdate,
)

from ._shared import _resolve_conference

router = APIRouter()


@router.get("/volunteer-roles", response_model=VolunteerRoleListResponse)
async def list_volunteer_roles(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> VolunteerRoleListResponse:
    """List all volunteer roles for a conference."""
    conference = await _resolve_conference(conference_id, current_user, db)

    query = (
        select(VolunteerRole)
        .where(
            VolunteerRole.conference_id == conference.id,
            VolunteerRole.tenant_id == conference.tenant_id,
        )
        .order_by(VolunteerRole.name)
    )
    result = await db.execute(query)
    roles = result.scalars().all()

    items = [
        VolunteerRoleResponse(
            id=r.id,
            tenant_id=r.tenant_id,
            conference_id=r.conference_id,
            name=r.name,
            description=r.description,
            is_active=r.is_active,
            created_at=r.created_at,
            updated_at=r.updated_at,
        )
        for r in roles
    ]

    return VolunteerRoleListResponse(items=items, total=len(items))


@router.post("/volunteer-roles", response_model=VolunteerRoleResponse)
async def create_volunteer_role(
    conference_id: UUID,
    role_data: VolunteerRoleCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> VolunteerRoleResponse:
    """Create a new volunteer role for a conference."""
    conference = await _resolve_conference(conference_id, current_user, db)

    # Check unique name within conference
    existing = await db.execute(
        select(VolunteerRole).where(
            VolunteerRole.conference_id == conference.id,
            VolunteerRole.tenant_id == conference.tenant_id,
            VolunteerRole.name == role_data.name,
        )
    )
    if existing.scalar_one_or_none():
        raise ValidationError(f"A volunteer role named '{role_data.name}' already exists")

    role = VolunteerRole(
        tenant_id=conference.tenant_id,
        conference_id=conference.id,
        name=role_data.name,
        description=role_data.description,
        is_active=role_data.is_active,
    )
    db.add(role)

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="volunteer_role.create",
        resource_type="volunteer_role",
        resource_id=role.id,
        details={"name": role.name, "conference_id": str(conference.id)},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(role)

    return VolunteerRoleResponse(
        id=role.id,
        tenant_id=role.tenant_id,
        conference_id=role.conference_id,
        name=role.name,
        description=role.description,
        is_active=role.is_active,
        created_at=role.created_at,
        updated_at=role.updated_at,
    )


@router.put("/volunteer-roles/{role_id}", response_model=VolunteerRoleResponse)
async def update_volunteer_role(
    conference_id: UUID,
    role_id: UUID,
    role_data: VolunteerRoleUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> VolunteerRoleResponse:
    """Update an existing volunteer role."""
    conference = await _resolve_conference(conference_id, current_user, db)

    result = await db.execute(
        select(VolunteerRole).where(
            VolunteerRole.id == role_id,
            VolunteerRole.conference_id == conference.id,
        )
    )
    role = result.scalar_one_or_none()
    if not role:
        raise NotFoundError(f"Volunteer role with ID '{role_id}' not found")

    # If name is changing, check uniqueness
    if role_data.name is not None and role_data.name != role.name:
        existing = await db.execute(
            select(VolunteerRole).where(
                VolunteerRole.conference_id == conference.id,
                VolunteerRole.tenant_id == conference.tenant_id,
                VolunteerRole.name == role_data.name,
                VolunteerRole.id != role_id,
            )
        )
        if existing.scalar_one_or_none():
            raise ValidationError(f"A volunteer role named '{role_data.name}' already exists")

    update_data = role_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(role, field, value)

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="volunteer_role.update",
        resource_type="volunteer_role",
        resource_id=role.id,
        details={"updated_fields": list(update_data.keys())},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(role)

    return VolunteerRoleResponse(
        id=role.id,
        tenant_id=role.tenant_id,
        conference_id=role.conference_id,
        name=role.name,
        description=role.description,
        is_active=role.is_active,
        created_at=role.created_at,
        updated_at=role.updated_at,
    )


@router.delete("/volunteer-roles/{role_id}")
async def delete_volunteer_role(
    conference_id: UUID,
    role_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete a volunteer role."""
    conference = await _resolve_conference(conference_id, current_user, db)

    result = await db.execute(
        select(VolunteerRole).where(
            VolunteerRole.id == role_id,
            VolunteerRole.conference_id == conference.id,
        )
    )
    role = result.scalar_one_or_none()
    if not role:
        raise NotFoundError(f"Volunteer role with ID '{role_id}' not found")

    role_name = role.name

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="volunteer_role.delete",
        resource_type="volunteer_role",
        resource_id=role.id,
        details={"name": role_name},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.delete(role)
    await db.commit()

    return {"message": f"Volunteer role '{role_name}' deleted successfully"}
