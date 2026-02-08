"""User management endpoints for tenant admins."""

from uuid import UUID

from fastapi import APIRouter, Query, Request
from sqlalchemy import select

from app.core.dependencies import CurrentUserDep, DbSessionDep, TenantAdminDep, get_client_ip
from app.core.exceptions import AuthorizationError, NotFoundError, ValidationError
from app.core.pagination import paginate
from app.core.security import hash_password
from app.models.audit import AuditAction, AuditLog
from app.models.settings import PronounOption
from app.models.user import User, UserRole
from app.schemas.user import (
    TenantUserCreate,
    TenantUserResponse,
    UserInDB,
    UserListResponse,
    UserUpdate,
)

router = APIRouter()


@router.get("", response_model=UserListResponse)
async def list_tenant_users(
    current_user: TenantAdminDep,
    db: DbSessionDep,
    tenant_id: UUID | None = Query(None, description="Filter by tenant ID (super admin only)"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    is_active: bool | None = None,
) -> UserListResponse:
    """
    List users in the current tenant (or specified tenant for super admin).

    Tenant admins see users in their tenant.
    Super admins can filter by tenant_id.
    """
    # Determine which tenant to query
    if current_user.is_super_admin:
        if tenant_id is None:
            raise ValidationError("Super admin must specify tenant_id")
        query_tenant_id = tenant_id
    else:
        if current_user.tenant_id is None:
            raise ValidationError("Tenant context required")
        query_tenant_id = current_user.tenant_id

    # Build query
    query = select(User).where(User.tenant_id == query_tenant_id)

    if search:
        query = query.where(
            User.email.ilike(f"%{search}%")
            | User.first_name.ilike(f"%{search}%")
            | User.last_name.ilike(f"%{search}%")
        )

    if is_active is not None:
        query = query.where(User.is_active == is_active)

    # Apply ordering and pagination
    query = query.order_by(User.created_at.desc())
    result = await paginate(db, query, page, page_size)

    items = [
        UserInDB(
            id=u.id,
            tenant_id=u.tenant_id,
            email=u.email,
            first_name=u.first_name,
            last_name=u.last_name,
            pronouns=u.pronouns,
            role=u.role,
            is_active=u.is_active,
            has_all_conference_access=u.has_all_conference_access,
            last_login=u.last_login,
            created_at=u.created_at,
            updated_at=u.updated_at,
        )
        for u in result.items
    ]

    return UserListResponse(
        items=items,
        total=result.total,
        page=page,
        page_size=page_size,
        pages=(result.total + page_size - 1) // page_size,
    )


@router.get("/pronoun-options")
async def list_user_pronoun_options(
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> list[dict]:
    """List distinct active pronoun names across all conferences in the tenant."""
    if current_user.tenant_id is None:
        return []

    result = await db.execute(
        select(PronounOption.name)
        .where(
            PronounOption.tenant_id == current_user.tenant_id,
            PronounOption.is_active == True,
        )
        .distinct()
        .order_by(PronounOption.name)
    )
    names = result.scalars().all()
    return [{"id": n, "name": n} for n in names]


@router.post("", response_model=TenantUserResponse, status_code=201)
async def create_tenant_user(
    user_data: TenantUserCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
    tenant_id: UUID | None = Query(None, description="Target tenant ID (super admin only)"),
) -> TenantUserResponse:
    """
    Create a new user within the current tenant.

    Only tenant_admin and user roles can be created.
    Super admins can specify tenant_id to create users in any tenant.
    """
    # Determine target tenant
    if current_user.is_super_admin:
        if tenant_id is None:
            raise ValidationError("Super admin must specify tenant_id")
        target_tenant_id = tenant_id
    else:
        if current_user.tenant_id is None:
            raise ValidationError("Tenant context required")
        target_tenant_id = current_user.tenant_id

    # Validate role - cannot create super_admin
    if user_data.role == UserRole.SUPER_ADMIN.value:
        raise AuthorizationError("Cannot create super admin users")

    # Check email uniqueness within tenant
    existing = await db.execute(
        select(User)
        .where(User.tenant_id == target_tenant_id)
        .where(User.email == user_data.email)
    )
    if existing.scalar_one_or_none():
        raise ValidationError(f"User with email '{user_data.email}' already exists in this tenant")

    # Create user
    user = User(
        tenant_id=target_tenant_id,
        email=user_data.email,
        password_hash=hash_password(user_data.password),
        first_name=user_data.first_name,
        last_name=user_data.last_name,
        pronouns=user_data.pronouns,
        role=user_data.role,
    )
    db.add(user)

    # Log action
    audit_log = AuditLog(
        tenant_id=target_tenant_id,
        user_id=current_user.user_id,
        action=AuditAction.USER_CREATE,
        resource_type="user",
        resource_id=user.id,
        details={"email": user.email, "role": user.role},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(user)

    return TenantUserResponse(
        id=user.id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        pronouns=user.pronouns,
        role=user.role,
        is_active=user.is_active,
        has_all_conference_access=user.has_all_conference_access,
        last_login=user.last_login,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


@router.get("/{user_id}", response_model=TenantUserResponse)
async def get_tenant_user(
    user_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> TenantUserResponse:
    """Get a user by ID within the current tenant."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise NotFoundError(f"User with ID '{user_id}' not found")

    # Verify user belongs to current tenant (unless super admin)
    if not current_user.is_super_admin and user.tenant_id != current_user.tenant_id:
        raise NotFoundError(f"User with ID '{user_id}' not found")

    return TenantUserResponse(
        id=user.id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        pronouns=user.pronouns,
        role=user.role,
        is_active=user.is_active,
        has_all_conference_access=user.has_all_conference_access,
        last_login=user.last_login,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


@router.put("/{user_id}", response_model=TenantUserResponse)
async def update_tenant_user(
    user_id: UUID,
    user_data: UserUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> TenantUserResponse:
    """Update a user within the current tenant."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise NotFoundError(f"User with ID '{user_id}' not found")

    # Verify user belongs to current tenant (unless super admin)
    if not current_user.is_super_admin and user.tenant_id != current_user.tenant_id:
        raise NotFoundError(f"User with ID '{user_id}' not found")

    # Cannot change role to super_admin
    if user_data.role == UserRole.SUPER_ADMIN.value:
        raise AuthorizationError("Cannot promote user to super admin")

    # Cannot demote a super_admin
    if user.role == UserRole.SUPER_ADMIN.value and not current_user.is_super_admin:
        raise AuthorizationError("Cannot modify super admin users")

    # Check email uniqueness if email is being changed
    update_data = user_data.model_dump(exclude_unset=True)
    if "email" in update_data and update_data["email"] != user.email:
        existing = await db.execute(
            select(User)
            .where(User.tenant_id == user.tenant_id)
            .where(User.email == update_data["email"])
            .where(User.id != user_id)
        )
        if existing.scalar_one_or_none():
            raise ValidationError(f"User with email '{update_data['email']}' already exists in this tenant")

    # Handle password separately
    if "password" in update_data:
        update_data["password_hash"] = hash_password(update_data.pop("password"))

    for field, value in update_data.items():
        setattr(user, field, value)

    # Log action
    audit_log = AuditLog(
        tenant_id=user.tenant_id,
        user_id=current_user.user_id,
        action=AuditAction.USER_UPDATE,
        resource_type="user",
        resource_id=user.id,
        details={"updated_fields": list(user_data.model_dump(exclude_unset=True).keys())},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(user)

    return TenantUserResponse(
        id=user.id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        pronouns=user.pronouns,
        role=user.role,
        is_active=user.is_active,
        has_all_conference_access=user.has_all_conference_access,
        last_login=user.last_login,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


@router.delete("/{user_id}")
async def deactivate_tenant_user(
    user_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
    permanent: bool = Query(False, description="Permanently delete user (super admin only)"),
) -> dict:
    """Deactivate a user (soft delete) or permanently delete (super admin only)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise NotFoundError(f"User with ID '{user_id}' not found")

    # Verify user belongs to current tenant (unless super admin)
    if not current_user.is_super_admin and user.tenant_id != current_user.tenant_id:
        raise NotFoundError(f"User with ID '{user_id}' not found")

    # Cannot delete yourself
    if user.id == current_user.user_id:
        raise ValidationError("Cannot delete your own account")

    # Cannot delete super_admin (unless you are super_admin)
    if user.role == UserRole.SUPER_ADMIN.value and not current_user.is_super_admin:
        raise AuthorizationError("Cannot delete super admin users")

    # Permanent delete requires super admin
    if permanent:
        if not current_user.is_super_admin:
            raise AuthorizationError("Only super admins can permanently delete users")

        user_email = user.email
        await db.delete(user)

        # Log action
        audit_log = AuditLog(
            tenant_id=user.tenant_id,
            user_id=current_user.user_id,
            action=AuditAction.USER_DELETE,
            resource_type="user",
            resource_id=user_id,
            details={"email": user_email, "permanent": True},
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent"),
        )
        db.add(audit_log)
        await db.commit()

        return {"message": f"User '{user_email}' has been permanently deleted"}

    # Soft delete (deactivate)
    user.is_active = False

    # Log action
    audit_log = AuditLog(
        tenant_id=user.tenant_id,
        user_id=current_user.user_id,
        action=AuditAction.USER_DELETE,
        resource_type="user",
        resource_id=user.id,
        details={"email": user.email},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()

    return {"message": f"User '{user.email}' has been deactivated"}
