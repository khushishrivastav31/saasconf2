"""Tests for conference-specific admin access.

Tests the /my-access/{conference_id} endpoint and the check_conference_admin_access
function that controls whether users can perform admin actions on specific conferences.
"""

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import check_conference_admin_access
from app.models.conference import Conference
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from app.models.user_conference_access import ConferenceAccessLevel, UserConferenceAccess
from app.core.security import hash_password, create_access_token
from tests.conftest import auth_headers


BASE_URL = "/api/v1/user-conference-access"


# ── Additional fixtures for conference access ────────────────────────────


@pytest_asyncio.fixture()
async def read_only_user(db_session: AsyncSession, tenant: Tenant) -> User:
    """Create a user with read_only role (not admin)."""
    u = User(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        email=f"readonly-{uuid.uuid4().hex[:8]}@test.com",
        password_hash=hash_password("Password123!"),
        first_name="ReadOnly",
        last_name="User",
        role=UserRole.USER.value,
        is_active=True,
    )
    db_session.add(u)
    await db_session.commit()
    return u


@pytest.fixture()
def read_only_user_token(read_only_user: User) -> str:
    """Return a valid access token for the read-only user."""
    return create_access_token(
        user_id=read_only_user.id,
        tenant_id=read_only_user.tenant_id,
        role=read_only_user.role,
        modules=["conferences"],
    )


@pytest_asyncio.fixture()
async def second_conference(db_session: AsyncSession, tenant: Tenant) -> Conference:
    """Create a second conference for testing different access levels."""
    c = Conference(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="Second Conference 2026",
        abbreviation="SC26",
        is_active=True,
    )
    db_session.add(c)
    await db_session.commit()
    return c


@pytest_asyncio.fixture()
async def user_with_admin_access(
    db_session: AsyncSession,
    read_only_user: User,
    conference: Conference,
) -> tuple[User, UserConferenceAccess]:
    """Grant admin access to read_only_user for the conference."""
    access = UserConferenceAccess(
        id=uuid.uuid4(),
        user_id=read_only_user.id,
        conference_id=conference.id,
        access_level=ConferenceAccessLevel.ADMIN.value,
    )
    db_session.add(access)
    await db_session.commit()
    return read_only_user, access


@pytest_asyncio.fixture()
async def user_with_readonly_access(
    db_session: AsyncSession,
    read_only_user: User,
    conference: Conference,
) -> tuple[User, UserConferenceAccess]:
    """Grant read-only access to read_only_user for the conference."""
    access = UserConferenceAccess(
        id=uuid.uuid4(),
        user_id=read_only_user.id,
        conference_id=conference.id,
        access_level=ConferenceAccessLevel.READ_ONLY.value,
    )
    db_session.add(access)
    await db_session.commit()
    return read_only_user, access


# ── Tests for /my-access/{conference_id} endpoint ─────────────────────────


async def test_my_access_super_admin_always_admin(
    client: AsyncClient,
    tenant: Tenant,
    conference: Conference,
    super_admin_user: User,
    super_admin_token: str,
) -> None:
    """Super admin always has admin access to any conference."""
    response = await client.get(
        f"{BASE_URL}/my-access/{conference.id}",
        headers=auth_headers(super_admin_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["has_access"] is True
    assert data["access_level"] == "admin"
    assert data["is_conference_admin"] is True


async def test_my_access_tenant_admin_always_admin(
    client: AsyncClient,
    tenant: Tenant,
    conference: Conference,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Tenant admin always has admin access to conferences in their tenant."""
    response = await client.get(
        f"{BASE_URL}/my-access/{conference.id}",
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["has_access"] is True
    assert data["access_level"] == "admin"
    assert data["is_conference_admin"] is True


async def test_my_access_user_no_access_record(
    client: AsyncClient,
    tenant: Tenant,
    conference: Conference,
    read_only_user: User,
    read_only_user_token: str,
) -> None:
    """User with no UserConferenceAccess record has read-only access."""
    response = await client.get(
        f"{BASE_URL}/my-access/{conference.id}",
        headers=auth_headers(read_only_user_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["has_access"] is True
    assert data["access_level"] == "read_only"
    assert data["is_conference_admin"] is False


async def test_my_access_user_with_admin_access(
    client: AsyncClient,
    tenant: Tenant,
    conference: Conference,
    user_with_admin_access: tuple[User, UserConferenceAccess],
    read_only_user_token: str,
) -> None:
    """User with admin access record has admin access."""
    response = await client.get(
        f"{BASE_URL}/my-access/{conference.id}",
        headers=auth_headers(read_only_user_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["has_access"] is True
    assert data["access_level"] == "admin"
    assert data["is_conference_admin"] is True


async def test_my_access_user_with_readonly_access(
    client: AsyncClient,
    tenant: Tenant,
    conference: Conference,
    user_with_readonly_access: tuple[User, UserConferenceAccess],
    read_only_user_token: str,
) -> None:
    """User with read-only access record has read-only access."""
    response = await client.get(
        f"{BASE_URL}/my-access/{conference.id}",
        headers=auth_headers(read_only_user_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["has_access"] is True
    assert data["access_level"] == "read_only"
    assert data["is_conference_admin"] is False


async def test_my_access_different_conferences_different_access(
    db_session: AsyncSession,
    client: AsyncClient,
    tenant: Tenant,
    conference: Conference,
    second_conference: Conference,
    read_only_user: User,
    read_only_user_token: str,
) -> None:
    """User can have different access levels for different conferences."""
    # Grant admin access to first conference
    admin_access = UserConferenceAccess(
        id=uuid.uuid4(),
        user_id=read_only_user.id,
        conference_id=conference.id,
        access_level=ConferenceAccessLevel.ADMIN.value,
    )
    db_session.add(admin_access)

    # Grant read-only access to second conference
    readonly_access = UserConferenceAccess(
        id=uuid.uuid4(),
        user_id=read_only_user.id,
        conference_id=second_conference.id,
        access_level=ConferenceAccessLevel.READ_ONLY.value,
    )
    db_session.add(readonly_access)
    await db_session.commit()

    # Check first conference - should be admin
    response1 = await client.get(
        f"{BASE_URL}/my-access/{conference.id}",
        headers=auth_headers(read_only_user_token),
    )
    assert response1.status_code == 200
    data1 = response1.json()
    assert data1["is_conference_admin"] is True

    # Check second conference - should be read-only
    response2 = await client.get(
        f"{BASE_URL}/my-access/{second_conference.id}",
        headers=auth_headers(read_only_user_token),
    )
    assert response2.status_code == 200
    data2 = response2.json()
    assert data2["is_conference_admin"] is False


async def test_my_access_unauthenticated(
    client: AsyncClient,
    conference: Conference,
) -> None:
    """Unauthenticated request returns 401."""
    response = await client.get(
        f"{BASE_URL}/my-access/{conference.id}",
    )
    assert response.status_code == 401


# ── Tests for check_conference_admin_access function ─────────────────────


async def test_check_admin_access_no_record(
    db_session: AsyncSession,
    read_only_user: User,
    conference: Conference,
) -> None:
    """check_conference_admin_access returns False when no access record exists."""
    result = await check_conference_admin_access(
        db_session,
        read_only_user.id,
        conference.id,
    )
    assert result is False


async def test_check_admin_access_with_admin_record(
    db_session: AsyncSession,
    user_with_admin_access: tuple[User, UserConferenceAccess],
    conference: Conference,
) -> None:
    """check_conference_admin_access returns True when user has admin access."""
    user, _ = user_with_admin_access
    result = await check_conference_admin_access(
        db_session,
        user.id,
        conference.id,
    )
    assert result is True


async def test_check_admin_access_with_readonly_record(
    db_session: AsyncSession,
    user_with_readonly_access: tuple[User, UserConferenceAccess],
    conference: Conference,
) -> None:
    """check_conference_admin_access returns False when user has read-only access."""
    user, _ = user_with_readonly_access
    result = await check_conference_admin_access(
        db_session,
        user.id,
        conference.id,
    )
    assert result is False


async def test_check_admin_access_wrong_conference(
    db_session: AsyncSession,
    user_with_admin_access: tuple[User, UserConferenceAccess],
    second_conference: Conference,
) -> None:
    """check_conference_admin_access returns False for a different conference."""
    user, _ = user_with_admin_access
    # User has admin access to `conference`, not `second_conference`
    result = await check_conference_admin_access(
        db_session,
        user.id,
        second_conference.id,
    )
    assert result is False


# ── Integration tests for admin-only endpoints ────────────────────────────


async def test_update_conference_with_conference_admin_access(
    db_session: AsyncSession,
    client: AsyncClient,
    tenant: Tenant,
    conference: Conference,
    user_with_admin_access: tuple[User, UserConferenceAccess],
    read_only_user_token: str,
) -> None:
    """User with conference-specific admin access can update the conference."""
    response = await client.put(
        f"/api/v1/conferences/{conference.id}",
        json={"name": "Updated by Conference Admin"},
        headers=auth_headers(read_only_user_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Updated by Conference Admin"


async def test_update_conference_without_admin_access_forbidden(
    db_session: AsyncSession,
    client: AsyncClient,
    tenant: Tenant,
    conference: Conference,
    user_with_readonly_access: tuple[User, UserConferenceAccess],
    read_only_user_token: str,
) -> None:
    """User with read-only conference access cannot update the conference."""
    response = await client.put(
        f"/api/v1/conferences/{conference.id}",
        json={"name": "Should Not Update"},
        headers=auth_headers(read_only_user_token),
    )
    assert response.status_code == 403


async def test_update_conference_no_access_record_forbidden(
    client: AsyncClient,
    tenant: Tenant,
    conference: Conference,
    read_only_user: User,
    read_only_user_token: str,
) -> None:
    """User with no access record cannot update the conference."""
    response = await client.put(
        f"/api/v1/conferences/{conference.id}",
        json={"name": "Should Not Update"},
        headers=auth_headers(read_only_user_token),
    )
    assert response.status_code == 403


async def test_delete_conference_with_conference_admin_access(
    db_session: AsyncSession,
    client: AsyncClient,
    tenant: Tenant,
    conference: Conference,
    user_with_admin_access: tuple[User, UserConferenceAccess],
    read_only_user_token: str,
) -> None:
    """User with conference-specific admin access can delete the conference."""
    response = await client.delete(
        f"/api/v1/conferences/{conference.id}",
        headers=auth_headers(read_only_user_token),
    )
    assert response.status_code == 200


async def test_delete_conference_without_admin_access_forbidden(
    db_session: AsyncSession,
    client: AsyncClient,
    tenant: Tenant,
    conference: Conference,
    user_with_readonly_access: tuple[User, UserConferenceAccess],
    read_only_user_token: str,
) -> None:
    """User with read-only conference access cannot delete the conference."""
    response = await client.delete(
        f"/api/v1/conferences/{conference.id}",
        headers=auth_headers(read_only_user_token),
    )
    assert response.status_code == 403
