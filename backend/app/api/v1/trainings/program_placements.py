"""Program year training placement endpoints (CRUD)."""

import logging
from uuid import UUID

from fastapi import APIRouter, Request
from sqlalchemy import func, select
from sqlalchemy.orm import joinedload, selectinload

from app.core.dependencies import DbSessionDep, TenantAdminDep, get_client_ip
from app.core.exceptions import ConflictError, NotFoundError
from app.models.audit import AuditLog
from app.models.customer_offer import CustomerOffer
from app.models.offer_attendee import OfferAttendee
from app.models.training_program import (
    PlacementTrainer,
    ProgramYearTraining,
    TrainingProgramYear,
)
from app.models.training_registration import TrainingRegistration
from app.schemas.training_program import (
    PlacementTrainerResponse,
    ProgramYearTrainingCreate,
    ProgramYearTrainingResponse,
    ProgramYearTrainingUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/programs/years", tags=["training-programs"])


def _placement_to_response(p: ProgramYearTraining) -> ProgramYearTrainingResponse:
    """Convert a ProgramYearTraining to its response schema with training details."""
    trainer_assignments = []
    for ta in p.trainer_assignments or []:
        trainer_assignments.append(
            PlacementTrainerResponse(
                id=ta.id,
                placement_id=ta.placement_id,
                trainer_id=ta.trainer_id,
                trainer_first_name=ta.trainer.first_name,
                trainer_last_name=ta.trainer.last_name,
                created_at=ta.created_at,
            )
        )
    return ProgramYearTrainingResponse(
        id=p.id,
        program_year_id=p.program_year_id,
        training_id=p.training_id,
        training_name=p.training.name,
        training_slug=p.training.slug,
        training_abbreviation=p.training.abbreviation,
        training_duration=p.training.duration,
        training_color=p.training.color,
        location_id=p.location_id,
        location_name=p.location.name if p.location else None,
        location_code=p.location.code if p.location else None,
        start_date=p.start_date,
        placement_type=p.placement_type or "open",
        customer_id=p.customer_id,
        customer_name=p.customer.name if p.customer else None,
        offer_id=p.offer_id,
        is_guaranteed=p.is_guaranteed or False,
        is_active=bool(p.is_active),
        created_at=p.created_at,
        updated_at=p.updated_at,
        trainer_assignments=trainer_assignments,
    )


@router.get("/{year_id}/trainings", response_model=list[ProgramYearTrainingResponse])
async def list_year_trainings(
    year_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> list[ProgramYearTrainingResponse]:
    """List all training placements for a program year."""
    result = await db.execute(
        select(ProgramYearTraining)
        .options(
            joinedload(ProgramYearTraining.training),
            joinedload(ProgramYearTraining.location),
            selectinload(ProgramYearTraining.trainer_assignments).joinedload(PlacementTrainer.trainer),
        )
        .where(
            ProgramYearTraining.program_year_id == year_id,
            ProgramYearTraining.tenant_id == current_user.tenant_id,
        )
        .order_by(ProgramYearTraining.start_date, ProgramYearTraining.created_at)
    )
    placements = list(result.scalars().unique().all())
    return [_placement_to_response(p) for p in placements]


@router.post("/{year_id}/trainings", response_model=ProgramYearTrainingResponse, status_code=201)
async def create_year_training(
    year_id: UUID,
    payload: ProgramYearTrainingCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> ProgramYearTrainingResponse:
    """Place a training on the program year calendar."""
    # Verify program year exists and belongs to tenant
    py_result = await db.execute(
        select(TrainingProgramYear).where(
            TrainingProgramYear.id == year_id,
            TrainingProgramYear.tenant_id == current_user.tenant_id,
        )
    )
    if not py_result.scalar_one_or_none():
        raise NotFoundError("Program year not found")

    placement = ProgramYearTraining(
        tenant_id=current_user.tenant_id,
        program_year_id=year_id,
        training_id=payload.training_id,
        start_date=payload.start_date,
        location_id=payload.location_id,
    )
    db.add(placement)
    await db.flush()

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="program_year_training.create",
        resource_type="program_year_training",
        resource_id=placement.id,
        details={"training_id": str(payload.training_id), "start_date": str(payload.start_date)},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()

    # Reload with training relationship
    result = await db.execute(
        select(ProgramYearTraining)
        .options(joinedload(ProgramYearTraining.training), joinedload(ProgramYearTraining.location))
        .where(ProgramYearTraining.id == placement.id)
    )
    placement = result.scalar_one()
    return _placement_to_response(placement)


@router.delete("/{year_id}/trainings/{placement_id}")
async def delete_year_training(
    year_id: UUID,
    placement_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Remove a training placement from the program year calendar."""
    result = await db.execute(
        select(ProgramYearTraining).where(
            ProgramYearTraining.id == placement_id,
            ProgramYearTraining.program_year_id == year_id,
            ProgramYearTraining.tenant_id == current_user.tenant_id,
        )
    )
    placement = result.scalar_one_or_none()
    if not placement:
        raise NotFoundError("Placement not found")

    await db.delete(placement)

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="program_year_training.delete",
        resource_type="program_year_training",
        resource_id=placement_id,
        details={"training_id": str(placement.training_id), "start_date": str(placement.start_date)},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()

    return {"message": "Placement deleted"}


@router.put("/{year_id}/trainings/{placement_id}", response_model=ProgramYearTrainingResponse)
async def update_year_training(
    year_id: UUID,
    placement_id: UUID,
    payload: ProgramYearTrainingUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> ProgramYearTrainingResponse:
    """Update a training placement (location, start date)."""
    result = await db.execute(
        select(ProgramYearTraining).where(
            ProgramYearTraining.id == placement_id,
            ProgramYearTraining.program_year_id == year_id,
            ProgramYearTraining.tenant_id == current_user.tenant_id,
        )
    )
    placement = result.scalar_one_or_none()
    if not placement:
        raise NotFoundError("Placement not found")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(placement, field, value)

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="program_year_training.update",
        resource_type="program_year_training",
        resource_id=placement_id,
        details={"updated_fields": list(update_data.keys())},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()

    # Expire cached instance so relationships are freshly loaded
    db.expire(placement)

    # Reload with relationships
    result = await db.execute(
        select(ProgramYearTraining)
        .options(
            joinedload(ProgramYearTraining.training),
            joinedload(ProgramYearTraining.location),
            selectinload(ProgramYearTraining.trainer_assignments).joinedload(PlacementTrainer.trainer),
        )
        .where(ProgramYearTraining.id == placement_id)
    )
    placement = result.scalar_one()
    return _placement_to_response(placement)


@router.patch("/{year_id}/trainings/{placement_id}/guaranteed", response_model=ProgramYearTrainingResponse)
async def toggle_placement_guaranteed(
    year_id: UUID,
    placement_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> ProgramYearTrainingResponse:
    """Toggle the is_guaranteed flag on a placement."""
    result = await db.execute(
        select(ProgramYearTraining).where(
            ProgramYearTraining.id == placement_id,
            ProgramYearTraining.program_year_id == year_id,
            ProgramYearTraining.tenant_id == current_user.tenant_id,
        )
    )
    placement = result.scalar_one_or_none()
    if not placement:
        raise NotFoundError("Placement not found")

    placement.is_guaranteed = not placement.is_guaranteed
    await db.commit()
    db.expire(placement)

    result = await db.execute(
        select(ProgramYearTraining)
        .options(
            joinedload(ProgramYearTraining.training),
            joinedload(ProgramYearTraining.location),
            selectinload(ProgramYearTraining.trainer_assignments).joinedload(PlacementTrainer.trainer),
        )
        .where(ProgramYearTraining.id == placement_id)
    )
    placement = result.scalar_one()
    return _placement_to_response(placement)


@router.patch("/{year_id}/trainings/{placement_id}/active", response_model=ProgramYearTrainingResponse)
async def toggle_placement_active(
    year_id: UUID,
    placement_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> ProgramYearTrainingResponse:
    """Toggle the is_active flag on a placement.

    Deactivating requires zero registrations and zero offer-attendees on the
    placement. Reactivating is always allowed.
    """
    result = await db.execute(
        select(ProgramYearTraining).where(
            ProgramYearTraining.id == placement_id,
            ProgramYearTraining.program_year_id == year_id,
            ProgramYearTraining.tenant_id == current_user.tenant_id,
        )
    )
    placement = result.scalar_one_or_none()
    if not placement:
        raise NotFoundError("Placement not found")

    if placement.is_active:
        reg_count = (
            await db.execute(
                select(func.count(TrainingRegistration.id)).where(
                    TrainingRegistration.placement_id == placement_id,
                    TrainingRegistration.tenant_id == current_user.tenant_id,
                    TrainingRegistration.status != "cancelled",
                )
            )
        ).scalar() or 0
        oa_count = (
            await db.execute(
                select(func.count(OfferAttendee.id))
                .join(CustomerOffer, OfferAttendee.offer_id == CustomerOffer.id)
                .where(
                    OfferAttendee.placement_id == placement_id,
                    OfferAttendee.tenant_id == current_user.tenant_id,
                    CustomerOffer.status == "accepted",
                )
            )
        ).scalar() or 0
        if reg_count + oa_count > 0:
            raise ConflictError("Cannot deactivate a placement with attendees")

    placement.is_active = not placement.is_active
    await db.commit()
    db.expire(placement)

    result = await db.execute(
        select(ProgramYearTraining)
        .options(
            joinedload(ProgramYearTraining.training),
            joinedload(ProgramYearTraining.location),
            selectinload(ProgramYearTraining.trainer_assignments).joinedload(PlacementTrainer.trainer),
        )
        .where(ProgramYearTraining.id == placement_id)
    )
    placement = result.scalar_one()
    return _placement_to_response(placement)
