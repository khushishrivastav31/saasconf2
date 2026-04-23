"""Integration tests for user tenant roles (module-scoped access control)."""

import uuid

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenant import Tenant
from app.models.user import User
from app.models.user_tenant_role import UserTenantRole
from tests.conftest import auth_headers

BASE_URL = "/api/v1/users"


# ── Helper ──────────────────────────────────────────────────────────────


async def _create_role(db: AsyncSession, user_id: uuid.UUID, scope: str, level: str) -> UserTenantRole:
    """Insert a tenant role directly for a user."""
    role = UserTenantRole(user_id=user_id, scope=scope, level=level)
    db.add(role)
    await db.commit()
    return role


# ── GET tenant-roles ────────────────────────────────────────────────────


async def test_get_user_tenant_roles_empty(
    client: AsyncClient,
    regular_user: User,
    tenant_admin_token: str,
) -> None:
    """A user with no roles returns an empty list."""
    resp = await client.get(
        f"{BASE_URL}/{regular_user.id}/tenant-roles",
        headers=auth_headers(tenant_admin_token),
    )
    assert resp.status_code == 200
    assert resp.json() == []


async def test_get_user_tenant_roles_with_roles(
    client: AsyncClient,
    regular_user: User,
    tenant_admin_token: str,
    db_session: AsyncSession,
) -> None:
    """Roles assigned to a user are returned."""
    await _create_role(db_session, regular_user.id, "conferences", "admin")
    resp = await client.get(
        f"{BASE_URL}/{regular_user.id}/tenant-roles",
        headers=auth_headers(tenant_admin_token),
    )
    assert resp.status_code == 200
    roles = resp.json()
    assert len(roles) == 1
    assert roles[0]["scope"] == "conferences"
    assert roles[0]["level"] == "admin"


# ── PUT tenant-roles (bulk set) ────────────────────────────────────────


async def test_set_tenant_roles_assign_admin(
    client: AsyncClient,
    regular_user: User,
    tenant_admin_token: str,
) -> None:
    """Tenant admin can assign admin roles to a user."""
    resp = await client.put(
        f"{BASE_URL}/{regular_user.id}/tenant-roles",
        json={"roles": [{"scope": "conferences", "level": "admin"}]},
        headers=auth_headers(tenant_admin_token),
    )
    assert resp.status_code == 200
    roles = resp.json()
    assert len(roles) == 1
    assert roles[0]["scope"] == "conferences"
    assert roles[0]["level"] == "admin"


async def test_set_tenant_roles_multiple(
    client: AsyncClient,
    regular_user: User,
    tenant_admin_token: str,
) -> None:
    """Can assign multiple scoped roles at once."""
    resp = await client.put(
        f"{BASE_URL}/{regular_user.id}/tenant-roles",
        json={
            "roles": [
                {"scope": "conferences", "level": "admin"},
                {"scope": "accounting", "level": "admin"},
            ]
        },
        headers=auth_headers(tenant_admin_token),
    )
    assert resp.status_code == 200
    roles = resp.json()
    assert len(roles) == 2
    scopes = {r["scope"] for r in roles}
    assert scopes == {"conferences", "accounting"}


async def test_set_tenant_roles_replace_existing(
    client: AsyncClient,
    regular_user: User,
    tenant_admin_token: str,
    db_session: AsyncSession,
) -> None:
    """Setting roles replaces all existing roles."""
    await _create_role(db_session, regular_user.id, "conferences", "admin")

    resp = await client.put(
        f"{BASE_URL}/{regular_user.id}/tenant-roles",
        json={"roles": [{"scope": "trainings", "level": "member"}]},
        headers=auth_headers(tenant_admin_token),
    )
    assert resp.status_code == 200
    roles = resp.json()
    assert len(roles) == 1
    assert roles[0]["scope"] == "trainings"
    assert roles[0]["level"] == "member"


async def test_set_tenant_roles_clear_all(
    client: AsyncClient,
    regular_user: User,
    tenant_admin_token: str,
    db_session: AsyncSession,
) -> None:
    """Sending empty roles list removes all roles."""
    await _create_role(db_session, regular_user.id, "conferences", "admin")

    resp = await client.put(
        f"{BASE_URL}/{regular_user.id}/tenant-roles",
        json={"roles": []},
        headers=auth_headers(tenant_admin_token),
    )
    assert resp.status_code == 200
    assert resp.json() == []


async def test_set_tenant_roles_invalid_scope(
    client: AsyncClient,
    regular_user: User,
    tenant_admin_token: str,
) -> None:
    """Invalid scope is rejected."""
    resp = await client.put(
        f"{BASE_URL}/{regular_user.id}/tenant-roles",
        json={"roles": [{"scope": "invalid", "level": "admin"}]},
        headers=auth_headers(tenant_admin_token),
    )
    assert resp.status_code == 422


async def test_set_tenant_roles_invalid_level(
    client: AsyncClient,
    regular_user: User,
    tenant_admin_token: str,
) -> None:
    """Invalid level is rejected."""
    resp = await client.put(
        f"{BASE_URL}/{regular_user.id}/tenant-roles",
        json={"roles": [{"scope": "conferences", "level": "invalid"}]},
        headers=auth_headers(tenant_admin_token),
    )
    assert resp.status_code == 422


async def test_set_tenant_roles_duplicate_scope_rejected(
    client: AsyncClient,
    regular_user: User,
    tenant_admin_token: str,
) -> None:
    """Duplicate scopes in a single request are rejected."""
    resp = await client.put(
        f"{BASE_URL}/{regular_user.id}/tenant-roles",
        json={
            "roles": [
                {"scope": "conferences", "level": "admin"},
                {"scope": "conferences", "level": "member"},
            ]
        },
        headers=auth_headers(tenant_admin_token),
    )
    assert resp.status_code == 400


async def test_set_tenant_roles_scope_all_requires_super_user(
    client: AsyncClient,
    regular_user: User,
    tenant_admin_token: str,
) -> None:
    """Scope 'all' can only have level 'super_user'."""
    resp = await client.put(
        f"{BASE_URL}/{regular_user.id}/tenant-roles",
        json={"roles": [{"scope": "all", "level": "admin"}]},
        headers=auth_headers(tenant_admin_token),
    )
    assert resp.status_code == 400


async def test_set_tenant_roles_cannot_modify_own(
    client: AsyncClient,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Users cannot modify their own roles."""
    resp = await client.put(
        f"{BASE_URL}/{tenant_admin_user.id}/tenant-roles",
        json={"roles": [{"scope": "conferences", "level": "admin"}]},
        headers=auth_headers(tenant_admin_token),
    )
    assert resp.status_code == 400


# ── Backward compatibility ──────────────────────────────────────────────


async def test_user_list_includes_tenant_roles(
    client: AsyncClient,
    regular_user: User,
    tenant_admin_token: str,
    db_session: AsyncSession,
) -> None:
    """User list endpoint includes tenant_roles field."""
    await _create_role(db_session, regular_user.id, "conferences", "admin")
    resp = await client.get(
        BASE_URL,
        headers=auth_headers(tenant_admin_token),
    )
    assert resp.status_code == 200
    items = resp.json()["items"]
    user_item = next((u for u in items if u["id"] == str(regular_user.id)), None)
    assert user_item is not None
    assert "tenant_roles" in user_item
    assert any(r["scope"] == "conferences" for r in user_item["tenant_roles"])


async def test_auth_me_includes_tenant_roles(
    client: AsyncClient,
    tenant_admin_token: str,
) -> None:
    """/auth/me endpoint includes tenant_roles."""
    resp = await client.get(
        "/api/v1/auth/me",
        headers=auth_headers(tenant_admin_token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "tenant_roles" in data
    assert isinstance(data["tenant_roles"], list)


# ── Authorization ───────────────────────────────────────────────────────


async def test_regular_user_cannot_set_roles(
    client: AsyncClient,
    regular_user: User,
    regular_user_token: str,
    tenant_admin_user: User,
) -> None:
    """Regular users cannot set roles."""
    resp = await client.put(
        f"{BASE_URL}/{tenant_admin_user.id}/tenant-roles",
        json={"roles": [{"scope": "conferences", "level": "admin"}]},
        headers=auth_headers(regular_user_token),
    )
    assert resp.status_code == 403


async def test_super_admin_can_set_roles(
    client: AsyncClient,
    regular_user: User,
    super_admin_token: str,
    tenant: Tenant,
) -> None:
    """SaaS super admin can set roles for any user."""
    resp = await client.put(
        f"{BASE_URL}/{regular_user.id}/tenant-roles",
        json={"roles": [{"scope": "all", "level": "super_user"}]},
        headers=auth_headers(super_admin_token),
    )
    assert resp.status_code == 200
    roles = resp.json()
    assert len(roles) == 1
    assert roles[0]["scope"] == "all"
    assert roles[0]["level"] == "super_user"
