"""Program time slot endpoints."""

from datetime import timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select

from app.core.dependencies import CurrentUserDep, DbSessionDep, get_client_ip, require_module
from app.core.exceptions import NotFoundError, ValidationError
from app.models.audit import AuditLog
from app.models.program import ProgramDay, ProgramSession, ProgramTimeSlot
from app.schemas.program import (
    ProgramTimeSlotBatchCreate,
    ProgramTimeSlotCreate,
    ProgramTimeSlotListResponse,
    ProgramTimeSlotResponse,
    ProgramTimeSlotUpdate,
)

from ._shared import MODULE_CODE, _build_slot_response, _check_admin_access, _get_conference_for_tenant

router = APIRouter()


@router.get(
    "/days/{day_id}/slots",
    response_model=ProgramTimeSlotListResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def list_slots(
    conference_id: UUID,
    day_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> ProgramTimeSlotListResponse:
    """List all time slots for a day."""
    await _get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    # Verify day exists
    day_result = await db.execute(
        select(ProgramDay).where(
            ProgramDay.id == day_id,
            ProgramDay.conference_id == conference_id,
        )
    )
    if not day_result.scalar_one_or_none():
        raise NotFoundError(f"Program day with ID '{day_id}' not found")

    result = await db.execute(
        select(ProgramTimeSlot)
        .where(ProgramTimeSlot.program_day_id == day_id)
        .order_by(ProgramTimeSlot.sort_order, ProgramTimeSlot.start_time)
    )
    slots = result.scalars().all()

    return ProgramTimeSlotListResponse(
        items=[_build_slot_response(s) for s in slots],
        total=len(slots),
    )


@router.post(
    "/days/{day_id}/slots",
    response_model=ProgramTimeSlotResponse,
    status_code=201,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def create_slot(
    conference_id: UUID,
    day_id: UUID,
    slot_data: ProgramTimeSlotCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> ProgramTimeSlotResponse:
    """Create a new time slot."""
    await _check_admin_access(db, current_user, conference_id)
    await _get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    # Verify day exists
    day_result = await db.execute(
        select(ProgramDay).where(
            ProgramDay.id == day_id,
            ProgramDay.conference_id == conference_id,
        )
    )
    day = day_result.scalar_one_or_none()
    if not day:
        raise NotFoundError(f"Program day with ID '{day_id}' not found")

    # Validate times
    if slot_data.end_time <= slot_data.start_time:
        raise ValidationError("End time must be after start time")

    # Check for duplicate
    existing = await db.execute(
        select(ProgramTimeSlot).where(
            ProgramTimeSlot.program_day_id == day_id,
            ProgramTimeSlot.start_time == slot_data.start_time,
        )
    )
    if existing.scalar_one_or_none():
        raise ValidationError(f"A slot starting at {slot_data.start_time} already exists")

    slot = ProgramTimeSlot(
        tenant_id=current_user.tenant_id,
        program_day_id=day_id,
        start_time=slot_data.start_time,
        end_time=slot_data.end_time,
        sort_order=slot_data.sort_order,
        is_session_free=slot_data.is_session_free,
    )
    db.add(slot)
    await db.flush()  # Flush to get the ID

    db.add(
        AuditLog(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action="program_slot.create",
            resource_type="program_time_slot",
            resource_id=str(slot.id),
            details={"start_time": str(slot_data.start_time), "end_time": str(slot_data.end_time)},
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
    )

    await db.commit()
    await db.refresh(slot)
    return _build_slot_response(slot)


@router.post(
    "/days/{day_id}/slots/batch",
    response_model=ProgramTimeSlotListResponse,
    status_code=201,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def create_slots_batch(
    conference_id: UUID,
    day_id: UUID,
    batch_data: ProgramTimeSlotBatchCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> ProgramTimeSlotListResponse:
    """Create multiple time slots at regular intervals."""
    await _check_admin_access(db, current_user, conference_id)
    await _get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    # Verify day exists
    day_result = await db.execute(
        select(ProgramDay).where(
            ProgramDay.id == day_id,
            ProgramDay.conference_id == conference_id,
        )
    )
    day = day_result.scalar_one_or_none()
    if not day:
        raise NotFoundError(f"Program day with ID '{day_id}' not found")

    # Validate times
    if batch_data.end_time <= batch_data.start_time:
        raise ValidationError("End time must be after start time")

    # Get existing slots
    existing_result = await db.execute(
        select(ProgramTimeSlot.start_time).where(ProgramTimeSlot.program_day_id == day_id)
    )
    existing_starts = {row[0] for row in existing_result.all()}

    # Generate slots
    from datetime import datetime, time as dt_time

    created = []
    current_start = datetime.combine(datetime.today(), batch_data.start_time)
    end_limit = datetime.combine(datetime.today(), batch_data.end_time)
    interval = timedelta(minutes=batch_data.interval_minutes)
    sort_order = 0

    while current_start < end_limit:
        current_end = current_start + interval
        if current_end > end_limit:
            current_end = end_limit

        start_t = current_start.time()
        end_t = current_end.time()

        if start_t not in existing_starts:
            slot = ProgramTimeSlot(
                tenant_id=current_user.tenant_id,
                program_day_id=day_id,
                start_time=start_t,
                end_time=end_t,
                sort_order=sort_order,
            )
            db.add(slot)
            created.append(slot)

        current_start = current_end
        sort_order += 1

    if created:
        db.add(
            AuditLog(
                tenant_id=current_user.tenant_id,
                user_id=current_user.user_id,
                action="program_slot.batch_create",
                resource_type="program_time_slot",
                resource_id=str(day_id),
                details={"created_count": len(created), "interval_minutes": batch_data.interval_minutes},
                ip_address=get_client_ip(request),
                user_agent=request.headers.get("user-agent"),
            )
        )
        await db.commit()
        for slot in created:
            await db.refresh(slot)

    return ProgramTimeSlotListResponse(
        items=[_build_slot_response(s) for s in created],
        total=len(created),
    )


@router.put(
    "/slots/{slot_id}",
    response_model=ProgramTimeSlotResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def update_slot(
    conference_id: UUID,
    slot_id: UUID,
    slot_data: ProgramTimeSlotUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> ProgramTimeSlotResponse:
    """Update a time slot."""
    await _check_admin_access(db, current_user, conference_id)
    await _get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    result = await db.execute(
        select(ProgramTimeSlot)
        .join(ProgramDay, ProgramTimeSlot.program_day_id == ProgramDay.id)
        .where(
            ProgramTimeSlot.id == slot_id,
            ProgramDay.conference_id == conference_id,
            ProgramTimeSlot.tenant_id == current_user.tenant_id,
        )
    )
    slot = result.scalar_one_or_none()
    if not slot:
        raise NotFoundError(f"Time slot with ID '{slot_id}' not found")

    if slot_data.start_time is not None:
        slot.start_time = slot_data.start_time
    if slot_data.end_time is not None:
        slot.end_time = slot_data.end_time
    if slot_data.sort_order is not None:
        slot.sort_order = slot_data.sort_order
    if slot_data.is_session_free is not None:
        slot.is_session_free = slot_data.is_session_free

    # Validate times
    if slot.end_time <= slot.start_time:
        raise ValidationError("End time must be after start time")

    db.add(
        AuditLog(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action="program_slot.update",
            resource_type="program_time_slot",
            resource_id=str(slot_id),
            details=slot_data.model_dump(mode="json", exclude_unset=True),
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
    )

    await db.commit()
    await db.refresh(slot)
    return _build_slot_response(slot)


@router.delete(
    "/slots/{slot_id}",
    status_code=204,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def delete_slot(
    conference_id: UUID,
    slot_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> None:
    """Delete a time slot. Fails if sessions reference it."""
    await _check_admin_access(db, current_user, conference_id)
    await _get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    result = await db.execute(
        select(ProgramTimeSlot)
        .join(ProgramDay, ProgramTimeSlot.program_day_id == ProgramDay.id)
        .where(
            ProgramTimeSlot.id == slot_id,
            ProgramDay.conference_id == conference_id,
            ProgramTimeSlot.tenant_id == current_user.tenant_id,
        )
    )
    slot = result.scalar_one_or_none()
    if not slot:
        raise NotFoundError(f"Time slot with ID '{slot_id}' not found")

    # Check for sessions using this slot
    session_count = await db.execute(
        select(func.count()).where(ProgramSession.start_slot_id == slot_id)
    )
    count = session_count.scalar() or 0
    if count > 0:
        raise ValidationError(f"Cannot delete slot: {count} session(s) use this time slot")

    db.add(
        AuditLog(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action="program_slot.delete",
            resource_type="program_time_slot",
            resource_id=str(slot_id),
            details={"start_time": str(slot.start_time)},
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
    )

    await db.delete(slot)
    await db.commit()
