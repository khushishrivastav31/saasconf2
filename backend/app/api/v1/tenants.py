"""Tenant management endpoints (super admin only)."""

from uuid import UUID

from fastapi import APIRouter, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import DbSessionDep, SuperAdminDep, get_client_ip
from app.core.exceptions import NotFoundError, ValidationError
from app.core.security import hash_password
from app.models.audit import AuditAction, AuditLog
from app.models.module import TenantModule
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from app.schemas.tenant import (
    TenantCreate,
    TenantListResponse,
    TenantResponse,
    TenantUpdate,
)
from app.schemas.module import TenantModuleAssign, TenantModuleUpdate, TenantModuleResponse

router = APIRouter()


@router.get("", response_model=TenantListResponse)
async def list_tenants(
    current_user: SuperAdminDep,
    db: DbSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    is_active: bool | None = None,
) -> TenantListResponse:
    """
    List all tenants with pagination and filtering.

    Only accessible by super admins.
    """
    # Build query
    query = select(Tenant)

    if search:
        query = query.where(
            Tenant.name.ilike(f"%{search}%") | Tenant.slug.ilike(f"%{search}%")
        )

    if is_active is not None:
        query = query.where(Tenant.is_active == is_active)

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Apply pagination
    query = query.offset((page - 1) * page_size).limit(page_size)
    query = query.order_by(Tenant.created_at.desc())

    result = await db.execute(query)
    tenants = result.scalars().all()

    # Get user and module counts for each tenant
    items = []
    for tenant in tenants:
        # Count users
        user_count = (
            await db.execute(
                select(func.count()).where(User.tenant_id == tenant.id)
            )
        ).scalar() or 0

        # Count modules
        module_count = (
            await db.execute(
                select(func.count()).where(TenantModule.tenant_id == tenant.id)
            )
        ).scalar() or 0

        items.append(
            TenantResponse(
                id=tenant.id,
                name=tenant.name,
                slug=tenant.slug,
                is_active=tenant.is_active,
                settings=tenant.settings,
                address=tenant.address,
                postal_code=tenant.postal_code,
                city=tenant.city,
                country=tenant.country,
                vat_number=tenant.vat_number,
                website=tenant.website,
                contact_persons=tenant.contact_persons or [],
                comments=tenant.comments,
                created_at=tenant.created_at,
                updated_at=tenant.updated_at,
                user_count=user_count,
                module_count=module_count,
            )
        )

    return TenantListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.post("", response_model=TenantResponse, status_code=201)
async def create_tenant(
    tenant_data: TenantCreate,
    current_user: SuperAdminDep,
    db: DbSessionDep,
    request: Request,
) -> TenantResponse:
    """
    Create a new tenant (company).

    Optionally creates an admin user for the tenant.
    """
    # Check slug uniqueness
    existing = await db.execute(select(Tenant).where(Tenant.slug == tenant_data.slug))
    if existing.scalar_one_or_none():
        raise ValidationError(f"Tenant with slug '{tenant_data.slug}' already exists")

    # Create tenant with all fields
    tenant = Tenant(
        name=tenant_data.name,
        slug=tenant_data.slug,
        settings=tenant_data.settings,
        address=tenant_data.address,
        postal_code=tenant_data.postal_code,
        city=tenant_data.city,
        country=tenant_data.country,
        vat_number=tenant_data.vat_number,
        website=tenant_data.website,
        contact_persons=[cp.model_dump() for cp in tenant_data.contact_persons] if tenant_data.contact_persons else [],
        comments=tenant_data.comments,
    )
    db.add(tenant)
    await db.flush()  # Get tenant ID

    # Optionally create admin user
    if tenant_data.admin_email and tenant_data.admin_password:
        admin_user = User(
            tenant_id=tenant.id,
            email=tenant_data.admin_email,
            password_hash=hash_password(tenant_data.admin_password),
            full_name=tenant_data.admin_name,
            role=UserRole.TENANT_ADMIN.value,
        )
        db.add(admin_user)

    # Log action
    audit_log = AuditLog(
        tenant_id=None,
        user_id=current_user.user_id,
        action=AuditAction.TENANT_CREATE,
        resource_type="tenant",
        resource_id=tenant.id,
        details={"name": tenant.name, "slug": tenant.slug},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(tenant)

    return TenantResponse(
        id=tenant.id,
        name=tenant.name,
        slug=tenant.slug,
        is_active=tenant.is_active,
        settings=tenant.settings,
        address=tenant.address,
        postal_code=tenant.postal_code,
        city=tenant.city,
        country=tenant.country,
        vat_number=tenant.vat_number,
        website=tenant.website,
        contact_persons=tenant.contact_persons or [],
        comments=tenant.comments,
        created_at=tenant.created_at,
        updated_at=tenant.updated_at,
        user_count=1 if tenant_data.admin_email else 0,
        module_count=0,
    )


@router.get("/{tenant_id}", response_model=TenantResponse)
async def get_tenant(
    tenant_id: UUID,
    current_user: SuperAdminDep,
    db: DbSessionDep,
) -> TenantResponse:
    """Get tenant details by ID."""
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()

    if not tenant:
        raise NotFoundError(f"Tenant with ID '{tenant_id}' not found")

    # Count users and modules
    user_count = (
        await db.execute(select(func.count()).where(User.tenant_id == tenant.id))
    ).scalar() or 0

    module_count = (
        await db.execute(
            select(func.count()).where(TenantModule.tenant_id == tenant.id)
        )
    ).scalar() or 0

    return TenantResponse(
        id=tenant.id,
        name=tenant.name,
        slug=tenant.slug,
        is_active=tenant.is_active,
        settings=tenant.settings,
        address=tenant.address,
        postal_code=tenant.postal_code,
        city=tenant.city,
        country=tenant.country,
        vat_number=tenant.vat_number,
        website=tenant.website,
        contact_persons=tenant.contact_persons or [],
        comments=tenant.comments,
        created_at=tenant.created_at,
        updated_at=tenant.updated_at,
        user_count=user_count,
        module_count=module_count,
    )


@router.put("/{tenant_id}", response_model=TenantResponse)
async def update_tenant(
    tenant_id: UUID,
    tenant_data: TenantUpdate,
    current_user: SuperAdminDep,
    db: DbSessionDep,
    request: Request,
) -> TenantResponse:
    """Update tenant details."""
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()

    if not tenant:
        raise NotFoundError(f"Tenant with ID '{tenant_id}' not found")

    # Check slug uniqueness if changing
    if tenant_data.slug and tenant_data.slug != tenant.slug:
        existing = await db.execute(
            select(Tenant).where(Tenant.slug == tenant_data.slug)
        )
        if existing.scalar_one_or_none():
            raise ValidationError(
                f"Tenant with slug '{tenant_data.slug}' already exists"
            )

    # Update fields
    update_data = tenant_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(tenant, field, value)

    # Log action
    audit_log = AuditLog(
        tenant_id=None,
        user_id=current_user.user_id,
        action=AuditAction.TENANT_UPDATE,
        resource_type="tenant",
        resource_id=tenant.id,
        details=update_data,
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(tenant)

    # Get counts
    user_count = (
        await db.execute(select(func.count()).where(User.tenant_id == tenant.id))
    ).scalar() or 0

    module_count = (
        await db.execute(
            select(func.count()).where(TenantModule.tenant_id == tenant.id)
        )
    ).scalar() or 0

    return TenantResponse(
        id=tenant.id,
        name=tenant.name,
        slug=tenant.slug,
        is_active=tenant.is_active,
        settings=tenant.settings,
        address=tenant.address,
        postal_code=tenant.postal_code,
        city=tenant.city,
        country=tenant.country,
        vat_number=tenant.vat_number,
        website=tenant.website,
        contact_persons=tenant.contact_persons or [],
        comments=tenant.comments,
        created_at=tenant.created_at,
        updated_at=tenant.updated_at,
        user_count=user_count,
        module_count=module_count,
    )


@router.delete("/{tenant_id}")
async def delete_tenant(
    tenant_id: UUID,
    current_user: SuperAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """
    Soft delete a tenant (deactivate).

    This deactivates the tenant rather than deleting data.
    """
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()

    if not tenant:
        raise NotFoundError(f"Tenant with ID '{tenant_id}' not found")

    tenant.is_active = False

    # Log action
    audit_log = AuditLog(
        tenant_id=None,
        user_id=current_user.user_id,
        action=AuditAction.TENANT_DEACTIVATE,
        resource_type="tenant",
        resource_id=tenant.id,
        details={"name": tenant.name},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()

    return {"message": f"Tenant '{tenant.name}' has been deactivated"}


# Module assignment endpoints


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
