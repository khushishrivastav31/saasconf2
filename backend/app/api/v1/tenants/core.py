"""Tenant CRUD endpoints (super admin only)."""

import secrets
from datetime import timedelta
from uuid import UUID

from fastapi import APIRouter, Query, Request
from sqlalchemy import func, select

from app.config import get_settings
from app.core.applicant_security import generate_email_verification_token
from app.core.dependencies import DbSessionDep, SuperAdminDep, get_client_ip
from app.core.email import send_tenant_user_welcome_email
from app.core.exceptions import NotFoundError, ValidationError
from app.core.pagination import calculate_pages, paginate
from app.core.search import unaccent_ilike
from app.core.security import hash_password
from app.core.utils import utcnow
from app.models.audit import AuditAction, AuditLog
from app.models.module import TenantModule
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from app.models.user_password_reset import UserPasswordReset
from app.schemas.tenant import (
    TenantCreate,
    TenantListResponse,
    TenantResponse,
    TenantUpdate,
)

from ._shared import _build_tenant_response

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
        query = query.where(unaccent_ilike(Tenant.name, search) | unaccent_ilike(Tenant.slug, search))

    if is_active is not None:
        query = query.where(Tenant.is_active == is_active)

    # Apply ordering and pagination
    query = query.order_by(Tenant.created_at.desc())
    result = await paginate(db, query, page, page_size)

    # Get user and module counts for each tenant
    items = []
    for tenant in result.items:
        # Count users
        user_count = (await db.execute(select(func.count()).where(User.tenant_id == tenant.id))).scalar() or 0

        # Count modules
        module_count = (await db.execute(select(func.count()).where(TenantModule.tenant_id == tenant.id))).scalar() or 0

        items.append(_build_tenant_response(tenant, user_count, module_count))

    return TenantListResponse(
        items=items,
        total=result.total,
        page=page,
        page_size=page_size,
        pages=calculate_pages(result.total, page_size),
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
        email_domain=tenant_data.email_domain,
        contact_persons=[cp.model_dump() for cp in tenant_data.contact_persons] if tenant_data.contact_persons else [],
        comments=tenant_data.comments,
    )
    db.add(tenant)
    await db.flush()  # Get tenant ID

    # Optionally create admin user
    admin_user = None
    if tenant_data.admin_email:
        if tenant_data.admin_password:
            pw_hash = hash_password(tenant_data.admin_password)
        else:
            pw_hash = hash_password(secrets.token_urlsafe(32))

        admin_user = User(
            tenant_id=tenant.id,
            email=tenant_data.admin_email,
            password_hash=pw_hash,
            first_name=tenant_data.admin_first_name,
            last_name=tenant_data.admin_last_name,
            role=UserRole.TENANT_ADMIN.value,
        )
        db.add(admin_user)
        await db.flush()

        # Generate invite token (7-day expiry)
        raw_token, token_hash = generate_email_verification_token()
        reset = UserPasswordReset(
            user_id=admin_user.id,
            token_hash=token_hash,
            expires_at=utcnow() + timedelta(days=7),
        )
        db.add(reset)

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

    if admin_user:
        db.add(
            AuditLog(
                tenant_id=tenant.id,
                user_id=current_user.user_id,
                action=AuditAction.USER_INVITE_SENT,
                resource_type="user",
                resource_id=admin_user.id,
                details={"email": admin_user.email, "role": admin_user.role},
                ip_address=get_client_ip(request),
                user_agent=request.headers.get("User-Agent"),
            )
        )

    await db.commit()
    await db.refresh(tenant)

    # Send invite email after commit (so user exists in DB)
    if admin_user:
        settings = get_settings()
        frontend_base = settings.CORS_ORIGINS[0] if settings.CORS_ORIGINS else "http://localhost:3000"
        from_email = f"noreply@{tenant.email_domain}" if tenant.email_domain else None
        await send_tenant_user_welcome_email(
            db,
            email=admin_user.email,
            token=raw_token,
            company_name=tenant.name,
            user_type="Administrator",
            first_name=admin_user.first_name or "",
            last_name=admin_user.last_name or "",
            base_url=frontend_base,
            from_email=from_email,
        )

    return _build_tenant_response(
        tenant,
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
    user_count = (await db.execute(select(func.count()).where(User.tenant_id == tenant.id))).scalar() or 0

    module_count = (await db.execute(select(func.count()).where(TenantModule.tenant_id == tenant.id))).scalar() or 0

    return _build_tenant_response(tenant, user_count, module_count)


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
        existing = await db.execute(select(Tenant).where(Tenant.slug == tenant_data.slug))
        if existing.scalar_one_or_none():
            raise ValidationError(f"Tenant with slug '{tenant_data.slug}' already exists")

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
    user_count = (await db.execute(select(func.count()).where(User.tenant_id == tenant.id))).scalar() or 0

    module_count = (await db.execute(select(func.count()).where(TenantModule.tenant_id == tenant.id))).scalar() or 0

    return _build_tenant_response(tenant, user_count, module_count)


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
