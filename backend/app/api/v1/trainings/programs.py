"""Training program year endpoints."""

import datetime
from uuid import UUID

from fastapi import APIRouter, Query, Request
from sqlalchemy import literal, select
from sqlalchemy.orm import joinedload, selectinload

from app.core.dependencies import DbSessionDep, TenantAdminDep, get_client_ip
from app.models.audit import AuditLog
from app.models.trainer import Trainer, TrainerUnavailability
from app.models.training_program import PlacementTrainer, ProgramYearTraining, TrainingProgramYear
from app.schemas.training_program import (
    AvailabilityCheckResponse,
    PlacementTrainerCreate,
    PlacementTrainerResponse,
    ProgramYearTrainingCreate,
    ProgramYearTrainingResponse,
    ProgramYearTrainingUpdate,
    TrainerConflict,
    TrainingProgramYearCreate,
    TrainingProgramYearResponse,
    TrainingProgramYearUpdate,
)

router = APIRouter(prefix="/programs/years", tags=["training-programs"])


def _tenant_filter(current_user: TenantAdminDep):
    if current_user.is_super_admin:
        return literal(True)
    return TrainingProgramYear.tenant_id == current_user.tenant_id


@router.get("", response_model=list[TrainingProgramYearResponse])
async def list_program_years(
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> list[TrainingProgramYearResponse]:
    """List all training program years for the tenant, ordered by year descending."""
    query = select(TrainingProgramYear).where(_tenant_filter(current_user)).order_by(TrainingProgramYear.year.desc())
    result = await db.execute(query)
    years = list(result.scalars().all())
    return [TrainingProgramYearResponse.model_validate(y) for y in years]


@router.post("", response_model=TrainingProgramYearResponse, status_code=201)
async def create_program_year(
    payload: TrainingProgramYearCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> TrainingProgramYearResponse:
    """Create a new training program year."""
    # Check uniqueness
    existing = await db.execute(
        select(TrainingProgramYear).where(
            TrainingProgramYear.tenant_id == current_user.tenant_id,
            TrainingProgramYear.year == payload.year,
        )
    )
    if existing.scalar_one_or_none():
        from app.core.exceptions import ConflictError

        raise ConflictError(f"Program year {payload.year} already exists")

    program_year = TrainingProgramYear(
        tenant_id=current_user.tenant_id,
        year=payload.year,
    )
    db.add(program_year)
    await db.flush()

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="training_program_year.create",
        resource_type="training_program_year",
        resource_id=program_year.id,
        details={"year": payload.year},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()
    await db.refresh(program_year)

    return TrainingProgramYearResponse.model_validate(program_year)


@router.put("/{year_id}", response_model=TrainingProgramYearResponse)
async def update_program_year(
    year_id: UUID,
    payload: TrainingProgramYearUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> TrainingProgramYearResponse:
    """Update a training program year."""
    result = await db.execute(
        select(TrainingProgramYear).where(
            TrainingProgramYear.id == year_id,
            _tenant_filter(current_user),
        )
    )
    program_year = result.scalar_one_or_none()
    if not program_year:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Program year not found")

    if payload.notes is not None:
        program_year.notes = payload.notes or None

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="training_program_year.update",
        resource_type="training_program_year",
        resource_id=program_year.id,
        details={"year": program_year.year},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()
    await db.refresh(program_year)

    return TrainingProgramYearResponse.model_validate(program_year)


@router.delete("/{year_id}")
async def delete_program_year(
    year_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete a training program year (only if draft)."""
    result = await db.execute(
        select(TrainingProgramYear).where(
            TrainingProgramYear.id == year_id,
            _tenant_filter(current_user),
        )
    )
    program_year = result.scalar_one_or_none()
    if not program_year:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Program year not found")

    if program_year.status != "draft":
        from app.core.exceptions import ValidationError

        raise ValidationError("Only draft program years can be deleted")

    year_value = program_year.year
    await db.delete(program_year)

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="training_program_year.delete",
        resource_type="training_program_year",
        resource_id=year_id,
        details={"year": year_value},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()

    return {"message": "Program year deleted"}


@router.post("/{year_id}/publish", response_model=TrainingProgramYearResponse)
async def publish_program_year(
    year_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> TrainingProgramYearResponse:
    """Publish a training program year."""
    result = await db.execute(
        select(TrainingProgramYear).where(
            TrainingProgramYear.id == year_id,
            _tenant_filter(current_user),
        )
    )
    program_year = result.scalar_one_or_none()
    if not program_year:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Program year not found")

    program_year.status = "published"

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="training_program_year.publish",
        resource_type="training_program_year",
        resource_id=program_year.id,
        details={"year": program_year.year},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()
    await db.refresh(program_year)

    return TrainingProgramYearResponse.model_validate(program_year)


@router.post("/{year_id}/unpublish", response_model=TrainingProgramYearResponse)
async def unpublish_program_year(
    year_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> TrainingProgramYearResponse:
    """Unpublish a training program year (revert to draft)."""
    result = await db.execute(
        select(TrainingProgramYear).where(
            TrainingProgramYear.id == year_id,
            _tenant_filter(current_user),
        )
    )
    program_year = result.scalar_one_or_none()
    if not program_year:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Program year not found")

    program_year.status = "draft"

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="training_program_year.unpublish",
        resource_type="training_program_year",
        resource_id=program_year.id,
        details={"year": program_year.year},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()
    await db.refresh(program_year)

    return TrainingProgramYearResponse.model_validate(program_year)


# --- Program Year Training Placements ---


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
        from app.core.exceptions import NotFoundError

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
        from app.core.exceptions import NotFoundError

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
        from app.core.exceptions import NotFoundError

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


# --- Placement Trainer Assignments ---


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
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Placement not found")

    # Verify trainer exists and belongs to tenant
    trainer_result = await db.execute(
        select(Trainer).where(
            Trainer.id == trainer_id,
            Trainer.tenant_id == current_user.tenant_id,
        )
    )
    if not trainer_result.scalar_one_or_none():
        from app.core.exceptions import NotFoundError

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
        from app.core.exceptions import NotFoundError

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
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Trainer not found")

    # Check uniqueness
    existing = await db.execute(
        select(PlacementTrainer).where(
            PlacementTrainer.placement_id == placement_id,
            PlacementTrainer.trainer_id == payload.trainer_id,
        )
    )
    if existing.scalar_one_or_none():
        from app.core.exceptions import ConflictError

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
        from app.core.exceptions import NotFoundError

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
