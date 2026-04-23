"""Tests for screen overlay CRUD endpoints."""

import os
import uuid

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://saasconf:saasconf_dev_password@localhost:5432/saasconf_test",
)
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-unit-tests-minimum-32-chars")
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "testpassword123")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.conference import Conference
from app.models.module import Module, TenantModule
from app.models.screen_overlay import ScreenOverlay
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from tests.conftest import auth_headers

# Minimal valid 1x1 white PNG (67 bytes)
VALID_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
    b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00"
    b"\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00"
    b"\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
)


# ── Helpers ────────────────────────────────────────────────────────────


def _make_token(user: User, modules: list[str] | None = None) -> str:
    """Create a valid JWT access token for a user."""
    return create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role,
        modules=modules or [],
    )


def _overlays_url(conference_id: uuid.UUID, path: str = "") -> str:
    """Build the screen overlays endpoint URL."""
    base = f"/api/v1/conferences/{conference_id}/screen-overlays"
    if path:
        return f"{base}/{path}"
    return base


# ── Fixtures ───────────────────────────────────────────────────────────


@pytest.fixture()
def admin_token(tenant_admin_user: User) -> str:
    """Return a valid access token for the tenant admin with conferences module."""
    return _make_token(tenant_admin_user, modules=["conferences"])


@pytest.fixture()
def user_token(regular_user: User) -> str:
    """Return a valid access token for the regular user."""
    return _make_token(regular_user, modules=["conferences"])


@pytest_asyncio.fixture()
async def sample_overlay(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
) -> ScreenOverlay:
    """Create a sample screen overlay directly in the database."""
    overlay = ScreenOverlay(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        trigger_type="always",
        title="Welcome Overlay",
        body_text="<p>Hello!</p>",
        animation_style="confetti",
        duration_seconds=5,
        is_active=True,
        display_order=0,
    )
    db_session.add(overlay)
    await db_session.commit()
    await db_session.refresh(overlay)
    return overlay


# ═══════════════════════════════════════════════════════════════════════
# 1. LIST SCREEN OVERLAYS
# ═══════════════════════════════════════════════════════════════════════


class TestListScreenOverlays:
    """GET /conferences/{conference_id}/screen-overlays"""

    async def test_list_empty(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Listing overlays returns an empty list when none exist."""
        url = _overlays_url(conference.id)
        response = await client.get(url, headers=auth_headers(admin_token))

        assert response.status_code == 200
        data = response.json()
        assert data["items"] == []
        assert data["total"] == 0

    async def test_list_with_overlay(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        sample_overlay: ScreenOverlay,
    ) -> None:
        """Listing overlays returns existing overlays."""
        url = _overlays_url(conference.id)
        response = await client.get(url, headers=auth_headers(admin_token))

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert len(data["items"]) == 1
        assert data["items"][0]["title"] == "Welcome Overlay"
        assert data["items"][0]["id"] == str(sample_overlay.id)

    async def test_list_pagination(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        tenant: Tenant,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Pagination parameters page and page_size work correctly."""
        for i in range(3):
            overlay = ScreenOverlay(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                conference_id=conference.id,
                trigger_type="always",
                title=f"Overlay {chr(65 + i)}",
                animation_style="confetti",
                duration_seconds=5,
                is_active=True,
                display_order=i,
            )
            db_session.add(overlay)
        await db_session.commit()

        url = _overlays_url(conference.id)

        response = await client.get(
            url,
            params={"page": 1, "page_size": 2},
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 3
        assert len(data["items"]) == 2

    async def test_list_no_auth_401(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
    ) -> None:
        """Listing overlays without auth returns 401."""
        url = _overlays_url(conference.id)
        response = await client.get(url)
        assert response.status_code == 401


# ═══════════════════════════════════════════════════════════════════════
# 2. CREATE SCREEN OVERLAY
# ═══════════════════════════════════════════════════════════════════════


class TestCreateScreenOverlay:
    """POST /conferences/{conference_id}/screen-overlays"""

    async def test_create_minimal(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Create an overlay with just trigger_type and title returns 201."""
        url = _overlays_url(conference.id)
        payload = {"trigger_type": "always", "title": "Test Overlay"}
        response = await client.post(url, json=payload, headers=auth_headers(admin_token))

        assert response.status_code == 201
        data = response.json()
        assert data["title"] == "Test Overlay"
        assert data["trigger_type"] == "always"
        assert data["animation_style"] == "confetti"
        assert data["duration_seconds"] == 5
        assert data["is_active"] is False
        assert data["display_order"] == 0
        assert data["conference_id"] == str(conference.id)
        assert "id" in data
        assert "created_at" in data

    async def test_create_full_fields(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Create an overlay with all fields populated."""
        url = _overlays_url(conference.id)
        payload = {
            "trigger_type": "always",
            "title": "Full Overlay",
            "body_text": "<p>Welcome everyone!</p>",
            "animation_style": "fireworks",
            "duration_seconds": 10,
            "is_active": True,
            "display_order": 5,
        }
        response = await client.post(url, json=payload, headers=auth_headers(admin_token))

        assert response.status_code == 201
        data = response.json()
        assert data["body_text"] == "<p>Welcome everyone!</p>"
        assert data["animation_style"] == "fireworks"
        assert data["duration_seconds"] == 10
        assert data["is_active"] is True
        assert data["display_order"] == 5

    async def test_create_scheduled_with_date(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Create a scheduled overlay with schedule_date returns 201."""
        url = _overlays_url(conference.id)
        payload = {
            "trigger_type": "scheduled",
            "title": "Scheduled Overlay",
            "schedule_date": "2026-06-15T10:00:00Z",
        }
        response = await client.post(url, json=payload, headers=auth_headers(admin_token))

        assert response.status_code == 201
        data = response.json()
        assert data["trigger_type"] == "scheduled"
        assert data["schedule_date"] is not None

    async def test_create_scheduled_without_date_422(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Create a scheduled overlay without schedule_date returns 422."""
        url = _overlays_url(conference.id)
        payload = {"trigger_type": "scheduled", "title": "No Date"}
        response = await client.post(url, json=payload, headers=auth_headers(admin_token))

        assert response.status_code == 422

    async def test_create_invalid_trigger_type_422(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Create an overlay with invalid trigger_type returns 422."""
        url = _overlays_url(conference.id)
        payload = {"trigger_type": "invalid", "title": "Bad Trigger"}
        response = await client.post(url, json=payload, headers=auth_headers(admin_token))

        assert response.status_code == 422

    async def test_create_invalid_animation_style_422(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Create an overlay with invalid animation_style returns 422."""
        url = _overlays_url(conference.id)
        payload = {
            "trigger_type": "always",
            "title": "Bad Animation",
            "animation_style": "invalid",
        }
        response = await client.post(url, json=payload, headers=auth_headers(admin_token))

        assert response.status_code == 422

    async def test_create_no_auth_401(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
    ) -> None:
        """Create an overlay without auth returns 401."""
        url = _overlays_url(conference.id)
        payload = {"trigger_type": "always", "title": "No Auth"}
        response = await client.post(url, json=payload)

        assert response.status_code == 401

    async def test_create_regular_user_403(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        regular_user: User,
        user_token: str,
    ) -> None:
        """Regular user cannot create overlays."""
        url = _overlays_url(conference.id)
        payload = {"trigger_type": "always", "title": "Forbidden"}
        response = await client.post(url, json=payload, headers=auth_headers(user_token))

        assert response.status_code == 403


# ═══════════════════════════════════════════════════════════════════════
# 3. GET SCREEN OVERLAY
# ═══════════════════════════════════════════════════════════════════════


class TestGetScreenOverlay:
    """GET /conferences/{conference_id}/screen-overlays/{overlay_id}"""

    async def test_get_existing(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        sample_overlay: ScreenOverlay,
    ) -> None:
        """Get an existing overlay returns 200 with full data."""
        url = _overlays_url(conference.id, str(sample_overlay.id))
        response = await client.get(url, headers=auth_headers(admin_token))

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(sample_overlay.id)
        assert data["title"] == "Welcome Overlay"
        assert data["animation_style"] == "confetti"
        assert data["body_text"] == "<p>Hello!</p>"

    async def test_get_nonexistent_404(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Get a nonexistent overlay returns 404."""
        fake_id = uuid.uuid4()
        url = _overlays_url(conference.id, str(fake_id))
        response = await client.get(url, headers=auth_headers(admin_token))

        assert response.status_code == 404


# ═══════════════════════════════════════════════════════════════════════
# 4. UPDATE SCREEN OVERLAY
# ═══════════════════════════════════════════════════════════════════════


class TestUpdateScreenOverlay:
    """PUT /conferences/{conference_id}/screen-overlays/{overlay_id}"""

    async def test_update_title(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        sample_overlay: ScreenOverlay,
    ) -> None:
        """Update just the title of an overlay."""
        url = _overlays_url(conference.id, str(sample_overlay.id))
        response = await client.put(
            url,
            json={"title": "Updated Title"},
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "Updated Title"
        assert data["animation_style"] == "confetti"  # unchanged

    async def test_update_multiple_fields(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        sample_overlay: ScreenOverlay,
    ) -> None:
        """Update multiple fields at once."""
        url = _overlays_url(conference.id, str(sample_overlay.id))
        response = await client.put(
            url,
            json={
                "animation_style": "balloons",
                "duration_seconds": 15,
                "is_active": False,
            },
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 200
        data = response.json()
        assert data["animation_style"] == "balloons"
        assert data["duration_seconds"] == 15
        assert data["is_active"] is False

    async def test_update_switch_to_scheduled_without_date_422(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        sample_overlay: ScreenOverlay,
    ) -> None:
        """Switching to scheduled trigger without schedule_date returns 422."""
        url = _overlays_url(conference.id, str(sample_overlay.id))
        response = await client.put(
            url,
            json={"trigger_type": "scheduled"},
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 422

    async def test_update_nonexistent_404(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Updating a nonexistent overlay returns 404."""
        fake_id = uuid.uuid4()
        url = _overlays_url(conference.id, str(fake_id))
        response = await client.put(
            url,
            json={"title": "Ghost"},
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 404

    async def test_update_regular_user_403(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        regular_user: User,
        user_token: str,
        sample_overlay: ScreenOverlay,
    ) -> None:
        """Regular user cannot update overlays."""
        url = _overlays_url(conference.id, str(sample_overlay.id))
        response = await client.put(
            url,
            json={"title": "Forbidden"},
            headers=auth_headers(user_token),
        )

        assert response.status_code == 403


# ═══════════════════════════════════════════════════════════════════════
# 5. DELETE SCREEN OVERLAY
# ═══════════════════════════════════════════════════════════════════════


class TestDeleteScreenOverlay:
    """DELETE /conferences/{conference_id}/screen-overlays/{overlay_id}"""

    async def test_delete_existing(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        sample_overlay: ScreenOverlay,
    ) -> None:
        """Deleting an overlay returns 200 with success message."""
        url = _overlays_url(conference.id, str(sample_overlay.id))
        response = await client.delete(url, headers=auth_headers(admin_token))

        assert response.status_code == 200
        data = response.json()
        assert "deleted" in data["message"].lower()

    async def test_delete_nonexistent_404(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Deleting a nonexistent overlay returns 404."""
        fake_id = uuid.uuid4()
        url = _overlays_url(conference.id, str(fake_id))
        response = await client.delete(url, headers=auth_headers(admin_token))

        assert response.status_code == 404

    async def test_delete_verify_gone(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        sample_overlay: ScreenOverlay,
    ) -> None:
        """After deletion, GET returns 404."""
        url = _overlays_url(conference.id, str(sample_overlay.id))
        response = await client.delete(url, headers=auth_headers(admin_token))
        assert response.status_code == 200

        response = await client.get(url, headers=auth_headers(admin_token))
        assert response.status_code == 404

    async def test_delete_regular_user_403(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        regular_user: User,
        user_token: str,
        sample_overlay: ScreenOverlay,
    ) -> None:
        """Regular user cannot delete overlays."""
        url = _overlays_url(conference.id, str(sample_overlay.id))
        response = await client.delete(url, headers=auth_headers(user_token))

        assert response.status_code == 403


# ═══════════════════════════════════════════════════════════════════════
# 6. IMAGE ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════


class TestScreenOverlayImage:
    """POST/GET/DELETE /conferences/{cid}/screen-overlays/{oid}/image"""

    async def test_upload_image(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        sample_overlay: ScreenOverlay,
    ) -> None:
        """Upload an image to an overlay returns 200 with image_url."""
        url = _overlays_url(conference.id, f"{sample_overlay.id}/image")
        response = await client.post(
            url,
            files={"file": ("test.png", VALID_PNG, "image/png")},
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 200
        data = response.json()
        assert "image_url" in data
        assert "image" in data["image_url"]

    async def test_get_image(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        sample_overlay: ScreenOverlay,
    ) -> None:
        """After uploading, GET image returns the image content."""
        upload_url = _overlays_url(conference.id, f"{sample_overlay.id}/image")
        await client.post(
            upload_url,
            files={"file": ("test.png", VALID_PNG, "image/png")},
            headers=auth_headers(admin_token),
        )

        # GET image is public (no auth required)
        get_url = _overlays_url(conference.id, f"{sample_overlay.id}/image")
        response = await client.get(get_url)

        assert response.status_code == 200
        assert "image" in response.headers.get("content-type", "")

    async def test_get_image_not_found(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        sample_overlay: ScreenOverlay,
    ) -> None:
        """GET image for an overlay without image returns 404."""
        url = _overlays_url(conference.id, f"{sample_overlay.id}/image")
        response = await client.get(url)

        assert response.status_code == 404

    async def test_delete_image(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        sample_overlay: ScreenOverlay,
    ) -> None:
        """Deleting an image clears the overlay image_url."""
        img_url = _overlays_url(conference.id, f"{sample_overlay.id}/image")
        await client.post(
            img_url,
            files={"file": ("test.png", VALID_PNG, "image/png")},
            headers=auth_headers(admin_token),
        )

        # Verify image_url was set
        overlay_url = _overlays_url(conference.id, str(sample_overlay.id))
        response = await client.get(overlay_url, headers=auth_headers(admin_token))
        assert response.json()["image_url"] is not None

        # Delete image
        response = await client.delete(img_url, headers=auth_headers(admin_token))
        assert response.status_code == 200

        # Verify image_url is cleared
        response = await client.get(overlay_url, headers=auth_headers(admin_token))
        assert response.json()["image_url"] is None


# ═══════════════════════════════════════════════════════════════════════
# 7. CROSS-TENANT ISOLATION
# ═══════════════════════════════════════════════════════════════════════


class TestCrossTenantIsolation:
    """Verify overlays from one tenant are not visible to another."""

    @pytest_asyncio.fixture()
    async def other_tenant_setup(
        self,
        db_session: AsyncSession,
        conferences_module: Module,
    ) -> tuple[Tenant, Conference, str]:
        """Create a second tenant with its own conference and admin."""
        tenant2 = Tenant(
            id=uuid.uuid4(),
            name="Other Corp",
            slug=f"other-corp-{uuid.uuid4().hex[:8]}",
            is_active=True,
        )
        db_session.add(tenant2)
        await db_session.flush()

        # Link module
        db_session.add(
            TenantModule(
                id=uuid.uuid4(),
                tenant_id=tenant2.id,
                module_id=conferences_module.id,
                is_enabled=True,
            )
        )

        conference2 = Conference(
            id=uuid.uuid4(),
            tenant_id=tenant2.id,
            name="OtherConf 2026",
            abbreviation="OC26",
            is_active=True,
        )
        db_session.add(conference2)

        from app.core.security import hash_password

        admin2 = User(
            id=uuid.uuid4(),
            tenant_id=tenant2.id,
            email=f"admin2-{uuid.uuid4().hex[:8]}@test.com",
            password_hash=hash_password("Password123!"),
            first_name="Other",
            last_name="Admin",
            role=UserRole.TENANT_ADMIN.value,
            is_active=True,
        )
        db_session.add(admin2)
        await db_session.commit()

        token2 = _make_token(admin2, modules=["conferences"])
        return tenant2, conference2, token2

    async def test_cross_tenant_list_empty(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        admin_token: str,
        sample_overlay: ScreenOverlay,
        other_tenant_setup: tuple[Tenant, Conference, str],
    ) -> None:
        """Other tenant's admin sees no overlays when listing on their conference."""
        _, conference2, token2 = other_tenant_setup
        url = _overlays_url(conference2.id)
        response = await client.get(url, headers=auth_headers(token2))

        assert response.status_code == 200
        assert response.json()["total"] == 0

    async def test_cross_tenant_get_404(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        admin_token: str,
        sample_overlay: ScreenOverlay,
        other_tenant_setup: tuple[Tenant, Conference, str],
    ) -> None:
        """Other tenant's admin cannot access overlay from first tenant."""
        _, conference2, token2 = other_tenant_setup
        url = _overlays_url(conference2.id, str(sample_overlay.id))
        response = await client.get(url, headers=auth_headers(token2))

        assert response.status_code == 404
