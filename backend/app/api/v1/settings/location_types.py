"""Location Types CRUD endpoints."""

from typing import Any

from sqlalchemy import func, select
from sqlalchemy import update as sql_update

from app.core.exceptions import ValidationError
from app.models.location import Location
from app.models.settings import TenantLocationType
from app.schemas.settings import (
    LocationTypeCreate,
    LocationTypeListResponse,
    LocationTypeResponse,
    LocationTypeUpdate,
)

from ._crud_factory import create_crud_router


async def _build_location_type_response(
    entity: Any, conference: Any, db: Any
) -> LocationTypeResponse:
    """Build a response including usage_count from the Location table."""
    usage_count = (
        await db.execute(
            select(func.count()).where(
                Location.tenant_id == conference.tenant_id,
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


async def _cascade_slug_change(
    entity: Any, update_data: dict[str, Any], conference: Any, db: Any
) -> None:
    """If slug changed, update all locations using the old slug."""
    if "slug" not in update_data:
        return
    from sqlalchemy import inspect as sa_inspect

    state = sa_inspect(entity)
    history = state.attrs.slug.history
    if history.deleted and history.deleted[0] != entity.slug:
        old_slug = history.deleted[0]
        await db.execute(
            sql_update(Location)
            .where(
                Location.tenant_id == conference.tenant_id,
                Location.location_type == old_slug,
            )
            .values(location_type=entity.slug)
        )


async def _check_locations_using_type(entity: Any, conference: Any, db: Any) -> None:
    """Block deletion if any locations use this type."""
    usage_count = (
        await db.execute(
            select(func.count()).where(
                Location.tenant_id == conference.tenant_id,
                Location.location_type == entity.slug,
            )
        )
    ).scalar() or 0

    if usage_count > 0:
        raise ValidationError(
            f"Cannot delete location type '{entity.name}': {usage_count} location(s) are using it"
        )


router = create_crud_router(
    prefix="location-types",
    entity_name="location_type",
    model_class=TenantLocationType,
    create_schema=LocationTypeCreate,
    update_schema=LocationTypeUpdate,
    response_schema=LocationTypeResponse,
    list_response_schema=LocationTypeListResponse,
    unique_field="slug",
    unique_field_label="slug",
    label_field="name",
    order_by=("name",),
    audit_create_fields=["name", "slug"],
    response_builder=_build_location_type_response,
    post_update_hook=_cascade_slug_change,
    pre_delete_check=_check_locations_using_type,
)
