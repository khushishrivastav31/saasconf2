"""Trainer assignment endpoints for program year placements."""

import datetime
import logging
from uuid import UUID

from fastapi import APIRouter, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.core.dependencies import DbSessionDep, TenantAdminDep, get_client_ip
from app.core.exceptions import ConflictError, NotFoundError
from app.models.audit import AuditLog
from app.models.trainer import Trainer, TrainerUnavailability
from app.models.training_program import (
    PlacementTrainer,
    ProgramYearTraining,
)
from app.schemas.training_program import (
    AvailabilityCheckResponse,
    PlacementTrainerCreate,
    PlacementTrainerResponse,
    TrainerConflict,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/programs/years", tags=["training-programs"])


def _compute_placement_end(p: ProgramYearTraining) -> datetime.date:
    """Compute the end date of a placement based on training duration."""
    duration = p.training.duration if p.training.duration else 1
    return p.start_date + datetime.timedelta(days=duration - 1)


async def _check_trainer_conflicts(
    db: DbSessionDep,
    trainer_id: UUID,
    placement: ProgramYearTraining,
    tenant_id: UUID,
) -> list[TrainerConflict]:
    """Check for unavailability and double-booking conflicts."""
    conflicts: list[TrainerConflict] = []
    p_start = placement.start_date
    p_end = _compute_placement_end(placement)

    # 1. Check trainer unavailability
    unavail_result = await db.execute(
        select(TrainerUnavailability).where(
            TrainerUnavailability.trainer_id == trainer_id,
            TrainerUnavailability.tenant_id == tenant_id,
            TrainerUnavailability.start_date <= p_end,
            TrainerUnavailability.end_date >= p_start,
        )
    )
    for u in unavail_result.scalars().all():
        conflicts.append(
            TrainerConflict(
                type="unavailability",
                description=u.description or "Trainer is unavailable during this period",
                start_date=u.start_date,
                end_date=u.end_date,
            )
        )

    # 2. Check double-booking: trainer already assigned to another placement with overlapping dates
    other_assignments = await db.execute(
        select(PlacementTrainer)
        .join(ProgramYearTraining, PlacementTrainer.placement_id == ProgramYearTraining.id)
        .options(
            joinedload(PlacementTrainer.placement).joinedload(ProgramYearTraining.training),
        )
        .where(
            PlacementTrainer.trainer_id == trainer_id,
            PlacementTrainer.tenant_id == tenant_id,
            PlacementTrainer.placement_id != placement.id,
            ProgramYearTraining.program_year_id == placement.program_year_id,
        )
    )
    for oa in other_assignments.scalars().unique().all():
        other_p = oa.placement
        other_start = other_p.start_date
        other_end = _compute_placement_end(other_p)
        if other_start <= p_end and other_end >= p_start:
            training_name = other_p.training.name if other_p.training else "Unknown"
            conflicts.append(
                TrainerConflict(
                    type="double_booking",
                    description=f"Trainer is already assigned to '{training_name}' ({other_start} – {other_end})",
                    start_date=other_start,
                    end_date=other_end,
                    other_training_name=training_name,
                    other_placement_id=other_p.id,
                )
            )

    return conflicts


@router.get("/{year_id}/trainings/{placement_id}/check-trainer", response_model=AvailabilityCheckResponse)
async def check_trainer_availability(
    year_id: UUID,
    placement_id: UUID,
    trainer_id: UUID = Query(...),
    current_user: TenantAdminDep = ...,
    db: DbSessionDep = ...,
) -> AvailabilityCheckResponse:
    """Check if a trainer is available for a given placement."""
    result = await db.execute(
        select(ProgramYearTraining)
        .options(joinedload(ProgramYearTraining.training))
        .where(
            ProgramYearTraining.id == placement_id,
            ProgramYearTraining.program_year_id == year_id,
            ProgramYearTraining.tenant_id == current_user.tenant_id,
        )
    )
    placement = result.scalar_one_or_none()
    if not placement:
        raise NotFoundError("Placement not found")

    # Verify trainer exists and belongs to tenant
    trainer_result = await db.execute(
        select(Trainer).where(
            Trainer.id == trainer_id,
            Trainer.tenant_id == current_user.tenant_id,
        )
    )
    if not trainer_result.scalar_one_or_none():
        raise NotFoundError("Trainer not found")

    conflicts = await _check_trainer_conflicts(db, trainer_id, placement, current_user.tenant_id)
    return AvailabilityCheckResponse(available=len(conflicts) == 0, conflicts=conflicts)


@router.post(
    "/{year_id}/trainings/{placement_id}/trainers",
    response_model=PlacementTrainerResponse,
    status_code=201,
)
async def assign_trainer_to_placement(
    year_id: UUID,
    placement_id: UUID,
    payload: PlacementTrainerCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> PlacementTrainerResponse:
    """Assign a trainer to a training placement."""
    # Verify placement
    result = await db.execute(
        select(ProgramYearTraining).where(
            ProgramYearTraining.id == placement_id,
            ProgramYearTraining.program_year_id == year_id,
            ProgramYearTraining.tenant_id == current_user.tenant_id,
        )
    )
    if not result.scalar_one_or_none():
        raise NotFoundError("Placement not found")

    # Verify trainer
    trainer_result = await db.execute(
        select(Trainer).where(
            Trainer.id == payload.trainer_id,
            Trainer.tenant_id == current_user.tenant_id,
        )
    )
    trainer = trainer_result.scalar_one_or_none()
    if not trainer:
        raise NotFoundError("Trainer not found")

    # Check uniqueness
    existing = await db.execute(
        select(PlacementTrainer).where(
            PlacementTrainer.placement_id == placement_id,
            PlacementTrainer.trainer_id == payload.trainer_id,
        )
    )
    if existing.scalar_one_or_none():
        raise ConflictError("Trainer is already assigned to this placement")

    assignment = PlacementTrainer(
        tenant_id=current_user.tenant_id,
        placement_id=placement_id,
        trainer_id=payload.trainer_id,
    )
    db.add(assignment)
    await db.flush()

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="placement_trainer.assign",
        resource_type="placement_trainer",
        resource_id=assignment.id,
        details={"placement_id": str(placement_id), "trainer_id": str(payload.trainer_id)},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()
    await db.refresh(assignment)

    return PlacementTrainerResponse(
        id=assignment.id,
        placement_id=assignment.placement_id,
        trainer_id=assignment.trainer_id,
        trainer_first_name=trainer.first_name,
        trainer_last_name=trainer.last_name,
        created_at=assignment.created_at,
    )


@router.delete("/{year_id}/trainings/{placement_id}/trainers/{assignment_id}")
async def remove_trainer_from_placement(
    year_id: UUID,
    placement_id: UUID,
    assignment_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Remove a trainer assignment from a placement."""
    result = await db.execute(
        select(PlacementTrainer).where(
            PlacementTrainer.id == assignment_id,
            PlacementTrainer.placement_id == placement_id,
            PlacementTrainer.tenant_id == current_user.tenant_id,
        )
    )
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise NotFoundError("Trainer assignment not found")

    await db.delete(assignment)

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="placement_trainer.remove",
        resource_type="placement_trainer",
        resource_id=assignment_id,
        details={"placement_id": str(placement_id), "trainer_id": str(assignment.trainer_id)},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()

    return {"message": "Trainer removed from placement"}
