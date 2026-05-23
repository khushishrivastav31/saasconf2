"""User management endpoints for tenant admins."""

import logging
import secrets
from datetime import timedelta
from uuid import UUID

from fastapi import APIRouter, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.core.applicant_security import generate_email_verification_token
from app.core.dependencies import CurrentUserDep, DbSessionDep, TenantAdminDep, get_client_ip
from app.core.email import send_email_background, send_tenant_user_welcome_email
from app.core.exceptions import AuthorizationError, NotFoundError, ValidationError
from app.core.pagination import calculate_pages, paginate
from app.core.search import unaccent_ilike
from app.core.security import hash_password
from app.core.security.pii_crypto import hash_email, read_pii
from app.core.security.token_blacklist import (
    MAX_LOGIN_ATTEMPTS,
    clear_failed_logins,
    get_failed_login_count,
)
from app.core.utils import utcnow
from app.models.audit import AuditAction, AuditLog
from app.models.settings import PronounOption
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from app.models.user_password_reset import UserPasswordReset
from app.models.user_tenant_role import TenantRoleLevel, UserTenantRole
from app.schemas.user import (
    BulkTenantRoleAssignment,
    TenantRoleResponse,
    TenantUserCreate,
    TenantUserResponse,
    UserInDB,
    UserListResponse,
    UserUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter()


async def _get_tenant_roles(db: AsyncSession, user_id: UUID) -> list[TenantRoleResponse]:
    """Load tenant roles for a user as response objects."""
    result = await db.execute(select(UserTenantRole).where(UserTenantRole.user_id == user_id))
    return [TenantRoleResponse(scope=r.scope, level=r.level) for r in result.scalars().all()]


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

    # Build query — eagerly load tenant_roles
    query = select(User).where(User.tenant_id == query_tenant_id).options(selectinload(User.tenant_roles))

    if search:
        name_clause = unaccent_ilike(User.first_name, search) | unaccent_ilike(User.last_name, search)
        # Email is encrypted at rest — partial match is impossible; only exact
        # (case/whitespace-normalized) matches resolve via email_hash.
        if "@" in search:
            query = query.where(name_clause | (User.email_hash == hash_email(search)))
        else:
            query = query.where(name_clause)

    if is_active is not None:
        query = query.where(User.is_active == is_active)

    # Apply ordering and pagination
    query = query.order_by(User.created_at.desc())
    result = await paginate(db, query, page, page_size)

    items = [
        UserInDB(
            id=u.id,
            tenant_id=u.tenant_id,
            email=read_pii(u, "email") or "",
            first_name=u.first_name,
            last_name=u.last_name,
            pronouns=u.pronouns,
            role=u.role,
            is_active=u.is_active,
            has_all_conference_access=u.has_all_conference_access,
            tenant_roles=[TenantRoleResponse(scope=r.scope, level=r.level) for r in u.tenant_roles],
            last_login=u.last_login,
            created_at=u.created_at,
            updated_at=u.updated_at,
            address_line_1=u.address_line_1,
            address_line_2=u.address_line_2,
            city=u.city,
            postal_code=u.postal_code,
            country=u.country,
        )
        for u in result.items
    ]

    return UserListResponse(
        items=items,
        total=result.total,
        page=page,
        page_size=page_size,
        pages=calculate_pages(result.total, page_size),
    )


@router.get("/pronoun-options")
async def list_user_pronoun_options(
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> list[dict]:
    """List active pronoun options for the tenant."""
    if current_user.tenant_id is None:
        return []

    result = await db.execute(
        select(PronounOption.name)
        .where(
            PronounOption.tenant_id == current_user.tenant_id,
            PronounOption.is_active == True,
        )
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
        select(User).where(User.tenant_id == target_tenant_id).where(User.email_hash == hash_email(user_data.email))
    )
    if existing.scalar_one_or_none():
        raise ValidationError(f"User with email '{user_data.email}' already exists in this tenant")

    # Create user — use provided password or generate a random unusable one
    pw_hash = hash_password(user_data.password) if user_data.password else hash_password(secrets.token_urlsafe(32))

    user = User(
        tenant_id=target_tenant_id,
        email=user_data.email,
        password_hash=pw_hash,
        first_name=user_data.first_name,
        last_name=user_data.last_name,
        pronouns=user_data.pronouns,
        role=user_data.role,
    )
    db.add(user)
    await db.flush()

    # Generate invite token when no password was provided
    raw_token = None
    if not user_data.password:
        raw_token, token_hash = generate_email_verification_token()
        reset = UserPasswordReset(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=utcnow() + timedelta(days=7),
        )
        db.add(reset)

    # Log action
    audit_log = AuditLog(
        tenant_id=target_tenant_id,
        user_id=current_user.user_id,
        action=AuditAction.USER_CREATE,
        resource_type="user",
        resource_id=user.id,
        details={"email": read_pii(user, "email"), "role": user.role},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    if raw_token:
        db.add(
            AuditLog(
                tenant_id=target_tenant_id,
                user_id=current_user.user_id,
                action=AuditAction.USER_INVITE_SENT,
                resource_type="user",
                resource_id=user.id,
                details={"email": read_pii(user, "email"), "role": user.role},
                ip_address=get_client_ip(request),
                user_agent=request.headers.get("User-Agent"),
            )
        )

    await db.commit()
    await db.refresh(user)

    # Send invite email after commit
    if raw_token:
        settings = get_settings()
        frontend_base = settings.FRONTEND_BASE_URL
        # Look up tenant name, email domain, and contact email
        tenant_result = await db.execute(
            select(Tenant.name, Tenant.contact_persons).where(Tenant.id == target_tenant_id)
        )
        tenant_row = tenant_result.one_or_none()
        tenant_name = tenant_row[0] if tenant_row else "SaaSConf"
        # Use first contact person's email as support email
        tenant_support_email = ""
        if tenant_row and tenant_row[1]:
            for cp in tenant_row[1]:
                if isinstance(cp, dict) and cp.get("email"):
                    tenant_support_email = cp["email"]
                    break
        user_type = "Administrator" if user.role == UserRole.TENANT_ADMIN.value else "Team Member"
        send_email_background(
            send_tenant_user_welcome_email,
            db,
            email=read_pii(user, "email") or "",
            token=raw_token,
            tenant_id=target_tenant_id,
            company_name=tenant_name,
            user_type=user_type,
            first_name=user.first_name or "",
            last_name=user.last_name or "",
            support_email=tenant_support_email,
            base_url=frontend_base,
        )

    tenant_roles = await _get_tenant_roles(db, user.id)
    return TenantUserResponse(
        id=user.id,
        email=read_pii(user, "email") or "",
        first_name=user.first_name,
        last_name=user.last_name,
        pronouns=user.pronouns,
        role=user.role,
        is_active=user.is_active,
        has_all_conference_access=user.has_all_conference_access,
        tenant_roles=tenant_roles,
        last_login=user.last_login,
        created_at=user.created_at,
        updated_at=user.updated_at,
        address_line_1=user.address_line_1,
        address_line_2=user.address_line_2,
        city=user.city,
        postal_code=user.postal_code,
        country=user.country,
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

    tenant_roles = await _get_tenant_roles(db, user.id)
    return TenantUserResponse(
        id=user.id,
        email=read_pii(user, "email") or "",
        first_name=user.first_name,
        last_name=user.last_name,
        pronouns=user.pronouns,
        role=user.role,
        is_active=user.is_active,
        has_all_conference_access=user.has_all_conference_access,
        tenant_roles=tenant_roles,
        last_login=user.last_login,
        created_at=user.created_at,
        updated_at=user.updated_at,
        address_line_1=user.address_line_1,
        address_line_2=user.address_line_2,
        city=user.city,
        postal_code=user.postal_code,
        country=user.country,
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

    # Cannot modify your own profile via this endpoint. The role + is_active
    # fields here feed back into the requester's own permission checks
    # (``current_user.is_tenant_admin`` falls back to ``user.role ==
    # TENANT_ADMIN`` if no tenant_roles are set), so allowing self-edit
    # would let a user demote themselves into an admin-equivalent or
    # deactivate their own account by accident. Profile self-service
    # belongs in a separate ``/me`` endpoint with a narrower payload.
    if user.id == current_user.user_id:
        raise ValidationError("Cannot modify your own user record via the admin endpoint")

    # Cannot change role to super_admin
    if user_data.role == UserRole.SUPER_ADMIN.value:
        raise AuthorizationError("Cannot promote user to super admin")

    # Cannot demote a super_admin
    if user.role == UserRole.SUPER_ADMIN.value and not current_user.is_super_admin:
        raise AuthorizationError("Cannot modify super admin users")

    # Check email uniqueness if email is being changed
    update_data = user_data.model_dump(exclude_unset=True)
    if "email" in update_data and update_data["email"] != read_pii(user, "email"):
        existing = await db.execute(
            select(User)
            .where(User.tenant_id == user.tenant_id)
            .where(User.email_hash == hash_email(update_data["email"]))
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
    logger.info("User %s updated successfully. Fields: %s", user_id, list(update_data.keys()))

    tenant_roles = await _get_tenant_roles(db, user.id)
    return TenantUserResponse(
        id=user.id,
        email=read_pii(user, "email") or "",
        first_name=user.first_name,
        last_name=user.last_name,
        pronouns=user.pronouns,
        role=user.role,
        is_active=user.is_active,
        has_all_conference_access=user.has_all_conference_access,
        tenant_roles=tenant_roles,
        last_login=user.last_login,
        created_at=user.created_at,
        updated_at=user.updated_at,
        address_line_1=user.address_line_1,
        address_line_2=user.address_line_2,
        city=user.city,
        postal_code=user.postal_code,
        country=user.country,
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

    # Permanent delete
    if permanent:
        user_email = read_pii(user, "email")
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

    # Clear super_user_id if this user was the tenant's super user
    if user.tenant_id:
        tenant_result = await db.execute(select(Tenant).where(Tenant.id == user.tenant_id))
        tenant = tenant_result.scalar_one_or_none()
        if tenant and tenant.super_user_id == user.id:
            tenant.super_user_id = None

    # Log action
    audit_log = AuditLog(
        tenant_id=user.tenant_id,
        user_id=current_user.user_id,
        action=AuditAction.USER_DELETE,
        resource_type="user",
        resource_id=user.id,
        details={"email": read_pii(user, "email")},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()

    return {"message": f"User '{read_pii(user, 'email')}' has been deactivated"}


@router.post("/{user_id}/unlock-login")
async def unlock_user_login(
    user_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Clear the brute-force login lockout (failed-attempt counter) for a user.

    After 5 failed logins within 15 minutes the account is locked. This
    lets a tenant admin (or super admin) lift the lock for a colleague
    who fat-fingered their password.
    """
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise NotFoundError(f"User with ID '{user_id}' not found")

    if not current_user.is_super_admin and user.tenant_id != current_user.tenant_id:
        raise NotFoundError(f"User with ID '{user_id}' not found")

    email = read_pii(user, "email") or ""
    attempts_before = await get_failed_login_count(email) if email else 0
    was_locked = attempts_before >= MAX_LOGIN_ATTEMPTS
    if email:
        await clear_failed_logins(email)

    audit_log = AuditLog(
        tenant_id=user.tenant_id,
        user_id=current_user.user_id,
        action=AuditAction.USER_UNLOCK_LOGIN,
        resource_type="user",
        resource_id=user.id,
        details={"email": email, "attempts_cleared": attempts_before, "was_locked": was_locked},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()

    return {
        "message": (
            f"Cleared {attempts_before} failed login attempt(s) for '{email}'"
            if attempts_before > 0
            else f"No failed login attempts on record for '{email}'"
        ),
        "attempts_cleared": attempts_before,
        "was_locked": was_locked,
    }


@router.post("/{user_id}/resend-invite")
async def resend_invite(
    user_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Resend an invite email to a user who has never logged in."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise NotFoundError(f"User with ID '{user_id}' not found")

    if not current_user.is_super_admin and user.tenant_id != current_user.tenant_id:
        raise NotFoundError(f"User with ID '{user_id}' not found")

    if user.last_login is not None:
        raise ValidationError("Cannot resend invite — user has already logged in")

    if not user.is_active:
        raise ValidationError("Cannot resend invite — user is deactivated")

    # Invalidate any previous unused tokens
    prev_tokens = await db.execute(
        select(UserPasswordReset).where(
            UserPasswordReset.user_id == user.id,
            UserPasswordReset.used_at.is_(None),
        )
    )
    for prev in prev_tokens.scalars().all():
        prev.used_at = utcnow()

    # Generate new invite token (7-day expiry)
    raw_token, token_hash = generate_email_verification_token()
    reset = UserPasswordReset(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=utcnow() + timedelta(days=7),
    )
    db.add(reset)

    db.add(
        AuditLog(
            tenant_id=user.tenant_id,
            user_id=current_user.user_id,
            action=AuditAction.USER_INVITE_SENT,
            resource_type="user",
            resource_id=user.id,
            details={"email": read_pii(user, "email"), "resend": True},
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent"),
        )
    )

    await db.commit()

    # Send invite email
    settings = get_settings()
    frontend_base = settings.FRONTEND_BASE_URL
    tenant_result = await db.execute(select(Tenant.name, Tenant.contact_persons).where(Tenant.id == user.tenant_id))
    tenant_row = tenant_result.one_or_none()
    tenant_name = tenant_row[0] if tenant_row else "SaaSConf"
    # Use first contact person's email as support email
    tenant_support_email = ""
    if tenant_row and tenant_row[1]:
        for cp in tenant_row[1]:
            if isinstance(cp, dict) and cp.get("email"):
                tenant_support_email = cp["email"]
                break
    user_type = "Administrator" if user.role == UserRole.TENANT_ADMIN.value else "Team Member"
    user_email = read_pii(user, "email") or ""
    await send_tenant_user_welcome_email(
        db,
        email=user_email,
        token=raw_token,
        tenant_id=user.tenant_id,
        company_name=tenant_name,
        user_type=user_type,
        first_name=user.first_name or "",
        last_name=user.last_name or "",
        support_email=tenant_support_email,
        base_url=frontend_base,
    )

    return {"message": f"Invite email has been resent to {user_email}"}


@router.get("/{user_id}/tenant-roles", response_model=list[TenantRoleResponse])
async def get_user_tenant_roles(
    user_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> list[TenantRoleResponse]:
    """Get tenant roles for a specific user."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise NotFoundError(f"User with ID '{user_id}' not found")

    if not current_user.is_super_admin and user.tenant_id != current_user.tenant_id:
        raise NotFoundError(f"User with ID '{user_id}' not found")

    return await _get_tenant_roles(db, user.id)


@router.put("/{user_id}/tenant-roles", response_model=list[TenantRoleResponse])
async def set_user_tenant_roles(
    user_id: UUID,
    data: BulkTenantRoleAssignment,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> list[TenantRoleResponse]:
    """
    Bulk-set tenant roles for a user. Replaces all existing roles.

    Only super admins and users with scope="all" + level="super_user" can assign
    the super_user level. Tenant admins can assign admin and member levels.
    """
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise NotFoundError(f"User with ID '{user_id}' not found")

    if not current_user.is_super_admin and user.tenant_id != current_user.tenant_id:
        raise NotFoundError(f"User with ID '{user_id}' not found")

    # Cannot modify super_admin users
    if user.role == UserRole.SUPER_ADMIN.value:
        raise AuthorizationError("Cannot modify roles for super admin users")

    # Cannot modify your own roles (prevents self-demotion)
    if user.id == current_user.user_id:
        raise ValidationError("Cannot modify your own roles")

    # Authorization: only super_user-level users (or SaaS super admin) can grant super_user
    has_super_user_assignment = any(r.level == "super_user" for r in data.roles)
    if has_super_user_assignment:
        if not (current_user.is_super_admin or current_user.is_tenant_super_user):
            raise AuthorizationError("Only super users can grant the super_user level")

    # Validate: scope="all" can only be combined with super_user level
    for r in data.roles:
        if r.scope == "all" and r.level != "super_user":
            raise ValidationError("Scope 'all' can only be assigned with level 'super_user'")

    # Check for duplicate scopes in the request
    scopes_seen: set[str] = set()
    for r in data.roles:
        if r.scope in scopes_seen:
            raise ValidationError(f"Duplicate scope '{r.scope}' in role assignment")
        scopes_seen.add(r.scope)

    # Delete existing roles
    existing = await db.execute(select(UserTenantRole).where(UserTenantRole.user_id == user_id))
    for role in existing.scalars().all():
        await db.delete(role)
    await db.flush()

    # Insert new roles
    for r in data.roles:
        db.add(
            UserTenantRole(
                user_id=user_id,
                scope=r.scope,
                level=r.level,
                granted_by=current_user.user_id,
            )
        )

    # Sync ``User.role`` for backward compat. The legacy ``role`` column is
    # still consulted by ``is_tenant_admin``, so we must only promote to
    # ``TENANT_ADMIN`` when the user actually holds an admin-or-higher
    # scoped role. Previously this promoted *any* tenant_role (including
    # ``level=member``), which silently turned every Conferences-Member
    # invite into a tenant-admin and bypassed every write guard
    # (Brandon's QA 0.5.1.2 and 0.5.1.7).
    has_admin_role = any(r.level in (TenantRoleLevel.ADMIN.value, TenantRoleLevel.SUPER_USER.value) for r in data.roles)
    if has_admin_role:
        user.role = UserRole.TENANT_ADMIN.value
    else:
        user.role = UserRole.USER.value

    # Log action
    db.add(
        AuditLog(
            tenant_id=user.tenant_id,
            user_id=current_user.user_id,
            action=AuditAction.USER_UPDATE,
            resource_type="user",
            resource_id=user.id,
            details={
                "action": "set_tenant_roles",
                "roles": [{"scope": r.scope, "level": r.level} for r in data.roles],
            },
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent"),
        )
    )

    await db.commit()

    return await _get_tenant_roles(db, user.id)
