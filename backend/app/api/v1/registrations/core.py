"""Core registration endpoints: CRUD, bookable sessions, create, and VAT validation."""

import math
from collections import OrderedDict
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.conference_helpers import check_conference_admin, get_conference_for_tenant
from app.core.dependencies import CurrentUserDep, DbSessionDep
from app.core.exceptions import NotFoundError
from app.core.vat_validation import validate_vat_number
from app.models.booking import BookingOption
from app.models.cfp_applicants import CFPApplicant
from app.models.cfp_papers import CFPPaper
from app.models.program import ProgramDay, ProgramSession, ProgramTimeSlot
from app.models.registration import (
    BillingProfile,
    Registration,
    RegistrationMode,
    RegistrationStatus,
)
from app.models.settings import SessionType
from app.schemas.registration import (
    BulkRegistrationCreate,
    BulkRegistrationResponse,
    CompanySingleRegistrationCreate,
    IndividualRegistrationCreate,
    RegistrationListResponse,
    RegistrationResponse,
    RegistrationUpdate,
    UnifiedRegistrationCreate,
    UnifiedRegistrationResponse,
)

from ._helpers import (
    _auto_add_alumni,
    _build_response,
    _check_email_unique,
    _create_items,
    _get_option_name_map,
    _validate_booking_option,
    limiter,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Bookable sessions for a booking option
# ---------------------------------------------------------------------------


@router.get("/bookable-sessions/{booking_option_id}")
async def get_bookable_sessions(
    conference_id: UUID,
    booking_option_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> dict:
    """Return separately-bookable sessions grouped by session type for a booking option's day."""
    tenant_id = current_user.tenant_id
    await get_conference_for_tenant(db, conference_id, tenant_id)

    # Look up the booking option and its linked day
    result = await db.execute(
        select(BookingOption).where(
            BookingOption.id == booking_option_id,
            BookingOption.conference_id == conference_id,
            BookingOption.tenant_id == tenant_id,
        )
    )
    option = result.scalar_one_or_none()
    if not option or not option.conference_day_id:
        return {"day_name": None, "groups": []}

    # Get the day name
    day_result = await db.execute(select(ProgramDay).where(ProgramDay.id == option.conference_day_id))
    day = day_result.scalar_one_or_none()
    day_name = day.name if day else None

    # Pre-fetch all time slots for this day (ordered) so we can compute
    # the actual end time for sessions that span multiple slots.
    all_slots_result = await db.execute(
        select(ProgramTimeSlot)
        .where(ProgramTimeSlot.program_day_id == option.conference_day_id)
        .order_by(ProgramTimeSlot.start_time)
    )
    all_slots = all_slots_result.scalars().all()
    slot_index = {s.id: idx for idx, s in enumerate(all_slots)}

    # Get all separately-bookable sessions for that day, joined with their time slot,
    # session type, and speaker info
    result = await db.execute(
        select(
            ProgramSession,
            ProgramTimeSlot,
            SessionType.id.label("st_id"),
            SessionType.name.label("st_name"),
            CFPApplicant.first_name.label("speaker_first"),
            CFPApplicant.last_name.label("speaker_last"),
        )
        .join(ProgramTimeSlot, ProgramTimeSlot.id == ProgramSession.start_slot_id)
        .outerjoin(SessionType, SessionType.id == ProgramSession.session_type_id)
        .outerjoin(CFPPaper, CFPPaper.id == ProgramSession.paper_id)
        .outerjoin(CFPApplicant, CFPApplicant.id == CFPPaper.main_speaker_id)
        .where(
            ProgramSession.conference_id == conference_id,
            ProgramSession.tenant_id == tenant_id,
            ProgramTimeSlot.program_day_id == option.conference_day_id,
            ProgramSession.separately_bookable == True,  # noqa: E712
        )
        .order_by(ProgramTimeSlot.sort_order, ProgramTimeSlot.start_time)
    )
    rows = result.all()

    if not rows:
        return {"day_name": day_name, "groups": []}

    # Group by session type, then by time slot within each type
    type_map: OrderedDict[str, dict] = OrderedDict()
    for session, slot, st_id, st_name, speaker_first, speaker_last in rows:
        type_key = str(st_id) if st_id else "untyped"
        type_label = st_name if st_name else "Other"

        if type_key not in type_map:
            type_map[type_key] = {
                "session_type_id": str(st_id) if st_id else None,
                "session_type_name": type_label,
                "slots": OrderedDict(),
            }

        # Compute actual end time: if the session spans multiple slots,
        # use the end_time of the last spanned slot.
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
            # If another session in the same slot spans further, extend the label
            existing_end = slots[slot_key]["end_time"]
            new_end = end_slot.end_time.strftime("%H:%M")
            if new_end > existing_end:
                slots[slot_key]["end_time"] = new_end
                slots[slot_key]["label"] = f"{slots[slot_key]['start_time']} – {new_end}"

        speaker_name = f"{speaker_first} {speaker_last}".strip() if speaker_first else None
        slots[slot_key]["sessions"].append(
            {
                "id": str(session.id),
                "title": session.title,
                "description": session.description,
                "speaker_name": speaker_name,
                "has_paper": session.paper_id is not None,
            }
        )

    # Convert OrderedDicts to lists
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


# ---------------------------------------------------------------------------
# List & Get
# ---------------------------------------------------------------------------


@router.get("", response_model=RegistrationListResponse)
async def list_registrations(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    status: str | None = None,
) -> RegistrationListResponse:
    """List registrations for a conference with pagination and filtering."""
    tenant_id = current_user.tenant_id
    await get_conference_for_tenant(db, conference_id, tenant_id)

    # Count query
    count_q = select(func.count(Registration.id)).where(
        Registration.tenant_id == tenant_id,
        Registration.conference_id == conference_id,
    )
    # Data query
    data_q = (
        select(Registration)
        .where(
            Registration.tenant_id == tenant_id,
            Registration.conference_id == conference_id,
        )
        .options(
            selectinload(Registration.billing_profile),
            selectinload(Registration.items),
        )
    )

    if search:
        search_filter = (
            Registration.first_name.ilike(f"%{search}%")
            | Registration.last_name.ilike(f"%{search}%")
            | Registration.email.ilike(f"%{search}%")
        )
        count_q = count_q.where(search_filter)
        data_q = data_q.where(search_filter)

    if status:
        count_q = count_q.where(Registration.status == status)
        data_q = data_q.where(Registration.status == status)

    total = (await db.execute(count_q)).scalar() or 0
    pages = max(1, math.ceil(total / page_size))

    data_q = data_q.order_by(Registration.created_at.desc())
    data_q = data_q.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(data_q)
    registrations = result.scalars().all()

    # Batch-fetch booking option names
    opt_map = await _get_option_name_map(db, conference_id, tenant_id)

    items = [_build_response(reg, option_name=opt_map.get(reg.booking_option_id)) for reg in registrations]

    return RegistrationListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


@router.get("/{registration_id}", response_model=RegistrationResponse)
async def get_registration(
    conference_id: UUID,
    registration_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> RegistrationResponse:
    """Get a single registration by ID."""
    tenant_id = current_user.tenant_id
    result = await db.execute(
        select(Registration)
        .where(
            Registration.id == registration_id,
            Registration.conference_id == conference_id,
            Registration.tenant_id == tenant_id,
        )
        .options(
            selectinload(Registration.billing_profile),
            selectinload(Registration.items),
        )
    )
    reg = result.scalar_one_or_none()
    if not reg:
        raise NotFoundError(f"Registration '{registration_id}' not found")

    opt_map = await _get_option_name_map(db, conference_id, tenant_id)
    return _build_response(reg, option_name=opt_map.get(reg.booking_option_id))


# ---------------------------------------------------------------------------
# Unified registration (1 or more attendees, shared billing)
# ---------------------------------------------------------------------------


@router.post("", response_model=UnifiedRegistrationResponse, status_code=201)
@limiter.limit("10/minute")
async def create_registration(
    request: Request,
    conference_id: UUID,
    data: UnifiedRegistrationCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> UnifiedRegistrationResponse:
    """Register one or more attendees with shared billing."""
    tenant_id = current_user.tenant_id
    conference = await get_conference_for_tenant(db, conference_id, tenant_id)
    await check_conference_admin(conference_id, current_user, db)

    # Validate all emails are unique for this conference
    for att in data.attendees:
        await _check_email_unique(db, conference_id, att.email)

    # Validate all referenced booking options
    option_ids = {att.booking_option_id for att in data.attendees}
    opt_map: dict[UUID, BookingOption] = {}
    for oid in option_ids:
        opt_map[oid] = await _validate_booking_option(db, oid, conference_id, tenant_id)

    # Create shared billing profile
    billing = BillingProfile(
        tenant_id=tenant_id,
        conference_id=conference_id,
        **data.billing.model_dump(),
    )
    db.add(billing)
    await db.flush()

    # Create registrations
    responses: list[RegistrationResponse] = []
    for att in data.attendees:
        reg = Registration(
            tenant_id=tenant_id,
            conference_id=conference_id,
            billing_profile_id=billing.id,
            first_name=att.first_name,
            last_name=att.last_name,
            email=att.email.lower(),
            pronouns=att.pronouns,
            job_title=att.job_title,
            department=att.department,
            phone=att.phone,
            booking_option_id=att.booking_option_id,
            registration_mode=RegistrationMode.COMPANY_BULK.value,
            status=RegistrationStatus.REGISTERED_PENDING_INVOICE.value,
            notes=att.notes,
            created_by=current_user.user_id,
        )
        db.add(reg)
        await db.flush()

        items = await _create_items(db, reg, att.items, conference_id, tenant_id, conference)
        if items:
            await db.flush()
        reg.billing_profile = billing
        responses.append(
            _build_response(
                reg,
                option_name=opt_map[att.booking_option_id].name,
                items=items,
            )
        )

    await db.commit()

    return UnifiedRegistrationResponse(
        billing_profile_id=billing.id,
        registrations=responses,
        total_created=len(responses),
    )


# ---------------------------------------------------------------------------
# Individual registration (deprecated — use POST "" instead)
# ---------------------------------------------------------------------------


@router.post("/individual", response_model=RegistrationResponse, status_code=201, deprecated=True)
@limiter.limit("10/minute")
async def create_individual_registration(
    request: Request,
    conference_id: UUID,
    data: IndividualRegistrationCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> RegistrationResponse:
    """Register a single individual attendee."""
    tenant_id = current_user.tenant_id
    conference = await get_conference_for_tenant(db, conference_id, tenant_id)
    await check_conference_admin(conference_id, current_user, db)

    await _check_email_unique(db, conference_id, data.attendee.email)
    opt = await _validate_booking_option(db, data.booking_option_id, conference_id, tenant_id)

    # Create billing profile
    billing = BillingProfile(
        tenant_id=tenant_id,
        conference_id=conference_id,
        **data.billing.model_dump(),
    )
    db.add(billing)
    await db.flush()

    # Create registration
    reg = Registration(
        tenant_id=tenant_id,
        conference_id=conference_id,
        billing_profile_id=billing.id,
        first_name=data.attendee.first_name,
        last_name=data.attendee.last_name,
        email=data.attendee.email.lower(),
        pronouns=data.attendee.pronouns,
        job_title=data.attendee.job_title,
        department=data.attendee.department,
        phone=data.attendee.phone,
        booking_option_id=data.booking_option_id,
        registration_mode=RegistrationMode.INDIVIDUAL.value,
        status=RegistrationStatus.REGISTERED_PENDING_INVOICE.value,
        notes=data.notes,
        created_by=current_user.user_id,
    )
    db.add(reg)
    await db.flush()

    # Create add-on items
    items = await _create_items(db, reg, data.items, conference_id, tenant_id, conference)

    await db.commit()
    await db.refresh(reg)
    await db.refresh(billing)

    return _build_response(reg, option_name=opt.name, items=items)


# ---------------------------------------------------------------------------
# Company single registration (deprecated — use POST "" instead)
# ---------------------------------------------------------------------------


@router.post("/company", response_model=RegistrationResponse, status_code=201, deprecated=True)
@limiter.limit("10/minute")
async def create_company_registration(
    request: Request,
    conference_id: UUID,
    data: CompanySingleRegistrationCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> RegistrationResponse:
    """Register one employee of a company."""
    tenant_id = current_user.tenant_id
    conference = await get_conference_for_tenant(db, conference_id, tenant_id)
    await check_conference_admin(conference_id, current_user, db)

    await _check_email_unique(db, conference_id, data.attendee.email)
    opt = await _validate_booking_option(db, data.booking_option_id, conference_id, tenant_id)

    billing = BillingProfile(
        tenant_id=tenant_id,
        conference_id=conference_id,
        **data.billing.model_dump(),
    )
    db.add(billing)
    await db.flush()

    reg = Registration(
        tenant_id=tenant_id,
        conference_id=conference_id,
        billing_profile_id=billing.id,
        first_name=data.attendee.first_name,
        last_name=data.attendee.last_name,
        email=data.attendee.email.lower(),
        pronouns=data.attendee.pronouns,
        job_title=data.attendee.job_title,
        department=data.attendee.department,
        phone=data.attendee.phone,
        booking_option_id=data.booking_option_id,
        registration_mode=RegistrationMode.COMPANY_SINGLE.value,
        status=RegistrationStatus.REGISTERED_PENDING_INVOICE.value,
        notes=data.notes,
        created_by=current_user.user_id,
    )
    db.add(reg)
    await db.flush()

    items = await _create_items(db, reg, data.items, conference_id, tenant_id, conference)

    await db.commit()
    await db.refresh(reg)
    await db.refresh(billing)

    return _build_response(reg, option_name=opt.name, items=items)


# ---------------------------------------------------------------------------
# Bulk company registration (deprecated — use POST "" instead)
# ---------------------------------------------------------------------------


@router.post("/bulk", response_model=BulkRegistrationResponse, status_code=201, deprecated=True)
@limiter.limit("5/minute")
async def create_bulk_registration(
    request: Request,
    conference_id: UUID,
    data: BulkRegistrationCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> BulkRegistrationResponse:
    """Register multiple employees from the same company with shared billing."""
    tenant_id = current_user.tenant_id
    conference = await get_conference_for_tenant(db, conference_id, tenant_id)
    await check_conference_admin(conference_id, current_user, db)

    # Validate all emails are unique for this conference
    for att in data.attendees:
        await _check_email_unique(db, conference_id, att.email)

    # Validate all referenced booking options
    option_ids = {att.booking_option_id for att in data.attendees}
    opt_map: dict[UUID, BookingOption] = {}
    for oid in option_ids:
        opt_map[oid] = await _validate_booking_option(db, oid, conference_id, tenant_id)

    # Create shared billing profile
    billing = BillingProfile(
        tenant_id=tenant_id,
        conference_id=conference_id,
        **data.billing.model_dump(),
    )
    db.add(billing)
    await db.flush()

    # Create registrations
    responses: list[RegistrationResponse] = []
    for att in data.attendees:
        reg = Registration(
            tenant_id=tenant_id,
            conference_id=conference_id,
            billing_profile_id=billing.id,
            first_name=att.first_name,
            last_name=att.last_name,
            email=att.email.lower(),
            pronouns=att.pronouns,
            job_title=att.job_title,
            department=att.department,
            phone=att.phone,
            booking_option_id=att.booking_option_id,
            registration_mode=RegistrationMode.COMPANY_BULK.value,
            status=RegistrationStatus.REGISTERED_PENDING_INVOICE.value,
            notes=att.notes,
            created_by=current_user.user_id,
        )
        db.add(reg)
        await db.flush()

        items = await _create_items(db, reg, att.items, conference_id, tenant_id, conference)
        if items:
            await db.flush()
        reg.billing_profile = billing
        responses.append(
            _build_response(
                reg,
                option_name=opt_map[att.booking_option_id].name,
                items=items,
            )
        )

    await db.commit()

    return BulkRegistrationResponse(
        billing_profile_id=billing.id,
        registrations=responses,
        total_created=len(responses),
    )


# ---------------------------------------------------------------------------
# Update & Delete registration
# ---------------------------------------------------------------------------


@router.put("/{registration_id}", response_model=RegistrationResponse)
async def update_registration(
    conference_id: UUID,
    registration_id: UUID,
    data: RegistrationUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> RegistrationResponse:
    """Update a registration (person data, booking option, status)."""
    tenant_id = current_user.tenant_id
    await check_conference_admin(conference_id, current_user, db)

    result = await db.execute(
        select(Registration)
        .where(
            Registration.id == registration_id,
            Registration.conference_id == conference_id,
            Registration.tenant_id == tenant_id,
        )
        .options(
            selectinload(Registration.billing_profile),
            selectinload(Registration.items),
        )
    )
    reg = result.scalar_one_or_none()
    if not reg:
        raise NotFoundError(f"Registration '{registration_id}' not found")

    update_data = data.model_dump(exclude_unset=True)

    # Validate email uniqueness if changed
    if "email" in update_data:
        await _check_email_unique(db, conference_id, update_data["email"], exclude_id=registration_id)

    # Validate booking option if changed
    if "booking_option_id" in update_data:
        await _validate_booking_option(db, update_data["booking_option_id"], conference_id, tenant_id)

    for field, value in update_data.items():
        setattr(reg, field, value)

    # Auto-add to alumni when status changes to PAID
    if "status" in update_data and update_data["status"] == RegistrationStatus.PAID.value:
        await _auto_add_alumni(db, reg)

    await db.commit()
    await db.refresh(reg)

    opt_map = await _get_option_name_map(db, conference_id, tenant_id)
    return _build_response(reg, option_name=opt_map.get(reg.booking_option_id))


@router.delete("/{registration_id}")
async def delete_registration(
    conference_id: UUID,
    registration_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> dict:
    """Delete a registration."""
    tenant_id = current_user.tenant_id
    await check_conference_admin(conference_id, current_user, db)

    result = await db.execute(
        select(Registration).where(
            Registration.id == registration_id,
            Registration.conference_id == conference_id,
            Registration.tenant_id == tenant_id,
        )
    )
    reg = result.scalar_one_or_none()
    if not reg:
        raise NotFoundError(f"Registration '{registration_id}' not found")

    name = f"{reg.first_name} {reg.last_name}"
    await db.delete(reg)
    await db.commit()

    return {"message": f"Registration for '{name}' deleted successfully"}


# ---------------------------------------------------------------------------
# VAT Validation
# ---------------------------------------------------------------------------


@router.post("/validate-vat")
@limiter.limit("5/minute")
async def validate_vat(
    request: Request,
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    vat_number: str = Query(..., min_length=2),
    country: str = Query(..., min_length=2, max_length=2),
) -> dict:  # type: ignore[type-arg]
    """Validate a VAT number using stdnum, regex fallback, and VIES API."""
    tenant_id = current_user.tenant_id
    await get_conference_for_tenant(db, conference_id, tenant_id)
    return await validate_vat_number(vat_number, country)
