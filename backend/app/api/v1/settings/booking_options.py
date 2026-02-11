"""Booking Options CRUD endpoints."""

from uuid import UUID

import sqlalchemy as sa
from fastapi import APIRouter, Request
from sqlalchemy import select

from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    get_client_ip,
)
from app.core.exceptions import NotFoundError, ValidationError
from app.models.audit import AuditLog
from app.models.settings import BookingOption
from app.schemas.settings import (
    BookingOptionCreate,
    BookingOptionListResponse,
    BookingOptionResponse,
    BookingOptionUpdate,
)

from ._shared import _resolve_conference, _check_conference_admin

router = APIRouter()


@router.get("/booking-options", response_model=BookingOptionListResponse)
async def list_booking_options(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> BookingOptionListResponse:
    """List all booking options for a conference."""
    conference = await _resolve_conference(conference_id, current_user, db)

    query = (
        select(BookingOption)
        .where(
            BookingOption.conference_id == conference.id,
            BookingOption.tenant_id == conference.tenant_id,
        )
        .order_by(BookingOption.sort_order, BookingOption.name)
    )
    result = await db.execute(query)
    options = result.scalars().all()

    items = [
        BookingOptionResponse(
            id=o.id,
            tenant_id=o.tenant_id,
            conference_id=o.conference_id,
            name=o.name,
            description=o.description,
            sort_order=o.sort_order,
            is_active=o.is_active,
            created_at=o.created_at,
            updated_at=o.updated_at,
        )
        for o in options
    ]

    return BookingOptionListResponse(items=items, total=len(items))


@router.post("/booking-options", response_model=BookingOptionResponse)
async def create_booking_option(
    conference_id: UUID,
    option_data: BookingOptionCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> BookingOptionResponse:
    """Create a new booking option for a conference."""
    conference = await _resolve_conference(conference_id, current_user, db)
    await _check_conference_admin(conference_id, current_user, db)

    # Check unique name within conference
    existing = await db.execute(
        select(BookingOption).where(
            BookingOption.conference_id == conference.id,
            BookingOption.tenant_id == conference.tenant_id,
            BookingOption.name == option_data.name,
        )
    )
    if existing.scalar_one_or_none():
        raise ValidationError(f"A booking option named '{option_data.name}' already exists")

    option = BookingOption(
        tenant_id=conference.tenant_id,
        conference_id=conference.id,
        name=option_data.name,
        description=option_data.description,
        sort_order=option_data.sort_order,
        is_active=option_data.is_active,
    )
    db.add(option)

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="booking_option.create",
        resource_type="booking_option",
        resource_id=option.id,
        details={"name": option.name, "conference_id": str(conference.id)},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(option)

    return BookingOptionResponse(
        id=option.id,
        tenant_id=option.tenant_id,
        conference_id=option.conference_id,
        name=option.name,
        description=option.description,
        sort_order=option.sort_order,
        is_active=option.is_active,
        created_at=option.created_at,
        updated_at=option.updated_at,
    )


@router.put("/booking-options/{option_id}", response_model=BookingOptionResponse)
async def update_booking_option(
    conference_id: UUID,
    option_id: UUID,
    option_data: BookingOptionUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> BookingOptionResponse:
    """Update an existing booking option."""
    conference = await _resolve_conference(conference_id, current_user, db)
    await _check_conference_admin(conference_id, current_user, db)

    result = await db.execute(
        select(BookingOption).where(
            BookingOption.id == option_id,
            BookingOption.conference_id == conference.id,
        )
    )
    option = result.scalar_one_or_none()
    if not option:
        raise NotFoundError(f"Booking option with ID '{option_id}' not found")

    # If name is changing, check uniqueness
    if option_data.name is not None and option_data.name != option.name:
        existing = await db.execute(
            select(BookingOption).where(
                BookingOption.conference_id == conference.id,
                BookingOption.tenant_id == conference.tenant_id,
                BookingOption.name == option_data.name,
                BookingOption.id != option_id,
            )
        )
        if existing.scalar_one_or_none():
            raise ValidationError(f"A booking option named '{option_data.name}' already exists")

    update_data = option_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(option, field, value)

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="booking_option.update",
        resource_type="booking_option",
        resource_id=option.id,
        details={"updated_fields": list(update_data.keys())},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(option)

    return BookingOptionResponse(
        id=option.id,
        tenant_id=option.tenant_id,
        conference_id=option.conference_id,
        name=option.name,
        description=option.description,
        sort_order=option.sort_order,
        is_active=option.is_active,
        created_at=option.created_at,
        updated_at=option.updated_at,
    )


@router.delete("/booking-options/{option_id}")
async def delete_booking_option(
    conference_id: UUID,
    option_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete a booking option."""
    conference = await _resolve_conference(conference_id, current_user, db)
    await _check_conference_admin(conference_id, current_user, db)

    result = await db.execute(
        select(BookingOption).where(
            BookingOption.id == option_id,
            BookingOption.conference_id == conference.id,
        )
    )
    option = result.scalar_one_or_none()
    if not option:
        raise NotFoundError(f"Booking option with ID '{option_id}' not found")

    option_name = option.name

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="booking_option.delete",
        resource_type="booking_option",
        resource_id=option.id,
        details={"name": option_name},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.delete(option)

    # Clean up dangling option_id key from all booking_periods prices JSONB
    await db.execute(
        sa.text(
            "UPDATE booking_periods SET prices = prices - :option_key "
            "WHERE conference_id = :conf_id AND tenant_id = :tenant_id AND prices ? :option_key"
        ),
        {"option_key": str(option_id), "conf_id": conference.id, "tenant_id": conference.tenant_id},
    )

    await db.commit()

    return {"message": f"Booking option '{option_name}' deleted successfully"}
