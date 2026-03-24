"""Training location type CRUD endpoints (tenant-level, conference_id=NULL)."""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import func, select

from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    TenantAdminDep,
    require_module,
)
from app.core.exceptions import NotFoundError, ValidationError
from app.models.location import Location
from app.models.settings import TenantLocationType
from app.schemas.settings import (
    LocationTypeCreate,
    LocationTypeListResponse,
    LocationTypeResponse,
    LocationTypeUpdate,
)

from ._shared import MODULE_CODE

router = APIRouter()


async def _build_response(entity: TenantLocationType, db: object) -> LocationTypeResponse:
    """Build response with usage_count."""
    from sqlalchemy.ext.asyncio import AsyncSession

    assert isinstance(db, AsyncSession)
    usage_count = (
        await db.execute(
            select(func.count()).where(
                Location.tenant_id == entity.tenant_id,
                Location.location_type == entity.slug,
            )
        )
    ).scalar() or 0

    return LocationTypeResponse(
        id=entity.id,
        tenant_id=entity.tenant_id,
        conference_id=entity.conference_id,
        name=entity.name,
        slug=entity.slug,
        description=entity.description,
        is_active=entity.is_active,
        created_at=entity.created_at,
        updated_at=entity.updated_at,
        usage_count=usage_count,
    )


@router.get(
    "/location-types",
    response_model=LocationTypeListResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def list_location_types(
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> LocationTypeListResponse:
    """List all tenant-level location types (for trainings)."""
    result = await db.execute(
        select(TenantLocationType)
        .where(
            TenantLocationType.tenant_id == current_user.tenant_id,
            TenantLocationType.conference_id.is_(None),
        )
        .order_by(TenantLocationType.name)
    )
    items = list(result.scalars().all())
    responses = [await _build_response(lt, db) for lt in items]
    return LocationTypeListResponse(items=responses, total=len(responses))


@router.post(
    "/location-types",
    response_model=LocationTypeResponse,
    status_code=201,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def create_location_type(
    data: LocationTypeCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> LocationTypeResponse:
    """Create a tenant-level location type."""
    # Check slug uniqueness within tenant-level types
    existing = (
        await db.execute(
            select(TenantLocationType).where(
                TenantLocationType.tenant_id == current_user.tenant_id,
                TenantLocationType.conference_id.is_(None),
                TenantLocationType.slug == data.slug,
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise ValidationError(f"A location type with slug '{data.slug}' already exists")

    entity = TenantLocationType(
        tenant_id=current_user.tenant_id,
        conference_id=None,
        name=data.name,
        slug=data.slug,
        description=data.description,
        is_active=data.is_active,
    )
    db.add(entity)
    await db.commit()
    await db.refresh(entity)
    return await _build_response(entity, db)


@router.put(
    "/location-types/{location_type_id}",
    response_model=LocationTypeResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def update_location_type(
    location_type_id: UUID,
    data: LocationTypeUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> LocationTypeResponse:
    """Update a tenant-level location type."""
    result = await db.execute(
        select(TenantLocationType).where(
            TenantLocationType.id == location_type_id,
            TenantLocationType.tenant_id == current_user.tenant_id,
            TenantLocationType.conference_id.is_(None),
        )
    )
    entity = result.scalar_one_or_none()
    if not entity:
        raise NotFoundError(f"Location type with ID '{location_type_id}' not found")

    update_data = data.model_dump(exclude_unset=True)

    # Check slug uniqueness if changing
    if "slug" in update_data and update_data["slug"] != entity.slug:
        existing = (
            await db.execute(
                select(TenantLocationType).where(
                    TenantLocationType.tenant_id == current_user.tenant_id,
                    TenantLocationType.conference_id.is_(None),
                    TenantLocationType.slug == update_data["slug"],
                    TenantLocationType.id != location_type_id,
                )
            )
        ).scalar_one_or_none()
        if existing:
            raise ValidationError(f"A location type with slug '{update_data['slug']}' already exists")

    # Cascade slug change to locations
    old_slug = entity.slug
    for field, value in update_data.items():
        setattr(entity, field, value)

    if "slug" in update_data and update_data["slug"] != old_slug:
        from sqlalchemy import update as sql_update

        await db.execute(
            sql_update(Location)
            .where(
                Location.tenant_id == current_user.tenant_id,
                Location.location_type == old_slug,
            )
            .values(location_type=entity.slug)
        )

    await db.commit()
    await db.refresh(entity)
    return await _build_response(entity, db)


@router.delete(
    "/location-types/{location_type_id}",
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def delete_location_type(
    location_type_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Delete a tenant-level location type."""
    result = await db.execute(
        select(TenantLocationType).where(
            TenantLocationType.id == location_type_id,
            TenantLocationType.tenant_id == current_user.tenant_id,
            TenantLocationType.conference_id.is_(None),
        )
    )
    entity = result.scalar_one_or_none()
    if not entity:
        raise NotFoundError(f"Location type with ID '{location_type_id}' not found")

    # Check usage
    usage_count = (
        await db.execute(
            select(func.count()).where(
                Location.tenant_id == current_user.tenant_id,
                Location.location_type == entity.slug,
            )
        )
    ).scalar() or 0

    if usage_count > 0:
        raise ValidationError(
            f"Cannot delete location type '{entity.name}': {usage_count} location(s) are using it"
        )

    await db.delete(entity)
    await db.commit()
    return {"message": f"Location type '{entity.name}' deleted successfully"}
