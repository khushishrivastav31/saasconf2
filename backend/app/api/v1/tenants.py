"""Tenant management endpoints (super admin only)."""

from uuid import UUID

from fastapi import APIRouter, Query, Request
from sqlalchemy import func, select

from app.config import get_settings
from app.core.dependencies import DbSessionDep, SuperAdminDep, get_client_ip
from app.core.exceptions import NotFoundError, ValidationError
from app.core.file_validation import safe_content_disposition, sanitize_filename, strip_image_metadata, validate_upload
from app.core.pagination import paginate
from app.core.security import hash_password
from app.models.audit import AuditAction, AuditLog
from app.models.module import TenantModule
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from app.schemas.module import TenantModuleAssign, TenantModuleResponse, TenantModuleUpdate
from app.schemas.tenant import (
    TenantCreate,
    TenantListResponse,
    TenantResponse,
    TenantUpdate,
)

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

    # Apply ordering and pagination
    query = query.order_by(Tenant.created_at.desc())
    result = await paginate(db, query, page, page_size)

    # Get user and module counts for each tenant
    items = []
    for tenant in result.items:
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
                logo_url=tenant.logo_url,
                contact_persons=tenant.contact_persons or [],
                comments=tenant.comments,
                super_user_id=tenant.super_user_id,
                created_at=tenant.created_at,
                updated_at=tenant.updated_at,
                user_count=user_count,
                module_count=module_count,
            )
        )

    return TenantListResponse(
        items=items,
        total=result.total,
        page=page,
        page_size=page_size,
        pages=(result.total + page_size - 1) // page_size,
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
            first_name=tenant_data.admin_first_name,
            last_name=tenant_data.admin_last_name,
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
        logo_url=tenant.logo_url,
        contact_persons=tenant.contact_persons or [],
        comments=tenant.comments,
        super_user_id=tenant.super_user_id,
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
        logo_url=tenant.logo_url,
        contact_persons=tenant.contact_persons or [],
        comments=tenant.comments,
        super_user_id=tenant.super_user_id,
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
        logo_url=tenant.logo_url,
        contact_persons=tenant.contact_persons or [],
        comments=tenant.comments,
        super_user_id=tenant.super_user_id,
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


@router.delete("/{tenant_id}/permanent")
async def permanently_delete_tenant(
    tenant_id: UUID,
    current_user: SuperAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """
    Permanently delete a tenant and all associated data.

    WARNING: This is irreversible. All data associated with this tenant will be deleted:
    - All users
    - All conferences
    - All CFPs, papers, applicants
    - All volunteers, locations, sponsors
    - All attachments and settings

    Only accessible by super admins.
    """
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()

    if not tenant:
        raise NotFoundError(f"Tenant with ID '{tenant_id}' not found")

    tenant_name = tenant.name
    tenant_slug = tenant.slug

    # Log action before deletion (audit log will have tenant_id set to NULL via ON DELETE SET NULL)
    audit_log = AuditLog(
        tenant_id=None,  # Set to None since tenant will be deleted
        user_id=current_user.user_id,
        action=AuditAction.TENANT_DELETE,
        resource_type="tenant",
        resource_id=tenant_id,
        details={
            "name": tenant_name,
            "slug": tenant_slug,
            "permanent": True,
        },
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    # Delete tenant - cascade will handle all related data
    await db.delete(tenant)
    await db.commit()

    return {"message": f"Tenant '{tenant_name}' and all associated data have been permanently deleted"}


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


# Tenant Super User endpoints


@router.get("/{tenant_id}/super-user")
async def get_tenant_super_user(
    tenant_id: UUID,
    current_user: SuperAdminDep,
    db: DbSessionDep,
) -> dict:
    """
    Get the designated super user for a tenant.

    Only accessible by SaaS super admins.
    """
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()

    if not tenant:
        raise NotFoundError(f"Tenant with ID '{tenant_id}' not found")

    if not tenant.super_user_id:
        return {
            "tenant_id": str(tenant_id),
            "tenant_name": tenant.name,
            "super_user": None,
        }

    # Get user details
    user_result = await db.execute(select(User).where(User.id == tenant.super_user_id))
    super_user = user_result.scalar_one_or_none()

    return {
        "tenant_id": str(tenant_id),
        "tenant_name": tenant.name,
        "super_user": {
            "id": str(super_user.id),
            "email": super_user.email,
            "first_name": super_user.first_name,
            "last_name": super_user.last_name,
        } if super_user else None,
    }


@router.put("/{tenant_id}/super-user")
async def assign_tenant_super_user(
    tenant_id: UUID,
    user_id: UUID,
    current_user: SuperAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """
    Assign a tenant super user.

    The tenant super user has elevated privileges within their tenant,
    including the ability to delete deactivated conferences.

    Only accessible by SaaS super admins.

    Args:
        tenant_id: The tenant ID
        user_id: The user ID to assign as tenant super user (must belong to this tenant)
    """
    # Get tenant
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()

    if not tenant:
        raise NotFoundError(f"Tenant with ID '{tenant_id}' not found")

    # Get user and verify they belong to this tenant
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()

    if not user:
        raise NotFoundError(f"User with ID '{user_id}' not found")

    if user.tenant_id != tenant_id:
        raise ValidationError("User must belong to this tenant to be assigned as super user")

    if not user.is_active:
        raise ValidationError("Cannot assign an inactive user as tenant super user")

    # Assign the super user
    old_super_user_id = tenant.super_user_id
    tenant.super_user_id = user_id

    # Log action
    audit_log = AuditLog(
        tenant_id=tenant_id,
        user_id=current_user.user_id,
        action=AuditAction.TENANT_UPDATE,
        resource_type="tenant",
        resource_id=tenant.id,
        details={
            "action": "assign_super_user",
            "new_super_user_id": str(user_id),
            "new_super_user_email": user.email,
            "old_super_user_id": str(old_super_user_id) if old_super_user_id else None,
        },
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()

    return {
        "message": f"User '{user.email}' assigned as super user for tenant '{tenant.name}'",
        "tenant_id": str(tenant_id),
        "super_user_id": str(user_id),
        "super_user_email": user.email,
    }


@router.delete("/{tenant_id}/super-user")
async def remove_tenant_super_user(
    tenant_id: UUID,
    current_user: SuperAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """
    Remove the tenant super user assignment.

    Only accessible by SaaS super admins.
    """
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()

    if not tenant:
        raise NotFoundError(f"Tenant with ID '{tenant_id}' not found")

    if not tenant.super_user_id:
        return {"message": "No super user was assigned to this tenant"}

    old_super_user_id = tenant.super_user_id
    tenant.super_user_id = None

    # Log action
    audit_log = AuditLog(
        tenant_id=tenant_id,
        user_id=current_user.user_id,
        action=AuditAction.TENANT_UPDATE,
        resource_type="tenant",
        resource_id=tenant.id,
        details={
            "action": "remove_super_user",
            "old_super_user_id": str(old_super_user_id),
        },
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()

    return {"message": f"Super user removed from tenant '{tenant.name}'"}


# Tenant Logo endpoints


@router.post("/{tenant_id}/logo")
async def upload_tenant_logo(
    tenant_id: UUID,
    current_user: SuperAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """
    Upload a logo for a tenant.

    Only accessible by super admins.
    """
    from fastapi import UploadFile, File
    from app.models.attachment import Attachment

    # Get form data
    form = await request.form()
    file: UploadFile | None = form.get("file")

    if not file:
        raise ValidationError("No file provided")

    # Verify tenant exists
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()

    if not tenant:
        raise NotFoundError(f"Tenant with ID '{tenant_id}' not found")

    # Read and validate file
    file_data = await file.read()
    file_size = len(file_data)

    settings = get_settings()
    max_size = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if file_size > max_size:
        raise ValidationError(
            f"File size ({file_size // (1024 * 1024)}MB) exceeds maximum allowed ({settings.MAX_UPLOAD_SIZE_MB}MB)"
        )

    content_type = file.content_type or "application/octet-stream"
    verified_type = validate_upload(file_data, content_type, "tenant_logo")
    file_data = strip_image_metadata(file_data, verified_type)
    file_size = len(file_data)
    safe_filename = sanitize_filename(file.filename or "logo")

    # Delete existing logo attachment if present
    if tenant.logo_url:
        existing_attachment = await db.execute(
            select(Attachment).where(
                Attachment.entity_type == "tenant_logo",
                Attachment.entity_id == tenant_id,
            )
        )
        existing = existing_attachment.scalar_one_or_none()
        if existing:
            await db.delete(existing)

    # Create attachment
    attachment = Attachment(
        tenant_id=tenant_id,
        entity_type="tenant_logo",
        entity_id=tenant_id,
        filename=safe_filename,
        content_type=verified_type,
        file_size=file_size,
        file_data=file_data,
    )
    db.add(attachment)

    # Update tenant logo_url
    tenant.logo_url = f"/admin/tenants/{tenant_id}/logo"

    await db.commit()

    return {"message": "Logo uploaded successfully", "logo_url": tenant.logo_url}


@router.get("/{tenant_id}/logo")
async def get_tenant_logo(
    tenant_id: UUID,
    db: DbSessionDep,
) -> bytes:
    """Get the tenant logo image."""
    from fastapi.responses import Response
    from app.models.attachment import Attachment
    from app.db.session import set_rls_context

    # Set RLS context to allow access (logos are public)
    await set_rls_context(db, is_super_admin=True)

    result = await db.execute(
        select(Attachment).where(
            Attachment.entity_type == "tenant_logo",
            Attachment.entity_id == tenant_id,
        )
    )
    attachment = result.scalar_one_or_none()

    if not attachment:
        raise NotFoundError("Logo not found")

    return Response(
        content=attachment.file_data,
        media_type=attachment.content_type,
        headers={
            "Content-Disposition": safe_content_disposition(attachment.filename, "inline"),
            "Cache-Control": "public, max-age=3600",
        },
    )


@router.delete("/{tenant_id}/logo")
async def delete_tenant_logo(
    tenant_id: UUID,
    current_user: SuperAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """
    Delete the tenant logo.

    Only accessible by super admins.
    """
    from app.models.attachment import Attachment

    # Verify tenant exists
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()

    if not tenant:
        raise NotFoundError(f"Tenant with ID '{tenant_id}' not found")

    # Find and delete attachment
    attachment_result = await db.execute(
        select(Attachment).where(
            Attachment.entity_type == "tenant_logo",
            Attachment.entity_id == tenant_id,
        )
    )
    attachment = attachment_result.scalar_one_or_none()

    if attachment:
        await db.delete(attachment)

    # Clear logo_url
    tenant.logo_url = None

    await db.commit()

    return {"message": "Logo deleted successfully"}
