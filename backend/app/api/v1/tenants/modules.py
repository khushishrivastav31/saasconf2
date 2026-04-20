"""Tenant module assignment endpoints (super admin only)."""

from uuid import UUID

from fastapi import APIRouter, Request
from pydantic import BaseModel
from sqlalchemy import select, update

from app.core.dependencies import DbSessionDep, SuperAdminDep, get_client_ip
from app.core.exceptions import NotFoundError, ValidationError
from app.models.audit import AuditAction, AuditLog
from app.models.module import Module, TenantModule
from app.models.tenant import Tenant
from app.schemas.module import TenantModuleAssign, TenantModuleResponse, TenantModuleUpdate

router = APIRouter()

# Module codes that belong to the "Conferences" product group.
# All other modules (except "trainings") are also in this group.
CONFERENCES_MODULE_CODES = frozenset(
    {
        "conferences",
        "cfp",
        "speakers",
        "sessions",
        "locations",
        "attendees",
        "sponsors",
        "service_providers",
        "volunteers",
        "program",
        "registration",
        "analytics",
        "invoices",
        "news",
    }
)

TRAININGS_MODULE_CODES = frozenset({"trainings"})


@router.get("/{tenant_id}/modules", response_model=list[TenantModuleResponse])
async def get_tenant_modules(
    tenant_id: UUID,
    current_user: SuperAdminDep,
    db: DbSessionDep,
) -> list[TenantModuleResponse]:
    """Get modules assigned to a tenant."""
    # Verify tenant exists
    tenant_result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = tenant_result.scalar_one_or_none()

    if not tenant:
        raise NotFoundError(f"Tenant with ID '{tenant_id}' not found")

    # Get assigned modules
    tm_result = await db.execute(select(TenantModule).where(TenantModule.tenant_id == tenant_id))
    tenant_modules = tm_result.scalars().all()

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
    tenant_result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = tenant_result.scalar_one_or_none()

    if not tenant:
        raise NotFoundError(f"Tenant with ID '{tenant_id}' not found")

    # Verify module exists
    module_result = await db.execute(select(Module).where(Module.id == module_data.module_id))
    module = module_result.scalar_one_or_none()

    if not module:
        raise NotFoundError(f"Module with ID '{module_data.module_id}' not found")

    # Check if already assigned
    existing_result = await db.execute(
        select(TenantModule)
        .where(TenantModule.tenant_id == tenant_id)
        .where(TenantModule.module_id == module_data.module_id)
    )
    existing = existing_result.scalar_one_or_none()

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
    tm_result = await db.execute(
        select(TenantModule).where(TenantModule.tenant_id == tenant_id).where(TenantModule.module_id == module_id)
    )
    tenant_module = tm_result.scalar_one_or_none()

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
    tm_result = await db.execute(
        select(TenantModule).where(TenantModule.tenant_id == tenant_id).where(TenantModule.module_id == module_id)
    )
    tenant_module = tm_result.scalar_one_or_none()

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


# ---------------------------------------------------------------------------
# Batch toggle endpoint — simple Conferences / Trainings checkboxes
# ---------------------------------------------------------------------------


class ModuleGroupToggle(BaseModel):
    conferences: bool | None = None
    trainings: bool | None = None


class ModuleGroupStatus(BaseModel):
    conferences: bool
    trainings: bool


@router.get("/{tenant_id}/module-groups", response_model=ModuleGroupStatus)
async def get_module_groups(
    tenant_id: UUID,
    current_user: SuperAdminDep,
    db: DbSessionDep,
) -> ModuleGroupStatus:
    """Get the enabled/disabled state of the Conferences and Trainings product groups."""
    tm_result = await db.execute(select(TenantModule).where(TenantModule.tenant_id == tenant_id))
    tenant_modules = tm_result.scalars().all()

    # Load module codes
    module_ids = [tm.module_id for tm in tenant_modules]
    if module_ids:
        mod_result = await db.execute(select(Module).where(Module.id.in_(module_ids)))
        modules_by_id = {m.id: m.code for m in mod_result.scalars().all()}
    else:
        modules_by_id = {}

    # Conferences is enabled if the "conferences" module is enabled
    conferences_enabled = False
    trainings_enabled = False
    for tm in tenant_modules:
        code = modules_by_id.get(tm.module_id)
        if code == "conferences" and tm.is_enabled:
            conferences_enabled = True
        if code == "trainings" and tm.is_enabled:
            trainings_enabled = True

    return ModuleGroupStatus(conferences=conferences_enabled, trainings=trainings_enabled)


@router.put("/{tenant_id}/module-groups", response_model=ModuleGroupStatus)
async def toggle_module_groups(
    tenant_id: UUID,
    data: ModuleGroupToggle,
    current_user: SuperAdminDep,
    db: DbSessionDep,
    request: Request,
) -> ModuleGroupStatus:
    """Batch enable/disable Conferences and/or Trainings module groups."""
    # Verify tenant
    tenant_result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = tenant_result.scalar_one_or_none()
    if not tenant:
        raise NotFoundError(f"Tenant with ID '{tenant_id}' not found")

    # Collect module codes to toggle
    codes_to_enable: set[str] = set()
    codes_to_disable: set[str] = set()

    if data.conferences is True:
        codes_to_enable |= CONFERENCES_MODULE_CODES
    elif data.conferences is False:
        codes_to_disable |= CONFERENCES_MODULE_CODES

    if data.trainings is True:
        codes_to_enable |= TRAININGS_MODULE_CODES
    elif data.trainings is False:
        codes_to_disable |= TRAININGS_MODULE_CODES

    # Get module IDs for the codes
    all_codes = codes_to_enable | codes_to_disable
    if all_codes:
        mod_result = await db.execute(select(Module).where(Module.code.in_(all_codes)))
        modules_map = {m.code: m.id for m in mod_result.scalars().all()}

        enable_ids = [modules_map[c] for c in codes_to_enable if c in modules_map]
        disable_ids = [modules_map[c] for c in codes_to_disable if c in modules_map]

        if enable_ids:
            await db.execute(
                update(TenantModule)
                .where(TenantModule.tenant_id == tenant_id)
                .where(TenantModule.module_id.in_(enable_ids))
                .values(is_enabled=True)
            )

        if disable_ids:
            await db.execute(
                update(TenantModule)
                .where(TenantModule.tenant_id == tenant_id)
                .where(TenantModule.module_id.in_(disable_ids))
                .values(is_enabled=False)
            )

        # Audit log
        audit_log = AuditLog(
            tenant_id=tenant_id,
            user_id=current_user.user_id,
            action=AuditAction.MODULE_UPDATE,
            resource_type="tenant_module_groups",
            details={
                "tenant_name": tenant.name,
                "conferences": data.conferences,
                "trainings": data.trainings,
            },
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent"),
        )
        db.add(audit_log)

        await db.commit()

    # Return current state
    return await get_module_groups(tenant_id, current_user, db)
