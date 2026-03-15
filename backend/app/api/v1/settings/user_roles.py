"""User Roles CRUD endpoints with system role seeding."""

from uuid import UUID

from fastapi import APIRouter, Request
from sqlalchemy import func, select

from app.core.dependencies import CurrentUserDep, DbSessionDep, get_client_ip
from app.core.exceptions import NotFoundError, ValidationError
from app.core.html_sanitize import sanitize_html
from app.models.audit import AuditLog
from app.models.settings import UserRole, UserRoleAssignment
from app.schemas.settings import (
    UserRoleCreate,
    UserRoleListResponse,
    UserRoleResponse,
    UserRoleUpdate,
)

from ._shared import _check_conference_admin, _resolve_conference

router = APIRouter(prefix="/user-roles", tags=["user-roles"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _ensure_system_roles(
    conference_id: UUID,
    tenant_id: UUID,
    db: DbSessionDep,
) -> None:
    """Seed the fixed system roles if they don't exist for this conference."""
    result = await db.execute(
        select(UserRole).where(
            UserRole.tenant_id == tenant_id,
            UserRole.conference_id == conference_id,
            UserRole.name.in_(UserRole.SYSTEM_ROLES),
        )
    )
    existing_roles = list(result.scalars().all())
    existing_names = {r.name for r in existing_roles}

    # Mark any existing roles with system names as is_system=True
    for role in existing_roles:
        if not role.is_system:
            role.is_system = True

    # Create missing system roles
    for role_name in UserRole.SYSTEM_ROLES:
        if role_name not in existing_names:
            db.add(
                UserRole(
                    tenant_id=tenant_id,
                    conference_id=conference_id,
                    name=role_name,
                    is_system=True,
                    is_active=True,
                )
            )

    await db.flush()


async def _get_role_for_conference(
    role_id: UUID,
    conference_id: UUID,
    tenant_id: UUID,
    db: DbSessionDep,
) -> UserRole:
    """Fetch a role, verifying it belongs to the given conference and tenant."""
    result = await db.execute(
        select(UserRole).where(
            UserRole.id == role_id,
            UserRole.tenant_id == tenant_id,
            UserRole.conference_id == conference_id,
        )
    )
    role = result.scalar_one_or_none()
    if not role:
        raise NotFoundError("User role not found")
    return role


# ---------------------------------------------------------------------------
# Role CRUD
# ---------------------------------------------------------------------------


@router.get("", response_model=UserRoleListResponse)
async def list_user_roles(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> UserRoleListResponse:
    """List all user roles for a conference, seeding system roles on first access."""
    conference = await _resolve_conference(conference_id, current_user, db)
    await _ensure_system_roles(conference.id, conference.tenant_id, db)
    await db.commit()

    # Subquery for assignment counts
    count_sq = (
        select(
            UserRoleAssignment.user_role_id,
            func.count(UserRoleAssignment.id).label("cnt"),
        )
        .group_by(UserRoleAssignment.user_role_id)
        .subquery()
    )

    result = await db.execute(
        select(UserRole, func.coalesce(count_sq.c.cnt, 0).label("assignment_count"))
        .outerjoin(count_sq, UserRole.id == count_sq.c.user_role_id)
        .where(
            UserRole.tenant_id == conference.tenant_id,
            UserRole.conference_id == conference.id,
        )
        .order_by(UserRole.is_system.desc(), UserRole.name)
    )
    rows = result.all()
    items = []
    for role, cnt in rows:
        resp = UserRoleResponse.model_validate(role)
        resp.assignment_count = cnt
        items.append(resp)

    return UserRoleListResponse(items=items, total=len(items))


@router.post("", response_model=UserRoleResponse, status_code=201)
async def create_user_role(
    conference_id: UUID,
    data: UserRoleCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> UserRoleResponse:
    """Create a custom user role."""
    conference = await _resolve_conference(conference_id, current_user, db)
    await _check_conference_admin(conference_id, current_user, db)

    # Check name uniqueness
    result = await db.execute(
        select(UserRole).where(
            UserRole.tenant_id == conference.tenant_id,
            UserRole.conference_id == conference.id,
            UserRole.name == data.name,
        )
    )
    if result.scalar_one_or_none():
        raise ValidationError(f"A user role named '{data.name}' already exists")

    role = UserRole(
        tenant_id=conference.tenant_id,
        conference_id=conference.id,
        name=data.name,
        description=sanitize_html(data.description) if data.description else data.description,
        is_system=False,
        is_active=data.is_active,
    )
    db.add(role)

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="user_role.create",
        resource_type="user_role",
        resource_id=None,
        details={"name": data.name, "conference_id": str(conference.id)},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()
    await db.refresh(role)

    return UserRoleResponse.model_validate(role)


@router.put("/{role_id}", response_model=UserRoleResponse)
async def update_user_role(
    conference_id: UUID,
    role_id: UUID,
    data: UserRoleUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> UserRoleResponse:
    """Update a user role. System roles cannot be renamed."""
    conference = await _resolve_conference(conference_id, current_user, db)
    await _check_conference_admin(conference_id, current_user, db)

    role = await _get_role_for_conference(role_id, conference.id, conference.tenant_id, db)

    # System roles cannot be renamed
    if role.is_system and data.name is not None and data.name != role.name:
        raise ValidationError("System roles cannot be renamed")

    # Check name uniqueness if changing name
    if data.name is not None and data.name != role.name:
        dup = await db.execute(
            select(UserRole).where(
                UserRole.tenant_id == conference.tenant_id,
                UserRole.conference_id == conference.id,
                UserRole.name == data.name,
                UserRole.id != role_id,
            )
        )
        if dup.scalar_one_or_none():
            raise ValidationError(f"A user role named '{data.name}' already exists")
        role.name = data.name

    if data.description is not None:
        role.description = sanitize_html(data.description) if data.description else data.description
    if data.is_active is not None:
        role.is_active = data.is_active

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="user_role.update",
        resource_type="user_role",
        resource_id=role.id,
        details={"name": role.name, "conference_id": str(conference.id)},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()
    await db.refresh(role)

    return UserRoleResponse.model_validate(role)


@router.delete("/{role_id}")
async def delete_user_role(
    conference_id: UUID,
    role_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete a custom user role. System roles cannot be deleted."""
    conference = await _resolve_conference(conference_id, current_user, db)
    await _check_conference_admin(conference_id, current_user, db)

    role = await _get_role_for_conference(role_id, conference.id, conference.tenant_id, db)

    if role.is_system:
        raise ValidationError("System roles cannot be deleted")

    role_name = role.name
    await db.delete(role)

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="user_role.delete",
        resource_type="user_role",
        resource_id=role_id,
        details={"name": role_name, "conference_id": str(conference.id)},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()

    return {"message": f"User role '{role_name}' deleted"}
