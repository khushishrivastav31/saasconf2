"""Registration management endpoints (conference-scoped)."""

import math
from collections import OrderedDict
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.conference_helpers import check_conference_admin, get_conference_for_tenant
from app.core.dependencies import CurrentUserDep, DbSessionDep, require_module
from app.core.exceptions import NotFoundError, ValidationError
from app.models.booking import BookingOption
from app.models.cfp_applicants import CFPApplicant
from app.models.cfp_papers import CFPPaper
from app.models.conference import Conference
from app.models.program import ProgramDay, ProgramSession, ProgramTimeSlot
from app.models.registration import (
    BillingProfile,
    Registration,
    RegistrationItem,
    RegistrationItemType,
    RegistrationMode,
    RegistrationStatus,
)
from app.models.settings import SessionType
from app.schemas.registration import (
    BillingProfileResponse,
    BillingProfileUpdate,
    BulkRegistrationCreate,
    BulkRegistrationResponse,
    CompanySingleRegistrationCreate,
    IndividualRegistrationCreate,
    RegistrationItemCreate,
    RegistrationItemResponse,
    RegistrationListResponse,
    RegistrationResponse,
    RegistrationUpdate,
    UnifiedRegistrationCreate,
    UnifiedRegistrationResponse,
)

MODULE_CODE = "registration"

router = APIRouter(dependencies=[Depends(require_module(MODULE_CODE))])
limiter = Limiter(key_func=get_remote_address)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _validate_booking_option(db, option_id: UUID, conference_id: UUID, tenant_id: UUID) -> BookingOption:
    """Validate that a booking option exists and belongs to this conference."""
    result = await db.execute(
        select(BookingOption).where(
            BookingOption.id == option_id,
            BookingOption.conference_id == conference_id,
            BookingOption.tenant_id == tenant_id,
            BookingOption.is_active == True,
        )
    )
    opt = result.scalar_one_or_none()
    if not opt:
        raise ValidationError(f"Booking option '{option_id}' not found or inactive for this conference")
    return opt


async def _resolve_item(
    db,
    item_data: RegistrationItemCreate,
    conference_id: UUID,
    tenant_id: UUID,
    conference: Conference,
) -> tuple[str, bool]:
    """Resolve add-on item name and pending status. Returns (item_name, pending)."""
    if item_data.item_type == RegistrationItemType.BOOKING_OPTION:
        if not item_data.booking_option_id:
            raise ValidationError("booking_option_id is required for booking_option items")
        result = await db.execute(
            select(BookingOption).where(
                BookingOption.id == item_data.booking_option_id,
                BookingOption.conference_id == conference_id,
                BookingOption.tenant_id == tenant_id,
            )
        )
        option = result.scalar_one_or_none()
        if not option:
            raise ValidationError(f"Booking option '{item_data.booking_option_id}' not found for this conference")
        return option.name, False

    elif item_data.item_type == RegistrationItemType.TUTORIAL:
        program_published = conference.program_published_at is not None
        if item_data.program_session_id and program_published:
            result = await db.execute(
                select(ProgramSession).where(
                    ProgramSession.id == item_data.program_session_id,
                    ProgramSession.conference_id == conference_id,
                    ProgramSession.tenant_id == tenant_id,
                )
            )
            session = result.scalar_one_or_none()
            if not session:
                raise ValidationError(f"Program session '{item_data.program_session_id}' not found for this conference")
            if not session.separately_bookable:
                raise ValidationError(f"Session '{session.title}' is not separately bookable")
            return session.title or "Tutorial", False
        else:
            # Program not published yet — mark as pending placeholder
            return "Tutorial (to be selected)", True

    raise ValidationError(f"Unknown item type: {item_data.item_type}")


async def _create_items(
    db,
    registration: Registration,
    items_data: list[RegistrationItemCreate],
    conference_id: UUID,
    tenant_id: UUID,
    conference: Conference,
) -> list[RegistrationItem]:
    """Create RegistrationItem records for a registration."""
    created = []
    for item_data in items_data:
        item_name, pending = await _resolve_item(db, item_data, conference_id, tenant_id, conference)
        item = RegistrationItem(
            tenant_id=tenant_id,
            registration_id=registration.id,
            item_type=item_data.item_type.value,
            booking_option_id=item_data.booking_option_id,
            program_session_id=item_data.program_session_id if not pending else None,
            item_name=item_name,
            pending=pending,
            notes=item_data.notes,
        )
        db.add(item)
        created.append(item)
    return created


async def _get_option_name_map(db, conference_id: UUID, tenant_id: UUID) -> dict[UUID, str]:
    """Batch-fetch booking option names for a conference."""
    result = await db.execute(
        select(BookingOption.id, BookingOption.name).where(
            BookingOption.conference_id == conference_id,
            BookingOption.tenant_id == tenant_id,
        )
    )
    return {row.id: row.name for row in result.all()}


def _build_response(
    reg: Registration,
    option_name: str | None = None,
    items: list[RegistrationItem] | None = None,
) -> RegistrationResponse:
    """Build a RegistrationResponse from a Registration model."""
    item_responses = [
        RegistrationItemResponse(
            id=item.id,
            item_type=item.item_type,
            booking_option_id=item.booking_option_id,
            program_session_id=item.program_session_id,
            item_name=item.item_name,
            pending=item.pending,
            notes=item.notes,
            created_at=item.created_at,
        )
        for item in (items if items is not None else reg.items)
    ]

    billing = reg.billing_profile
    return RegistrationResponse(
        id=reg.id,
        tenant_id=reg.tenant_id,
        conference_id=reg.conference_id,
        billing_profile_id=reg.billing_profile_id,
        first_name=reg.first_name,
        last_name=reg.last_name,
        email=reg.email,
        pronouns=reg.pronouns,
        job_title=reg.job_title,
        department=reg.department,
        phone=reg.phone,
        booking_option_id=reg.booking_option_id,
        booking_option_name=option_name,
        items=item_responses,
        registration_mode=reg.registration_mode,
        status=reg.status,
        notes=reg.notes,
        created_by=reg.created_by,
        created_at=reg.created_at,
        updated_at=reg.updated_at,
        billing_company_name=billing.company_name if billing else None,
        billing_contact_email=billing.contact_email if billing else None,
    )


async def _check_email_unique(db, conference_id: UUID, email: str, exclude_id: UUID | None = None) -> None:
    """Check that an email is not already registered for this conference."""
    query = select(Registration.id).where(
        Registration.conference_id == conference_id,
        Registration.email == email.lower(),
    )
    if exclude_id:
        query = query.where(Registration.id != exclude_id)
    result = await db.execute(query)
    if result.scalar_one_or_none():
        raise ValidationError(f"Email '{email}' is already registered for this conference")


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
            ProgramSession.separately_bookable == True,
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
# Add-on items (add / remove after registration)
# ---------------------------------------------------------------------------


@router.post(
    "/{registration_id}/items",
    response_model=RegistrationItemResponse,
    status_code=201,
)
async def add_registration_item(
    conference_id: UUID,
    registration_id: UUID,
    data: RegistrationItemCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> RegistrationItemResponse:
    """Add a tutorial or booking option to an existing registration."""
    tenant_id = current_user.tenant_id
    conference = await get_conference_for_tenant(db, conference_id, tenant_id)
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

    item_name, pending = await _resolve_item(db, data, conference_id, tenant_id, conference)

    item = RegistrationItem(
        tenant_id=tenant_id,
        registration_id=reg.id,
        item_type=data.item_type.value,
        booking_option_id=data.booking_option_id,
        program_session_id=data.program_session_id if not pending else None,
        item_name=item_name,
        pending=pending,
        notes=data.notes,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)

    return RegistrationItemResponse(
        id=item.id,
        item_type=item.item_type,
        booking_option_id=item.booking_option_id,
        program_session_id=item.program_session_id,
        item_name=item.item_name,
        pending=item.pending,
        notes=item.notes,
        created_at=item.created_at,
    )


@router.delete("/{registration_id}/items/{item_id}")
async def remove_registration_item(
    conference_id: UUID,
    registration_id: UUID,
    item_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> dict:
    """Remove an add-on item from a registration."""
    tenant_id = current_user.tenant_id
    await check_conference_admin(conference_id, current_user, db)

    result = await db.execute(
        select(RegistrationItem).where(
            RegistrationItem.id == item_id,
            RegistrationItem.registration_id == registration_id,
            RegistrationItem.tenant_id == tenant_id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError(f"Registration item '{item_id}' not found")

    await db.delete(item)
    await db.commit()

    return {"message": "Registration item removed successfully"}


# ---------------------------------------------------------------------------
# Billing profile CRUD
# ---------------------------------------------------------------------------


@router.get(
    "/{registration_id}/billing",
    response_model=BillingProfileResponse,
)
async def get_billing_profile(
    conference_id: UUID,
    registration_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> BillingProfileResponse:
    """Get the billing profile for a registration."""
    tenant_id = current_user.tenant_id
    result = await db.execute(
        select(Registration)
        .where(
            Registration.id == registration_id,
            Registration.conference_id == conference_id,
            Registration.tenant_id == tenant_id,
        )
        .options(selectinload(Registration.billing_profile))
    )
    reg = result.scalar_one_or_none()
    if not reg:
        raise NotFoundError(f"Registration '{registration_id}' not found")

    return BillingProfileResponse.model_validate(reg.billing_profile)


@router.put(
    "/{registration_id}/billing",
    response_model=BillingProfileResponse,
)
async def update_billing_profile(
    conference_id: UUID,
    registration_id: UUID,
    data: BillingProfileUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> BillingProfileResponse:
    """Update the billing profile for a registration."""
    tenant_id = current_user.tenant_id
    await check_conference_admin(conference_id, current_user, db)

    result = await db.execute(
        select(Registration)
        .where(
            Registration.id == registration_id,
            Registration.conference_id == conference_id,
            Registration.tenant_id == tenant_id,
        )
        .options(selectinload(Registration.billing_profile))
    )
    reg = result.scalar_one_or_none()
    if not reg:
        raise NotFoundError(f"Registration '{registration_id}' not found")

    billing = reg.billing_profile
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(billing, field, value)

    await db.commit()
    await db.refresh(billing)

    return BillingProfileResponse.model_validate(billing)


# ---------------------------------------------------------------------------
# VAT Validation
# ---------------------------------------------------------------------------

EU_COUNTRIES = {
    "AT",
    "BE",
    "BG",
    "HR",
    "CY",
    "CZ",
    "DK",
    "EE",
    "FI",
    "FR",
    "DE",
    "GR",
    "HU",
    "IE",
    "IT",
    "LV",
    "LT",
    "LU",
    "MT",
    "NL",
    "PL",
    "PT",
    "RO",
    "SK",
    "SI",
    "ES",
    "SE",
}

# Country code prefix mapping for VAT numbers
COUNTRY_VAT_PREFIX = {
    "AT": "AT",
    "BE": "BE",
    "BG": "BG",
    "HR": "HR",
    "CY": "CY",
    "CZ": "CZ",
    "DK": "DK",
    "EE": "EE",
    "FI": "FI",
    "FR": "FR",
    "DE": "DE",
    "GR": "EL",
    "HU": "HU",
    "IE": "IE",
    "IT": "IT",
    "LV": "LV",
    "LT": "LT",
    "LU": "LU",
    "MT": "MT",
    "NL": "NL",
    "PL": "PL",
    "PT": "PT",
    "RO": "RO",
    "SK": "SK",
    "SI": "SI",
    "ES": "ES",
    "SE": "SE",
}

# Basic regex patterns per country prefix
VAT_REGEX = {
    "AT": r"^ATU\d{8}$",
    "BE": r"^BE[01]\d{9}$",
    "BG": r"^BG\d{9,10}$",
    "HR": r"^HR\d{11}$",
    "CY": r"^CY\d{8}[A-Z]$",
    "CZ": r"^CZ\d{8,10}$",
    "DK": r"^DK\d{8}$",
    "EE": r"^EE\d{9}$",
    "FI": r"^FI\d{8}$",
    "FR": r"^FR[A-Z0-9]{2}\d{9}$",
    "DE": r"^DE\d{9}$",
    "EL": r"^EL\d{9}$",
    "HU": r"^HU\d{8}$",
    "IE": r"^IE\d{7}[A-Z]{1,2}$|^IE\d[A-Z]\d{5}[A-Z]$",
    "IT": r"^IT\d{11}$",
    "LV": r"^LV\d{11}$",
    "LT": r"^LT\d{9,12}$",
    "LU": r"^LU\d{8}$",
    "MT": r"^MT\d{8}$",
    "NL": r"^NL\d{9}B\d{2}$",
    "PL": r"^PL\d{10}$",
    "PT": r"^PT\d{9}$",
    "RO": r"^RO\d{2,10}$",
    "SK": r"^SK\d{10}$",
    "SI": r"^SI\d{8}$",
    "ES": r"^ES[A-Z0-9]\d{7}[A-Z0-9]$",
    "SE": r"^SE\d{12}$",
}


def _normalize_vat(vat: str) -> str:
    """Strip whitespace, dots, dashes and uppercase."""
    return vat.replace(" ", "").replace(".", "").replace("-", "").upper()


def _validate_stdnum(vat: str) -> bool | None:
    """Validate with python-stdnum. Returns True/False or None if not applicable."""
    try:
        from stdnum.eu import vat as eu_vat

        return eu_vat.is_valid(vat)
    except Exception:
        return None


def _validate_regex(vat: str, country: str) -> bool:
    """Validate VAT format with regex for the given country."""
    import re

    prefix = COUNTRY_VAT_PREFIX.get(country)
    if not prefix:
        return False
    pattern = VAT_REGEX.get(prefix)
    if not pattern:
        return False
    return bool(re.match(pattern, vat))


async def _validate_vies(vat: str) -> bool | None:
    """Check VAT number against the EU VIES service. Returns True/False or None on error."""
    import httpx

    # Extract country code (first 2 chars) and number
    country_code = vat[:2]
    number = vat[2:]

    url = "https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number"
    payload = {"countryCode": country_code, "vatNumber": number}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, json=payload)
            if response.status_code == 200:
                data = response.json()
                return data.get("valid", False)
    except Exception:
        pass
    return None


@router.post("/validate-vat")
@limiter.limit("5/minute")
async def validate_vat(
    request: Request,
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    vat_number: str = Query(..., min_length=2),
    country: str = Query(..., min_length=2, max_length=2),
) -> dict:
    """Validate a VAT number using stdnum, regex fallback, and VIES API."""
    tenant_id = current_user.tenant_id
    await get_conference_for_tenant(db, conference_id, tenant_id)

    country_upper = country.upper()
    if country_upper not in EU_COUNTRIES:
        return {"valid": None, "method": None, "message": "Country is not in the EU"}

    vat = _normalize_vat(vat_number)
    # Ensure country prefix is present
    expected_prefix = COUNTRY_VAT_PREFIX.get(country_upper, country_upper)
    if not vat.startswith(expected_prefix):
        vat = expected_prefix + vat

    # Stage 1: python-stdnum (format + checksum)
    stdnum_result = _validate_stdnum(vat)
    if stdnum_result is True:
        return {"valid": True, "method": "stdnum", "vat_normalized": vat}
    if stdnum_result is False:
        # Stage 2: regex fallback (more lenient)
        if _validate_regex(vat, country_upper):
            # Stage 3: VIES API for definitive answer
            vies_result = await _validate_vies(vat)
            if vies_result is True:
                return {"valid": True, "method": "vies", "vat_normalized": vat}
            if vies_result is False:
                return {"valid": False, "method": "vies", "vat_normalized": vat}
            # VIES unavailable — regex passed, report as uncertain
            return {
                "valid": None,
                "method": "regex",
                "vat_normalized": vat,
                "message": "Format OK but could not verify online",
            }
        return {"valid": False, "method": "stdnum", "vat_normalized": vat}

    # stdnum returned None (error/not applicable) — fall through to regex + VIES
    if _validate_regex(vat, country_upper):
        vies_result = await _validate_vies(vat)
        if vies_result is True:
            return {"valid": True, "method": "vies", "vat_normalized": vat}
        if vies_result is False:
            return {"valid": False, "method": "vies", "vat_normalized": vat}
        return {
            "valid": None,
            "method": "regex",
            "vat_normalized": vat,
            "message": "Format OK but could not verify online",
        }

    return {"valid": False, "method": "regex", "vat_normalized": vat}
