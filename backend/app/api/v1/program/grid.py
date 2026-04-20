"""Program grid endpoints (combined view)."""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.core.conference_helpers import get_conference_for_tenant
from app.core.dependencies import CurrentUserDep, DbSessionDep, require_module
from app.core.exceptions import NotFoundError
from app.models.cfp import CFPApplicant, CFPPaper
from app.models.location import Location
from app.models.program import ProgramDay, ProgramSession, ProgramTrack
from app.models.settings import SessionType
from app.schemas.program import (
    ProgramFullGridResponse,
    ProgramGridResponse,
)

from ._shared import (
    MODULE_CODE,
    _build_day_response,
    _build_session_response,
    _build_slot_response,
    _build_track_response,
)

router = APIRouter()


@router.get(
    "/grid",
    response_model=ProgramFullGridResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def get_full_grid(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> ProgramFullGridResponse:
    """Get complete program grid for all days."""
    await get_conference_for_tenant(db, conference_id, current_user.require_tenant_id())

    # Get all days
    days_result = await db.execute(
        select(ProgramDay)
        .where(
            ProgramDay.conference_id == conference_id,
            ProgramDay.tenant_id == current_user.require_tenant_id(),
        )
        .order_by(ProgramDay.sort_order, ProgramDay.date)
    )
    days = days_result.scalars().all()

    # Get all tracks (grouped by day)
    tracks_result = await db.execute(
        select(ProgramTrack)
        .where(
            ProgramTrack.conference_id == conference_id,
            ProgramTrack.tenant_id == current_user.require_tenant_id(),
        )
        .order_by(ProgramTrack.sort_order)
    )
    all_tracks = tracks_result.scalars().all()

    # Get location names for tracks
    location_ids = [t.location_id for t in all_tracks if t.location_id]
    location_map: dict[UUID, str] = {}
    if location_ids:
        loc_result = await db.execute(select(Location.id, Location.name).where(Location.id.in_(location_ids)))
        location_map = {row.id: row.name for row in loc_result.all()}

    # Group tracks by day_id
    tracks_by_day: dict[UUID, list[ProgramTrack]] = {}
    for t in all_tracks:
        if t.program_day_id:
            tracks_by_day.setdefault(t.program_day_id, []).append(t)

    # Get all sessions
    sessions_result = await db.execute(
        select(ProgramSession).where(
            ProgramSession.conference_id == conference_id,
            ProgramSession.tenant_id == current_user.require_tenant_id(),
        )
    )
    all_sessions = sessions_result.scalars().all()

    # Get session type names
    type_ids = [s.session_type_id for s in all_sessions if s.session_type_id]
    type_map: dict[UUID, str] = {}
    if type_ids:
        type_result = await db.execute(select(SessionType.id, SessionType.name).where(SessionType.id.in_(type_ids)))
        type_map = {row.id: row.name for row in type_result.all()}

    # Get paper titles and speaker names
    paper_ids = [s.paper_id for s in all_sessions if s.paper_id]
    paper_map: dict[UUID, str] = {}
    speaker_map: dict[UUID, str] = {}
    if paper_ids:
        paper_result = await db.execute(
            select(CFPPaper.id, CFPPaper.title, CFPApplicant.first_name, CFPApplicant.last_name)
            .join(CFPApplicant, CFPPaper.main_speaker_id == CFPApplicant.id)
            .where(CFPPaper.id.in_(paper_ids))
        )
        for row in paper_result.all():
            paper_map[row.id] = row.title
            speaker_map[row.id] = f"{row.first_name} {row.last_name}"

    # Build grid for each day
    grids = []
    for day in days:
        # Get slots for this day (already loaded via relationship)
        slot_ids = {slot.id for slot in day.time_slots}

        # Filter sessions for this day
        day_sessions = [s for s in all_sessions if s.start_slot_id in slot_ids]

        # Get tracks for this day
        day_tracks = tracks_by_day.get(day.id, [])

        grids.append(
            ProgramGridResponse(
                day=_build_day_response(day),
                slots=[_build_slot_response(s) for s in day.time_slots],
                tracks=[_build_track_response(t, location_map.get(t.location_id)) for t in day_tracks],
                sessions=[
                    _build_session_response(
                        s,
                        type_map.get(s.session_type_id) if s.session_type_id else None,
                        paper_map.get(s.paper_id) if s.paper_id else None,
                        speaker_map.get(s.paper_id) if s.paper_id else None,
                    )
                    for s in day_sessions
                ],
            )
        )

    return ProgramFullGridResponse(days=grids, total_days=len(grids))


@router.get(
    "/grid/{day_id}",
    response_model=ProgramGridResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def get_day_grid(
    conference_id: UUID,
    day_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> ProgramGridResponse:
    """Get program grid for a specific day."""
    await get_conference_for_tenant(db, conference_id, current_user.require_tenant_id())

    # Get day with slots
    day_result = await db.execute(
        select(ProgramDay).where(
            ProgramDay.id == day_id,
            ProgramDay.conference_id == conference_id,
            ProgramDay.tenant_id == current_user.require_tenant_id(),
        )
    )
    day = day_result.scalar_one_or_none()
    if not day:
        raise NotFoundError(f"Program day with ID '{day_id}' not found")

    # Get tracks for this day
    tracks_result = await db.execute(
        select(ProgramTrack)
        .where(
            ProgramTrack.conference_id == conference_id,
            ProgramTrack.tenant_id == current_user.require_tenant_id(),
            ProgramTrack.program_day_id == day_id,
        )
        .order_by(ProgramTrack.sort_order)
    )
    tracks = tracks_result.scalars().all()

    # Get location names for tracks
    location_ids = [t.location_id for t in tracks if t.location_id]
    location_map: dict[UUID, str] = {}
    if location_ids:
        loc_result = await db.execute(select(Location.id, Location.name).where(Location.id.in_(location_ids)))
        location_map = {row.id: row.name for row in loc_result.all()}

    # Get sessions for this day
    slot_ids = [slot.id for slot in day.time_slots]
    sessions_result = await db.execute(
        select(ProgramSession).where(
            ProgramSession.start_slot_id.in_(slot_ids),
            ProgramSession.tenant_id == current_user.require_tenant_id(),
        )
    )
    sessions = sessions_result.scalars().all()

    # Get session type names
    type_ids = [s.session_type_id for s in sessions if s.session_type_id]
    type_map: dict[UUID, str] = {}
    if type_ids:
        type_result = await db.execute(select(SessionType.id, SessionType.name).where(SessionType.id.in_(type_ids)))
        type_map = {row.id: row.name for row in type_result.all()}

    # Get paper titles and speaker names
    paper_ids = [s.paper_id for s in sessions if s.paper_id]
    paper_map: dict[UUID, str] = {}
    speaker_map: dict[UUID, str] = {}
    if paper_ids:
        paper_result = await db.execute(
            select(CFPPaper.id, CFPPaper.title, CFPApplicant.first_name, CFPApplicant.last_name)
            .join(CFPApplicant, CFPPaper.main_speaker_id == CFPApplicant.id)
            .where(CFPPaper.id.in_(paper_ids))
        )
        for row in paper_result.all():
            paper_map[row.id] = row.title
            speaker_map[row.id] = f"{row.first_name} {row.last_name}"

    return ProgramGridResponse(
        day=_build_day_response(day),
        slots=[_build_slot_response(s) for s in day.time_slots],
        tracks=[_build_track_response(t, location_map.get(t.location_id)) for t in tracks],
        sessions=[
            _build_session_response(
                s,
                type_map.get(s.session_type_id) if s.session_type_id else None,
                paper_map.get(s.paper_id) if s.paper_id else None,
                speaker_map.get(s.paper_id) if s.paper_id else None,
            )
            for s in sessions
        ],
    )
