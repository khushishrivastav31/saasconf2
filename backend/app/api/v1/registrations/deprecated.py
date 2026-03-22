"""Deprecated registration endpoints (individual, company, bulk).

These endpoints are superseded by the unified POST "" endpoint in core.py.
They are preserved for backward compatibility and marked deprecated=True.
"""

from uuid import UUID

from fastapi import APIRouter, Request

from app.core.conference_helpers import check_conference_admin, get_conference_for_tenant
from app.core.dependencies import CurrentUserDep, DbSessionDep
from app.models.booking import BookingOption
from app.models.registration import (
    BillingProfile,
    Registration,
    RegistrationMode,
    RegistrationStatus,
)
from app.schemas.registration import (
    BulkRegistrationCreate,
    BulkRegistrationResponse,
    CompanySingleRegistrationCreate,
    IndividualRegistrationCreate,
    RegistrationResponse,
)

from ._helpers import (
    _build_response,
    _check_email_unique,
    _create_items,
    _validate_booking_option,
    _validate_session_capacity,
    limiter,
)

router = APIRouter()


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

    # Validate session capacity for items
    for item in data.items:
        if item.program_session_id:
            await _validate_session_capacity(db, item.program_session_id, conference_id, tenant_id)

    # Create billing profile
    billing = BillingProfile(
        tenant_id=tenant_id,
        conference_id=conference_id,
        **data.billing.model_dump(exclude={"payment_intent_id", "vat_validated"}),
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

    # Manually set billing_profile relationship so it's available in _build_response
    reg.billing_profile = billing

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

    # Validate session capacity for items
    for item in data.items:
        if item.program_session_id:
            await _validate_session_capacity(db, item.program_session_id, conference_id, tenant_id)

    billing = BillingProfile(
        tenant_id=tenant_id,
        conference_id=conference_id,
        **data.billing.model_dump(exclude={"payment_intent_id", "vat_validated"}),
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

    # Manually set billing_profile relationship so it's available in _build_response
    reg.billing_profile = billing

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

    # Validate session capacity for items (with row-level locking to prevent overselling)
    for att in data.attendees:
        for item in att.items:
            if item.program_session_id:
                await _validate_session_capacity(db, item.program_session_id, conference_id, tenant_id)

    # Create shared billing profile
    billing = BillingProfile(
        tenant_id=tenant_id,
        conference_id=conference_id,
        **data.billing.model_dump(exclude={"payment_intent_id", "vat_validated"}),
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
