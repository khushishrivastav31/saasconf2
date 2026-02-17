"""Tenant super user management endpoints (super admin only)."""

from uuid import UUID

from fastapi import APIRouter, Request
from sqlalchemy import select

from app.core.dependencies import DbSessionDep, SuperAdminDep, get_client_ip
from app.core.exceptions import NotFoundError, ValidationError
from app.models.audit import AuditAction, AuditLog
from app.models.tenant import Tenant
from app.models.user import User

router = APIRouter()


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
