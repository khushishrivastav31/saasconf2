"""Shared helpers for program sub-modules."""

from uuid import UUID

from sqlalchemy import select

from app.core.exceptions import NotFoundError
from app.models.program import ProgramDay, ProgramSession, ProgramTimeSlot, ProgramTrack
from app.schemas.program import (
    ProgramDayResponse,
    ProgramSessionResponse,
    ProgramTimeSlotResponse,
    ProgramTrackResponse,
)

MODULE_CODE = "program"


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
        separately_bookable=session.separately_bookable,
        settings=session.settings or {},
        created_at=session.created_at,
        updated_at=session.updated_at,
    )
