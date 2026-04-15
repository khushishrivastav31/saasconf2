"""Inhouse training CRUD endpoints."""

from uuid import UUID

from fastapi import APIRouter, Query, Request
from sqlalchemy import func, literal, select
from sqlalchemy.orm import joinedload

from app.core.dependencies import DbSessionDep, TenantAdminDep, get_client_ip
from app.core.exceptions import NotFoundError
from app.models.audit import AuditLog
from app.models.inhouse_training import InhouseTraining
from app.schemas.inhouse_training import (
    InhouseTrainingCreate,
    InhouseTrainingResponse,
    InhouseTrainingUpdate,
)

router = APIRouter(prefix="/inhouse", tags=["inhouse-trainings"])


def _tenant_filter(current_user: TenantAdminDep):
    if current_user.is_super_admin:
        return literal(True)
    return InhouseTraining.tenant_id == current_user.tenant_id


def _to_response(it: InhouseTraining) -> InhouseTrainingResponse:
    data = InhouseTrainingResponse.model_validate(it)
    data.customer_name = it.customer.name if it.customer else None
    data.training_name = it.training.name if it.training else None
    if it.trainer:
        data.trainer_name = f"{it.trainer.first_name} {it.trainer.last_name}"
    return data


@router.get("", response_model=dict)
async def list_inhouse_trainings(
    current_user: TenantAdminDep,
    db: DbSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    search: str | None = Query(None),
    status: str | None = Query(None),
) -> dict:
    """List inhouse trainings sorted by start_date desc."""
    base = select(InhouseTraining).where(_tenant_filter(current_user))

    if status:
        base = base.where(InhouseTraining.status == status)

    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    items_q = (
        base.options(
            joinedload(InhouseTraining.customer),
            joinedload(InhouseTraining.training),
            joinedload(InhouseTraining.trainer),
        )
        .order_by(InhouseTraining.start_date.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await db.execute(items_q)
    items = [_to_response(it) for it in result.scalars().unique().all()]

    # Apply search filter post-load (needs joined relations)
    if search:
        q = search.lower()
        items = [
            i
            for i in items
            if (i.training_name and q in i.training_name.lower())
            or (i.customer_name and q in i.customer_name.lower())
            or (i.trainer_name and q in i.trainer_name.lower())
        ]

    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/{inhouse_id}", response_model=InhouseTrainingResponse)
async def get_inhouse_training(
    inhouse_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> InhouseTrainingResponse:
    """Get a single inhouse training."""
    result = await db.execute(
        select(InhouseTraining).where(InhouseTraining.id == inhouse_id, _tenant_filter(current_user))
    )
    it = result.scalar_one_or_none()
    if not it:
        raise NotFoundError("Inhouse training not found")
    return _to_response(it)


@router.post("", response_model=InhouseTrainingResponse, status_code=201)
async def create_inhouse_training(
    data: InhouseTrainingCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> InhouseTrainingResponse:
    """Create a new inhouse training."""
    it = InhouseTraining(tenant_id=current_user.tenant_id, **data.model_dump())
    db.add(it)

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="inhouse_training.create",
        resource_type="inhouse_training",
        details={"training_id": str(data.training_id), "customer_id": str(data.customer_id)},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()
    await db.refresh(it)
    return _to_response(it)


@router.put("/{inhouse_id}", response_model=InhouseTrainingResponse)
async def update_inhouse_training(
    inhouse_id: UUID,
    data: InhouseTrainingUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> InhouseTrainingResponse:
    """Update an inhouse training."""
    result = await db.execute(
        select(InhouseTraining).where(InhouseTraining.id == inhouse_id, _tenant_filter(current_user))
    )
    it = result.scalar_one_or_none()
    if not it:
        raise NotFoundError("Inhouse training not found")

    update_data = data.model_dump(exclude_unset=True)

    # Validate end_date >= start_date when updating one of them
    new_start = update_data.get("start_date", it.start_date)
    new_end = update_data.get("end_date", it.end_date)
    if new_end < new_start:
        from app.core.exceptions import ValidationError

        raise ValidationError("end_date must be >= start_date")

    for key, value in update_data.items():
        setattr(it, key, value)

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="inhouse_training.update",
        resource_type="inhouse_training",
        resource_id=inhouse_id,
        details=update_data,
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()
    await db.refresh(it)
    return _to_response(it)


@router.delete("/{inhouse_id}")
async def delete_inhouse_training(
    inhouse_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete an inhouse training."""
    result = await db.execute(
        select(InhouseTraining).where(InhouseTraining.id == inhouse_id, _tenant_filter(current_user))
    )
    it = result.scalar_one_or_none()
    if not it:
        raise NotFoundError("Inhouse training not found")

    await db.delete(it)

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="inhouse_training.delete",
        resource_type="inhouse_training",
        resource_id=inhouse_id,
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()
    return {"message": "Inhouse training deleted"}
