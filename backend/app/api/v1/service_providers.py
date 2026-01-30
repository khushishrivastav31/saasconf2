"""Service provider endpoints (nested under locations)."""

from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy import delete as sa_delete
from sqlalchemy import select

from app.core.dependencies import CurrentUserDep, DbSessionDep, TenantAdminDep, get_client_ip, require_module
from app.core.exceptions import NotFoundError
from app.models.attachment import Attachment
from app.models.audit import AuditLog
from app.models.location import Location
from app.models.service_provider import ServiceProvider
from app.schemas.service_provider import (
    ServiceProviderCreate,
    ServiceProviderListResponse,
    ServiceProviderResponse,
    ServiceProviderUpdate,
)

router = APIRouter()

MODULE_CODE = "locations"


def build_service_provider_response(sp: ServiceProvider) -> ServiceProviderResponse:
    """Build a ServiceProviderResponse from a ServiceProvider model."""
    return ServiceProviderResponse(
        id=sp.id,
        tenant_id=sp.tenant_id,
        location_id=sp.location_id,
        conference_id=sp.conference_id,
        company_name=sp.company_name,
        service_description=sp.service_description,
        phone=sp.phone,
        email=sp.email,
        website=sp.website,
        address_line1=sp.address_line1,
        address_line2=sp.address_line2,
        city=sp.city,
        state=sp.state,
        postal_code=sp.postal_code,
        country=sp.country,
        vat_number=sp.vat_number,
        contact_persons=sp.contact_persons or [],
        created_at=sp.created_at,
        updated_at=sp.updated_at,
    )


async def _get_location_or_404(
    db, location_id: UUID, tenant_id: UUID
) -> Location:
    """Fetch location and raise 404 if not found."""
    result = await db.execute(
        select(Location).where(
            Location.id == location_id,
            Location.tenant_id == tenant_id,
        )
    )
    location = result.scalar_one_or_none()
    if not location:
        raise NotFoundError(f"Location with ID '{location_id}' not found")
    return location


@router.get("", response_model=ServiceProviderListResponse, dependencies=[Depends(require_module(MODULE_CODE))])
async def list_service_providers(
    location_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> ServiceProviderListResponse:
    """List service providers for a location."""

    await _get_location_or_404(db, location_id, current_user.tenant_id)

    result = await db.execute(
        select(ServiceProvider)
        .where(
            ServiceProvider.tenant_id == current_user.tenant_id,
            ServiceProvider.location_id == location_id,
        )
        .order_by(ServiceProvider.company_name)
    )
    providers = result.scalars().all()

    items = [build_service_provider_response(sp) for sp in providers]
    return ServiceProviderListResponse(items=items, total=len(items))


@router.post("", response_model=ServiceProviderResponse, status_code=201, dependencies=[Depends(require_module(MODULE_CODE))])
async def create_service_provider(
    location_id: UUID,
    sp_data: ServiceProviderCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> ServiceProviderResponse:
    """Create a new service provider for a location."""

    await _get_location_or_404(db, location_id, current_user.tenant_id)

    sp = ServiceProvider(
        tenant_id=current_user.tenant_id,
        location_id=location_id,
        company_name=sp_data.company_name,
        service_description=sp_data.service_description,
        phone=sp_data.phone,
        email=sp_data.email,
        website=sp_data.website,
        address_line1=sp_data.address_line1,
        address_line2=sp_data.address_line2,
        city=sp_data.city,
        state=sp_data.state,
        postal_code=sp_data.postal_code,
        country=sp_data.country,
        vat_number=sp_data.vat_number,
        contact_persons=[cp.model_dump() for cp in sp_data.contact_persons] if sp_data.contact_persons else [],
    )
    db.add(sp)

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="service_provider.create",
        resource_type="service_provider",
        resource_id=sp.id,
        details={"company_name": sp.company_name, "location_id": str(location_id)},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(sp)

    return build_service_provider_response(sp)


@router.put("/{provider_id}", response_model=ServiceProviderResponse, dependencies=[Depends(require_module(MODULE_CODE))])
async def update_service_provider(
    location_id: UUID,
    provider_id: UUID,
    sp_data: ServiceProviderUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> ServiceProviderResponse:
    """Update a service provider."""

    result = await db.execute(
        select(ServiceProvider).where(
            ServiceProvider.id == provider_id,
            ServiceProvider.location_id == location_id,
            ServiceProvider.tenant_id == current_user.tenant_id,
        )
    )
    sp = result.scalar_one_or_none()
    if not sp:
        raise NotFoundError(f"Service provider with ID '{provider_id}' not found")

    update_data = sp_data.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        setattr(sp, field, value)

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="service_provider.update",
        resource_type="service_provider",
        resource_id=provider_id,
        details=update_data,
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(sp)

    return build_service_provider_response(sp)


@router.delete("/{provider_id}", dependencies=[Depends(require_module(MODULE_CODE))])
async def delete_service_provider(
    location_id: UUID,
    provider_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete a service provider and its attachments."""

    result = await db.execute(
        select(ServiceProvider).where(
            ServiceProvider.id == provider_id,
            ServiceProvider.location_id == location_id,
            ServiceProvider.tenant_id == current_user.tenant_id,
        )
    )
    sp = result.scalar_one_or_none()
    if not sp:
        raise NotFoundError(f"Service provider with ID '{provider_id}' not found")

    company_name = sp.company_name

    # Delete associated attachments
    await db.execute(
        sa_delete(Attachment).where(
            Attachment.entity_type == "service_provider",
            Attachment.entity_id == provider_id,
            Attachment.tenant_id == current_user.tenant_id,
        )
    )

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="service_provider.delete",
        resource_type="service_provider",
        resource_id=provider_id,
        details={"company_name": company_name, "location_id": str(location_id)},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.delete(sp)
    await db.commit()

    return {"message": f"Service provider '{company_name}' deleted successfully"}
