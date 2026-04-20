"""Program track endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select

from app.core.conference_helpers import check_conference_admin, get_conference_for_tenant
from app.core.dependencies import CurrentUserDep, DbSessionDep, get_client_ip, require_module
from app.core.exceptions import NotFoundError, ValidationError
from app.models.audit import AuditLog
from app.models.location import Location
from app.models.program import ProgramDay, ProgramTrack
from app.schemas.program import (
    ProgramTrackCreate,
    ProgramTrackListResponse,
    ProgramTrackReorder,
    ProgramTrackResponse,
    ProgramTrackUpdate,
)

from ._shared import MODULE_CODE, _build_track_response

router = APIRouter()


@router.get(
    "/tracks",
    response_model=ProgramTrackListResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def list_tracks(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    day_id: UUID | None = None,
    is_active: bool | None = None,
) -> ProgramTrackListResponse:
    """List all tracks for a conference, optionally filtered by day."""
    await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    query = select(ProgramTrack).where(
        ProgramTrack.conference_id == conference_id,
        ProgramTrack.tenant_id == current_user.tenant_id,
    )

    if day_id is not None:
        query = query.where(ProgramTrack.program_day_id == day_id)

    if is_active is not None:
        query = query.where(ProgramTrack.is_active == is_active)

    query = query.order_by(ProgramTrack.sort_order, ProgramTrack.name)
    result = await db.execute(query)
    tracks = result.scalars().all()

    # Get location names
    location_ids = [t.location_id for t in tracks if t.location_id]
    location_map: dict[UUID, str] = {}
    if location_ids:
        loc_result = await db.execute(select(Location.id, Location.name).where(Location.id.in_(location_ids)))
        location_map = {row.id: row.name for row in loc_result.all()}

    return ProgramTrackListResponse(
        items=[_build_track_response(t, location_map.get(t.location_id)) for t in tracks],
        total=len(tracks),
    )


@router.post(
    "/tracks",
    response_model=ProgramTrackResponse,
    status_code=201,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def create_track(
    conference_id: UUID,
    track_data: ProgramTrackCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> ProgramTrackResponse:
    """Create a new track."""
    await check_conference_admin(conference_id, current_user, db)
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    # Validate day exists
    day_result = await db.execute(
        select(ProgramDay).where(
            ProgramDay.id == track_data.program_day_id,
            ProgramDay.conference_id == conference_id,
        )
    )
    if not day_result.scalar_one_or_none():
        raise NotFoundError("Program day not found or not in this conference")

    # Validate location if provided
    location_name: str | None = None
    if track_data.location_id:
        loc_result = await db.execute(
            select(Location).where(
                Location.id == track_data.location_id,
                Location.tenant_id == current_user.tenant_id,
            )
        )
        loc = loc_result.scalar_one_or_none()
        if not loc:
            raise NotFoundError("Location not found")
        location_name = loc.name

    track = ProgramTrack(
        tenant_id=current_user.tenant_id,
        conference_id=conference.id,
        program_day_id=track_data.program_day_id,
        name=track_data.name,
        color=track_data.color,
        location_id=track_data.location_id,
        sort_order=track_data.sort_order,
        is_active=track_data.is_active,
    )
    db.add(track)
    await db.flush()  # Flush to get the ID

    db.add(
        AuditLog(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action="program_track.create",
            resource_type="program_track",
            resource_id=str(track.id),
            details={"name": track_data.name},
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
    )

    await db.commit()
    await db.refresh(track)
    return _build_track_response(track, location_name)


@router.put(
    "/tracks/reorder",
    response_model=ProgramTrackListResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def reorder_tracks(
    conference_id: UUID,
    reorder_data: ProgramTrackReorder,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> ProgramTrackListResponse:
    """Reorder tracks."""
    await check_conference_admin(conference_id, current_user, db)
    await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    # Fetch all tracks
    result = await db.execute(
        select(ProgramTrack).where(
            ProgramTrack.id.in_(reorder_data.track_ids),
            ProgramTrack.conference_id == conference_id,
            ProgramTrack.tenant_id == current_user.tenant_id,
        )
    )
    tracks = {t.id: t for t in result.scalars().all()}

    if len(tracks) != len(reorder_data.track_ids):
        raise ValidationError("One or more track IDs not found")

    # Update sort orders
    for i, track_id in enumerate(reorder_data.track_ids):
        tracks[track_id].sort_order = i

    db.add(
        AuditLog(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action="program_track.reorder",
            resource_type="program_track",
            resource_id=str(conference_id),
            details={"order": [str(tid) for tid in reorder_data.track_ids]},
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
    )

    await db.commit()

    # Fetch updated list
    return await list_tracks(conference_id, current_user, db)


@router.put(
    "/tracks/{track_id}",
    response_model=ProgramTrackResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def update_track(
    conference_id: UUID,
    track_id: UUID,
    track_data: ProgramTrackUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> ProgramTrackResponse:
    """Update a track."""
    await check_conference_admin(conference_id, current_user, db)
    await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    result = await db.execute(
        select(ProgramTrack).where(
            ProgramTrack.id == track_id,
            ProgramTrack.conference_id == conference_id,
            ProgramTrack.tenant_id == current_user.tenant_id,
        )
    )
    track = result.scalar_one_or_none()
    if not track:
        raise NotFoundError(f"Track with ID '{track_id}' not found")

    location_name: str | None = None
    if track_data.name is not None:
        track.name = track_data.name
    if track_data.color is not None:
        track.color = track_data.color
    if track_data.location_id is not None:
        track.location_id = track_data.location_id
        if track_data.location_id:
            loc_result = await db.execute(select(Location).where(Location.id == track_data.location_id))
            loc = loc_result.scalar_one_or_none()
            location_name = loc.name if loc else None
    if track_data.sort_order is not None:
        track.sort_order = track_data.sort_order
    if track_data.is_active is not None:
        track.is_active = track_data.is_active

    db.add(
        AuditLog(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action="program_track.update",
            resource_type="program_track",
            resource_id=str(track_id),
            details=track_data.model_dump(mode="json", exclude_unset=True),
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
    )

    await db.commit()
    await db.refresh(track)

    # Get location name if not already fetched
    if location_name is None and track.location_id:
        loc_result = await db.execute(select(Location).where(Location.id == track.location_id))
        loc = loc_result.scalar_one_or_none()
        location_name = loc.name if loc else None

    return _build_track_response(track, location_name)


@router.delete(
    "/tracks/{track_id}",
    status_code=204,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def delete_track(
    conference_id: UUID,
    track_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> None:
    """Delete a track. Sessions using this track will have start_track_id set to NULL."""
    await check_conference_admin(conference_id, current_user, db)
    await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    result = await db.execute(
        select(ProgramTrack).where(
            ProgramTrack.id == track_id,
            ProgramTrack.conference_id == conference_id,
            ProgramTrack.tenant_id == current_user.tenant_id,
        )
    )
    track = result.scalar_one_or_none()
    if not track:
        raise NotFoundError(f"Track with ID '{track_id}' not found")

    db.add(
        AuditLog(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action="program_track.delete",
            resource_type="program_track",
            resource_id=str(track_id),
            details={"name": track.name},
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
    )

    await db.delete(track)
    await db.commit()
