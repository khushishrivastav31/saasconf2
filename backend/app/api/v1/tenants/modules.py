"""Tenant module assignment endpoints (super admin only)."""

from uuid import UUID

from fastapi import APIRouter, Request
from sqlalchemy import select

from app.core.dependencies import DbSessionDep, SuperAdminDep, get_client_ip
from app.core.exceptions import NotFoundError, ValidationError
from app.models.audit import AuditAction, AuditLog
from app.models.module import TenantModule
from app.models.tenant import Tenant
from app.schemas.module import TenantModuleAssign, TenantModuleResponse, TenantModuleUpdate

router = APIRouter()


@router.get("/{tenant_id}/modules", response_model=list[TenantModuleResponse])
async def get_tenant_modules(
    tenant_id: UUID,
    current_user: SuperAdminDep,
    db: DbSessionDep,
) -> list[TenantModuleResponse]:
    """Get modules assigned to a tenant."""
    # Verify tenant exists
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()

    if not tenant:
        raise NotFoundError(f"Tenant with ID '{tenant_id}' not found")

    # Get assigned modules
    result = await db.execute(
        select(TenantModule).where(TenantModule.tenant_id == tenant_id)
    )
    tenant_modules = result.scalars().all()

    items = []
    for tm in tenant_modules:
        await db.refresh(tm, ["module"])
        items.append(
            TenantModuleResponse(
                id=tm.id,
                tenant_id=tm.tenant_id,
                module_id=tm.module_id,
                module_code=tm.module.code,
                module_name=tm.module.name,
                is_enabled=tm.is_enabled,
                config=tm.config,
                granted_at=tm.granted_at,
                granted_by=tm.granted_by,
                start_date=tm.start_date,
                end_date=tm.end_date,
                price=tm.price,
                currency=tm.currency,
                max_papers=tm.max_papers,
                max_speakers=tm.max_speakers,
                max_attendees=tm.max_attendees,
                max_volunteers=tm.max_volunteers,
                is_active_subscription=tm.is_active_subscription,
            )
        )

    return items


@router.post("/{tenant_id}/modules", response_model=TenantModuleResponse, status_code=201)
async def assign_module_to_tenant(
    tenant_id: UUID,
    module_data: TenantModuleAssign,
    current_user: SuperAdminDep,
    db: DbSessionDep,
    request: Request,
) -> TenantModuleResponse:
    """Assign a module to a tenant."""
    from app.models.module import Module

    # Verify tenant exists
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()

    if not tenant:
        raise NotFoundError(f"Tenant with ID '{tenant_id}' not found")

    # Verify module exists
    result = await db.execute(select(Module).where(Module.id == module_data.module_id))
    module = result.scalar_one_or_none()

    if not module:
        raise NotFoundError(f"Module with ID '{module_data.module_id}' not found")

    # Check if already assigned
    result = await db.execute(
        select(TenantModule)
        .where(TenantModule.tenant_id == tenant_id)
        .where(TenantModule.module_id == module_data.module_id)
    )
    existing = result.scalar_one_or_none()

    if existing:
        raise ValidationError(f"Module '{module.code}' is already assigned to this tenant")

    # Create assignment with all fields
    tenant_module = TenantModule(
        tenant_id=tenant_id,
        module_id=module_data.module_id,
        config=module_data.config,
        granted_by=current_user.user_id,
        start_date=module_data.start_date,
        end_date=module_data.end_date,
        price=module_data.price,
        currency=module_data.currency,
        max_papers=module_data.max_papers,
        max_speakers=module_data.max_speakers,
        max_attendees=module_data.max_attendees,
        max_volunteers=module_data.max_volunteers,
    )
    db.add(tenant_module)

    # Log action
    audit_log = AuditLog(
        tenant_id=tenant_id,
        user_id=current_user.user_id,
        action=AuditAction.MODULE_ASSIGN,
        resource_type="tenant_module",
        resource_id=module.id,
        details={
            "module_code": module.code,
            "tenant_name": tenant.name,
            "start_date": str(module_data.start_date) if module_data.start_date else None,
            "end_date": str(module_data.end_date) if module_data.end_date else None,
            "price": str(module_data.price) if module_data.price else None,
        },
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(tenant_module)

    return TenantModuleResponse(
        id=tenant_module.id,
        tenant_id=tenant_module.tenant_id,
        module_id=tenant_module.module_id,
        module_code=module.code,
        module_name=module.name,
        is_enabled=tenant_module.is_enabled,
        config=tenant_module.config,
        granted_at=tenant_module.granted_at,
        granted_by=tenant_module.granted_by,
        start_date=tenant_module.start_date,
        end_date=tenant_module.end_date,
        price=tenant_module.price,
        currency=tenant_module.currency,
        max_papers=tenant_module.max_papers,
        max_speakers=tenant_module.max_speakers,
        max_attendees=tenant_module.max_attendees,
        max_volunteers=tenant_module.max_volunteers,
        is_active_subscription=tenant_module.is_active_subscription,
    )


@router.put("/{tenant_id}/modules/{module_id}", response_model=TenantModuleResponse)
async def update_tenant_module(
    tenant_id: UUID,
    module_id: UUID,
    module_data: TenantModuleUpdate,
    current_user: SuperAdminDep,
    db: DbSessionDep,
    request: Request,
) -> TenantModuleResponse:
    """Update a tenant's module assignment (dates, limits, pricing)."""
    # Find the assignment
    result = await db.execute(
        select(TenantModule)
        .where(TenantModule.tenant_id == tenant_id)
        .where(TenantModule.module_id == module_id)
    )
    tenant_module = result.scalar_one_or_none()

    if not tenant_module:
        raise NotFoundError("Module assignment not found")

    # Update fields that are provided
    update_data = module_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(tenant_module, field, value)

    # Log action
    await db.refresh(tenant_module, ["module", "tenant"])
    audit_log = AuditLog(
        tenant_id=tenant_id,
        user_id=current_user.user_id,
        action=AuditAction.MODULE_UPDATE,
        resource_type="tenant_module",
        resource_id=module_id,
        details={
            "module_code": tenant_module.module.code,
            "tenant_name": tenant_module.tenant.name,
            "updated_fields": list(update_data.keys()),
        },
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(tenant_module, ["module"])

    return TenantModuleResponse(
        id=tenant_module.id,
        tenant_id=tenant_module.tenant_id,
        module_id=tenant_module.module_id,
        module_code=tenant_module.module.code,
        module_name=tenant_module.module.name,
        is_enabled=tenant_module.is_enabled,
        config=tenant_module.config,
        granted_at=tenant_module.granted_at,
        granted_by=tenant_module.granted_by,
        start_date=tenant_module.start_date,
        end_date=tenant_module.end_date,
        price=tenant_module.price,
        currency=tenant_module.currency,
        max_papers=tenant_module.max_papers,
        max_speakers=tenant_module.max_speakers,
        max_attendees=tenant_module.max_attendees,
        max_volunteers=tenant_module.max_volunteers,
        is_active_subscription=tenant_module.is_active_subscription,
    )


@router.delete("/{tenant_id}/modules/{module_id}")
async def revoke_module_from_tenant(
    tenant_id: UUID,
    module_id: UUID,
    current_user: SuperAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Revoke a module from a tenant."""
    # Find the assignment
    result = await db.execute(
        select(TenantModule)
        .where(TenantModule.tenant_id == tenant_id)
        .where(TenantModule.module_id == module_id)
    )
    tenant_module = result.scalar_one_or_none()

    if not tenant_module:
        raise NotFoundError("Module assignment not found")

    await db.refresh(tenant_module, ["module", "tenant"])

    # Log action
    audit_log = AuditLog(
        tenant_id=tenant_id,
        user_id=current_user.user_id,
        action=AuditAction.MODULE_REVOKE,
        resource_type="tenant_module",
        resource_id=module_id,
        details={
            "module_code": tenant_module.module.code,
            "tenant_name": tenant_module.tenant.name,
        },
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.delete(tenant_module)
    await db.commit()

    return {"message": "Module access revoked successfully"}
