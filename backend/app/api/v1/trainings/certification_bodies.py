"""Certification body CRUD endpoints for training module."""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    TenantAdminDep,
    require_module,
)
from app.core.exceptions import NotFoundError
from app.models.certification_body import CertificationBody
from app.schemas.certification_body import (
    CertificationBodyCreate,
    CertificationBodyListResponse,
    CertificationBodyResponse,
    CertificationBodyUpdate,
)
from app.schemas.location import LocationContactPersonResponse

from ._shared import MODULE_CODE

router = APIRouter()


def _build_response(cb: CertificationBody) -> CertificationBodyResponse:
    contact_persons = [
        LocationContactPersonResponse(
            first_name=cp.get("first_name", ""),
            last_name=cp.get("last_name", ""),
            email=cp.get("email"),
            phone=cp.get("phone"),
            comment=cp.get("comment"),
        )
        for cp in (cb.contact_persons or [])
    ]
    return CertificationBodyResponse(
        id=cb.id,
        tenant_id=cb.tenant_id,
        company_name=cb.company_name,
        service_description=cb.service_description,
        phone=cb.phone,
        email=cb.email,
        website=cb.website,
        address_line1=cb.address_line1,
        address_line2=cb.address_line2,
        city=cb.city,
        state=cb.state,
        postal_code=cb.postal_code,
        country=cb.country,
        vat_number=cb.vat_number,
        contact_persons=contact_persons,
        created_at=cb.created_at,
        updated_at=cb.updated_at,
    )


@router.get(
    "/certification-bodies",
    response_model=CertificationBodyListResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def list_certification_bodies(
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> CertificationBodyListResponse:
    """List all certification bodies for the current tenant."""
    query = (
        select(CertificationBody)
        .where(CertificationBody.tenant_id == current_user.tenant_id)
        .order_by(CertificationBody.company_name)
    )
    result = await db.execute(query)
    bodies = list(result.scalars().all())

    return CertificationBodyListResponse(
        items=[_build_response(cb) for cb in bodies],
        total=len(bodies),
    )


@router.post(
    "/certification-bodies",
    response_model=CertificationBodyResponse,
    status_code=201,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def create_certification_body(
    body_data: CertificationBodyCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> CertificationBodyResponse:
    """Create a new certification body."""
    cb = CertificationBody(
        tenant_id=current_user.tenant_id,
        company_name=body_data.company_name,
        service_description=body_data.service_description,
        phone=body_data.phone,
        email=body_data.email,
        website=body_data.website,
        address_line1=body_data.address_line1,
        address_line2=body_data.address_line2,
        city=body_data.city,
        state=body_data.state,
        postal_code=body_data.postal_code,
        country=body_data.country,
        vat_number=body_data.vat_number,
        contact_persons=[cp.model_dump() for cp in body_data.contact_persons],
    )
    db.add(cb)
    await db.commit()
    await db.refresh(cb)

    return _build_response(cb)


@router.put(
    "/certification-bodies/{body_id}",
    response_model=CertificationBodyResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def update_certification_body(
    body_id: UUID,
    body_data: CertificationBodyUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> CertificationBodyResponse:
    """Update a certification body."""
    result = await db.execute(
        select(CertificationBody).where(
            CertificationBody.id == body_id,
            CertificationBody.tenant_id == current_user.tenant_id,
        )
    )
    cb = result.scalar_one_or_none()

    if not cb:
        raise NotFoundError(f"Certification body with ID '{body_id}' not found")

    update_data = body_data.model_dump(exclude_unset=True)
    if "contact_persons" in update_data and update_data["contact_persons"] is not None:
        update_data["contact_persons"] = [cp.model_dump() for cp in body_data.contact_persons]

    for field, value in update_data.items():
        setattr(cb, field, value)

    await db.commit()
    await db.refresh(cb)

    return _build_response(cb)


@router.delete(
    "/certification-bodies/{body_id}",
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def delete_certification_body(
    body_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Delete a certification body."""
    result = await db.execute(
        select(CertificationBody).where(
            CertificationBody.id == body_id,
            CertificationBody.tenant_id == current_user.tenant_id,
        )
    )
    cb = result.scalar_one_or_none()

    if not cb:
        raise NotFoundError(f"Certification body with ID '{body_id}' not found")

    await db.delete(cb)
    await db.commit()

    return {"message": f"Certification body '{cb.company_name}' deleted successfully"}
