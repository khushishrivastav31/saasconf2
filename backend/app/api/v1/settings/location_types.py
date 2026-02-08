"""Location Types CRUD endpoints."""

from uuid import UUID

from fastapi import APIRouter, Request
from sqlalchemy import func, select
from sqlalchemy import update as sql_update

from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    get_client_ip,
)
from app.core.exceptions import NotFoundError, ValidationError
from app.models.audit import AuditLog
from app.models.location import Location
from app.models.settings import TenantLocationType
from app.schemas.settings import (
    LocationTypeCreate,
    LocationTypeListResponse,
    LocationTypeResponse,
    LocationTypeUpdate,
)

from ._shared import _resolve_conference, _check_conference_admin

router = APIRouter()


@router.get("/location-types", response_model=LocationTypeListResponse)
async def list_location_types(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> LocationTypeListResponse:
    """List all location types for a conference."""
    conference = await _resolve_conference(conference_id, current_user, db)

    query = (
        select(TenantLocationType)
        .where(
            TenantLocationType.conference_id == conference.id,
            TenantLocationType.tenant_id == conference.tenant_id,
        )
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
                Location.tenant_id == conference.tenant_id,
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
            conference_id=t.conference_id,
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
    conference_id: UUID,
    type_data: LocationTypeCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> LocationTypeResponse:
    """Create a new location type for a conference."""
    conference = await _resolve_conference(conference_id, current_user, db)
    await _check_conference_admin(conference_id, current_user, db)

    # Check unique slug within conference
    existing = await db.execute(
        select(TenantLocationType).where(
            TenantLocationType.conference_id == conference.id,
            TenantLocationType.tenant_id == conference.tenant_id,
            TenantLocationType.slug == type_data.slug,
        )
    )
    if existing.scalar_one_or_none():
        raise ValidationError(f"A location type with slug '{type_data.slug}' already exists")

    loc_type = TenantLocationType(
        tenant_id=conference.tenant_id,
        conference_id=conference.id,
        name=type_data.name,
        slug=type_data.slug,
        description=type_data.description,
        is_active=type_data.is_active,
    )
    db.add(loc_type)

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="location_type.create",
        resource_type="location_type",
        resource_id=loc_type.id,
        details={"name": loc_type.name, "slug": loc_type.slug, "conference_id": str(conference.id)},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(loc_type)

    return LocationTypeResponse(
        id=loc_type.id,
        tenant_id=loc_type.tenant_id,
        conference_id=loc_type.conference_id,
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
    conference_id: UUID,
    type_id: UUID,
    type_data: LocationTypeUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> LocationTypeResponse:
    """Update an existing location type."""
    conference = await _resolve_conference(conference_id, current_user, db)
    await _check_conference_admin(conference_id, current_user, db)

    result = await db.execute(
        select(TenantLocationType).where(
            TenantLocationType.id == type_id,
            TenantLocationType.conference_id == conference.id,
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
                TenantLocationType.conference_id == conference.id,
                TenantLocationType.tenant_id == conference.tenant_id,
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
        await db.execute(
            sql_update(Location)
            .where(
                Location.tenant_id == conference.tenant_id,
                Location.location_type == old_slug,
            )
            .values(location_type=type_data.slug)
        )

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
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
                Location.tenant_id == conference.tenant_id,
                Location.location_type == loc_type.slug,
            )
        )
    ).scalar() or 0

    return LocationTypeResponse(
        id=loc_type.id,
        tenant_id=loc_type.tenant_id,
        conference_id=loc_type.conference_id,
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
    conference_id: UUID,
    type_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete a location type. Blocked if locations are using this type."""
    conference = await _resolve_conference(conference_id, current_user, db)
    await _check_conference_admin(conference_id, current_user, db)

    result = await db.execute(
        select(TenantLocationType).where(
            TenantLocationType.id == type_id,
            TenantLocationType.conference_id == conference.id,
        )
    )
    loc_type = result.scalar_one_or_none()
    if not loc_type:
        raise NotFoundError(f"Location type with ID '{type_id}' not found")

    # Check if any locations use this type
    usage_count = (
        await db.execute(
            select(func.count()).where(
                Location.tenant_id == conference.tenant_id,
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
        tenant_id=conference.tenant_id,
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
