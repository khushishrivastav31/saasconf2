"""Syllabus CRUD endpoints for training module."""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    TenantAdminDep,
    require_module,
)
from app.core.exceptions import NotFoundError
from app.models.syllabus import Syllabus
from app.schemas.syllabus import (
    SyllabusCreate,
    SyllabusListResponse,
    SyllabusResponse,
    SyllabusUpdate,
)

from ._shared import MODULE_CODE

router = APIRouter()


def _build_response(s: Syllabus) -> SyllabusResponse:
    return SyllabusResponse(
        id=s.id,
        tenant_id=s.tenant_id,
        slug=s.slug,
        name=s.name,
        description=s.description,
        price=float(s.price) if s.price is not None else None,
        exam_cost=float(s.exam_cost) if s.exam_cost is not None else None,
        certification_body_id=s.certification_body_id,
        certification_body_name=s.certification_body.company_name if s.certification_body else None,
        language_id=s.language_id,
        language_name=s.language.name if s.language else None,
        created_at=s.created_at,
        updated_at=s.updated_at,
    )


@router.get(
    "/syllabi",
    response_model=SyllabusListResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def list_syllabi(
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> SyllabusListResponse:
    """List all syllabi for the current tenant."""
    query = (
        select(Syllabus)
        .options(joinedload(Syllabus.certification_body), joinedload(Syllabus.language))
        .where(Syllabus.tenant_id == current_user.tenant_id)
        .order_by(Syllabus.name)
    )
    result = await db.execute(query)
    items = list(result.scalars().unique().all())

    return SyllabusListResponse(
        items=[_build_response(s) for s in items],
        total=len(items),
    )


@router.post(
    "/syllabi",
    response_model=SyllabusResponse,
    status_code=201,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def create_syllabus(
    data: SyllabusCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> SyllabusResponse:
    """Create a new syllabus."""
    s = Syllabus(
        tenant_id=current_user.tenant_id,
        slug=data.slug,
        name=data.name,
        description=data.description,
        price=data.price,
        exam_cost=data.exam_cost,
        certification_body_id=data.certification_body_id,
        language_id=data.language_id,
    )
    db.add(s)
    await db.commit()
    await db.refresh(s)

    return _build_response(s)


@router.put(
    "/syllabi/{syllabus_id}",
    response_model=SyllabusResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def update_syllabus(
    syllabus_id: UUID,
    data: SyllabusUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> SyllabusResponse:
    """Update a syllabus."""
    result = await db.execute(
        select(Syllabus).where(
            Syllabus.id == syllabus_id,
            Syllabus.tenant_id == current_user.tenant_id,
        )
    )
    s = result.scalar_one_or_none()

    if not s:
        raise NotFoundError(f"Syllabus with ID '{syllabus_id}' not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(s, field, value)

    await db.commit()
    await db.refresh(s)

    return _build_response(s)


@router.delete(
    "/syllabi/{syllabus_id}",
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def delete_syllabus(
    syllabus_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Delete a syllabus."""
    result = await db.execute(
        select(Syllabus).where(
            Syllabus.id == syllabus_id,
            Syllabus.tenant_id == current_user.tenant_id,
        )
    )
    s = result.scalar_one_or_none()

    if not s:
        raise NotFoundError(f"Syllabus with ID '{syllabus_id}' not found")

    await db.delete(s)
    await db.commit()

    return {"message": f"Syllabus '{s.name}' deleted successfully"}
