"""Program session endpoints."""

from collections import defaultdict
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.dependencies import CurrentUserDep, DbSessionDep, get_client_ip, require_module
from app.core.exceptions import NotFoundError
from app.models.audit import AuditLog
from app.models.cfp import CFPApplicant, CFPPaper, CFPPaperCospeaker
from app.models.form_schema import ConferencePaperFormSchema
from app.models.program import ProgramDay, ProgramSession, ProgramTimeSlot, ProgramTrack
from app.models.settings import SessionType
from app.schemas.program import (
    CustomFieldMeta,
    EnrichedSessionResponse,
    EnrichedSessionsResponse,
    ProgramSessionCreate,
    ProgramSessionListResponse,
    ProgramSessionMove,
    ProgramSessionResponse,
    ProgramSessionUpdate,
)

from ._shared import MODULE_CODE, _build_session_response, _check_admin_access, _get_conference_for_tenant

router = APIRouter()


@router.get(
    "/sessions",
    response_model=ProgramSessionListResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def list_sessions(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    day_id: UUID | None = None,
    is_general_event: bool | None = None,
) -> ProgramSessionListResponse:
    """List all sessions for a conference, optionally filtered by day."""
    await _get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    query = select(ProgramSession).where(
        ProgramSession.conference_id == conference_id,
        ProgramSession.tenant_id == current_user.tenant_id,
    )

    if day_id is not None:
        # Filter by day via slot
        slot_ids_query = select(ProgramTimeSlot.id).where(ProgramTimeSlot.program_day_id == day_id)
        query = query.where(ProgramSession.start_slot_id.in_(slot_ids_query))

    if is_general_event is not None:
        query = query.where(ProgramSession.is_general_event == is_general_event)

    result = await db.execute(query)
    sessions = result.scalars().all()

    # Get session type names
    type_ids = [s.session_type_id for s in sessions if s.session_type_id]
    type_map: dict[UUID, str] = {}
    if type_ids:
        type_result = await db.execute(
            select(SessionType.id, SessionType.name).where(SessionType.id.in_(type_ids))
        )
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

    return ProgramSessionListResponse(
        items=[
            _build_session_response(
                s,
                type_map.get(s.session_type_id) if s.session_type_id else None,
                paper_map.get(s.paper_id) if s.paper_id else None,
                speaker_map.get(s.paper_id) if s.paper_id else None,
            )
            for s in sessions
        ],
        total=len(sessions),
    )


@router.get(
    "/sessions/enriched",
    response_model=EnrichedSessionsResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def list_sessions_enriched(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> EnrichedSessionsResponse:
    """List sessions with full paper, speaker, and custom field data."""
    tenant_id = current_user.tenant_id
    await _get_conference_for_tenant(db, conference_id, tenant_id)

    # Fetch all sessions
    result = await db.execute(
        select(ProgramSession).where(
            ProgramSession.conference_id == conference_id,
            ProgramSession.tenant_id == tenant_id,
        )
    )
    sessions = result.scalars().all()

    # Fetch days
    days_result = await db.execute(
        select(ProgramDay).where(
            ProgramDay.conference_id == conference_id,
            ProgramDay.tenant_id == tenant_id,
        ).order_by(ProgramDay.sort_order)
    )
    days = {d.id: d for d in days_result.scalars().all()}

    # Fetch time slots
    day_ids = list(days.keys())
    slots_map: dict[UUID, ProgramTimeSlot] = {}
    slot_day_map: dict[UUID, UUID] = {}
    if day_ids:
        slots_result = await db.execute(
            select(ProgramTimeSlot).where(
                ProgramTimeSlot.program_day_id.in_(day_ids)
            ).order_by(ProgramTimeSlot.sort_order)
        )
        for s in slots_result.scalars().all():
            slots_map[s.id] = s
            slot_day_map[s.id] = s.program_day_id

    # Group slots by day and sort for end-time calculation
    day_sorted_slots: dict[UUID, list[ProgramTimeSlot]] = defaultdict(list)
    for slot in slots_map.values():
        day_sorted_slots[slot.program_day_id].append(slot)
    for slot_list in day_sorted_slots.values():
        slot_list.sort(key=lambda s: s.start_time)

    # Fetch tracks
    tracks_result = await db.execute(
        select(ProgramTrack).where(
            ProgramTrack.conference_id == conference_id,
            ProgramTrack.tenant_id == tenant_id,
        )
    )
    tracks = {t.id: t for t in tracks_result.scalars().all()}

    # Fetch session types
    type_ids = [s.session_type_id for s in sessions if s.session_type_id]
    type_map: dict[UUID, str] = {}
    if type_ids:
        type_result = await db.execute(
            select(SessionType.id, SessionType.name).where(SessionType.id.in_(type_ids))
        )
        type_map = {row.id: row.name for row in type_result.all()}

    # Fetch papers with full details
    paper_ids = [s.paper_id for s in sessions if s.paper_id]
    paper_map: dict[UUID, CFPPaper] = {}
    speaker_map: dict[UUID, CFPApplicant] = {}
    cospeaker_map: dict[UUID, list[str]] = {}

    if paper_ids:
        paper_result = await db.execute(
            select(CFPPaper).where(CFPPaper.id.in_(paper_ids))
        )
        for paper in paper_result.scalars().all():
            paper_map[paper.id] = paper

        # Fetch main speakers
        speaker_ids = [p.main_speaker_id for p in paper_map.values()]
        if speaker_ids:
            speaker_result = await db.execute(
                select(CFPApplicant).where(CFPApplicant.id.in_(speaker_ids))
            )
            for a in speaker_result.scalars().all():
                speaker_map[a.id] = a

        # Fetch co-speakers
        cs_result = await db.execute(
            select(CFPPaperCospeaker).where(
                CFPPaperCospeaker.paper_id.in_(paper_ids)
            )
        )
        cs_applicant_ids: set[UUID] = set()
        cs_by_paper: dict[UUID, list[UUID]] = defaultdict(list)
        for cs in cs_result.scalars().all():
            cs_by_paper[cs.paper_id].append(cs.applicant_id)
            cs_applicant_ids.add(cs.applicant_id)

        cs_names: dict[UUID, str] = {}
        if cs_applicant_ids:
            cs_name_result = await db.execute(
                select(CFPApplicant.id, CFPApplicant.first_name, CFPApplicant.last_name).where(
                    CFPApplicant.id.in_(list(cs_applicant_ids))
                )
            )
            cs_names = {
                row.id: f"{row.first_name} {row.last_name}".strip()
                for row in cs_name_result.all()
            }

        for pid, cs_ids in cs_by_paper.items():
            cospeaker_map[pid] = [
                cs_names[cid] for cid in cs_ids if cid in cs_names
            ]

    # Fetch form schema custom fields
    custom_fields: list[CustomFieldMeta] = []
    schema_result = await db.execute(
        select(ConferencePaperFormSchema)
        .options(selectinload(ConferencePaperFormSchema.fields))
        .where(
            ConferencePaperFormSchema.conference_id == conference_id,
            ConferencePaperFormSchema.tenant_id == tenant_id,
        )
    )
    form_schema = schema_result.scalar_one_or_none()
    if form_schema:
        for field in form_schema.fields:
            if field.is_visible:
                custom_fields.append(CustomFieldMeta(
                    field_key=field.field_key,
                    label=field.label,
                    field_type=field.field_type,
                ))

    # Build enriched response items
    items: list[EnrichedSessionResponse] = []
    for session in sessions:
        slot = slots_map.get(session.start_slot_id)
        day_id = slot_day_map.get(session.start_slot_id) if slot else None
        day = days.get(day_id) if day_id else None
        track = tracks.get(session.start_track_id) if session.start_track_id else None
        paper = paper_map.get(session.paper_id) if session.paper_id else None
        speaker = speaker_map.get(paper.main_speaker_id) if paper else None

        # Calculate end time from slot span
        end_time = None
        if slot and day_id:
            sorted_slots = day_sorted_slots.get(day_id, [])
            start_idx = next((i for i, s in enumerate(sorted_slots) if s.id == slot.id), None)
            if start_idx is not None:
                end_idx = min(start_idx + session.slot_span - 1, len(sorted_slots) - 1)
                end_time = sorted_slots[end_idx].end_time

        cospeakers_str = ", ".join(cospeaker_map.get(session.paper_id, [])) if session.paper_id else None

        items.append(EnrichedSessionResponse(
            id=session.id,
            title=session.title,
            description=session.description,
            session_type_id=session.session_type_id,
            session_type_name=type_map.get(session.session_type_id) if session.session_type_id else None,
            is_general_event=session.is_general_event,
            color=session.color,
            notes=session.notes,
            paper_id=session.paper_id,
            paper_title=paper.title if paper else None,
            paper_abstract_short=paper.abstract_short if paper else None,
            paper_level=paper.level if paper else None,
            paper_learning_objectives=paper.learning_objectives if paper else None,
            paper_importance=paper.importance if paper else None,
            paper_status=paper.status if paper else None,
            paper_custom_field_answers=paper.custom_field_answers if paper else None,
            speaker_name=f"{speaker.first_name} {speaker.last_name}".strip() if speaker else None,
            speaker_email=speaker.email if speaker else None,
            speaker_company=speaker.company if speaker else None,
            cospeakers=cospeakers_str or None,
            day_id=day_id,
            day_name=day.name if day else None,
            day_date=day.date if day else None,
            start_time=slot.start_time if slot else None,
            end_time=end_time,
            track_name=track.name if track else None,
        ))

    # Sort by day date, then start time
    items.sort(key=lambda item: (
        item.day_date or "",
        item.start_time or "",
    ))

    return EnrichedSessionsResponse(
        items=items,
        total=len(items),
        custom_fields=custom_fields,
    )


@router.post(
    "/sessions",
    response_model=ProgramSessionResponse,
    status_code=201,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def create_session(
    conference_id: UUID,
    session_data: ProgramSessionCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> ProgramSessionResponse:
    """Create a new session."""
    await _check_admin_access(db, current_user, conference_id)
    conference = await _get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    # Validate slot exists and belongs to this conference
    slot_result = await db.execute(
        select(ProgramTimeSlot)
        .join(ProgramDay, ProgramTimeSlot.program_day_id == ProgramDay.id)
        .where(
            ProgramTimeSlot.id == session_data.start_slot_id,
            ProgramDay.conference_id == conference_id,
        )
    )
    if not slot_result.scalar_one_or_none():
        raise NotFoundError("Time slot not found or not in this conference")

    # Validate track if provided
    if session_data.start_track_id:
        track_result = await db.execute(
            select(ProgramTrack).where(
                ProgramTrack.id == session_data.start_track_id,
                ProgramTrack.conference_id == conference_id,
            )
        )
        if not track_result.scalar_one_or_none():
            raise NotFoundError("Track not found or not in this conference")

    # Validate session type if provided
    session_type_name: str | None = None
    if session_data.session_type_id:
        type_result = await db.execute(
            select(SessionType).where(
                SessionType.id == session_data.session_type_id,
                SessionType.conference_id == conference_id,
            )
        )
        session_type = type_result.scalar_one_or_none()
        if not session_type:
            raise NotFoundError("Session type not found or not in this conference")
        session_type_name = session_type.name

    session = ProgramSession(
        tenant_id=current_user.tenant_id,
        conference_id=conference.id,
        start_slot_id=session_data.start_slot_id,
        start_track_id=session_data.start_track_id,
        slot_span=session_data.slot_span,
        track_span=session_data.track_span,
        title=session_data.title,
        description=session_data.description,
        session_type_id=session_data.session_type_id,
        is_general_event=session_data.is_general_event,
        color=session_data.color,
        paper_id=session_data.paper_id,
        notes=session_data.notes,
        allow_in_session_free=session_data.allow_in_session_free,
        settings=session_data.settings or {},
    )
    db.add(session)
    await db.flush()  # Flush to get the ID

    db.add(
        AuditLog(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action="program_session.create",
            resource_type="program_session",
            resource_id=str(session.id),
            details={"title": session_data.title},
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
    )

    await db.commit()
    await db.refresh(session)

    # Resolve paper title and speaker name
    paper_title: str | None = None
    speaker_name: str | None = None
    if session.paper_id:
        paper_result = await db.execute(
            select(CFPPaper.title, CFPApplicant.first_name, CFPApplicant.last_name)
            .join(CFPApplicant, CFPPaper.main_speaker_id == CFPApplicant.id)
            .where(CFPPaper.id == session.paper_id)
        )
        row = paper_result.one_or_none()
        if row:
            paper_title = row.title
            speaker_name = f"{row.first_name} {row.last_name}"

    return _build_session_response(session, session_type_name, paper_title, speaker_name)


@router.put(
    "/sessions/{session_id}",
    response_model=ProgramSessionResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def update_session(
    conference_id: UUID,
    session_id: UUID,
    session_data: ProgramSessionUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> ProgramSessionResponse:
    """Update a session."""
    await _check_admin_access(db, current_user, conference_id)
    await _get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    result = await db.execute(
        select(ProgramSession).where(
            ProgramSession.id == session_id,
            ProgramSession.conference_id == conference_id,
            ProgramSession.tenant_id == current_user.tenant_id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise NotFoundError(f"Session with ID '{session_id}' not found")

    # Update fields
    if session_data.start_slot_id is not None:
        # Validate slot
        slot_result = await db.execute(
            select(ProgramTimeSlot)
            .join(ProgramDay, ProgramTimeSlot.program_day_id == ProgramDay.id)
            .where(
                ProgramTimeSlot.id == session_data.start_slot_id,
                ProgramDay.conference_id == conference_id,
            )
        )
        if not slot_result.scalar_one_or_none():
            raise NotFoundError("Time slot not found or not in this conference")
        session.start_slot_id = session_data.start_slot_id

    if session_data.start_track_id is not None:
        if session_data.start_track_id:
            track_result = await db.execute(
                select(ProgramTrack).where(
                    ProgramTrack.id == session_data.start_track_id,
                    ProgramTrack.conference_id == conference_id,
                )
            )
            if not track_result.scalar_one_or_none():
                raise NotFoundError("Track not found or not in this conference")
        session.start_track_id = session_data.start_track_id

    if session_data.slot_span is not None:
        session.slot_span = session_data.slot_span
    if session_data.track_span is not None:
        session.track_span = session_data.track_span
    if session_data.title is not None:
        session.title = session_data.title
    if session_data.description is not None:
        session.description = session_data.description
    if session_data.session_type_id is not None:
        session.session_type_id = session_data.session_type_id
    if session_data.is_general_event is not None:
        session.is_general_event = session_data.is_general_event
    if session_data.color is not None:
        session.color = session_data.color
    if "paper_id" in session_data.model_fields_set:
        session.paper_id = session_data.paper_id
        if session_data.paper_id is not None:
            # Assign: auto-populate title and session type from the paper
            paper_result = await db.execute(
                select(CFPPaper).where(CFPPaper.id == session_data.paper_id)
            )
            paper = paper_result.scalar_one_or_none()
            if paper:
                session.title = paper.title
                if paper.session_type_id:
                    session.session_type_id = paper.session_type_id
        else:
            # Unassign: revert title to session type name
            if session.session_type_id:
                type_result = await db.execute(
                    select(SessionType.name).where(SessionType.id == session.session_type_id)
                )
                type_name = type_result.scalar_one_or_none()
                session.title = type_name or "Session"
            else:
                session.title = "Session"
    if session_data.notes is not None:
        session.notes = session_data.notes
    if session_data.allow_in_session_free is not None:
        session.allow_in_session_free = session_data.allow_in_session_free
    if session_data.settings is not None:
        session.settings = session_data.settings

    db.add(
        AuditLog(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action="program_session.update",
            resource_type="program_session",
            resource_id=str(session_id),
            details=session_data.model_dump(mode="json", exclude_unset=True),
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
    )

    await db.commit()
    await db.refresh(session)

    # Get session type name
    session_type_name: str | None = None
    if session.session_type_id:
        type_result = await db.execute(
            select(SessionType.name).where(SessionType.id == session.session_type_id)
        )
        session_type_name = type_result.scalar_one_or_none()

    # Resolve paper title and speaker name
    paper_title: str | None = None
    speaker_name: str | None = None
    if session.paper_id:
        paper_result = await db.execute(
            select(CFPPaper.title, CFPApplicant.first_name, CFPApplicant.last_name)
            .join(CFPApplicant, CFPPaper.main_speaker_id == CFPApplicant.id)
            .where(CFPPaper.id == session.paper_id)
        )
        row = paper_result.one_or_none()
        if row:
            paper_title = row.title
            speaker_name = f"{row.first_name} {row.last_name}"

    return _build_session_response(session, session_type_name, paper_title, speaker_name)


@router.put(
    "/sessions/{session_id}/move",
    response_model=ProgramSessionResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def move_session(
    conference_id: UUID,
    session_id: UUID,
    move_data: ProgramSessionMove,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> ProgramSessionResponse:
    """Move a session to a different slot/track."""
    await _check_admin_access(db, current_user, conference_id)
    await _get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    result = await db.execute(
        select(ProgramSession).where(
            ProgramSession.id == session_id,
            ProgramSession.conference_id == conference_id,
            ProgramSession.tenant_id == current_user.tenant_id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise NotFoundError(f"Session with ID '{session_id}' not found")

    # Validate new slot
    slot_result = await db.execute(
        select(ProgramTimeSlot)
        .join(ProgramDay, ProgramTimeSlot.program_day_id == ProgramDay.id)
        .where(
            ProgramTimeSlot.id == move_data.start_slot_id,
            ProgramDay.conference_id == conference_id,
        )
    )
    if not slot_result.scalar_one_or_none():
        raise NotFoundError("Time slot not found or not in this conference")

    # Validate new track if provided
    if move_data.start_track_id:
        track_result = await db.execute(
            select(ProgramTrack).where(
                ProgramTrack.id == move_data.start_track_id,
                ProgramTrack.conference_id == conference_id,
            )
        )
        if not track_result.scalar_one_or_none():
            raise NotFoundError("Track not found or not in this conference")

    session.start_slot_id = move_data.start_slot_id
    session.start_track_id = move_data.start_track_id

    db.add(
        AuditLog(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action="program_session.move",
            resource_type="program_session",
            resource_id=str(session_id),
            details={"new_slot_id": str(move_data.start_slot_id), "new_track_id": str(move_data.start_track_id) if move_data.start_track_id else None},
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
    )

    await db.commit()
    await db.refresh(session)

    # Get session type name
    session_type_name: str | None = None
    if session.session_type_id:
        type_result = await db.execute(
            select(SessionType.name).where(SessionType.id == session.session_type_id)
        )
        session_type_name = type_result.scalar_one_or_none()

    # Resolve paper title and speaker name
    paper_title: str | None = None
    speaker_name: str | None = None
    if session.paper_id:
        paper_result = await db.execute(
            select(CFPPaper.title, CFPApplicant.first_name, CFPApplicant.last_name)
            .join(CFPApplicant, CFPPaper.main_speaker_id == CFPApplicant.id)
            .where(CFPPaper.id == session.paper_id)
        )
        row = paper_result.one_or_none()
        if row:
            paper_title = row.title
            speaker_name = f"{row.first_name} {row.last_name}"

    return _build_session_response(session, session_type_name, paper_title, speaker_name)


@router.delete(
    "/sessions/{session_id}",
    status_code=204,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def delete_session(
    conference_id: UUID,
    session_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> None:
    """Delete a session."""
    await _check_admin_access(db, current_user, conference_id)
    await _get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    result = await db.execute(
        select(ProgramSession).where(
            ProgramSession.id == session_id,
            ProgramSession.conference_id == conference_id,
            ProgramSession.tenant_id == current_user.tenant_id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise NotFoundError(f"Session with ID '{session_id}' not found")

    db.add(
        AuditLog(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action="program_session.delete",
            resource_type="program_session",
            resource_id=str(session_id),
            details={"title": session.title},
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
    )

    await db.delete(session)
    await db.commit()
