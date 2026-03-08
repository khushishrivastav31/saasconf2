"""Registration item (add-on) endpoints."""

from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select

from app.core.conference_helpers import check_conference_admin, get_conference_for_tenant
from app.core.dependencies import CurrentUserDep, DbSessionDep
from app.core.exceptions import NotFoundError
from app.models.booking import BookingOption
from app.models.program import ProgramSession
from app.models.registration import Registration, RegistrationItem
from app.schemas.registration import (
    RegistrationItemCreate,
    RegistrationItemResponse,
    RegistrationItemUpdate,
)

from ._helpers import _resolve_item

router = APIRouter()


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
        program_session_id=data.program_session_id,
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


@router.patch(
    "/{registration_id}/items/{item_id}",
    response_model=RegistrationItemResponse,
)
async def update_registration_item(
    conference_id: UUID,
    registration_id: UUID,
    item_id: UUID,
    data: RegistrationItemUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> RegistrationItemResponse:
    """Update a registration item (typically to select a session)."""
    tenant_id = current_user.tenant_id
    conference = await get_conference_for_tenant(db, conference_id, tenant_id)
    await check_conference_admin(conference_id, current_user, db)

    # Fetch the item
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

    # Update session selection
    if data.program_session_id is not None:
        item.program_session_id = data.program_session_id

        # Re-resolve item name based on new session
        # Get booking option name
        if item.booking_option_id:
            bo_result = await db.execute(select(BookingOption).where(BookingOption.id == item.booking_option_id))
            booking_option = bo_result.scalar_one_or_none()
            if booking_option:
                option_name = booking_option.name

                # Get session title if session selected
                if data.program_session_id:
                    session_result = await db.execute(
                        select(ProgramSession).where(ProgramSession.id == data.program_session_id)
                    )
                    session = session_result.scalar_one_or_none()
                    if session and session.title:
                        item.item_name = f"{option_name} - {session.title}"
                        item.pending = False
                    else:
                        item.item_name = f"{option_name} (session to be selected)"
                        item.pending = True
                else:
                    # Removed session selection
                    if booking_option.conference_day_id and conference.program_published_at is None:
                        item.item_name = f"{option_name} (session to be selected)"
                        item.pending = True
                    else:
                        item.item_name = option_name
                        item.pending = False

    if data.notes is not None:
        item.notes = data.notes

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
