"""Tests for audit log endpoints (super admin only)."""

import uuid

import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.audit import AuditLog
from app.models.tenant import Tenant
from app.models.user import User
from tests.conftest import auth_headers

AUDIT_URL = "/api/v1/admin/audit-logs"


# ── Helpers ────────────────────────────────────────────────────────────


def _make_token(user: User, modules: list[str] | None = None) -> str:
    """Create a valid JWT access token for a user."""
    return create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role,
        modules=modules or [],
    )


# ── Fixtures ───────────────────────────────────────────────────────────


@pytest_asyncio.fixture()
async def audit_logs(
    db_session: AsyncSession,
    tenant: Tenant,
    super_admin_user: User,
) -> list[AuditLog]:
    """Seed several audit log entries for testing."""
    logs = []
    actions_and_resources = [
        ("user.login", "user"),
        ("user.login", "user"),
        ("tenant.create", "tenant"),
        ("conference.create", "conference"),
        ("conference.update", "conference"),
    ]
    for action, resource_type in actions_and_resources:
        log = AuditLog(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            user_id=super_admin_user.id,
            action=action,
            resource_type=resource_type,
            resource_id=uuid.uuid4(),
            details={"info": f"test {action}"},
            ip_address="127.0.0.1",
            user_agent="pytest",
        )
        db_session.add(log)
        logs.append(log)
    await db_session.commit()
    return logs


# ═══════════════════════════════════════════════════════════════════════
# 1. LIST AUDIT LOGS
# ═══════════════════════════════════════════════════════════════════════


async def test_list_audit_logs(
    client: AsyncClient,
    super_admin_user: User,
    super_admin_token: str,
    audit_logs: list[AuditLog],
) -> None:
    """Super admin can list audit logs and gets a paginated response."""
    response = await client.get(
        AUDIT_URL,
        headers=auth_headers(super_admin_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert "page" in data
    assert "page_size" in data
    assert "pages" in data
    assert data["total"] == 5
    assert len(data["items"]) == 5
    assert data["page"] == 1


async def test_list_audit_logs_empty(
    client: AsyncClient,
    super_admin_user: User,
    super_admin_token: str,
) -> None:
    """Super admin listing audit logs when none exist returns empty list."""
    response = await client.get(
        AUDIT_URL,
        headers=auth_headers(super_admin_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["items"] == []
    assert data["total"] == 0


# ═══════════════════════════════════════════════════════════════════════
# 2. LIST ACTIONS / RESOURCE TYPES
# ═══════════════════════════════════════════════════════════════════════


async def test_list_audit_log_actions(
    client: AsyncClient,
    super_admin_user: User,
    super_admin_token: str,
    audit_logs: list[AuditLog],
) -> None:
    """Super admin can list distinct audit log actions."""
    response = await client.get(
        f"{AUDIT_URL}/actions",
        headers=auth_headers(super_admin_token),
    )
    assert response.status_code == 200
    actions = response.json()
    assert isinstance(actions, list)
    # We seeded user.login, tenant.create, conference.create, conference.update
    assert "user.login" in actions
    assert "tenant.create" in actions
    assert "conference.create" in actions
    assert "conference.update" in actions
    # Should be sorted
    assert actions == sorted(actions)


async def test_list_audit_log_resource_types(
    client: AsyncClient,
    super_admin_user: User,
    super_admin_token: str,
    audit_logs: list[AuditLog],
) -> None:
    """Super admin can list distinct audit log resource types."""
    response = await client.get(
        f"{AUDIT_URL}/resource-types",
        headers=auth_headers(super_admin_token),
    )
    assert response.status_code == 200
    resource_types = response.json()
    assert isinstance(resource_types, list)
    assert "user" in resource_types
    assert "tenant" in resource_types
    assert "conference" in resource_types
    # Should be sorted
    assert resource_types == sorted(resource_types)


# ═══════════════════════════════════════════════════════════════════════
# 3. PAGINATION
# ═══════════════════════════════════════════════════════════════════════


async def test_audit_logs_pagination(
    client: AsyncClient,
    super_admin_user: User,
    super_admin_token: str,
    audit_logs: list[AuditLog],
) -> None:
    """Pagination parameters work correctly for audit logs."""
    # Request page 1, page_size 2
    response = await client.get(
        AUDIT_URL,
        params={"page": 1, "page_size": 2},
        headers=auth_headers(super_admin_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 5
    assert len(data["items"]) == 2
    assert data["page"] == 1
    assert data["page_size"] == 2
    assert data["pages"] == 3  # ceil(5/2)

    # Request page 2, page_size 2
    response = await client.get(
        AUDIT_URL,
        params={"page": 2, "page_size": 2},
        headers=auth_headers(super_admin_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 5
    assert len(data["items"]) == 2
    assert data["page"] == 2

    # Request page 3, page_size 2
    response = await client.get(
        AUDIT_URL,
        params={"page": 3, "page_size": 2},
        headers=auth_headers(super_admin_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 5
    assert len(data["items"]) == 1
    assert data["page"] == 3


# ═══════════════════════════════════════════════════════════════════════
# 4. FILTERING
# ═══════════════════════════════════════════════════════════════════════


async def test_audit_logs_filter_by_action(
    client: AsyncClient,
    super_admin_user: User,
    super_admin_token: str,
    audit_logs: list[AuditLog],
) -> None:
    """Filtering audit logs by action returns only matching entries."""
    response = await client.get(
        AUDIT_URL,
        params={"action": "user.login"},
        headers=auth_headers(super_admin_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 2
    for item in data["items"]:
        assert item["action"] == "user.login"


async def test_audit_logs_filter_by_resource_type(
    client: AsyncClient,
    super_admin_user: User,
    super_admin_token: str,
    audit_logs: list[AuditLog],
) -> None:
    """Filtering audit logs by resource_type returns only matching entries."""
    response = await client.get(
        AUDIT_URL,
        params={"resource_type": "conference"},
        headers=auth_headers(super_admin_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 2
    for item in data["items"]:
        assert item["resource_type"] == "conference"


async def test_audit_logs_filter_by_tenant_id(
    client: AsyncClient,
    super_admin_user: User,
    super_admin_token: str,
    tenant: Tenant,
    audit_logs: list[AuditLog],
) -> None:
    """Filtering audit logs by tenant_id returns only matching entries."""
    response = await client.get(
        AUDIT_URL,
        params={"tenant_id": str(tenant.id)},
        headers=auth_headers(super_admin_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 5
    for item in data["items"]:
        assert item["tenant_id"] == str(tenant.id)

    # Use a non-existent tenant_id
    response = await client.get(
        AUDIT_URL,
        params={"tenant_id": str(uuid.uuid4())},
        headers=auth_headers(super_admin_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 0


# ═══════════════════════════════════════════════════════════════════════
# 5. AUTHORIZATION
# ═══════════════════════════════════════════════════════════════════════


async def test_audit_logs_forbidden_for_non_admin(
    client: AsyncClient,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Tenant admin (non-super-admin) gets 403 when accessing audit logs."""
    response = await client.get(
        AUDIT_URL,
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 403


async def test_audit_logs_forbidden_for_regular_user(
    client: AsyncClient,
    regular_user: User,
    regular_user_token: str,
) -> None:
    """Regular user gets 403 when accessing audit logs."""
    response = await client.get(
        AUDIT_URL,
        headers=auth_headers(regular_user_token),
    )
    assert response.status_code == 403


async def test_audit_logs_actions_forbidden_for_non_admin(
    client: AsyncClient,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Tenant admin gets 403 when accessing audit actions."""
    response = await client.get(
        f"{AUDIT_URL}/actions",
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 403


async def test_audit_logs_resource_types_forbidden_for_non_admin(
    client: AsyncClient,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Tenant admin gets 403 when accessing audit resource types."""
    response = await client.get(
        f"{AUDIT_URL}/resource-types",
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 403


async def test_audit_logs_no_auth_401(
    client: AsyncClient,
) -> None:
    """Accessing audit logs without authentication returns 401."""
    response = await client.get(AUDIT_URL)
    assert response.status_code == 401


# ═══════════════════════════════════════════════════════════════════════
# 6. RESPONSE STRUCTURE
# ═══════════════════════════════════════════════════════════════════════


async def test_audit_log_item_structure(
    client: AsyncClient,
    super_admin_user: User,
    super_admin_token: str,
    audit_logs: list[AuditLog],
) -> None:
    """Each audit log item contains the expected fields."""
    response = await client.get(
        AUDIT_URL,
        headers=auth_headers(super_admin_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) > 0
    item = data["items"][0]

    # Required top-level keys
    assert "id" in item
    assert "action" in item
    assert "resource_type" in item
    assert "details" in item
    assert "created_at" in item
    assert "tenant_id" in item
    assert "user_id" in item
    assert "ip_address" in item
    assert "user_agent" in item

    # User sub-object should be present (super_admin_user is the actor)
    assert "user" in item
    if item["user"] is not None:
        assert "id" in item["user"]
        assert "email" in item["user"]
        assert "first_name" in item["user"]
        assert "last_name" in item["user"]


# ═══════════════════════════════════════════════════════════════════════
# 7. EXPORT
# ═══════════════════════════════════════════════════════════════════════


async def test_export_audit_logs(
    client: AsyncClient,
    super_admin_user: User,
    super_admin_token: str,
    audit_logs: list[AuditLog],
) -> None:
    """Super admin can export audit logs as CSV."""
    response = await client.get(
        f"{AUDIT_URL}/export",
        headers=auth_headers(super_admin_token),
    )
    assert response.status_code == 200
    assert "text/csv" in response.headers["content-type"]
    assert "content-disposition" in response.headers
    assert "audit_logs_" in response.headers["content-disposition"]

    # Parse CSV content (skip BOM bytes)
    content = response.content.decode("utf-8-sig")
    lines = content.strip().split("\n")
    # Header + data rows
    assert len(lines) >= 6  # 1 header + 5 data rows


async def test_export_audit_logs_forbidden_for_non_admin(
    client: AsyncClient,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Tenant admin gets 403 when trying to export audit logs."""
    response = await client.get(
        f"{AUDIT_URL}/export",
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 403
