"""Training program year endpoints."""

from uuid import UUID

from fastapi import APIRouter, Request
from sqlalchemy import literal, select
from sqlalchemy.orm import joinedload

from app.core.dependencies import DbSessionDep, TenantAdminDep, get_client_ip
from app.models.audit import AuditLog
from app.models.training_program import ProgramYearTraining, TrainingProgramYear
from app.schemas.training_program import (
    ProgramYearTrainingCreate,
    ProgramYearTrainingResponse,
    ProgramYearTrainingUpdate,
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
        .options(joinedload(ProgramYearTraining.training), joinedload(ProgramYearTraining.location))
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
        .options(joinedload(ProgramYearTraining.training), joinedload(ProgramYearTraining.location))
        .where(ProgramYearTraining.id == placement_id)
    )
    placement = result.scalar_one()
    return _placement_to_response(placement)
