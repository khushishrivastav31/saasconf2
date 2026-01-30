"""FastAPI dependencies for authentication and authorization."""

from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.exceptions import AuthenticationError, AuthorizationError
from app.core.security import decode_token
from app.db.session import get_db, set_rls_context
from app.models.tenant import Tenant
from app.models.user import User, UserRole

settings = get_settings()


class CurrentUser:
    """Container for current user context extracted from JWT."""

    def __init__(
        self,
        user_id: UUID,
        tenant_id: UUID | None,
        role: str,
        modules: list[str],
    ):
        self.user_id = user_id
        self.tenant_id = tenant_id
        self.role = role
        self.modules = modules

    @property
    def is_super_admin(self) -> bool:
        """Check if user is a super admin."""
        return self.role == UserRole.SUPER_ADMIN.value

    @property
    def is_tenant_admin(self) -> bool:
        """Check if user is a tenant admin."""
        return self.role == UserRole.TENANT_ADMIN.value

    def has_module(self, module_code: str) -> bool:
        """Check if user has access to a specific module."""
        return self.is_super_admin or module_code in self.modules


async def get_token_from_header(
    authorization: Annotated[str | None, Header()] = None
) -> str:
    """Extract token from Authorization header."""
    if not authorization:
        raise AuthenticationError("Authorization header missing")

    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise AuthenticationError("Invalid authorization header format")

    return parts[1]


async def get_current_user(
    token: Annotated[str, Depends(get_token_from_header)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CurrentUser:
    """
    Get the current user from the JWT token.

    This dependency:
    1. Decodes and validates the JWT token
    2. Extracts user information from the token
    3. Sets RLS context on the database session

    Returns:
        CurrentUser object with user context
    """
    payload = decode_token(token, token_type="access")

    user_id = UUID(payload["sub"])
    tenant_id = UUID(payload["tenant_id"]) if payload.get("tenant_id") else None
    role = payload["role"]
    modules = payload.get("modules", [])

    # Check if the user's tenant is active
    if tenant_id:
        result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
        tenant = result.scalar_one_or_none()
        if not tenant or not tenant.is_active:
            raise AuthenticationError("Your company account has been deactivated")

    # Set RLS context for this request
    await set_rls_context(
        db,
        tenant_id=str(tenant_id) if tenant_id else None,
        is_super_admin=(role == UserRole.SUPER_ADMIN.value),
    )

    return CurrentUser(
        user_id=user_id,
        tenant_id=tenant_id,
        role=role,
        modules=modules,
    )


async def get_current_active_user(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    """
    Get the current active user from the database.

    This dependency verifies the user still exists and is active.
    """
    result = await db.execute(select(User).where(User.id == current_user.user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise AuthenticationError("User not found")

    if not user.is_active:
        raise AuthenticationError("User account is deactivated")

    return user


async def require_super_admin(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> CurrentUser:
    """Require the current user to be a super admin."""
    if not current_user.is_super_admin:
        raise AuthorizationError("Super admin access required")
    return current_user


async def require_tenant_admin(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> CurrentUser:
    """Require the current user to be a tenant admin or super admin."""
    if not (current_user.is_super_admin or current_user.is_tenant_admin):
        raise AuthorizationError("Tenant admin access required")
    return current_user


def require_module(module_code: str):
    """
    Create a dependency that requires access to a specific module.

    Usage:
        @router.get("/conferences", dependencies=[Depends(require_module("conference"))])
        async def list_conferences(...):
            ...
    """

    async def _require_module(
        current_user: Annotated[CurrentUser, Depends(get_current_user)],
    ) -> CurrentUser:
        if not current_user.has_module(module_code):
            raise AuthorizationError(f"Access to module '{module_code}' required")
        return current_user

    return _require_module


def get_client_ip(request: Request) -> str | None:
    """Extract client IP from request, handling proxies."""
    # Check X-Forwarded-For header (from reverse proxy)
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        # Take the first IP in the list
        return forwarded_for.split(",")[0].strip()

    # Fall back to direct client IP
    if request.client:
        return request.client.host

    return None


# Type aliases for cleaner dependency injection
CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]
ActiveUserDep = Annotated[User, Depends(get_current_active_user)]
SuperAdminDep = Annotated[CurrentUser, Depends(require_super_admin)]
TenantAdminDep = Annotated[CurrentUser, Depends(require_tenant_admin)]
DbSessionDep = Annotated[AsyncSession, Depends(get_db)]
