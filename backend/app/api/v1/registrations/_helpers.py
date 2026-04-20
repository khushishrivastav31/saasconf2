"""Shared helpers for registration endpoints."""

from uuid import UUID

from sqlalchemy import func, inspect, select

from app.core.dependencies import DbSessionDep
from app.core.exceptions import ValidationError
from app.core.rate_limiter import limiter
from app.core.security.pii_crypto import read_pii
from app.models.booking import BookingOption
from app.models.conference import Conference
from app.models.program import ProgramSession
from app.models.registration import (
    Registration,
    RegistrationItem,
    RegistrationItemType,
    RegistrationStatus,
)
from app.models.settings import SessionType
from app.schemas.registration import (
    RegistrationItemCreate,
    RegistrationItemResponse,
    RegistrationResponse,
)

MODULE_CODE = "registration"

__all__ = ["MODULE_CODE", "limiter"]


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


async def _validate_session_capacity(
    db,
    session_id: UUID,
    conference_id: UUID,
    tenant_id: UUID,
) -> None:
    """Check that a session has capacity, using SELECT FOR UPDATE to prevent races.

    Locks the session's SessionType row (which holds max_attendees) for the
    duration of the transaction, then counts current bookings across both
    Registration.main_session_id and RegistrationItem.program_session_id.
    Raises ValidationError if the session is full.
    """
    # Get the session and its session_type_id
    session_result = await db.execute(
        select(ProgramSession.session_type_id, ProgramSession.title).where(
            ProgramSession.id == session_id,
            ProgramSession.conference_id == conference_id,
            ProgramSession.tenant_id == tenant_id,
        )
    )
    session_row = session_result.one_or_none()
    if not session_row or not session_row.session_type_id:
        return  # No session type = no capacity limit

    # Lock the session type row to serialize concurrent capacity checks
    st_result = await db.execute(
        select(SessionType).where(SessionType.id == session_row.session_type_id).with_for_update()
    )
    session_type = st_result.scalar_one_or_none()
    if not session_type or session_type.max_attendees is None:
        return  # No capacity limit configured

    # Count current bookings for this session (main + items)
    sid_str = str(session_id)
    main_count_result = await db.execute(
        select(func.count()).where(
            Registration.main_session_id == sid_str,
            Registration.conference_id == conference_id,
            Registration.tenant_id == tenant_id,
            Registration.status != RegistrationStatus.CANCELLED.value,
        )
    )
    main_count = main_count_result.scalar() or 0

    item_count_result = await db.execute(
        select(func.count()).where(
            RegistrationItem.program_session_id == session_id,
            RegistrationItem.tenant_id == tenant_id,
        )
    )
    item_count = item_count_result.scalar() or 0

    total_booked = main_count + item_count
    if total_booked >= session_type.max_attendees:
        raise ValidationError(
            f"Session '{session_row.title}' is full ({total_booked}/{session_type.max_attendees} spots taken)"
        )


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

        option_name = option.name

        # If this booking option has a conference_day_id, it can have session selections
        # Check if program is published to determine if session can be confirmed or is pending
        program_published = conference.program_published_at is not None

        # If a specific session is selected, validate and append to name
        if item_data.program_session_id:
            if program_published:
                session_result = await db.execute(
                    select(ProgramSession).where(
                        ProgramSession.id == item_data.program_session_id,
                        ProgramSession.conference_id == conference_id,
                        ProgramSession.tenant_id == tenant_id,
                    )
                )
                session = session_result.scalar_one_or_none()
                if session and session.title:
                    # Session is selected and valid - return option name (session shows in dropdown)
                    return option_name, False
                else:
                    # Session ID provided but not found - treat as pending
                    return f"{option_name} (session to be selected)", True
            else:
                # Program not published yet - session will be selected later
                return f"{option_name} (session to be selected)", True

        # No session selected - check if this option requires session selection
        # If option has conference_day_id and program isn't published, mark as pending
        if option.conference_day_id and not program_published:
            return f"{option_name} (session to be selected)", True

        # No session selected and either option doesn't require it or program is published
        return option_name, False

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
            program_session_id=item_data.program_session_id,
            item_name=item_name,
            pending=pending,
            notes=item_data.notes,
        )
        db.add(item)
        created.append(item)
    return created


async def _get_option_name_map(db, conference_id: UUID, tenant_id: UUID | None) -> dict[UUID, str]:
    """Batch-fetch booking option names for a conference.

    ``tenant_id`` accepts ``None`` so ``CurrentUser.tenant_id`` passes through
    directly; a ``None`` matches no row and returns an empty dict.
    """
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
    # Safely check if relationships are loaded without triggering lazy loads
    insp = inspect(reg)

    # Get items - either from parameter or loaded relationship
    if items is not None:
        item_list = items
    elif "items" not in insp.unloaded:
        item_list = reg.items
    else:
        item_list = []

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
        for item in item_list
    ]

    # Get billing_profile without lazy load
    billing = None
    if "billing_profile" not in insp.unloaded:
        billing = reg.billing_profile

    # Get main_session without lazy load
    main_session = None
    if "main_session" not in insp.unloaded:
        main_session = reg.main_session

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
        main_session_id=reg.main_session_id,
        main_session_name=main_session.title if main_session else None,
        items=item_responses,
        registration_mode=reg.registration_mode,
        status=reg.status,
        notes=reg.notes,
        created_by=reg.created_by,
        created_at=reg.created_at,
        updated_at=reg.updated_at,
        billing_company_name=billing.company_name if billing else None,
        billing_contact_email=read_pii(billing, "contact_email") if billing else None,
    )


async def _check_email_unique(db, conference_id: UUID, email: str, exclude_id: UUID | None = None) -> None:
    """Check that an email is not already registered for this conference.

    Cancelled registrations are excluded — a person whose registration was
    cancelled is no longer an attendee and must be able to re-register.
    """
    query = select(Registration.id).where(
        Registration.conference_id == conference_id,
        Registration.email == email.lower(),
        Registration.status != RegistrationStatus.CANCELLED,
    )
    if exclude_id:
        query = query.where(Registration.id != exclude_id)
    result = await db.execute(query)
    if result.scalar_one_or_none():
        raise ValidationError(f"Email '{email}' is already registered for this conference")


async def _auto_add_alumni(db: DbSessionDep, reg: Registration) -> None:  # type: ignore[type-arg]
    """Add registration to alumni list when payment confirmed (idempotent)."""
    from app.models.alumni import Alumni, AlumniSource

    existing = await db.execute(
        select(Alumni).where(
            Alumni.conference_id == reg.conference_id,
            func.lower(Alumni.email) == reg.email.lower(),
        )
    )
    if existing.scalar_one_or_none():
        return

    alumni = Alumni(
        tenant_id=reg.tenant_id,
        conference_id=reg.conference_id,
        email=reg.email.lower(),
        first_name=reg.first_name,
        last_name=reg.last_name,
        source=AlumniSource.REGISTRATION.value,
    )
    db.add(alumni)


async def _create_registrations_for_attendees(
    db,
    attendees: list,
    billing_profile_id: UUID,
    conference_id: UUID,
    tenant_id: UUID,
    registration_mode: str,
    conference: Conference,
    created_by: UUID | None = None,
) -> tuple[list[Registration], list[RegistrationResponse]]:
    """Create Registration records for all attendees.

    Unified registration creation logic used by admin, authenticated portal, and public portal.

    Args:
        db: Database session
        attendees: List of attendee data (must have first_name, last_name, email, items)
        billing_profile_id: Associated billing profile ID
        conference_id: Conference UUID
        tenant_id: Tenant UUID
        registration_mode: One of: INDIVIDUAL, COMPANY_SINGLE, COMPANY_BULK, PORTAL
        conference: Conference model (for program_published_at check)
        created_by: Optional user ID (admin registrations only)

    Returns:
        Tuple of (registrations, registration_responses)
    """
    registrations = []
    responses = []

    # Get option name map for responses
    option_name_map = await _get_option_name_map(db, conference_id, tenant_id)

    for attendee_data in attendees:
        # Check email uniqueness
        await _check_email_unique(db, conference_id, attendee_data.email)

        # Create registration
        reg = Registration(
            tenant_id=tenant_id,
            conference_id=conference_id,
            billing_profile_id=billing_profile_id,
            first_name=attendee_data.first_name,
            last_name=attendee_data.last_name,
            email=attendee_data.email.lower(),
            phone=getattr(attendee_data, "phone", None),
            pronouns=getattr(attendee_data, "pronouns", None),
            job_title=getattr(attendee_data, "job_title", None),
            department=getattr(attendee_data, "department", None),
            booking_option_id=attendee_data.booking_option_ids[0] if attendee_data.booking_option_ids else None,
            main_session_id=None,
            registration_mode=registration_mode,
            status="confirmed",
            created_by=created_by,
        )
        db.add(reg)
        await db.flush()  # Get reg.id for items

        # Create items
        items = await _create_items(
            db,
            reg,
            attendee_data.items,
            conference_id,
            tenant_id,
            conference,
        )

        # Build response
        option_name = option_name_map.get(reg.booking_option_id) if reg.booking_option_id else None
        response = _build_response(reg, option_name=option_name, items=items)

        registrations.append(reg)
        responses.append(response)

    return registrations, responses


async def _send_registration_emails(
    db,
    registrations: list[Registration],
    conference: Conference,
    invoice,
    password_setup_tokens: dict[UUID, str] | None = None,
) -> None:
    """Send invoice and welcome emails for registrations.

    Unified email sending logic used by admin, authenticated portal, and public portal.

    Args:
        db: Database session
        registrations: List of Registration models
        conference: Conference model
        invoice: Invoice model (or None if not created yet)
        password_setup_tokens: Optional dict mapping registration_id to password setup token
    """
    from app.core.email import send_email_background
    from app.core.registration_emails import send_attendee_welcome_email, send_registration_invoice_email

    # Send invoice email to billing contact (fire-and-forget with retry)
    if invoice:
        send_email_background(
            send_registration_invoice_email,
            db=db,
            invoice=invoice,
            conference=conference,
        )

    # Send welcome email to each attendee (fire-and-forget with retry)
    for reg in registrations:
        # Get password setup token for this registration
        token = password_setup_tokens.get(reg.id, "") if password_setup_tokens else ""

        send_email_background(
            send_attendee_welcome_email,
            db=db,
            registration=reg,
            conference=conference,
            password_setup_token=token,
        )
