"""Conference association endpoints (location, CFP linking)."""

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select

from app.core.conference_helpers import get_conference_for_tenant
from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    check_conference_admin_access,
    get_client_ip,
    require_module,
)
from app.core.exceptions import AuthorizationError, NotFoundError, ValidationError
from app.core.pagination import calculate_pages, paginate
from app.models.associations import ConferenceCFP, ConferenceLocation
from app.models.audit import AuditAction, AuditLog
from app.models.cfp import CallForPapers, Submission
from app.models.location import Location
from app.schemas.cfp import CFPListResponse
from app.schemas.conference import ConferenceAssociationRequest
from app.schemas.location import LocationListResponse

from ._shared import (
    MODULE_CODE,
    _build_cfp_response,
    _build_location_response_assoc,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Conference <-> Location association endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/{conference_id}/locations",
    response_model=LocationListResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def list_conference_locations(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> LocationListResponse:
    """List locations linked to a conference."""
    await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    query = (
        select(Location)
        .join(ConferenceLocation, ConferenceLocation.location_id == Location.id)
        .where(ConferenceLocation.conference_id == conference_id)
        .where(Location.tenant_id == current_user.tenant_id)
    )

    query = query.order_by(Location.created_at.desc())
    result = await paginate(db, query, page, page_size)
    locations = result.items

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

    items = [_build_location_response_assoc(loc, conf_ids_map.get(loc.id, [])) for loc in locations]
    pages = calculate_pages(result.total, page_size)

    return LocationListResponse(
        items=items,
        total=result.total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


@router.post("/{conference_id}/locations", status_code=201, dependencies=[Depends(require_module(MODULE_CODE))])
async def link_location_to_conference(
    conference_id: UUID,
    body: ConferenceAssociationRequest,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Link an existing location to a conference."""
    # Check admin access: tenant admin OR conference-specific admin
    if not current_user.is_super_admin and not current_user.is_tenant_admin:
        has_access = await check_conference_admin_access(db, current_user.user_id, conference_id)
        if not has_access:
            raise AuthorizationError("Admin access to this conference required")

    await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    loc_result = await db.execute(
        select(Location).where(Location.id == body.id).where(Location.tenant_id == current_user.tenant_id)
    )
    if not loc_result.scalar_one_or_none():
        raise NotFoundError("Location not found")

    existing = await db.execute(
        select(ConferenceLocation)
        .where(ConferenceLocation.conference_id == conference_id)
        .where(ConferenceLocation.location_id == body.id)
    )
    if existing.scalar_one_or_none():
        raise ValidationError("Location is already linked to this conference")

    db.add(ConferenceLocation(conference_id=conference_id, location_id=body.id))
    db.add(
        AuditLog(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action=AuditAction.CONFERENCE_LINK_LOCATION,
            resource_type="conference",
            resource_id=conference_id,
            details={"location_id": str(body.id)},
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent"),
        )
    )

    await db.commit()
    return {"message": "Location linked to conference"}


@router.delete("/{conference_id}/locations/{location_id}", dependencies=[Depends(require_module(MODULE_CODE))])
async def unlink_location_from_conference(
    conference_id: UUID,
    location_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Unlink a location from a conference. Blocked if it's the location's only conference."""
    # Check admin access: tenant admin OR conference-specific admin
    if not current_user.is_super_admin and not current_user.is_tenant_admin:
        has_access = await check_conference_admin_access(db, current_user.user_id, conference_id)
        if not has_access:
            raise AuthorizationError("Admin access to this conference required")

    await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    result = await db.execute(
        select(ConferenceLocation)
        .where(ConferenceLocation.conference_id == conference_id)
        .where(ConferenceLocation.location_id == location_id)
    )
    assoc = result.scalar_one_or_none()
    if not assoc:
        raise NotFoundError("Location is not linked to this conference")

    count = (
        await db.execute(
            select(func.count()).select_from(ConferenceLocation).where(ConferenceLocation.location_id == location_id)
        )
    ).scalar() or 0

    if count <= 1:
        raise ValidationError("Cannot unlink: this is the location's only conference")

    await db.delete(assoc)
    db.add(
        AuditLog(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action=AuditAction.CONFERENCE_UNLINK_LOCATION,
            resource_type="conference",
            resource_id=conference_id,
            details={"location_id": str(location_id)},
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent"),
        )
    )

    await db.commit()
    return {"message": "Location unlinked from conference"}


# ---------------------------------------------------------------------------
# Conference <-> CFP association endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/{conference_id}/cfps", response_model=CFPListResponse, dependencies=[Depends(require_module(MODULE_CODE))]
)
async def list_conference_cfps(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> CFPListResponse:
    """List CFPs linked to a conference."""
    await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    query = (
        select(CallForPapers)
        .join(ConferenceCFP, ConferenceCFP.cfp_id == CallForPapers.id)
        .where(ConferenceCFP.conference_id == conference_id)
        .where(CallForPapers.tenant_id == current_user.tenant_id)
    )

    query = query.order_by(CallForPapers.created_at.desc())
    result = await paginate(db, query, page, page_size)
    cfps = result.items

    cfp_ids = [c.id for c in cfps]
    conf_ids_map: dict[UUID, list[UUID]] = {cid: [] for cid in cfp_ids}
    if cfp_ids:
        assoc_result = await db.execute(
            select(ConferenceCFP.cfp_id, ConferenceCFP.conference_id).where(ConferenceCFP.cfp_id.in_(cfp_ids))
        )
        for row in assoc_result:
            conf_ids_map[row.cfp_id].append(row.conference_id)

    # Batch-query submission counts
    sub_counts: dict[UUID, int] = {cid: 0 for cid in cfp_ids}
    if cfp_ids:
        sub_result = await db.execute(
            select(Submission.cfp_id, func.count()).where(Submission.cfp_id.in_(cfp_ids)).group_by(Submission.cfp_id)
        )
        for row in sub_result:
            sub_counts[row[0]] = row[1]

    items = [_build_cfp_response(c, conf_ids_map.get(c.id, []), sub_counts.get(c.id, 0)) for c in cfps]
    pages = calculate_pages(result.total, page_size)

    return CFPListResponse(
        items=items,
        total=result.total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


@router.post("/{conference_id}/cfps", status_code=201, dependencies=[Depends(require_module(MODULE_CODE))])
async def link_cfp_to_conference(
    conference_id: UUID,
    body: ConferenceAssociationRequest,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Link an existing CFP to a conference."""
    # Check admin access: tenant admin OR conference-specific admin
    if not current_user.is_super_admin and not current_user.is_tenant_admin:
        has_access = await check_conference_admin_access(db, current_user.user_id, conference_id)
        if not has_access:
            raise AuthorizationError("Admin access to this conference required")

    await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    cfp_result = await db.execute(
        select(CallForPapers)
        .where(CallForPapers.id == body.id)
        .where(CallForPapers.tenant_id == current_user.tenant_id)
    )
    if not cfp_result.scalar_one_or_none():
        raise NotFoundError("Call for Papers not found")

    existing = await db.execute(
        select(ConferenceCFP).where(ConferenceCFP.conference_id == conference_id).where(ConferenceCFP.cfp_id == body.id)
    )
    if existing.scalar_one_or_none():
        raise ValidationError("CFP is already linked to this conference")

    db.add(ConferenceCFP(conference_id=conference_id, cfp_id=body.id))
    db.add(
        AuditLog(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action=AuditAction.CONFERENCE_LINK_CFP,
            resource_type="conference",
            resource_id=conference_id,
            details={"cfp_id": str(body.id)},
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent"),
        )
    )

    await db.commit()
    return {"message": "CFP linked to conference"}


@router.delete("/{conference_id}/cfps/{cfp_id}", dependencies=[Depends(require_module(MODULE_CODE))])
async def unlink_cfp_from_conference(
    conference_id: UUID,
    cfp_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Unlink a CFP from a conference. Blocked if it's the CFP's only conference."""
    # Check admin access: tenant admin OR conference-specific admin
    if not current_user.is_super_admin and not current_user.is_tenant_admin:
        has_access = await check_conference_admin_access(db, current_user.user_id, conference_id)
        if not has_access:
            raise AuthorizationError("Admin access to this conference required")

    await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    result = await db.execute(
        select(ConferenceCFP).where(ConferenceCFP.conference_id == conference_id).where(ConferenceCFP.cfp_id == cfp_id)
    )
    assoc = result.scalar_one_or_none()
    if not assoc:
        raise NotFoundError("CFP is not linked to this conference")

    count = (
        await db.execute(select(func.count()).select_from(ConferenceCFP).where(ConferenceCFP.cfp_id == cfp_id))
    ).scalar() or 0

    if count <= 1:
        raise ValidationError("Cannot unlink: this is the CFP's only conference")

    await db.delete(assoc)
    db.add(
        AuditLog(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action=AuditAction.CONFERENCE_UNLINK_CFP,
            resource_type="conference",
            resource_id=conference_id,
            details={"cfp_id": str(cfp_id)},
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent"),
        )
    )

    await db.commit()
    return {"message": "CFP unlinked from conference"}
