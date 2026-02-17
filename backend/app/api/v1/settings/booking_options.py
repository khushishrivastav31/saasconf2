"""Booking Options CRUD endpoints."""

from typing import Any
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy import select

from app.core.dependencies import CurrentUserDep, DbSessionDep
from app.models.program import ProgramDay
from app.models.settings import BookingOption
from app.schemas.settings import (
    BookingOptionCreate,
    BookingOptionListResponse,
    BookingOptionResponse,
    BookingOptionUpdate,
)

from ._crud_factory import create_crud_router
from ._shared import _resolve_conference


async def _clean_dangling_prices(entity: Any, conference: Any, db: Any) -> None:
    """Clean up dangling option_id key from all booking_periods prices JSONB."""
    await db.execute(
        sa.text(
            "UPDATE booking_periods SET prices = prices - :option_key "
            "WHERE conference_id = :conf_id AND tenant_id = :tenant_id AND prices ? :option_key"
        ),
        {"option_key": str(entity.id), "conf_id": conference.id, "tenant_id": conference.tenant_id},
    )


async def _sync_name_to_program_day(
    entity: Any, update_data: dict, conference: Any, db: Any
) -> None:
    """Sync the booking option name back to the linked program day.

    Booking options define the display name for conference days.
    When the option name changes, the linked program day name must update too.
    """
    day_id = entity.conference_day_id
    if not day_id:
        return

    # Sync name if it was updated, or if the day link just changed
    if "name" in update_data or "conference_day_id" in update_data:
        result = await db.execute(
            select(ProgramDay).where(ProgramDay.id == day_id)
        )
        day = result.scalar_one_or_none()
        if day and day.name != entity.name:
            day.name = entity.name


router = create_crud_router(
    prefix="booking-options",
    entity_name="booking_option",
    model_class=BookingOption,
    create_schema=BookingOptionCreate,
    update_schema=BookingOptionUpdate,
    response_schema=BookingOptionResponse,
    list_response_schema=BookingOptionListResponse,
    unique_field="name",
    order_by=("sort_order", "name"),
    post_delete_hook=_clean_dangling_prices,
    post_update_hook=_sync_name_to_program_day,
)


@router.post("/booking-options/sync-from-days")
async def sync_options_from_days(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> dict:
    """Auto-create booking options for program days that don't have one yet."""
    conference = await _resolve_conference(conference_id, current_user, db)

    # Get all program days for this conference
    days_result = await db.execute(
        select(ProgramDay)
        .where(
            ProgramDay.conference_id == conference.id,
            ProgramDay.tenant_id == conference.tenant_id,
        )
        .order_by(ProgramDay.sort_order, ProgramDay.date)
    )
    days = days_result.scalars().all()

    if not days:
        return {"created": 0}

    # Get all existing booking options for this conference
    options_result = await db.execute(
        select(BookingOption)
        .where(
            BookingOption.conference_id == conference.id,
            BookingOption.tenant_id == conference.tenant_id,
        )
    )
    options = options_result.scalars().all()

    # Find which day IDs are already linked to an option
    linked_day_ids = {opt.conference_day_id for opt in options if opt.conference_day_id}

    # Also track existing option names to avoid unique constraint violations
    existing_names = {opt.name for opt in options}

    created = 0
    next_sort = max((opt.sort_order for opt in options), default=-1) + 1

    for day in days:
        if day.id in linked_day_ids:
            continue

        # Determine name: use day name, or fallback to date string
        name = day.name or str(day.date)

        # If name already exists, skip (don't create duplicate)
        if name in existing_names:
            # Link existing option to this day if it's not already linked
            for opt in options:
                if opt.name == name and not opt.conference_day_id:
                    opt.conference_day_id = day.id
                    created += 1
                    break
            continue

        option = BookingOption(
            tenant_id=conference.tenant_id,
            conference_id=conference.id,
            name=name,
            conference_day_id=day.id,
            sort_order=next_sort,
        )
        db.add(option)
        existing_names.add(name)
        linked_day_ids.add(day.id)
        next_sort += 1
        created += 1

    if created > 0:
        await db.commit()

    return {"created": created}
