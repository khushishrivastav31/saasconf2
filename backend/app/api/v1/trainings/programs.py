"""Training program year endpoints."""

from uuid import UUID

from fastapi import APIRouter, Request
from sqlalchemy import literal, select

from app.core.dependencies import DbSessionDep, TenantAdminDep, get_client_ip
from app.models.audit import AuditLog
from app.models.training_program import TrainingProgramYear
from app.schemas.training_program import (
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
