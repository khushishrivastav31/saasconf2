"""User conference access management endpoints."""

import logging
from uuid import UUID

from fastapi import APIRouter, Request
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.config import get_settings
from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    TenantAdminDep,
    get_client_ip,
)
from app.core.email import send_conference_team_invitation_email, send_email_background
from app.core.exceptions import NotFoundError, ValidationError
from app.core.security.pii_crypto import read_pii
from app.models.audit import AuditLog
from app.models.conference import Conference
from app.models.tenant import Tenant
from app.models.user import User
from app.models.user_conference_access import ConferenceAccessLevel, UserConferenceAccess
from app.schemas.user_conference_access import (
    BulkGrantAccessRequest,
    BulkRevokeAccessRequest,
    ConferenceAccessListResponse,
    UserAccessListResponse,
    UserConferenceAccessCreate,
    UserConferenceAccessResponse,
    UserConferenceAccessUpdate,
    UserConferenceAccessWithDetails,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/my-access/{conference_id}")
async def get_my_conference_access(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> dict:
    """
    Get the current user's access level for a specific conference.

    Returns the access level if the user has conference-specific access,
    or derives it from their tenant role.
    """
    # Super admins and tenant admins always have admin access
    if current_user.is_super_admin or current_user.is_tenant_admin:
        return {
            "has_access": True,
            "access_level": "admin",
            "is_conference_admin": True,
        }

    # Check conference-specific access
    result = await db.execute(
        select(UserConferenceAccess)
        .where(UserConferenceAccess.user_id == current_user.user_id)
        .where(UserConferenceAccess.conference_id == conference_id)
    )
    access = result.scalar_one_or_none()

    if not access:
        # User has no conference-specific access, so they have read-only access
        # (since they can see the conference in the list)
        return {
            "has_access": True,
            "access_level": "read_only",
            "is_conference_admin": False,
        }

    return {
        "has_access": True,
        "access_level": access.access_level_value,
        "is_conference_admin": access.is_admin,
    }


@router.post("", response_model=UserConferenceAccessResponse, status_code=201)
async def grant_conference_access(
    access_data: UserConferenceAccessCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> UserConferenceAccessResponse:
    """Grant a user access to a conference."""
    # Verify user exists and belongs to same tenant
    user_result = await db.execute(select(User).where(User.id == access_data.user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise NotFoundError(f"User with ID '{access_data.user_id}' not found")
    if not current_user.is_super_admin and user.tenant_id != current_user.tenant_id:
        raise NotFoundError(f"User with ID '{access_data.user_id}' not found")

    # Verify conference exists and belongs to same tenant
    conf_result = await db.execute(select(Conference).where(Conference.id == access_data.conference_id))
    conference = conf_result.scalar_one_or_none()
    if not conference:
        raise NotFoundError(f"Conference with ID '{access_data.conference_id}' not found")
    if not current_user.is_super_admin and conference.tenant_id != current_user.tenant_id:
        raise NotFoundError(f"Conference with ID '{access_data.conference_id}' not found")

    # Check if access already exists
    existing = await db.execute(
        select(UserConferenceAccess)
        .where(UserConferenceAccess.user_id == access_data.user_id)
        .where(UserConferenceAccess.conference_id == access_data.conference_id)
    )
    if existing.scalar_one_or_none():
        raise ValidationError("User already has access to this conference")

    # Validate access level
    if access_data.access_level not in [e.value for e in ConferenceAccessLevel]:
        raise ValidationError(f"Invalid access level: {access_data.access_level}")

    # Create access record
    access = UserConferenceAccess(
        user_id=access_data.user_id,
        conference_id=access_data.conference_id,
        access_level=access_data.access_level,
        granted_by=current_user.user_id,
    )
    db.add(access)

    # Audit log
    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="user_conference_access.grant",
        resource_type="user_conference_access",
        resource_id=access.id,
        details={
            "user_id": str(access_data.user_id),
            "conference_id": str(access_data.conference_id),
            "access_level": access_data.access_level,
        },
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(access)

    # Send conference team invitation email (fire-and-forget with retry)
    settings = get_settings()
    tenant_result = await db.execute(select(Tenant.name).where(Tenant.id == current_user.tenant_id))
    tenant_name = tenant_result.scalar_one_or_none() or ""
    access_label = "Admin" if access_data.access_level == "admin" else "Read Only"
    send_email_background(
        send_conference_team_invitation_email,
        db,
        email=read_pii(user, "email") or "",
        first_name=user.first_name or "",
        last_name=user.last_name or "",
        conference_name=conference.name,
        company_name=tenant_name,
        access_level=access_label,
        conference_id=conference.id,
        tenant_id=current_user.tenant_id,
        support_email=conference.support_email or conference.contact_email or "",
        base_url=settings.FRONTEND_BASE_URL,
    )

    return UserConferenceAccessResponse.model_validate(access)


@router.get("/user/{user_id}", response_model=ConferenceAccessListResponse)
async def list_user_conference_access(
    user_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> ConferenceAccessListResponse:
    """List all conferences a user has access to."""
    # Verify user exists and belongs to same tenant
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise NotFoundError(f"User with ID '{user_id}' not found")
    if not current_user.is_super_admin and user.tenant_id != current_user.tenant_id:
        raise NotFoundError(f"User with ID '{user_id}' not found")

    # Get all access records for this user
    result = await db.execute(
        select(UserConferenceAccess)
        .options(joinedload(UserConferenceAccess.conference))
        .where(UserConferenceAccess.user_id == user_id)
        .order_by(UserConferenceAccess.granted_at.desc())
    )
    access_records = result.scalars().unique().all()

    items = [
        UserConferenceAccessWithDetails(
            id=a.id,
            user_id=a.user_id,
            conference_id=a.conference_id,
            access_level=a.access_level,
            granted_by=a.granted_by,
            granted_at=a.granted_at,
            conference_name=a.conference.name,
            conference_abbreviation=a.conference.abbreviation,
            user_email=read_pii(user, "email") or "",
            user_name=f"{user.first_name or ''} {user.last_name or ''}".strip() or None,
        )
        for a in access_records
    ]

    return ConferenceAccessListResponse(items=items, total=len(items))


@router.get("/conference/{conference_id}", response_model=UserAccessListResponse)
async def list_conference_user_access(
    conference_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> UserAccessListResponse:
    """List all users who have access to a conference."""
    # Verify conference exists and belongs to same tenant
    conf_result = await db.execute(select(Conference).where(Conference.id == conference_id))
    conference = conf_result.scalar_one_or_none()
    if not conference:
        raise NotFoundError(f"Conference with ID '{conference_id}' not found")
    if not current_user.is_super_admin and conference.tenant_id != current_user.tenant_id:
        raise NotFoundError(f"Conference with ID '{conference_id}' not found")

    # Get all access records for this conference
    result = await db.execute(
        select(UserConferenceAccess)
        .options(joinedload(UserConferenceAccess.user))
        .where(UserConferenceAccess.conference_id == conference_id)
        .order_by(UserConferenceAccess.granted_at.desc())
    )
    access_records = result.scalars().unique().all()

    items = [
        UserConferenceAccessWithDetails(
            id=a.id,
            user_id=a.user_id,
            conference_id=a.conference_id,
            access_level=a.access_level,
            granted_by=a.granted_by,
            granted_at=a.granted_at,
            conference_name=conference.name,
            conference_abbreviation=conference.abbreviation,
            user_email=read_pii(a.user, "email") or "",
            user_name=f"{a.user.first_name or ''} {a.user.last_name or ''}".strip() or None,
        )
        for a in access_records
    ]

    return UserAccessListResponse(items=items, total=len(items))


@router.put("/{access_id}", response_model=UserConferenceAccessResponse)
async def update_conference_access(
    access_id: UUID,
    update_data: UserConferenceAccessUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> UserConferenceAccessResponse:
    """Update a user's conference access level."""
    result = await db.execute(
        select(UserConferenceAccess)
        .options(joinedload(UserConferenceAccess.conference))
        .where(UserConferenceAccess.id == access_id)
    )
    access = result.scalar_one_or_none()
    if not access:
        raise NotFoundError(f"Access record with ID '{access_id}' not found")

    # Verify tenant access
    if not current_user.is_super_admin and access.conference.tenant_id != current_user.tenant_id:
        raise NotFoundError(f"Access record with ID '{access_id}' not found")

    # Validate access level
    if update_data.access_level not in [e.value for e in ConferenceAccessLevel]:
        raise ValidationError(f"Invalid access level: {update_data.access_level}")

    access.access_level = update_data.access_level

    # Audit log
    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="user_conference_access.update",
        resource_type="user_conference_access",
        resource_id=access.id,
        details={
            "user_id": str(access.user_id),
            "conference_id": str(access.conference_id),
            "access_level": update_data.access_level,
        },
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(access)

    return UserConferenceAccessResponse.model_validate(access)


@router.delete("/{access_id}")
async def revoke_conference_access(
    access_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Revoke a user's access to a conference."""
    result = await db.execute(
        select(UserConferenceAccess)
        .options(joinedload(UserConferenceAccess.conference))
        .where(UserConferenceAccess.id == access_id)
    )
    access = result.scalar_one_or_none()
    if not access:
        raise NotFoundError(f"Access record with ID '{access_id}' not found")

    # Verify tenant access
    if not current_user.is_super_admin and access.conference.tenant_id != current_user.tenant_id:
        raise NotFoundError(f"Access record with ID '{access_id}' not found")

    user_id = access.user_id
    conference_id = access.conference_id

    await db.delete(access)

    # Audit log
    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="user_conference_access.revoke",
        resource_type="user_conference_access",
        resource_id=access_id,
        details={
            "user_id": str(user_id),
            "conference_id": str(conference_id),
        },
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()

    return {"message": "Access revoked successfully"}


@router.post("/user/{user_id}/bulk-grant")
async def bulk_grant_access(
    user_id: UUID,
    bulk_data: BulkGrantAccessRequest,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Grant a user access to multiple conferences at once."""
    # Verify user exists and belongs to same tenant
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise NotFoundError(f"User with ID '{user_id}' not found")
    if not current_user.is_super_admin and user.tenant_id != current_user.tenant_id:
        raise NotFoundError(f"User with ID '{user_id}' not found")

    # Validate access level
    if bulk_data.access_level not in [e.value for e in ConferenceAccessLevel]:
        raise ValidationError(f"Invalid access level: {bulk_data.access_level}")

    granted_count = 0
    skipped_count = 0

    for conference_id in bulk_data.conference_ids:
        # Verify conference exists and belongs to same tenant
        conf_result = await db.execute(select(Conference).where(Conference.id == conference_id))
        conference = conf_result.scalar_one_or_none()
        if not conference:
            skipped_count += 1
            continue
        if not current_user.is_super_admin and conference.tenant_id != current_user.tenant_id:
            skipped_count += 1
            continue

        # Check if access already exists
        existing = await db.execute(
            select(UserConferenceAccess)
            .where(UserConferenceAccess.user_id == user_id)
            .where(UserConferenceAccess.conference_id == conference_id)
        )
        if existing.scalar_one_or_none():
            skipped_count += 1
            continue

        # Create access record
        access = UserConferenceAccess(
            user_id=user_id,
            conference_id=conference_id,
            access_level=bulk_data.access_level,
            granted_by=current_user.user_id,
        )
        db.add(access)
        granted_count += 1

    if granted_count > 0:
        # Audit log
        audit_log = AuditLog(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action="user_conference_access.bulk_grant",
            resource_type="user",
            resource_id=user_id,
            details={
                "conference_ids": [str(c) for c in bulk_data.conference_ids],
                "access_level": bulk_data.access_level,
                "granted_count": granted_count,
                "skipped_count": skipped_count,
            },
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent"),
        )
        db.add(audit_log)

    await db.commit()

    return {
        "message": f"Access granted to {granted_count} conferences",
        "granted": granted_count,
        "skipped": skipped_count,
    }


@router.post("/user/{user_id}/bulk-revoke")
async def bulk_revoke_access(
    user_id: UUID,
    bulk_data: BulkRevokeAccessRequest,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Revoke a user's access from multiple conferences at once."""
    # Verify user exists and belongs to same tenant
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise NotFoundError(f"User with ID '{user_id}' not found")
    if not current_user.is_super_admin and user.tenant_id != current_user.tenant_id:
        raise NotFoundError(f"User with ID '{user_id}' not found")

    revoked_count = 0

    for conference_id in bulk_data.conference_ids:
        # Find and delete access record
        result = await db.execute(
            select(UserConferenceAccess)
            .where(UserConferenceAccess.user_id == user_id)
            .where(UserConferenceAccess.conference_id == conference_id)
        )
        access = result.scalar_one_or_none()
        if access:
            await db.delete(access)
            revoked_count += 1

    if revoked_count > 0:
        # Audit log
        audit_log = AuditLog(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action="user_conference_access.bulk_revoke",
            resource_type="user",
            resource_id=user_id,
            details={
                "conference_ids": [str(c) for c in bulk_data.conference_ids],
                "revoked_count": revoked_count,
            },
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent"),
        )
        db.add(audit_log)

    await db.commit()

    return {
        "message": f"Access revoked from {revoked_count} conferences",
        "revoked": revoked_count,
    }


async def grant_conference_access_for_team_member(
    db: DbSessionDep,
    user_id: UUID,
    conference_id: UUID,
    is_manager: bool,
    granted_by: UUID | None = None,
) -> UserConferenceAccess | None:
    """
    Internal helper to grant conference access when a team member is linked to a user.

    Called when:
    - Adding a team member with a linked user account
    - Linking an existing user to a team member

    Returns the access record if created, None if already exists or user doesn't exist.
    """
    # Verify user exists (handles stale user_id references)
    user_result = await db.execute(select(User).where(User.id == user_id))
    if not user_result.scalar_one_or_none():
        # User doesn't exist - silently skip (stale data)
        return None

    # Check if access already exists
    existing = await db.execute(
        select(UserConferenceAccess)
        .where(UserConferenceAccess.user_id == user_id)
        .where(UserConferenceAccess.conference_id == conference_id)
    )
    if existing.scalar_one_or_none():
        return None

    # Create access record
    access_level = ConferenceAccessLevel.ADMIN.value if is_manager else ConferenceAccessLevel.READ_ONLY.value
    access = UserConferenceAccess(
        user_id=user_id,
        conference_id=conference_id,
        access_level=access_level,
        granted_by=granted_by,
    )
    db.add(access)

    # Flush to make the insert visible to subsequent queries in the same transaction
    await db.flush()

    return access
