"""Location management endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select

from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    TenantAdminDep,
    get_client_ip,
    require_module,
)
from app.core.exceptions import NotFoundError, ValidationError
from app.core.pagination import calculate_pages, paginate
from app.core.search import unaccent_ilike
from app.models.associations import ConferenceLocation
from app.models.audit import AuditLog
from app.models.conference import Conference
from app.models.location import LOCATION_DOMAIN_CONFERENCE, LOCATION_DOMAIN_TRAINING, Location
from app.models.settings import TenantLocationType
from app.schemas.location import (
    LocationCreate,
    LocationListResponse,
    LocationResponse,
    LocationStats,
    LocationTreeResponse,
    LocationTypeCount,
    LocationUpdate,
)

router = APIRouter()

MODULE_CODE = "locations"


def build_location_response(
    location: Location,
    children_count: int = 0,
    conference_ids: list[UUID] | None = None,
) -> LocationResponse:
    """Build a LocationResponse from a Location model."""
    return LocationResponse(
        id=location.id,
        tenant_id=location.tenant_id,
        parent_id=location.parent_id,
        name=location.name,
        code=location.code,
        location_type=location.location_type,
        domain=location.domain,
        description=location.description,
        capacity=location.capacity,
        address_line1=location.address_line1,
        address_line2=location.address_line2,
        city=location.city,
        state=location.state,
        postal_code=location.postal_code,
        country=location.country,
        full_address=location.full_address,
        latitude=location.latitude,
        longitude=location.longitude,
        building=location.building,
        floor=location.floor,
        phone=location.phone,
        website=location.website,
        vat_number=location.vat_number,
        amenities=location.amenities,
        accessibility_features=location.accessibility_features,
        virtual_url=location.virtual_url,
        virtual_platform=location.virtual_platform,
        is_active=location.is_active,
        settings=location.settings,
        contact_persons=location.contact_persons or [],
        created_at=location.created_at,
        updated_at=location.updated_at,
        children_count=children_count,
        conference_ids=conference_ids or [],
    )


@router.get("/types", dependencies=[Depends(require_module(MODULE_CODE))])
async def list_location_types_for_tenant(
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> list[dict]:
    """List active tenant-level location types (conference_id IS NULL, for trainings)."""
    result = await db.execute(
        select(TenantLocationType)
        .where(
            TenantLocationType.tenant_id == current_user.tenant_id,
            TenantLocationType.conference_id.is_(None),
            TenantLocationType.is_active == True,
        )
        .order_by(TenantLocationType.name)
    )
    return [{"id": str(t.id), "slug": t.slug, "name": t.name, "is_active": t.is_active} for t in result.scalars()]


@router.get("", response_model=LocationListResponse, dependencies=[Depends(require_module(MODULE_CODE))])
async def list_locations(
    current_user: CurrentUserDep,
    db: DbSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    location_type: str | None = None,
    parent_id: UUID | None = None,
    search: str | None = None,
    is_active: bool | None = None,
    conference_id: UUID | None = None,
    domain: str | None = Query(None, description="Filter by domain: 'conference' or 'training'"),
) -> LocationListResponse:
    """
    List locations for the current tenant.

    Requires the 'locations' module. Pass ``domain='training'`` from the
    trainings UI to see only training-domain rows; the conference UI
    filters via ``conference_id`` (which implicitly only matches
    ``domain='conference'`` rows because cross-domain rows aren't
    linkable to a conference).
    """
    query = select(Location).where(Location.tenant_id == current_user.tenant_id)

    if conference_id:
        query = query.join(ConferenceLocation, ConferenceLocation.location_id == Location.id).where(
            ConferenceLocation.conference_id == conference_id
        )

    if domain is not None:
        query = query.where(Location.domain == domain)

    if location_type:
        query = query.where(Location.location_type == location_type)

    if parent_id:
        query = query.where(Location.parent_id == parent_id)
    elif parent_id is None and location_type is None:
        # By default, show only top-level locations unless filtering
        pass

    if is_active is not None:
        query = query.where(Location.is_active == is_active)

    if search:
        search_filter = (
            unaccent_ilike(Location.name, search)
            | unaccent_ilike(Location.code, search)
            | unaccent_ilike(Location.city, search)
        )
        query = query.where(search_filter)

    query = query.order_by(Location.name)
    result = await paginate(db, query, page, page_size)
    locations = result.items

    # Batch-query conference_ids and children counts
    loc_ids = [loc.id for loc in locations]
    conf_ids_map: dict[UUID, list[UUID]] = {lid: [] for lid in loc_ids}
    if loc_ids:
        assoc_result = await db.execute(
            select(ConferenceLocation.location_id, ConferenceLocation.conference_id).where(
                ConferenceLocation.location_id.in_(loc_ids)
            )
        )
        for row in assoc_result:
            conf_ids_map[row.location_id].append(row.conference_id)

    # Batch-query children counts (single query instead of N+1)
    children_counts: dict[UUID, int] = {}
    if loc_ids:
        children_result = await db.execute(
            select(Location.parent_id, func.count(Location.id))
            .where(Location.parent_id.in_(loc_ids))
            .group_by(Location.parent_id)
        )
        children_counts = {pid: count for pid, count in children_result.tuples().all() if pid is not None}

    items = []
    for loc in locations:
        items.append(build_location_response(loc, children_counts.get(loc.id, 0), conf_ids_map.get(loc.id, [])))

    return LocationListResponse(
        items=items,
        total=result.total,
        page=page,
        page_size=page_size,
        pages=calculate_pages(result.total, page_size),
    )


@router.get("/tree", response_model=list[LocationTreeResponse], dependencies=[Depends(require_module(MODULE_CODE))])
async def get_location_tree(
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> list[LocationTreeResponse]:
    """
    Get locations as a hierarchical tree.

    Returns top-level locations with nested children.
    """

    # Get all locations for this tenant
    result = await db.execute(
        select(Location).where(Location.tenant_id == current_user.tenant_id).order_by(Location.name)
    )
    all_locations = result.scalars().all()

    # Build tree structure
    root_locations = []

    def build_tree(location: Location) -> LocationTreeResponse:
        children = [loc for loc in all_locations if loc.parent_id == location.id]
        return LocationTreeResponse(
            id=location.id,
            tenant_id=location.tenant_id,
            parent_id=location.parent_id,
            name=location.name,
            code=location.code,
            location_type=location.location_type,
            domain=location.domain,
            description=location.description,
            capacity=location.capacity,
            address_line1=location.address_line1,
            address_line2=location.address_line2,
            city=location.city,
            state=location.state,
            postal_code=location.postal_code,
            country=location.country,
            full_address=location.full_address,
            latitude=location.latitude,
            longitude=location.longitude,
            building=location.building,
            floor=location.floor,
            amenities=location.amenities,
            accessibility_features=location.accessibility_features,
            virtual_url=location.virtual_url,
            virtual_platform=location.virtual_platform,
            is_active=location.is_active,
            settings=location.settings,
            contact_persons=location.contact_persons or [],
            created_at=location.created_at,
            updated_at=location.updated_at,
            children_count=len(children),
            children=[build_tree(child) for child in children],
        )

    for loc in all_locations:
        if loc.parent_id is None:
            root_locations.append(build_tree(loc))

    return root_locations


@router.get("/stats", response_model=LocationStats, dependencies=[Depends(require_module(MODULE_CODE))])
async def get_location_stats(
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> LocationStats:
    """Get location statistics for the current tenant."""

    base_query = select(Location).where(Location.tenant_id == current_user.tenant_id)

    # Total count
    total = (await db.execute(select(func.count()).select_from(base_query.subquery()))).scalar() or 0

    # Get tenant's configured location types
    types_result = await db.execute(
        select(TenantLocationType)
        .where(TenantLocationType.tenant_id == current_user.tenant_id)
        .order_by(TenantLocationType.name)
    )
    tenant_types = types_result.scalars().all()

    # Count by type
    count_result = await db.execute(
        select(Location.location_type, func.count())
        .where(Location.tenant_id == current_user.tenant_id)
        .group_by(Location.location_type)
    )
    usage_counts: dict[str, int] = {}
    for row in count_result:
        usage_counts[row[0]] = row[1]

    type_counts_list = [
        LocationTypeCount(
            slug=t.slug,
            name=t.name,
            count=usage_counts.get(t.slug, 0),
        )
        for t in tenant_types
    ]

    # Total capacity
    total_capacity = (
        await db.execute(select(func.sum(Location.capacity)).where(Location.tenant_id == current_user.tenant_id))
    ).scalar() or 0

    return LocationStats(
        total=total,
        total_capacity=total_capacity,
        type_counts=type_counts_list,
    )


@router.post("", response_model=LocationResponse, status_code=201, dependencies=[Depends(require_module(MODULE_CODE))])
async def create_location(
    location_data: LocationCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
    domain: str = Query(
        LOCATION_DOMAIN_CONFERENCE,
        description="Domain for the new row: 'conference' or 'training'.",
    ),
) -> LocationResponse:
    """Create a new location.

    Stamps the row with ``domain`` (defaults to ``conference`` for
    backward-compat with the existing conference UI). Trainings UI must
    pass ``?domain=training``. Cross-domain attempts (e.g. training
    location with a ``conference_id``) are rejected.
    """
    if domain not in (LOCATION_DOMAIN_CONFERENCE, LOCATION_DOMAIN_TRAINING):
        raise ValidationError(f"Invalid domain '{domain}'. Must be 'conference' or 'training'.")

    if domain == LOCATION_DOMAIN_TRAINING and location_data.conference_id is not None:
        raise ValidationError("Training-domain locations cannot be linked to a conference at create time.")

    # Validate conference exists and belongs to tenant (if provided)
    if location_data.conference_id:
        conf_result = await db.execute(
            select(Conference).where(
                Conference.id == location_data.conference_id,
                Conference.tenant_id == current_user.tenant_id,
            )
        )
        if not conf_result.scalar_one_or_none():
            raise NotFoundError(f"Conference with ID '{location_data.conference_id}' not found")

    # Validate parent if provided
    if location_data.parent_id:
        parent = await db.execute(
            select(Location).where(
                Location.id == location_data.parent_id,
                Location.tenant_id == current_user.tenant_id,
            )
        )
        if not parent.scalar_one_or_none():
            raise NotFoundError(f"Parent location with ID '{location_data.parent_id}' not found")

    # Validate location_type against tenant's configured types
    valid_type = await db.execute(
        select(TenantLocationType).where(
            TenantLocationType.tenant_id == current_user.tenant_id,
            TenantLocationType.slug == location_data.location_type,
            TenantLocationType.is_active == True,
        )
    )
    if not valid_type.scalar_one_or_none():
        raise ValidationError(f"Invalid location type '{location_data.location_type}'")

    # Check for duplicate code within tenant
    if location_data.code:
        existing = await db.execute(
            select(Location).where(
                Location.tenant_id == current_user.tenant_id,
                Location.code == location_data.code,
            )
        )
        if existing.scalar_one_or_none():
            raise ValidationError(f"Location with code '{location_data.code}' already exists")

    location = Location(
        tenant_id=current_user.tenant_id,
        parent_id=location_data.parent_id,
        name=location_data.name,
        code=location_data.code,
        location_type=location_data.location_type,
        domain=domain,
        description=location_data.description,
        capacity=location_data.capacity,
        address_line1=location_data.address_line1,
        address_line2=location_data.address_line2,
        city=location_data.city,
        state=location_data.state,
        postal_code=location_data.postal_code,
        country=location_data.country,
        latitude=location_data.latitude,
        longitude=location_data.longitude,
        building=location_data.building,
        floor=location_data.floor,
        amenities=location_data.amenities,
        accessibility_features=location_data.accessibility_features,
        virtual_url=location_data.virtual_url,
        virtual_platform=location_data.virtual_platform,
        settings=location_data.settings,
        contact_persons=[cp.model_dump() for cp in location_data.contact_persons]
        if location_data.contact_persons
        else [],
    )
    db.add(location)
    await db.flush()

    # Create conference association if conference_id provided
    if location_data.conference_id:
        db.add(
            ConferenceLocation(
                conference_id=location_data.conference_id,
                location_id=location.id,
            )
        )

    # Audit log
    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="location.create",
        resource_type="location",
        resource_id=location.id,
        details={"name": location.name, "type": location.location_type},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(location)

    conf_ids = [location_data.conference_id] if location_data.conference_id else []
    return build_location_response(location, conference_ids=conf_ids)


@router.get("/{location_id}", response_model=LocationResponse, dependencies=[Depends(require_module(MODULE_CODE))])
async def get_location(
    location_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> LocationResponse:
    """Get location by ID."""

    result = await db.execute(
        select(Location).where(
            Location.id == location_id,
            Location.tenant_id == current_user.tenant_id,
        )
    )
    location = result.scalar_one_or_none()

    if not location:
        raise NotFoundError(f"Location with ID '{location_id}' not found")

    # Get children count
    children_count = (await db.execute(select(func.count()).where(Location.parent_id == location.id))).scalar() or 0

    # Get conference_ids
    assoc_result = await db.execute(
        select(ConferenceLocation.conference_id).where(ConferenceLocation.location_id == location.id)
    )
    conf_ids = [row[0] for row in assoc_result]

    return build_location_response(location, children_count, conf_ids)


@router.put("/{location_id}", response_model=LocationResponse, dependencies=[Depends(require_module(MODULE_CODE))])
async def update_location(
    location_id: UUID,
    location_data: LocationUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
    domain: str | None = Query(
        None,
        description="Caller's expected domain. Refuses to update a row whose actual domain doesn't match.",
    ),
) -> LocationResponse:
    """Update location details.

    Pass ``?domain=training`` from the trainings UI; the conference UI
    omits the param (or passes ``conference``). Mismatch returns 404 so
    the trainings UI can never silently mutate a conference row.
    """

    query = select(Location).where(
        Location.id == location_id,
        Location.tenant_id == current_user.tenant_id,
    )
    if domain is not None:
        query = query.where(Location.domain == domain)
    result = await db.execute(query)
    location = result.scalar_one_or_none()

    if not location:
        raise NotFoundError(f"Location with ID '{location_id}' not found")

    update_data = location_data.model_dump(exclude_unset=True)

    # Validate parent if changing
    if update_data.get("parent_id"):
        if update_data["parent_id"] == location_id:
            raise ValidationError("A location cannot be its own parent")
        parent = await db.execute(
            select(Location).where(
                Location.id == update_data["parent_id"],
                Location.tenant_id == current_user.tenant_id,
            )
        )
        if not parent.scalar_one_or_none():
            raise NotFoundError(f"Parent location with ID '{update_data['parent_id']}' not found")

    # Check code uniqueness if changing
    if "code" in update_data and update_data["code"] and update_data["code"] != location.code:
        existing = await db.execute(
            select(Location).where(
                Location.tenant_id == current_user.tenant_id,
                Location.code == update_data["code"],
            )
        )
        if existing.scalar_one_or_none():
            raise ValidationError(f"Location with code '{update_data['code']}' already exists")

    for field, value in update_data.items():
        setattr(location, field, value)

    # Audit log
    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="location.update",
        resource_type="location",
        resource_id=location.id,
        details={k: str(v) if isinstance(v, UUID) else v for k, v in update_data.items()},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(location)

    # Get children count
    children_count = (await db.execute(select(func.count()).where(Location.parent_id == location.id))).scalar() or 0

    # Get conference_ids
    assoc_result = await db.execute(
        select(ConferenceLocation.conference_id).where(ConferenceLocation.location_id == location.id)
    )
    conf_ids = [row[0] for row in assoc_result]

    return build_location_response(location, children_count, conf_ids)


@router.delete("/{location_id}", dependencies=[Depends(require_module(MODULE_CODE))])
async def delete_location(
    location_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
    conference_id: UUID | None = Query(
        None,
        description="Conference to unlink from. If location is only in this conference, it will be deleted entirely.",
    ),
    domain: str | None = Query(
        None,
        description="Caller's expected domain. Refuses to delete a row whose actual domain doesn't match.",
    ),
) -> dict:
    """
    Delete or unlink a location.

    Domain guard (added in stage 2 of the locations split):
      * Pass ``?domain=training`` from the trainings UI — the endpoint
        will 404 if the row is conference-domain. This is the fix for
        the orphaning bug: trainings can never delete a conference row
        and cascade-strip its conference links.
      * Pass ``?domain=conference`` (or omit, for backward-compat) from
        the conference UI.

    If ``conference_id`` is provided:
      * If location is linked to multiple conferences, only unlinks
        from the specified conference.
      * If location is only linked to this conference, deletes the
        location entirely.

    If ``conference_id`` is not provided:
      * Deletes the location entirely (legacy behaviour).
    """

    query = select(Location).where(
        Location.id == location_id,
        Location.tenant_id == current_user.tenant_id,
    )
    if domain is not None:
        query = query.where(Location.domain == domain)
    result = await db.execute(query)
    location = result.scalar_one_or_none()

    if not location:
        raise NotFoundError(f"Location with ID '{location_id}' not found")

    location_name = location.name

    # If conference_id is provided, check how many conferences this location is linked to
    if conference_id:
        # Verify the conference exists and belongs to the tenant
        conf_result = await db.execute(
            select(Conference).where(
                Conference.id == conference_id,
                Conference.tenant_id == current_user.tenant_id,
            )
        )
        conference = conf_result.scalar_one_or_none()
        if not conference:
            raise NotFoundError(f"Conference with ID '{conference_id}' not found")

        # Check if location is linked to this conference
        link_result = await db.execute(
            select(ConferenceLocation).where(
                ConferenceLocation.location_id == location_id,
                ConferenceLocation.conference_id == conference_id,
            )
        )
        link = link_result.scalar_one_or_none()
        if not link:
            raise ValidationError(f"Location is not linked to conference '{conference.name}'")

        # Count how many conferences this location is linked to
        count_result = await db.execute(select(func.count()).where(ConferenceLocation.location_id == location_id))
        link_count = count_result.scalar() or 0

        if link_count > 1:
            # Location is in multiple conferences - just unlink from this one
            await db.delete(link)

            # Audit log for unlink
            audit_log = AuditLog(
                tenant_id=current_user.tenant_id,
                user_id=current_user.user_id,
                action="location.unlink",
                resource_type="location",
                resource_id=location_id,
                details={
                    "name": location_name,
                    "type": location.location_type,
                    "conference_id": str(conference_id),
                    "conference_name": conference.name,
                },
                ip_address=get_client_ip(request),
                user_agent=request.headers.get("User-Agent"),
            )
            db.add(audit_log)

            await db.commit()
            return {"message": f"Location '{location_name}' unlinked from conference '{conference.name}'"}

    # Delete location entirely (either no conference_id, or this is the only conference)
    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="location.delete",
        resource_type="location",
        resource_id=location_id,
        details={"name": location_name, "type": location.location_type},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.delete(location)
    await db.commit()

    return {"message": f"Location '{location_name}' deleted successfully"}
