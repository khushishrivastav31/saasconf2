"""Module management endpoints (super admin only)."""

from uuid import UUID

from fastapi import APIRouter, Query, Request
from sqlalchemy import func, select

from app.core.dependencies import DbSessionDep, SuperAdminDep, get_client_ip
from app.core.exceptions import NotFoundError, ValidationError
from app.models.audit import AuditAction, AuditLog
from app.models.module import Module, TenantModule
from app.schemas.module import (
    ModuleCreate,
    ModuleListResponse,
    ModuleResponse,
    ModuleUpdate,
)

router = APIRouter()


@router.get("", response_model=ModuleListResponse)
async def list_modules(
    current_user: SuperAdminDep,
    db: DbSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    is_active: bool | None = None,
) -> ModuleListResponse:
    """
    List all available modules with pagination.

    Only accessible by super admins.
    """
    query = select(Module)

    if search:
        query = query.where(
            Module.name.ilike(f"%{search}%") | Module.code.ilike(f"%{search}%")
        )

    if is_active is not None:
        query = query.where(Module.is_active == is_active)

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Apply pagination
    query = query.offset((page - 1) * page_size).limit(page_size)
    query = query.order_by(Module.created_at.desc())

    result = await db.execute(query)
    modules = result.scalars().all()

    # Get tenant counts for each module
    items = []
    for module in modules:
        tenant_count = (
            await db.execute(
                select(func.count()).where(TenantModule.module_id == module.id)
            )
        ).scalar() or 0

        items.append(
            ModuleResponse(
                id=module.id,
                code=module.code,
                name=module.name,
                description=module.description,
                is_active=module.is_active,
                config_schema=module.config_schema,
                created_at=module.created_at,
                tenant_count=tenant_count,
            )
        )

    return ModuleListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.post("", response_model=ModuleResponse, status_code=201)
async def create_module(
    module_data: ModuleCreate,
    current_user: SuperAdminDep,
    db: DbSessionDep,
    request: Request,
) -> ModuleResponse:
    """
    Create a new module.

    Modules represent features that can be assigned to tenants.
    """
    # Check code uniqueness
    existing = await db.execute(select(Module).where(Module.code == module_data.code))
    if existing.scalar_one_or_none():
        raise ValidationError(f"Module with code '{module_data.code}' already exists")

    # Create module
    module = Module(
        code=module_data.code,
        name=module_data.name,
        description=module_data.description,
        config_schema=module_data.config_schema,
    )
    db.add(module)

    # Log action
    audit_log = AuditLog(
        tenant_id=None,
        user_id=current_user.user_id,
        action=AuditAction.MODULE_CREATE,
        resource_type="module",
        resource_id=module.id,
        details={"code": module.code, "name": module.name},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(module)

    return ModuleResponse(
        id=module.id,
        code=module.code,
        name=module.name,
        description=module.description,
        is_active=module.is_active,
        config_schema=module.config_schema,
        created_at=module.created_at,
        tenant_count=0,
    )


@router.get("/{module_id}", response_model=ModuleResponse)
async def get_module(
    module_id: UUID,
    current_user: SuperAdminDep,
    db: DbSessionDep,
) -> ModuleResponse:
    """Get module details by ID."""
    result = await db.execute(select(Module).where(Module.id == module_id))
    module = result.scalar_one_or_none()

    if not module:
        raise NotFoundError(f"Module with ID '{module_id}' not found")

    tenant_count = (
        await db.execute(
            select(func.count()).where(TenantModule.module_id == module.id)
        )
    ).scalar() or 0

    return ModuleResponse(
        id=module.id,
        code=module.code,
        name=module.name,
        description=module.description,
        is_active=module.is_active,
        config_schema=module.config_schema,
        created_at=module.created_at,
        tenant_count=tenant_count,
    )


@router.put("/{module_id}", response_model=ModuleResponse)
async def update_module(
    module_id: UUID,
    module_data: ModuleUpdate,
    current_user: SuperAdminDep,
    db: DbSessionDep,
    request: Request,
) -> ModuleResponse:
    """Update module details."""
    result = await db.execute(select(Module).where(Module.id == module_id))
    module = result.scalar_one_or_none()

    if not module:
        raise NotFoundError(f"Module with ID '{module_id}' not found")

    # Update fields
    update_data = module_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(module, field, value)

    # Log action
    audit_log = AuditLog(
        tenant_id=None,
        user_id=current_user.user_id,
        action=AuditAction.MODULE_UPDATE,
        resource_type="module",
        resource_id=module.id,
        details=update_data,
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(module)

    tenant_count = (
        await db.execute(
            select(func.count()).where(TenantModule.module_id == module.id)
        )
    ).scalar() or 0

    return ModuleResponse(
        id=module.id,
        code=module.code,
        name=module.name,
        description=module.description,
        is_active=module.is_active,
        config_schema=module.config_schema,
        created_at=module.created_at,
        tenant_count=tenant_count,
    )
