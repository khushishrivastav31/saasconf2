"""Conference service provider endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select

from app.api.v1.service_providers import build_service_provider_response
from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    check_conference_admin_access,
    get_client_ip,
    require_module,
)
from app.core.exceptions import AuthorizationError, NotFoundError
from app.models.attachment import Attachment
from app.models.audit import AuditLog
from app.models.service_provider import ServiceProvider
from app.schemas.service_provider import (
    ServiceProviderCreate,
    ServiceProviderListResponse,
    ServiceProviderResponse,
    ServiceProviderUpdate,
)

from ._shared import _get_conference_for_tenant

router = APIRouter()

MODULE_CODE_SP = "service_providers"


@router.get("/{conference_id}/service-providers", response_model=ServiceProviderListResponse, dependencies=[Depends(require_module(MODULE_CODE_SP))])
async def list_conference_service_providers(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> ServiceProviderListResponse:
    """List service providers directly linked to a conference."""
    conference = await _get_conference_for_tenant(conference_id, current_user.tenant_id, db)

    result = await db.execute(
        select(ServiceProvider)
        .where(ServiceProvider.conference_id == conference.id)
        .where(ServiceProvider.tenant_id == current_user.tenant_id)
        .order_by(ServiceProvider.company_name)
    )
    providers = result.scalars().all()

    items = [build_service_provider_response(sp) for sp in providers]

    return ServiceProviderListResponse(items=items, total=len(items))


@router.post("/{conference_id}/service-providers", response_model=ServiceProviderResponse, status_code=201, dependencies=[Depends(require_module(MODULE_CODE_SP))])
async def create_conference_service_provider(
    conference_id: UUID,
    data: ServiceProviderCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> ServiceProviderResponse:
    """Create a service provider directly linked to a conference (no location)."""
    # Check admin access: tenant admin OR conference-specific admin
    if not current_user.is_super_admin and not current_user.is_tenant_admin:
        has_access = await check_conference_admin_access(db, current_user.user_id, conference_id)
        if not has_access:
            raise AuthorizationError("Admin access to this conference required")

    conference = await _get_conference_for_tenant(conference_id, current_user.tenant_id, db)

    sp = ServiceProvider(
        tenant_id=current_user.tenant_id,
        conference_id=conference.id,
        location_id=None,
        company_name=data.company_name,
        service_description=data.service_description,
        phone=data.phone,
        email=data.email,
        website=data.website,
        address_line1=data.address_line1,
        address_line2=data.address_line2,
        city=data.city,
        state=data.state,
        postal_code=data.postal_code,
        country=data.country,
        vat_number=data.vat_number,
        contact_persons=[cp.model_dump() for cp in data.contact_persons] if data.contact_persons else [],
    )
    db.add(sp)

    db.add(AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="service_provider.create",
        resource_type="service_provider",
        resource_id=sp.id,
        details={"company_name": sp.company_name, "conference_id": str(conference.id)},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    ))

    await db.commit()
    await db.refresh(sp)

    return build_service_provider_response(sp)


@router.put("/{conference_id}/service-providers/{provider_id}", response_model=ServiceProviderResponse, dependencies=[Depends(require_module(MODULE_CODE_SP))])
async def update_conference_service_provider(
    conference_id: UUID,
    provider_id: UUID,
    data: ServiceProviderUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> ServiceProviderResponse:
    """Update a conference service provider."""
    # Check admin access: tenant admin OR conference-specific admin
    if not current_user.is_super_admin and not current_user.is_tenant_admin:
        has_access = await check_conference_admin_access(db, current_user.user_id, conference_id)
        if not has_access:
            raise AuthorizationError("Admin access to this conference required")

    conference = await _get_conference_for_tenant(conference_id, current_user.tenant_id, db)

    result = await db.execute(
        select(ServiceProvider)
        .where(ServiceProvider.id == provider_id)
        .where(ServiceProvider.conference_id == conference.id)
        .where(ServiceProvider.tenant_id == current_user.tenant_id)
    )
    sp = result.scalar_one_or_none()
    if not sp:
        raise NotFoundError(f"Service provider '{provider_id}' not found")

    update_data = data.model_dump(exclude_unset=True)
    if "contact_persons" in update_data and update_data["contact_persons"] is not None:
        update_data["contact_persons"] = [
            cp.model_dump() if hasattr(cp, "model_dump") else cp
            for cp in update_data["contact_persons"]
        ]

    for field, value in update_data.items():
        setattr(sp, field, value)

    db.add(AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="service_provider.update",
        resource_type="service_provider",
        resource_id=sp.id,
        details={"updated_fields": list(update_data.keys())},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    ))

    await db.commit()
    await db.refresh(sp)

    return build_service_provider_response(sp)


@router.delete("/{conference_id}/service-providers/{provider_id}", dependencies=[Depends(require_module(MODULE_CODE_SP))])
async def delete_conference_service_provider(
    conference_id: UUID,
    provider_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete a conference service provider and its attachments."""
    # Check admin access: tenant admin OR conference-specific admin
    if not current_user.is_super_admin and not current_user.is_tenant_admin:
        has_access = await check_conference_admin_access(db, current_user.user_id, conference_id)
        if not has_access:
            raise AuthorizationError("Admin access to this conference required")

    conference = await _get_conference_for_tenant(conference_id, current_user.tenant_id, db)

    result = await db.execute(
        select(ServiceProvider)
        .where(ServiceProvider.id == provider_id)
        .where(ServiceProvider.conference_id == conference.id)
        .where(ServiceProvider.tenant_id == current_user.tenant_id)
    )
    sp = result.scalar_one_or_none()
    if not sp:
        raise NotFoundError(f"Service provider '{provider_id}' not found")

    # Delete associated attachments
    attachments = await db.execute(
        select(Attachment)
        .where(Attachment.entity_type == "service_provider")
        .where(Attachment.entity_id == sp.id)
    )
    for att in attachments.scalars().all():
        await db.delete(att)

    company_name = sp.company_name
    await db.delete(sp)

    db.add(AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="service_provider.delete",
        resource_type="service_provider",
        resource_id=provider_id,
        details={"company_name": company_name, "conference_id": str(conference.id)},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    ))

    await db.commit()
    return {"message": f"Service provider '{company_name}' deleted"}
