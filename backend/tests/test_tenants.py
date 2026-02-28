"""Tests for tenant management endpoints."""

import os
import uuid

os.environ.setdefault(
    "DATABASE_URL", "postgresql+asyncpg://saasconf:saasconf_dev_password@localhost:5432/saasconf_test"
)
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-unit-tests-minimum-32-chars")
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "testpassword123")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.module import Module
from app.models.tenant import Tenant
from app.models.user import User
from tests.conftest import auth_headers

BASE_URL = "/api/v1/admin/tenants"


# ---------------------------------------------------------------------------
# TestTenantCRUD
# ---------------------------------------------------------------------------


class TestTenantCRUD:
    """Tests for tenant CRUD endpoints (super admin only)."""

    @pytest.mark.asyncio
    async def test_list_tenants_as_super_admin(
        self,
        client: AsyncClient,
        tenant: Tenant,
        super_admin_user: User,
        super_admin_token: str,
    ) -> None:
        """Super admin can list tenants and receives a paginated response."""
        response = await client.get(
            BASE_URL,
            headers=auth_headers(super_admin_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "total" in data
        assert "page" in data
        assert "page_size" in data
        assert "pages" in data
        assert data["total"] >= 1
        # The fixture tenant should appear in the results
        tenant_ids = [item["id"] for item in data["items"]]
        assert str(tenant.id) in tenant_ids

    @pytest.mark.asyncio
    async def test_list_tenants_with_search(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        super_admin_user: User,
        super_admin_token: str,
    ) -> None:
        """Super admin can search tenants by name."""
        # Create two tenants with distinct names
        t1 = Tenant(
            id=uuid.uuid4(),
            name="Alpha Corp",
            slug=f"alpha-corp-{uuid.uuid4().hex[:8]}",
            is_active=True,
        )
        t2 = Tenant(
            id=uuid.uuid4(),
            name="Beta Inc",
            slug=f"beta-inc-{uuid.uuid4().hex[:8]}",
            is_active=True,
        )
        db_session.add_all([t1, t2])
        await db_session.commit()

        response = await client.get(
            BASE_URL,
            params={"search": "Alpha"},
            headers=auth_headers(super_admin_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1
        names = [item["name"] for item in data["items"]]
        assert "Alpha Corp" in names
        assert "Beta Inc" not in names

    @pytest.mark.asyncio
    async def test_list_tenants_filter_active(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        super_admin_user: User,
        super_admin_token: str,
    ) -> None:
        """Super admin can filter tenants by is_active status."""
        active_tenant = Tenant(
            id=uuid.uuid4(),
            name="Active Tenant",
            slug=f"active-{uuid.uuid4().hex[:8]}",
            is_active=True,
        )
        inactive_tenant = Tenant(
            id=uuid.uuid4(),
            name="Inactive Tenant",
            slug=f"inactive-{uuid.uuid4().hex[:8]}",
            is_active=False,
        )
        db_session.add_all([active_tenant, inactive_tenant])
        await db_session.commit()

        # Filter for active only
        response = await client.get(
            BASE_URL,
            params={"is_active": True},
            headers=auth_headers(super_admin_token),
        )
        assert response.status_code == 200
        data = response.json()
        slugs = [item["slug"] for item in data["items"]]
        assert active_tenant.slug in slugs
        assert inactive_tenant.slug not in slugs

        # Filter for inactive only
        response = await client.get(
            BASE_URL,
            params={"is_active": False},
            headers=auth_headers(super_admin_token),
        )
        assert response.status_code == 200
        data = response.json()
        slugs = [item["slug"] for item in data["items"]]
        assert inactive_tenant.slug in slugs
        assert active_tenant.slug not in slugs

    @pytest.mark.asyncio
    async def test_create_tenant_minimal(
        self,
        client: AsyncClient,
        super_admin_user: User,
        super_admin_token: str,
    ) -> None:
        """Super admin can create a tenant with just name and slug."""
        slug = f"minimal-{uuid.uuid4().hex[:8]}"
        payload = {"name": "Minimal Corp", "slug": slug}
        response = await client.post(
            BASE_URL,
            json=payload,
            headers=auth_headers(super_admin_token),
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Minimal Corp"
        assert data["slug"] == slug
        assert data["is_active"] is True
        assert data["user_count"] == 0
        assert data["module_count"] == 0
        assert "id" in data

    @pytest.mark.asyncio
    async def test_create_tenant_with_admin(
        self,
        client: AsyncClient,
        super_admin_user: User,
        super_admin_token: str,
    ) -> None:
        """Super admin can create a tenant with an admin user."""
        slug = f"with-admin-{uuid.uuid4().hex[:8]}"
        payload = {
            "name": "Admin Corp",
            "slug": slug,
            "admin_email": f"admin-{uuid.uuid4().hex[:8]}@test.com",
            "admin_password": "Password123!",
            "admin_first_name": "Admin",
            "admin_last_name": "User",
        }
        response = await client.post(
            BASE_URL,
            json=payload,
            headers=auth_headers(super_admin_token),
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Admin Corp"
        assert data["slug"] == slug
        assert data["user_count"] == 1

    @pytest.mark.asyncio
    async def test_create_tenant_duplicate_slug_fails(
        self,
        client: AsyncClient,
        tenant: Tenant,
        super_admin_user: User,
        super_admin_token: str,
    ) -> None:
        """Creating a tenant with a duplicate slug returns 400."""
        payload = {"name": "Duplicate Corp", "slug": tenant.slug}
        response = await client.post(
            BASE_URL,
            json=payload,
            headers=auth_headers(super_admin_token),
        )
        assert response.status_code == 400
        data = response.json()
        assert "already exists" in data["detail"]

    @pytest.mark.asyncio
    async def test_create_tenant_invalid_slug_fails(
        self,
        client: AsyncClient,
        super_admin_user: User,
        super_admin_token: str,
    ) -> None:
        """Creating a tenant with an invalid slug format returns 422."""
        payload = {"name": "Bad Slug Corp", "slug": "INVALID SLUG!!"}
        response = await client.post(
            BASE_URL,
            json=payload,
            headers=auth_headers(super_admin_token),
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_get_tenant_detail(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        super_admin_user: User,
        super_admin_token: str,
    ) -> None:
        """Super admin can get tenant detail including user and module counts."""
        response = await client.get(
            f"{BASE_URL}/{tenant.id}",
            headers=auth_headers(super_admin_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(tenant.id)
        assert data["name"] == tenant.name
        assert data["slug"] == tenant.slug
        assert data["is_active"] is True
        # tenant_admin_user belongs to this tenant, so user_count >= 1
        assert data["user_count"] >= 1
        assert "module_count" in data
        assert "created_at" in data
        assert "updated_at" in data

    @pytest.mark.asyncio
    async def test_update_tenant(
        self,
        client: AsyncClient,
        tenant: Tenant,
        super_admin_user: User,
        super_admin_token: str,
    ) -> None:
        """Super admin can partially update a tenant."""
        new_name = "Updated Corp"
        response = await client.put(
            f"{BASE_URL}/{tenant.id}",
            json={"name": new_name, "city": "Berlin", "country": "Germany"},
            headers=auth_headers(super_admin_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == new_name
        assert data["city"] == "Berlin"
        assert data["country"] == "Germany"
        # Slug should remain unchanged
        assert data["slug"] == tenant.slug

    @pytest.mark.asyncio
    async def test_update_tenant_slug_uniqueness(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        super_admin_user: User,
        super_admin_token: str,
    ) -> None:
        """Updating a tenant slug to an existing slug returns 400."""
        t1 = Tenant(
            id=uuid.uuid4(),
            name="Tenant One",
            slug=f"tenant-one-{uuid.uuid4().hex[:8]}",
            is_active=True,
        )
        t2 = Tenant(
            id=uuid.uuid4(),
            name="Tenant Two",
            slug=f"tenant-two-{uuid.uuid4().hex[:8]}",
            is_active=True,
        )
        db_session.add_all([t1, t2])
        await db_session.commit()

        # Try to update t2's slug to match t1's slug
        response = await client.put(
            f"{BASE_URL}/{t2.id}",
            json={"slug": t1.slug},
            headers=auth_headers(super_admin_token),
        )
        assert response.status_code == 400
        data = response.json()
        assert "already exists" in data["detail"]

    @pytest.mark.asyncio
    async def test_soft_delete_tenant(
        self,
        client: AsyncClient,
        tenant: Tenant,
        super_admin_user: User,
        super_admin_token: str,
    ) -> None:
        """Soft deleting a tenant sets is_active to false."""
        response = await client.delete(
            f"{BASE_URL}/{tenant.id}",
            headers=auth_headers(super_admin_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert "deactivated" in data["message"].lower()

        # Verify tenant is now inactive
        get_response = await client.get(
            f"{BASE_URL}/{tenant.id}",
            headers=auth_headers(super_admin_token),
        )
        assert get_response.status_code == 200
        assert get_response.json()["is_active"] is False

    @pytest.mark.asyncio
    async def test_permanent_delete_tenant(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        super_admin_user: User,
        super_admin_token: str,
    ) -> None:
        """Permanently deleting a tenant removes all its data."""
        # Create a dedicated tenant for permanent deletion
        t = Tenant(
            id=uuid.uuid4(),
            name="Delete Me Corp",
            slug=f"delete-me-{uuid.uuid4().hex[:8]}",
            is_active=True,
        )
        db_session.add(t)
        await db_session.commit()

        response = await client.delete(
            f"{BASE_URL}/{t.id}/permanent",
            headers=auth_headers(super_admin_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert "permanently deleted" in data["message"].lower()

        # Verify tenant no longer exists
        get_response = await client.get(
            f"{BASE_URL}/{t.id}",
            headers=auth_headers(super_admin_token),
        )
        assert get_response.status_code == 404

    @pytest.mark.asyncio
    async def test_tenant_admin_cannot_access(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        tenant_admin_token: str,
    ) -> None:
        """Tenant admin gets 403 when accessing admin tenant endpoints."""
        # List
        response = await client.get(
            BASE_URL,
            headers=auth_headers(tenant_admin_token),
        )
        assert response.status_code == 403

        # Create
        response = await client.post(
            BASE_URL,
            json={"name": "Nope Corp", "slug": "nope-corp"},
            headers=auth_headers(tenant_admin_token),
        )
        assert response.status_code == 403

        # Get detail
        response = await client.get(
            f"{BASE_URL}/{tenant.id}",
            headers=auth_headers(tenant_admin_token),
        )
        assert response.status_code == 403

        # Update
        response = await client.put(
            f"{BASE_URL}/{tenant.id}",
            json={"name": "Nope"},
            headers=auth_headers(tenant_admin_token),
        )
        assert response.status_code == 403

        # Soft delete
        response = await client.delete(
            f"{BASE_URL}/{tenant.id}",
            headers=auth_headers(tenant_admin_token),
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_unauthenticated_fails(
        self,
        client: AsyncClient,
    ) -> None:
        """Requests without an auth token return 401."""
        response = await client.get(BASE_URL)
        assert response.status_code == 401

        response = await client.post(
            BASE_URL,
            json={"name": "No Auth Corp", "slug": "no-auth"},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_get_nonexistent_tenant_returns_404(
        self,
        client: AsyncClient,
        super_admin_user: User,
        super_admin_token: str,
    ) -> None:
        """Getting a nonexistent tenant returns 404."""
        fake_id = uuid.uuid4()
        response = await client.get(
            f"{BASE_URL}/{fake_id}",
            headers=auth_headers(super_admin_token),
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_create_tenant_with_admin_no_password(
        self,
        client: AsyncClient,
        super_admin_user: User,
        super_admin_token: str,
    ) -> None:
        """Creating a tenant with admin_email but no admin_password succeeds (invite flow)."""
        slug = f"invite-admin-{uuid.uuid4().hex[:8]}"
        payload = {
            "name": "Invite Admin Corp",
            "slug": slug,
            "admin_email": f"admin-{uuid.uuid4().hex[:8]}@test.com",
            "admin_first_name": "Invite",
            "admin_last_name": "Admin",
        }
        response = await client.post(
            BASE_URL,
            json=payload,
            headers=auth_headers(super_admin_token),
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Invite Admin Corp"
        assert data["slug"] == slug
        assert data["user_count"] == 1

    @pytest.mark.asyncio
    async def test_create_tenant_with_email_domain(
        self,
        client: AsyncClient,
        super_admin_user: User,
        super_admin_token: str,
    ) -> None:
        """Creating a tenant with email_domain includes it in the response."""
        slug = f"domain-{uuid.uuid4().hex[:8]}"
        payload = {
            "name": "Domain Corp",
            "slug": slug,
            "email_domain": "domaincorp.com",
        }
        response = await client.post(
            BASE_URL,
            json=payload,
            headers=auth_headers(super_admin_token),
        )
        assert response.status_code == 201
        data = response.json()
        assert data["email_domain"] == "domaincorp.com"

    @pytest.mark.asyncio
    async def test_update_tenant_email_domain(
        self,
        client: AsyncClient,
        tenant: Tenant,
        super_admin_user: User,
        super_admin_token: str,
    ) -> None:
        """Updating a tenant's email_domain persists and appears in response."""
        response = await client.put(
            f"{BASE_URL}/{tenant.id}",
            json={"email_domain": "updated-domain.com"},
            headers=auth_headers(super_admin_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["email_domain"] == "updated-domain.com"
        # Slug should remain unchanged
        assert data["slug"] == tenant.slug


# ---------------------------------------------------------------------------
# TestTenantModules
# ---------------------------------------------------------------------------


class TestTenantModules:
    """Tests for tenant module assignment endpoints (super admin only)."""

    @pytest.mark.asyncio
    async def test_list_modules_empty(
        self,
        client: AsyncClient,
        tenant: Tenant,
        super_admin_user: User,
        super_admin_token: str,
    ) -> None:
        """A new tenant has no modules assigned."""
        response = await client.get(
            f"{BASE_URL}/{tenant.id}/modules",
            headers=auth_headers(super_admin_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert data == []

    @pytest.mark.asyncio
    async def test_assign_module(
        self,
        client: AsyncClient,
        tenant: Tenant,
        conferences_module: Module,
        super_admin_user: User,
        super_admin_token: str,
    ) -> None:
        """Super admin can assign a module to a tenant."""
        response = await client.post(
            f"{BASE_URL}/{tenant.id}/modules",
            json={"module_id": str(conferences_module.id)},
            headers=auth_headers(super_admin_token),
        )
        assert response.status_code == 201
        data = response.json()
        assert data["tenant_id"] == str(tenant.id)
        assert data["module_id"] == str(conferences_module.id)
        assert data["module_code"] == "conferences"
        assert data["module_name"] == "Conferences"
        assert data["is_enabled"] is True

    @pytest.mark.asyncio
    async def test_assign_duplicate_module_fails(
        self,
        client: AsyncClient,
        tenant: Tenant,
        conferences_module: Module,
        super_admin_user: User,
        super_admin_token: str,
    ) -> None:
        """Assigning the same module twice returns 400."""
        # First assignment
        await client.post(
            f"{BASE_URL}/{tenant.id}/modules",
            json={"module_id": str(conferences_module.id)},
            headers=auth_headers(super_admin_token),
        )

        # Second assignment should fail
        response = await client.post(
            f"{BASE_URL}/{tenant.id}/modules",
            json={"module_id": str(conferences_module.id)},
            headers=auth_headers(super_admin_token),
        )
        assert response.status_code == 400
        data = response.json()
        assert "already assigned" in data["detail"]

    @pytest.mark.asyncio
    async def test_assign_nonexistent_module_fails(
        self,
        client: AsyncClient,
        tenant: Tenant,
        super_admin_user: User,
        super_admin_token: str,
    ) -> None:
        """Assigning a nonexistent module returns 404."""
        fake_module_id = uuid.uuid4()
        response = await client.post(
            f"{BASE_URL}/{tenant.id}/modules",
            json={"module_id": str(fake_module_id)},
            headers=auth_headers(super_admin_token),
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_list_modules_after_assign(
        self,
        client: AsyncClient,
        tenant: Tenant,
        conferences_module: Module,
        super_admin_user: User,
        super_admin_token: str,
    ) -> None:
        """After assigning a module, it appears in the list."""
        # Assign
        await client.post(
            f"{BASE_URL}/{tenant.id}/modules",
            json={"module_id": str(conferences_module.id)},
            headers=auth_headers(super_admin_token),
        )

        # List
        response = await client.get(
            f"{BASE_URL}/{tenant.id}/modules",
            headers=auth_headers(super_admin_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["module_code"] == "conferences"
        assert data[0]["tenant_id"] == str(tenant.id)

    @pytest.mark.asyncio
    async def test_update_module_assignment(
        self,
        client: AsyncClient,
        tenant: Tenant,
        conferences_module: Module,
        super_admin_user: User,
        super_admin_token: str,
    ) -> None:
        """Super admin can update a module assignment (e.g., disable it or set limits)."""
        # Assign first
        await client.post(
            f"{BASE_URL}/{tenant.id}/modules",
            json={"module_id": str(conferences_module.id)},
            headers=auth_headers(super_admin_token),
        )

        # Update the assignment
        response = await client.put(
            f"{BASE_URL}/{tenant.id}/modules/{conferences_module.id}",
            json={"is_enabled": False, "max_papers": 100},
            headers=auth_headers(super_admin_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["is_enabled"] is False
        assert data["max_papers"] == 100

    @pytest.mark.asyncio
    async def test_revoke_module(
        self,
        client: AsyncClient,
        tenant: Tenant,
        conferences_module: Module,
        super_admin_user: User,
        super_admin_token: str,
    ) -> None:
        """Super admin can revoke a module from a tenant."""
        # Assign first
        await client.post(
            f"{BASE_URL}/{tenant.id}/modules",
            json={"module_id": str(conferences_module.id)},
            headers=auth_headers(super_admin_token),
        )

        # Revoke
        response = await client.delete(
            f"{BASE_URL}/{tenant.id}/modules/{conferences_module.id}",
            headers=auth_headers(super_admin_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert "revoked" in data["message"].lower()

        # Verify it is gone
        list_response = await client.get(
            f"{BASE_URL}/{tenant.id}/modules",
            headers=auth_headers(super_admin_token),
        )
        assert list_response.status_code == 200
        assert list_response.json() == []

    @pytest.mark.asyncio
    async def test_non_super_admin_cannot_manage_modules(
        self,
        client: AsyncClient,
        tenant: Tenant,
        conferences_module: Module,
        tenant_admin_user: User,
        tenant_admin_token: str,
    ) -> None:
        """Tenant admin gets 403 when managing modules."""
        # List
        response = await client.get(
            f"{BASE_URL}/{tenant.id}/modules",
            headers=auth_headers(tenant_admin_token),
        )
        assert response.status_code == 403

        # Assign
        response = await client.post(
            f"{BASE_URL}/{tenant.id}/modules",
            json={"module_id": str(conferences_module.id)},
            headers=auth_headers(tenant_admin_token),
        )
        assert response.status_code == 403

        # Revoke
        response = await client.delete(
            f"{BASE_URL}/{tenant.id}/modules/{conferences_module.id}",
            headers=auth_headers(tenant_admin_token),
        )
        assert response.status_code == 403


# ---------------------------------------------------------------------------
# TestTenantSuperUser
# ---------------------------------------------------------------------------


class TestTenantSuperUser:
    """Tests for tenant super user management endpoints (super admin only)."""

    @pytest.mark.asyncio
    async def test_get_super_user_none(
        self,
        client: AsyncClient,
        tenant: Tenant,
        super_admin_user: User,
        super_admin_token: str,
    ) -> None:
        """A new tenant has no super user assigned."""
        response = await client.get(
            f"{BASE_URL}/{tenant.id}/super-user",
            headers=auth_headers(super_admin_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["tenant_id"] == str(tenant.id)
        assert data["super_user"] is None

    @pytest.mark.asyncio
    async def test_assign_super_user(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        super_admin_user: User,
        super_admin_token: str,
    ) -> None:
        """Super admin can assign a tenant user as the tenant super user."""
        response = await client.put(
            f"{BASE_URL}/{tenant.id}/super-user",
            params={"user_id": str(tenant_admin_user.id)},
            headers=auth_headers(super_admin_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["super_user_id"] == str(tenant_admin_user.id)
        assert data["super_user_email"] == tenant_admin_user.email
        assert "assigned" in data["message"].lower()

    @pytest.mark.asyncio
    async def test_assign_super_user_wrong_tenant_fails(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        super_admin_user: User,
        super_admin_token: str,
    ) -> None:
        """Assigning a user from a different tenant as super user returns 400."""
        from app.core.security import hash_password

        # Create another tenant and a user belonging to it
        other_tenant = Tenant(
            id=uuid.uuid4(),
            name="Other Tenant",
            slug=f"other-{uuid.uuid4().hex[:8]}",
            is_active=True,
        )
        db_session.add(other_tenant)
        await db_session.flush()

        other_user = User(
            id=uuid.uuid4(),
            tenant_id=other_tenant.id,
            email=f"other-{uuid.uuid4().hex[:8]}@test.com",
            password_hash=hash_password("Password123!"),
            first_name="Other",
            last_name="User",
            role="tenant_admin",
            is_active=True,
        )
        db_session.add(other_user)
        await db_session.commit()

        # Try to assign the other tenant's user as super user for our tenant
        response = await client.put(
            f"{BASE_URL}/{tenant.id}/super-user",
            params={"user_id": str(other_user.id)},
            headers=auth_headers(super_admin_token),
        )
        assert response.status_code == 400
        data = response.json()
        assert "must belong to this tenant" in data["detail"].lower()

    @pytest.mark.asyncio
    async def test_get_super_user_after_assign(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        super_admin_user: User,
        super_admin_token: str,
    ) -> None:
        """After assigning, GET returns the super user details."""
        # Assign first
        await client.put(
            f"{BASE_URL}/{tenant.id}/super-user",
            params={"user_id": str(tenant_admin_user.id)},
            headers=auth_headers(super_admin_token),
        )

        # Get
        response = await client.get(
            f"{BASE_URL}/{tenant.id}/super-user",
            headers=auth_headers(super_admin_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["super_user"] is not None
        assert data["super_user"]["id"] == str(tenant_admin_user.id)
        assert data["super_user"]["email"] == tenant_admin_user.email
        assert data["super_user"]["first_name"] == tenant_admin_user.first_name
        assert data["super_user"]["last_name"] == tenant_admin_user.last_name

    @pytest.mark.asyncio
    async def test_remove_super_user(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        super_admin_user: User,
        super_admin_token: str,
    ) -> None:
        """Super admin can remove the super user assignment."""
        # Assign first
        await client.put(
            f"{BASE_URL}/{tenant.id}/super-user",
            params={"user_id": str(tenant_admin_user.id)},
            headers=auth_headers(super_admin_token),
        )

        # Remove
        response = await client.delete(
            f"{BASE_URL}/{tenant.id}/super-user",
            headers=auth_headers(super_admin_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert "removed" in data["message"].lower()

        # Verify super user is now None
        get_response = await client.get(
            f"{BASE_URL}/{tenant.id}/super-user",
            headers=auth_headers(super_admin_token),
        )
        assert get_response.status_code == 200
        assert get_response.json()["super_user"] is None

    @pytest.mark.asyncio
    async def test_non_super_admin_cannot_manage(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        tenant_admin_token: str,
    ) -> None:
        """Tenant admin gets 403 when managing super user."""
        # Get
        response = await client.get(
            f"{BASE_URL}/{tenant.id}/super-user",
            headers=auth_headers(tenant_admin_token),
        )
        assert response.status_code == 403

        # Assign
        response = await client.put(
            f"{BASE_URL}/{tenant.id}/super-user",
            params={"user_id": str(tenant_admin_user.id)},
            headers=auth_headers(tenant_admin_token),
        )
        assert response.status_code == 403

        # Remove
        response = await client.delete(
            f"{BASE_URL}/{tenant.id}/super-user",
            headers=auth_headers(tenant_admin_token),
        )
        assert response.status_code == 403
