"""Tenant settings endpoints for volunteer roles and location types."""

from uuid import UUID

from fastapi import APIRouter, Request
from sqlalchemy import func, select

from app.core.dependencies import (
    CurrentUserDep,
    TenantAdminDep,
    DbSessionDep,
    get_client_ip,
)
from app.core.exceptions import NotFoundError, ValidationError
from app.models.audit import AuditLog
from app.models.settings import VolunteerRole, TenantLocationType
from app.models.location import Location
from app.schemas.settings import (
    VolunteerRoleCreate,
    VolunteerRoleUpdate,
    VolunteerRoleResponse,
    VolunteerRoleListResponse,
    LocationTypeCreate,
    LocationTypeUpdate,
    LocationTypeResponse,
    LocationTypeListResponse,
)

router = APIRouter()


def _resolve_tenant_id(current_user: TenantAdminDep) -> UUID:
    """Resolve the tenant ID for the request."""
    if current_user.tenant_id is None:
        raise ValidationError("Tenant context required. Super admins must use the tenant management page.")
    return current_user.tenant_id


# ---------------------------------------------------------------------------
# Volunteer Roles
# ---------------------------------------------------------------------------


@router.get("/volunteer-roles", response_model=VolunteerRoleListResponse)
async def list_volunteer_roles(
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> VolunteerRoleListResponse:
    """List all volunteer roles for the tenant."""
    if current_user.tenant_id is None:
        return VolunteerRoleListResponse(items=[], total=0)

    query = (
        select(VolunteerRole)
        .where(VolunteerRole.tenant_id == current_user.tenant_id)
        .order_by(VolunteerRole.name)
    )
    result = await db.execute(query)
    roles = result.scalars().all()

    items = [
        VolunteerRoleResponse(
            id=r.id,
            tenant_id=r.tenant_id,
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
    role_data: VolunteerRoleCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> VolunteerRoleResponse:
    """Create a new volunteer role."""
    resolved_tenant_id = _resolve_tenant_id(current_user)

    # Check unique name within tenant
    existing = await db.execute(
        select(VolunteerRole).where(
            VolunteerRole.tenant_id == resolved_tenant_id,
            VolunteerRole.name == role_data.name,
        )
    )
    if existing.scalar_one_or_none():
        raise ValidationError(f"A volunteer role named '{role_data.name}' already exists")

    role = VolunteerRole(
        tenant_id=resolved_tenant_id,
        name=role_data.name,
        description=role_data.description,
        is_active=role_data.is_active,
    )
    db.add(role)

    audit_log = AuditLog(
        tenant_id=resolved_tenant_id,
        user_id=current_user.user_id,
        action="volunteer_role.create",
        resource_type="volunteer_role",
        resource_id=role.id,
        details={"name": role.name},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(role)

    return VolunteerRoleResponse(
        id=role.id,
        tenant_id=role.tenant_id,
        name=role.name,
        description=role.description,
        is_active=role.is_active,
        created_at=role.created_at,
        updated_at=role.updated_at,
    )


@router.put("/volunteer-roles/{role_id}", response_model=VolunteerRoleResponse)
async def update_volunteer_role(
    role_id: UUID,
    role_data: VolunteerRoleUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> VolunteerRoleResponse:
    """Update an existing volunteer role."""
    resolved_tenant_id = _resolve_tenant_id(current_user)

    result = await db.execute(
        select(VolunteerRole).where(
            VolunteerRole.id == role_id,
            VolunteerRole.tenant_id == resolved_tenant_id,
        )
    )
    role = result.scalar_one_or_none()
    if not role:
        raise NotFoundError(f"Volunteer role with ID '{role_id}' not found")

    # If name is changing, check uniqueness
    if role_data.name is not None and role_data.name != role.name:
        existing = await db.execute(
            select(VolunteerRole).where(
                VolunteerRole.tenant_id == resolved_tenant_id,
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
        tenant_id=resolved_tenant_id,
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
        name=role.name,
        description=role.description,
        is_active=role.is_active,
        created_at=role.created_at,
        updated_at=role.updated_at,
    )


@router.delete("/volunteer-roles/{role_id}")
async def delete_volunteer_role(
    role_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete a volunteer role."""
    resolved_tenant_id = _resolve_tenant_id(current_user)

    result = await db.execute(
        select(VolunteerRole).where(
            VolunteerRole.id == role_id,
            VolunteerRole.tenant_id == resolved_tenant_id,
        )
    )
    role = result.scalar_one_or_none()
    if not role:
        raise NotFoundError(f"Volunteer role with ID '{role_id}' not found")

    role_name = role.name

    audit_log = AuditLog(
        tenant_id=resolved_tenant_id,
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


# ---------------------------------------------------------------------------
# Location Types
# ---------------------------------------------------------------------------


@router.get("/location-types", response_model=LocationTypeListResponse)
async def list_location_types(
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> LocationTypeListResponse:
    """List all location types for the tenant."""
    if current_user.tenant_id is None:
        return LocationTypeListResponse(items=[], total=0)

    query = (
        select(TenantLocationType)
        .where(TenantLocationType.tenant_id == current_user.tenant_id)
        .order_by(TenantLocationType.name)
    )
    result = await db.execute(query)
    types = result.scalars().all()

    # Get usage counts for all types
    type_slugs = [t.slug for t in types]
    usage_counts: dict[str, int] = {}
    if type_slugs:
        count_result = await db.execute(
            select(Location.location_type, func.count())
            .where(
                Location.tenant_id == current_user.tenant_id,
                Location.location_type.in_(type_slugs),
            )
            .group_by(Location.location_type)
        )
        for row in count_result:
            usage_counts[row[0]] = row[1]

    items = [
        LocationTypeResponse(
            id=t.id,
            tenant_id=t.tenant_id,
            name=t.name,
            slug=t.slug,
            description=t.description,
            is_active=t.is_active,
            created_at=t.created_at,
            updated_at=t.updated_at,
            usage_count=usage_counts.get(t.slug, 0),
        )
        for t in types
    ]

    return LocationTypeListResponse(items=items, total=len(items))


@router.post("/location-types", response_model=LocationTypeResponse)
async def create_location_type(
    type_data: LocationTypeCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> LocationTypeResponse:
    """Create a new location type."""
    resolved_tenant_id = _resolve_tenant_id(current_user)

    # Check unique slug within tenant
    existing = await db.execute(
        select(TenantLocationType).where(
            TenantLocationType.tenant_id == resolved_tenant_id,
            TenantLocationType.slug == type_data.slug,
        )
    )
    if existing.scalar_one_or_none():
        raise ValidationError(f"A location type with slug '{type_data.slug}' already exists")

    loc_type = TenantLocationType(
        tenant_id=resolved_tenant_id,
        name=type_data.name,
        slug=type_data.slug,
        description=type_data.description,
        is_active=type_data.is_active,
    )
    db.add(loc_type)

    audit_log = AuditLog(
        tenant_id=resolved_tenant_id,
        user_id=current_user.user_id,
        action="location_type.create",
        resource_type="location_type",
        resource_id=loc_type.id,
        details={"name": loc_type.name, "slug": loc_type.slug},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(loc_type)

    return LocationTypeResponse(
        id=loc_type.id,
        tenant_id=loc_type.tenant_id,
        name=loc_type.name,
        slug=loc_type.slug,
        description=loc_type.description,
        is_active=loc_type.is_active,
        created_at=loc_type.created_at,
        updated_at=loc_type.updated_at,
        usage_count=0,
    )


@router.put("/location-types/{type_id}", response_model=LocationTypeResponse)
async def update_location_type(
    type_id: UUID,
    type_data: LocationTypeUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> LocationTypeResponse:
    """Update an existing location type."""
    resolved_tenant_id = _resolve_tenant_id(current_user)

    result = await db.execute(
        select(TenantLocationType).where(
            TenantLocationType.id == type_id,
            TenantLocationType.tenant_id == resolved_tenant_id,
        )
    )
    loc_type = result.scalar_one_or_none()
    if not loc_type:
        raise NotFoundError(f"Location type with ID '{type_id}' not found")

    old_slug = loc_type.slug

    # If slug is changing, check uniqueness
    if type_data.slug is not None and type_data.slug != loc_type.slug:
        existing = await db.execute(
            select(TenantLocationType).where(
                TenantLocationType.tenant_id == resolved_tenant_id,
                TenantLocationType.slug == type_data.slug,
                TenantLocationType.id != type_id,
            )
        )
        if existing.scalar_one_or_none():
            raise ValidationError(f"A location type with slug '{type_data.slug}' already exists")

    update_data = type_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(loc_type, field, value)

    # If slug changed, update all locations using the old slug
    if type_data.slug is not None and type_data.slug != old_slug:
        from sqlalchemy import update as sql_update
        await db.execute(
            sql_update(Location)
            .where(
                Location.tenant_id == resolved_tenant_id,
                Location.location_type == old_slug,
            )
            .values(location_type=type_data.slug)
        )

    audit_log = AuditLog(
        tenant_id=resolved_tenant_id,
        user_id=current_user.user_id,
        action="location_type.update",
        resource_type="location_type",
        resource_id=loc_type.id,
        details={"updated_fields": list(update_data.keys())},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(loc_type)

    # Get usage count
    usage_count = (
        await db.execute(
            select(func.count()).where(
                Location.tenant_id == resolved_tenant_id,
                Location.location_type == loc_type.slug,
            )
        )
    ).scalar() or 0

    return LocationTypeResponse(
        id=loc_type.id,
        tenant_id=loc_type.tenant_id,
        name=loc_type.name,
        slug=loc_type.slug,
        description=loc_type.description,
        is_active=loc_type.is_active,
        created_at=loc_type.created_at,
        updated_at=loc_type.updated_at,
        usage_count=usage_count,
    )


@router.delete("/location-types/{type_id}")
async def delete_location_type(
    type_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete a location type. Blocked if locations are using this type."""
    resolved_tenant_id = _resolve_tenant_id(current_user)

    result = await db.execute(
        select(TenantLocationType).where(
            TenantLocationType.id == type_id,
            TenantLocationType.tenant_id == resolved_tenant_id,
        )
    )
    loc_type = result.scalar_one_or_none()
    if not loc_type:
        raise NotFoundError(f"Location type with ID '{type_id}' not found")

    # Check if any locations use this type
    usage_count = (
        await db.execute(
            select(func.count()).where(
                Location.tenant_id == resolved_tenant_id,
                Location.location_type == loc_type.slug,
            )
        )
    ).scalar() or 0

    if usage_count > 0:
        raise ValidationError(
            f"Cannot delete location type '{loc_type.name}': {usage_count} location(s) are using it"
        )

    type_name = loc_type.name

    audit_log = AuditLog(
        tenant_id=resolved_tenant_id,
        user_id=current_user.user_id,
        action="location_type.delete",
        resource_type="location_type",
        resource_id=loc_type.id,
        details={"name": type_name, "slug": loc_type.slug},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.delete(loc_type)
    await db.commit()

    return {"message": f"Location type '{type_name}' deleted successfully"}
