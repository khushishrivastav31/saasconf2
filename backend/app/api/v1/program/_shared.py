"""Shared helpers for program sub-modules."""

from uuid import UUID

from sqlalchemy import select

from app.core.dependencies import check_conference_admin_access
from app.core.exceptions import AuthorizationError, NotFoundError
from app.models.conference import Conference
from app.models.program import ProgramDay, ProgramSession, ProgramTimeSlot, ProgramTrack
from app.schemas.program import (
    ProgramDayResponse,
    ProgramSessionResponse,
    ProgramTimeSlotResponse,
    ProgramTrackResponse,
)

MODULE_CODE = "program"


async def _get_conference_for_tenant(db, conference_id: UUID, tenant_id: UUID) -> Conference:
    """Fetch conference and raise 404 if not found or not owned by tenant."""
    result = await db.execute(
        select(Conference).where(
            Conference.id == conference_id,
            Conference.tenant_id == tenant_id,
        )
    )
    conference = result.scalar_one_or_none()
    if not conference:
        raise NotFoundError(f"Conference with ID '{conference_id}' not found")
    return conference


async def _check_admin_access(db, current_user, conference_id: UUID) -> None:
    """Check if user has admin access to the conference."""
    if current_user.is_super_admin or current_user.is_tenant_admin:
        return
    has_access = await check_conference_admin_access(db, current_user.user_id, conference_id)
    if not has_access:
        raise AuthorizationError("Admin access to this conference required")


def _build_day_response(day: ProgramDay) -> ProgramDayResponse:
    return ProgramDayResponse(
        id=day.id,
        tenant_id=day.tenant_id,
        conference_id=day.conference_id,
        date=day.date,
        name=day.name,
        sort_order=day.sort_order,
        created_at=day.created_at,
        updated_at=day.updated_at,
    )


def _build_slot_response(slot: ProgramTimeSlot) -> ProgramTimeSlotResponse:
    return ProgramTimeSlotResponse(
        id=slot.id,
        tenant_id=slot.tenant_id,
        program_day_id=slot.program_day_id,
        start_time=slot.start_time,
        end_time=slot.end_time,
        sort_order=slot.sort_order,
        is_session_free=slot.is_session_free,
        created_at=slot.created_at,
        updated_at=slot.updated_at,
    )


def _build_track_response(track: ProgramTrack, location_name: str | None = None) -> ProgramTrackResponse:
    return ProgramTrackResponse(
        id=track.id,
        tenant_id=track.tenant_id,
        conference_id=track.conference_id,
        program_day_id=track.program_day_id,
        name=track.name,
        color=track.color,
        location_id=track.location_id,
        location_name=location_name,
        sort_order=track.sort_order,
        is_active=track.is_active,
        created_at=track.created_at,
        updated_at=track.updated_at,
    )


def _build_session_response(
    session: ProgramSession,
    session_type_name: str | None = None,
    paper_title: str | None = None,
    speaker_name: str | None = None,
) -> ProgramSessionResponse:
    return ProgramSessionResponse(
        id=session.id,
        tenant_id=session.tenant_id,
        conference_id=session.conference_id,
        start_slot_id=session.start_slot_id,
        start_track_id=session.start_track_id,
        slot_span=session.slot_span,
        track_span=session.track_span,
        title=session.title,
        description=session.description,
        session_type_id=session.session_type_id,
        session_type_name=session_type_name,
        is_general_event=session.is_general_event,
        color=session.color,
        paper_id=session.paper_id,
        paper_title=paper_title,
        speaker_name=speaker_name,
        notes=session.notes,
        allow_in_session_free=session.allow_in_session_free,
        settings=session.settings or {},
        created_at=session.created_at,
        updated_at=session.updated_at,
    )
