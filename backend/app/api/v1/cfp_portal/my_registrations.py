"""Portal endpoints for viewing own registrations and selecting sessions."""

import logging
from collections import OrderedDict
from uuid import UUID

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import func, select

from app.core.applicant_dependencies import CurrentApplicantDep, DbSessionDep
from app.core.exceptions import NotFoundError, ValidationError
from app.models.booking import BookingOption
from app.models.cfp import CFPApplicant, CFPPaper
from app.models.conference import Conference
from app.models.program import ProgramDay, ProgramSession, ProgramTimeSlot
from app.models.registration import Registration, RegistrationItem, RegistrationStatus
from app.models.settings import SessionType

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/portal/my-registrations")
async def get_my_registrations(
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> list[dict]:
    """Get all registrations for the current portal user (matched by email).

    Returns registrations across all conferences for this tenant.
    """
    tenant_id = current_applicant.tenant_id
    user_email = current_applicant.applicant.email.lower()

    result = await db.execute(
        select(Registration, BookingOption.name.label("booking_option_name"))
        .outerjoin(BookingOption, BookingOption.id == Registration.booking_option_id)
        .where(
            Registration.tenant_id == tenant_id,
            Registration.email == user_email,
            Registration.status != RegistrationStatus.CANCELLED.value,
        )
        .order_by(Registration.created_at.desc())
    )
    rows = result.all()

    if not rows:
        return []

    # Fetch conference details for all registrations
    conference_ids = list({r.conference_id for r, _ in rows})
    conf_result = await db.execute(select(Conference).where(Conference.id.in_(conference_ids)))
    conferences = {c.id: c for c in conf_result.scalars().all()}

    # Fetch main session details
    session_ids = [r.main_session_id for r, _ in rows if r.main_session_id]
    session_map: dict[UUID, ProgramSession] = {}
    if session_ids:
        sess_result = await db.execute(select(ProgramSession).where(ProgramSession.id.in_(session_ids)))
        session_map = {s.id: s for s in sess_result.scalars().all()}

    # Fetch registration items
    reg_ids = [r.id for r, _ in rows]
    items_result = await db.execute(select(RegistrationItem).where(RegistrationItem.registration_id.in_(reg_ids)))
    items_by_reg: dict[UUID, list[RegistrationItem]] = {}
    for item in items_result.scalars().all():
        items_by_reg.setdefault(item.registration_id, []).append(item)

    # Fetch item session details
    item_session_ids = [
        item.program_session_id
        for items in items_by_reg.values()
        for item in items
        if item.program_session_id and item.program_session_id not in session_map
    ]
    if item_session_ids:
        item_sess_result = await db.execute(select(ProgramSession).where(ProgramSession.id.in_(item_session_ids)))
        for s in item_sess_result.scalars().all():
            session_map[s.id] = s

    # Check which booking options have bookable sessions (conference_day_id set)
    # Include both registration-level and item-level booking option IDs
    option_ids = list({r.booking_option_id for r, _ in rows})
    item_option_ids = [
        item.booking_option_id for items in items_by_reg.values() for item in items if item.booking_option_id
    ]
    all_option_ids = list(set(option_ids + item_option_ids))
    opt_result = await db.execute(select(BookingOption).where(BookingOption.id.in_(all_option_ids)))
    option_map = {o.id: o for o in opt_result.scalars().all()}

    registrations = []
    for reg, booking_option_name in rows:
        conf = conferences.get(reg.conference_id)
        main_session = session_map.get(reg.main_session_id) if reg.main_session_id else None
        items = items_by_reg.get(reg.id, [])
        option = option_map.get(reg.booking_option_id)
        has_bookable_sessions = option is not None and option.conference_day_id is not None

        registrations.append(
            {
                "id": str(reg.id),
                "conference_id": str(reg.conference_id),
                "conference_name": conf.name if conf else None,
                "conference_abbreviation": conf.abbreviation if conf else None,
                "first_name": reg.first_name,
                "last_name": reg.last_name,
                "email": reg.email,
                "status": reg.status,
                "booking_option_id": str(reg.booking_option_id),
                "booking_option_name": booking_option_name,
                "has_bookable_sessions": has_bookable_sessions,
                "main_session_id": str(reg.main_session_id) if reg.main_session_id else None,
                "main_session_name": main_session.title if main_session else None,
                "created_at": reg.created_at.isoformat() if reg.created_at else None,
                "items": [
                    {
                        "id": str(item.id),
                        "item_type": item.item_type,
                        "item_name": item.item_name,
                        "booking_option_id": str(item.booking_option_id) if item.booking_option_id else None,
                        "program_session_id": str(item.program_session_id) if item.program_session_id else None,
                        "program_session_name": (
                            session_map[item.program_session_id].title
                            if item.program_session_id and item.program_session_id in session_map
                            else None
                        ),
                        "has_bookable_sessions": (
                            item.booking_option_id is not None
                            and item.booking_option_id in option_map
                            and option_map[item.booking_option_id].conference_day_id is not None
                        ),
                    }
                    for item in sorted(
                        items,
                        key=lambda i: (
                            option_map[i.booking_option_id].sort_order
                            if i.booking_option_id and i.booking_option_id in option_map
                            else 0
                        ),
                    )
                ],
            }
        )

    return registrations


class SelectSessionRequest(BaseModel):
    """Request to select a session for a registration."""

    session_id: UUID


@router.put("/portal/my-registrations/{registration_id}/select-session")
async def select_session(
    registration_id: UUID,
    data: SelectSessionRequest,
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> dict:
    """Select a booking session for own registration.

    Business rules:
    - Only the registration owner (matched by email) can select
    - Session can only be set if main_session_id is currently NULL
    - Once set, only admin can change it
    - Session must belong to the same conference day as the booking option
    - Session must not be fully booked
    """
    tenant_id = current_applicant.tenant_id
    user_email = current_applicant.applicant.email.lower()

    # Load registration
    result = await db.execute(
        select(Registration).where(
            Registration.id == registration_id,
            Registration.tenant_id == tenant_id,
            Registration.email == user_email,
            Registration.status != RegistrationStatus.CANCELLED.value,
        )
    )
    reg = result.scalar_one_or_none()
    if not reg:
        raise NotFoundError("Registration not found")

    # Check session is not already set
    if reg.main_session_id is not None:
        raise ValidationError("Session already selected. Only an admin can change it.")

    # Load the booking option to get conference_day_id
    opt_result = await db.execute(select(BookingOption).where(BookingOption.id == reg.booking_option_id))
    option = opt_result.scalar_one_or_none()
    if not option or not option.conference_day_id:
        raise ValidationError("This booking option does not support session selection")

    # Validate the session exists and belongs to the correct day
    sess_result = await db.execute(
        select(ProgramSession)
        .join(ProgramTimeSlot, ProgramTimeSlot.id == ProgramSession.start_slot_id)
        .where(
            ProgramSession.id == data.session_id,
            ProgramSession.conference_id == reg.conference_id,
            ProgramSession.tenant_id == tenant_id,
            ProgramSession.separately_bookable == True,
            ProgramTimeSlot.program_day_id == option.conference_day_id,
        )
    )
    session = sess_result.scalar_one_or_none()
    if not session:
        raise ValidationError("Invalid session selection")

    # Check capacity — get session type max_attendees
    st_result = await db.execute(select(SessionType.max_attendees).where(SessionType.id == session.session_type_id))
    max_attendees = st_result.scalar_one_or_none()

    if max_attendees is not None:
        # Count current registrations for this session
        main_count_result = await db.execute(
            select(func.count(Registration.id)).where(
                Registration.conference_id == reg.conference_id,
                Registration.tenant_id == tenant_id,
                Registration.main_session_id == data.session_id,
                Registration.status != RegistrationStatus.CANCELLED.value,
            )
        )
        main_count = main_count_result.scalar() or 0

        item_count_result = await db.execute(
            select(func.count(RegistrationItem.id))
            .join(Registration, Registration.id == RegistrationItem.registration_id)
            .where(
                Registration.conference_id == reg.conference_id,
                Registration.tenant_id == tenant_id,
                Registration.status != RegistrationStatus.CANCELLED.value,
                RegistrationItem.program_session_id == data.session_id,
            )
        )
        item_count = item_count_result.scalar() or 0

        if main_count + item_count >= max_attendees:
            raise ValidationError("This session is fully booked. Please choose another.")

    # Set the session
    reg.main_session_id = data.session_id
    await db.commit()

    logger.info(f"Portal user {user_email} selected session {data.session_id} for registration {registration_id}")

    return {"success": True, "main_session_id": str(data.session_id)}


@router.get("/portal/my-registrations/{registration_id}/bookable-sessions")
async def get_my_bookable_sessions(
    registration_id: UUID,
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> dict:
    """Get bookable sessions for a registration's booking option.

    Same logic as the public bookable-sessions endpoint but authenticated
    and scoped to the user's own registration.
    """
    tenant_id = current_applicant.tenant_id
    user_email = current_applicant.applicant.email.lower()

    # Load registration
    result = await db.execute(
        select(Registration).where(
            Registration.id == registration_id,
            Registration.tenant_id == tenant_id,
            Registration.email == user_email,
            Registration.status != RegistrationStatus.CANCELLED.value,
        )
    )
    reg = result.scalar_one_or_none()
    if not reg:
        raise NotFoundError("Registration not found")

    # Load booking option
    opt_result = await db.execute(select(BookingOption).where(BookingOption.id == reg.booking_option_id))
    option = opt_result.scalar_one_or_none()
    if not option or not option.conference_day_id:
        return {"day_name": None, "groups": []}

    # Get the day name
    day_result = await db.execute(select(ProgramDay).where(ProgramDay.id == option.conference_day_id))
    day = day_result.scalar_one_or_none()
    day_name = day.name if day else None

    # Pre-fetch all time slots for this day
    all_slots_result = await db.execute(
        select(ProgramTimeSlot)
        .where(ProgramTimeSlot.program_day_id == option.conference_day_id)
        .order_by(ProgramTimeSlot.start_time)
    )
    all_slots = all_slots_result.scalars().all()
    slot_index = {s.id: idx for idx, s in enumerate(all_slots)}

    # Get all separately-bookable sessions for that day
    result = await db.execute(
        select(
            ProgramSession,
            ProgramTimeSlot,
            SessionType.id.label("st_id"),
            SessionType.name.label("st_name"),
            SessionType.max_attendees.label("st_max_attendees"),
            CFPApplicant.first_name.label("speaker_first"),
            CFPApplicant.last_name.label("speaker_last"),
        )
        .join(ProgramTimeSlot, ProgramTimeSlot.id == ProgramSession.start_slot_id)
        .outerjoin(SessionType, SessionType.id == ProgramSession.session_type_id)
        .outerjoin(CFPPaper, CFPPaper.id == ProgramSession.paper_id)
        .outerjoin(CFPApplicant, CFPApplicant.id == CFPPaper.main_speaker_id)
        .where(
            ProgramSession.conference_id == reg.conference_id,
            ProgramSession.tenant_id == tenant_id,
            ProgramTimeSlot.program_day_id == option.conference_day_id,
            ProgramSession.separately_bookable == True,
        )
        .order_by(ProgramTimeSlot.sort_order, ProgramTimeSlot.start_time)
    )
    rows = result.all()

    if not rows:
        return {"day_name": day_name, "groups": []}

    # Count registrations for each session
    session_ids = [str(session.id) for session, *_ in rows]

    main_session_counts = await db.execute(
        select(
            Registration.main_session_id,
            func.count(Registration.id).label("count"),
        )
        .where(
            Registration.conference_id == reg.conference_id,
            Registration.tenant_id == tenant_id,
            Registration.main_session_id.in_(session_ids),
            Registration.status != "cancelled",
        )
        .group_by(Registration.main_session_id)
    )
    main_counts = {str(row[0]): row[1] for row in main_session_counts}

    item_session_counts = await db.execute(
        select(
            RegistrationItem.program_session_id,
            func.count(RegistrationItem.id).label("count"),
        )
        .join(Registration, Registration.id == RegistrationItem.registration_id)
        .where(
            Registration.conference_id == reg.conference_id,
            Registration.tenant_id == tenant_id,
            Registration.status != "cancelled",
            RegistrationItem.program_session_id.in_(session_ids),
        )
        .group_by(RegistrationItem.program_session_id)
    )
    item_counts = {str(row[0]): row[1] for row in item_session_counts}

    session_capacity: dict[str, int] = {}
    for sid in session_ids:
        session_capacity[sid] = main_counts.get(sid, 0) + item_counts.get(sid, 0)

    # Group by session type, then by time slot
    type_map: OrderedDict[str, dict] = OrderedDict()
    for session, slot, st_id, st_name, st_max_attendees, speaker_first, speaker_last in rows:
        type_key = str(st_id) if st_id else "untyped"
        type_label = st_name if st_name else "Other"

        if type_key not in type_map:
            type_map[type_key] = {
                "session_type_id": str(st_id) if st_id else None,
                "session_type_name": type_label,
                "slots": OrderedDict(),
            }

        start_idx = slot_index.get(slot.id, 0)
        end_idx = min(start_idx + session.slot_span - 1, len(all_slots) - 1)
        end_slot = all_slots[end_idx]

        slot_key = str(slot.id)
        slots = type_map[type_key]["slots"]
        if slot_key not in slots:
            start = slot.start_time.strftime("%H:%M")
            end = end_slot.end_time.strftime("%H:%M")
            slots[slot_key] = {
                "slot_id": slot_key,
                "start_time": start,
                "end_time": end,
                "label": f"{start} – {end}",
                "sessions": [],
            }
        else:
            existing_end = slots[slot_key]["end_time"]
            new_end = end_slot.end_time.strftime("%H:%M")
            if new_end > existing_end:
                slots[slot_key]["end_time"] = new_end
                slots[slot_key]["label"] = f"{slots[slot_key]['start_time']} – {new_end}"

        speaker_name = f"{speaker_first} {speaker_last}".strip() if speaker_first else None
        current_count = session_capacity.get(str(session.id), 0)
        max_attendees = st_max_attendees
        available_spots = max_attendees - current_count if max_attendees is not None else None
        is_full = max_attendees is not None and current_count >= max_attendees

        # Hide fully booked sessions
        if is_full:
            continue

        slots[slot_key]["sessions"].append(
            {
                "id": str(session.id),
                "title": session.title,
                "description": session.description,
                "speaker_name": speaker_name,
                "has_paper": session.paper_id is not None,
                "max_attendees": max_attendees,
                "current_count": current_count,
                "available_spots": available_spots,
                "is_full": is_full,
            }
        )

    groups = []
    for type_data in type_map.values():
        groups.append(
            {
                "session_type_id": type_data["session_type_id"],
                "session_type_name": type_data["session_type_name"],
                "slots": list(type_data["slots"].values()),
            }
        )

    return {"day_name": day_name, "groups": groups}


@router.get("/portal/my-registrations/{registration_id}/items/{item_id}/bookable-sessions")
async def get_item_bookable_sessions(
    registration_id: UUID,
    item_id: UUID,
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> dict:
    """Get bookable sessions for a registration item's booking option.

    Same logic as main bookable sessions but scoped to an item's booking option.
    """
    tenant_id = current_applicant.tenant_id
    user_email = current_applicant.applicant.email.lower()

    # Load registration
    result = await db.execute(
        select(Registration).where(
            Registration.id == registration_id,
            Registration.tenant_id == tenant_id,
            Registration.email == user_email,
            Registration.status != RegistrationStatus.CANCELLED.value,
        )
    )
    reg = result.scalar_one_or_none()
    if not reg:
        raise NotFoundError("Registration not found")

    # Load item
    item_result = await db.execute(
        select(RegistrationItem).where(
            RegistrationItem.id == item_id,
            RegistrationItem.registration_id == registration_id,
        )
    )
    item = item_result.scalar_one_or_none()
    if not item or not item.booking_option_id:
        raise NotFoundError("Item not found")

    # Load booking option
    opt_result = await db.execute(select(BookingOption).where(BookingOption.id == item.booking_option_id))
    option = opt_result.scalar_one_or_none()
    if not option or not option.conference_day_id:
        return {"day_name": None, "groups": []}

    # Get the day name
    day_result = await db.execute(select(ProgramDay).where(ProgramDay.id == option.conference_day_id))
    day = day_result.scalar_one_or_none()
    day_name = day.name if day else None

    # Pre-fetch all time slots for this day
    all_slots_result = await db.execute(
        select(ProgramTimeSlot)
        .where(ProgramTimeSlot.program_day_id == option.conference_day_id)
        .order_by(ProgramTimeSlot.start_time)
    )
    all_slots = all_slots_result.scalars().all()
    slot_index = {s.id: idx for idx, s in enumerate(all_slots)}

    # Get all separately-bookable sessions for that day
    result = await db.execute(
        select(
            ProgramSession,
            ProgramTimeSlot,
            SessionType.id.label("st_id"),
            SessionType.name.label("st_name"),
            SessionType.max_attendees.label("st_max_attendees"),
            CFPApplicant.first_name.label("speaker_first"),
            CFPApplicant.last_name.label("speaker_last"),
        )
        .join(ProgramTimeSlot, ProgramTimeSlot.id == ProgramSession.start_slot_id)
        .outerjoin(SessionType, SessionType.id == ProgramSession.session_type_id)
        .outerjoin(CFPPaper, CFPPaper.id == ProgramSession.paper_id)
        .outerjoin(CFPApplicant, CFPApplicant.id == CFPPaper.main_speaker_id)
        .where(
            ProgramSession.conference_id == reg.conference_id,
            ProgramSession.tenant_id == tenant_id,
            ProgramTimeSlot.program_day_id == option.conference_day_id,
            ProgramSession.separately_bookable == True,
        )
        .order_by(ProgramTimeSlot.sort_order, ProgramTimeSlot.start_time)
    )
    rows = result.all()

    if not rows:
        return {"day_name": day_name, "groups": []}

    # Count registrations for each session (same as main endpoint)
    session_ids = [str(session.id) for session, *_ in rows]

    main_session_counts = await db.execute(
        select(
            Registration.main_session_id,
            func.count(Registration.id).label("count"),
        )
        .where(
            Registration.conference_id == reg.conference_id,
            Registration.tenant_id == tenant_id,
            Registration.main_session_id.in_(session_ids),
            Registration.status != "cancelled",
        )
        .group_by(Registration.main_session_id)
    )
    main_counts = {str(row[0]): row[1] for row in main_session_counts}

    item_session_counts = await db.execute(
        select(
            RegistrationItem.program_session_id,
            func.count(RegistrationItem.id).label("count"),
        )
        .join(Registration, Registration.id == RegistrationItem.registration_id)
        .where(
            Registration.conference_id == reg.conference_id,
            Registration.tenant_id == tenant_id,
            Registration.status != "cancelled",
            RegistrationItem.program_session_id.in_(session_ids),
        )
        .group_by(RegistrationItem.program_session_id)
    )
    item_counts = {str(row[0]): row[1] for row in item_session_counts}

    session_capacity: dict[str, int] = {}
    for sid in session_ids:
        session_capacity[sid] = main_counts.get(sid, 0) + item_counts.get(sid, 0)

    # Group by session type, then by time slot
    type_map: OrderedDict[str, dict] = OrderedDict()
    for session, slot, st_id, st_name, st_max_attendees, speaker_first, speaker_last in rows:
        type_key = str(st_id) if st_id else "untyped"
        type_label = st_name if st_name else "Other"

        if type_key not in type_map:
            type_map[type_key] = {
                "session_type_id": str(st_id) if st_id else None,
                "session_type_name": type_label,
                "slots": OrderedDict(),
            }

        start_idx = slot_index.get(slot.id, 0)
        end_idx = min(start_idx + session.slot_span - 1, len(all_slots) - 1)
        end_slot = all_slots[end_idx]

        slot_key = str(slot.id)
        slots = type_map[type_key]["slots"]
        if slot_key not in slots:
            start = slot.start_time.strftime("%H:%M")
            end = end_slot.end_time.strftime("%H:%M")
            slots[slot_key] = {
                "slot_id": slot_key,
                "start_time": start,
                "end_time": end,
                "label": f"{start} – {end}",
                "sessions": [],
            }
        else:
            existing_end = slots[slot_key]["end_time"]
            new_end = end_slot.end_time.strftime("%H:%M")
            if new_end > existing_end:
                slots[slot_key]["end_time"] = new_end
                slots[slot_key]["label"] = f"{slots[slot_key]['start_time']} – {new_end}"

        speaker_name = f"{speaker_first} {speaker_last}".strip() if speaker_first else None
        current_count = session_capacity.get(str(session.id), 0)
        max_attendees = st_max_attendees
        available_spots = max_attendees - current_count if max_attendees is not None else None
        is_full = max_attendees is not None and current_count >= max_attendees

        if is_full:
            continue

        slots[slot_key]["sessions"].append(
            {
                "id": str(session.id),
                "title": session.title,
                "description": session.description,
                "speaker_name": speaker_name,
                "has_paper": session.paper_id is not None,
                "max_attendees": max_attendees,
                "current_count": current_count,
                "available_spots": available_spots,
                "is_full": is_full,
            }
        )

    groups = []
    for type_data in type_map.values():
        groups.append(
            {
                "session_type_id": type_data["session_type_id"],
                "session_type_name": type_data["session_type_name"],
                "slots": list(type_data["slots"].values()),
            }
        )

    return {"day_name": day_name, "groups": groups}


@router.put("/portal/my-registrations/{registration_id}/items/{item_id}/select-session")
async def select_item_session(
    registration_id: UUID,
    item_id: UUID,
    data: SelectSessionRequest,
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> dict:
    """Select a session for a registration item.

    Business rules:
    - Only the registration owner can select
    - Session can only be set if program_session_id is currently NULL
    - Once set, only admin can change it
    - Session must belong to the same conference day as the item's booking option
    - Session must not be fully booked
    """
    tenant_id = current_applicant.tenant_id
    user_email = current_applicant.applicant.email.lower()

    # Load registration
    result = await db.execute(
        select(Registration).where(
            Registration.id == registration_id,
            Registration.tenant_id == tenant_id,
            Registration.email == user_email,
            Registration.status != RegistrationStatus.CANCELLED.value,
        )
    )
    reg = result.scalar_one_or_none()
    if not reg:
        raise NotFoundError("Registration not found")

    # Load item
    item_result = await db.execute(
        select(RegistrationItem).where(
            RegistrationItem.id == item_id,
            RegistrationItem.registration_id == registration_id,
        )
    )
    item = item_result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Item not found")

    # Check session is not already set
    if item.program_session_id is not None:
        raise ValidationError("Session already selected for this item. Only an admin can change it.")

    # Load the booking option to get conference_day_id
    if not item.booking_option_id:
        raise ValidationError("This item does not support session selection")

    opt_result = await db.execute(select(BookingOption).where(BookingOption.id == item.booking_option_id))
    option = opt_result.scalar_one_or_none()
    if not option or not option.conference_day_id:
        raise ValidationError("This item's booking option does not support session selection")

    # Validate the session exists and belongs to the correct day
    sess_result = await db.execute(
        select(ProgramSession)
        .join(ProgramTimeSlot, ProgramTimeSlot.id == ProgramSession.start_slot_id)
        .where(
            ProgramSession.id == data.session_id,
            ProgramSession.conference_id == reg.conference_id,
            ProgramSession.tenant_id == tenant_id,
            ProgramSession.separately_bookable == True,
            ProgramTimeSlot.program_day_id == option.conference_day_id,
        )
    )
    session = sess_result.scalar_one_or_none()
    if not session:
        raise ValidationError("Invalid session selection")

    # Check capacity
    st_result = await db.execute(select(SessionType.max_attendees).where(SessionType.id == session.session_type_id))
    max_attendees = st_result.scalar_one_or_none()

    if max_attendees is not None:
        main_count_result = await db.execute(
            select(func.count(Registration.id)).where(
                Registration.conference_id == reg.conference_id,
                Registration.tenant_id == tenant_id,
                Registration.main_session_id == data.session_id,
                Registration.status != RegistrationStatus.CANCELLED.value,
            )
        )
        main_count = main_count_result.scalar() or 0

        item_count_result = await db.execute(
            select(func.count(RegistrationItem.id))
            .join(Registration, Registration.id == RegistrationItem.registration_id)
            .where(
                Registration.conference_id == reg.conference_id,
                Registration.tenant_id == tenant_id,
                Registration.status != RegistrationStatus.CANCELLED.value,
                RegistrationItem.program_session_id == data.session_id,
            )
        )
        item_count = item_count_result.scalar() or 0

        if main_count + item_count >= max_attendees:
            raise ValidationError("This session is fully booked. Please choose another.")

    # Set the session
    item.program_session_id = data.session_id
    await db.commit()

    logger.info(
        f"Portal user {user_email} selected session {data.session_id} for item {item_id} "
        f"of registration {registration_id}"
    )

    return {"success": True, "program_session_id": str(data.session_id)}
