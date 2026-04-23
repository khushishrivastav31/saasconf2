"""Tests for conference settings CRUD endpoints.

Covers volunteer roles (factory CRUD), session types (slug uniqueness + deletion
constraint), score scales (nested options), email templates (upsert/default
pattern), and review form settings (singleton pattern).
"""

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

from app.models.conference import Conference
from app.models.tenant import Tenant
from tests.conftest import auth_headers

# ---------------------------------------------------------------------------
# URL helpers
# ---------------------------------------------------------------------------


def _url(conference_id: uuid.UUID, resource: str) -> str:
    """Build a settings endpoint URL."""
    return f"/api/v1/conferences/{conference_id}/settings/{resource}"


# ===================================================================
# 1. Volunteer Roles  (representative CRUD factory test)
# ===================================================================


class TestVolunteerRoles:
    """Full CRUD + auth + scoping tests for volunteer roles."""

    # -- List (empty) ---------------------------------------------------

    @pytest.mark.asyncio
    async def test_list_empty(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        """GET returns an empty list when no volunteer roles exist."""
        url = _url(conference.id, "volunteer-roles")
        resp = await client.get(url, headers=auth_headers(tenant_admin_token))
        assert resp.status_code == 200
        body = resp.json()
        assert body["items"] == []
        assert body["total"] == 0

    # -- Create ---------------------------------------------------------

    @pytest.mark.asyncio
    async def test_create_volunteer_role(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        """POST creates a volunteer role and returns it."""
        url = _url(conference.id, "volunteer-roles")
        payload = {"name": "Stage Manager", "description": "Manages the main stage"}
        resp = await client.post(url, json=payload, headers=auth_headers(tenant_admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Stage Manager"
        assert data["description"] == "Manages the main stage"
        assert data["is_active"] is True
        assert data["conference_id"] == str(conference.id)
        assert data["tenant_id"] == str(conference.tenant_id)
        assert "id" in data
        assert "created_at" in data
        assert "updated_at" in data

    # -- Create duplicate name ------------------------------------------

    @pytest.mark.asyncio
    async def test_create_duplicate_name_fails(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        """POST with an existing name returns 400 (uniqueness violation)."""
        url = _url(conference.id, "volunteer-roles")
        payload = {"name": "AV Support"}
        resp1 = await client.post(url, json=payload, headers=auth_headers(tenant_admin_token))
        assert resp1.status_code == 200

        resp2 = await client.post(url, json=payload, headers=auth_headers(tenant_admin_token))
        assert resp2.status_code == 400
        assert "already exists" in resp2.json()["detail"]

    # -- List after create ----------------------------------------------

    @pytest.mark.asyncio
    async def test_list_after_create(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        """GET returns the created volunteer role."""
        url = _url(conference.id, "volunteer-roles")
        create_resp = await client.post(
            url,
            json={"name": "Registration Desk", "description": "Handles check-in"},
            headers=auth_headers(tenant_admin_token),
        )
        assert create_resp.status_code == 200

        list_resp = await client.get(url, headers=auth_headers(tenant_admin_token))
        assert list_resp.status_code == 200
        body = list_resp.json()
        assert body["total"] == 1
        assert body["items"][0]["name"] == "Registration Desk"
        assert body["items"][0]["description"] == "Handles check-in"

    # -- Update ---------------------------------------------------------

    @pytest.mark.asyncio
    async def test_update_volunteer_role(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        """PUT updates name and preserves other fields."""
        url = _url(conference.id, "volunteer-roles")
        create_resp = await client.post(
            url,
            json={"name": "Old Name", "description": "Original description"},
            headers=auth_headers(tenant_admin_token),
        )
        assert create_resp.status_code == 200
        role_id = create_resp.json()["id"]

        update_resp = await client.put(
            f"{url}/{role_id}",
            json={"name": "New Name"},
            headers=auth_headers(tenant_admin_token),
        )
        assert update_resp.status_code == 200
        data = update_resp.json()
        assert data["name"] == "New Name"
        assert data["description"] == "Original description"
        assert data["id"] == role_id

    # -- Update duplicate name ------------------------------------------

    @pytest.mark.asyncio
    async def test_update_duplicate_name_fails(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        """PUT with the name of another role returns 400."""
        url = _url(conference.id, "volunteer-roles")
        resp_a = await client.post(url, json={"name": "Role A"}, headers=auth_headers(tenant_admin_token))
        assert resp_a.status_code == 200

        resp_b = await client.post(url, json={"name": "Role B"}, headers=auth_headers(tenant_admin_token))
        assert resp_b.status_code == 200
        role_b_id = resp_b.json()["id"]

        # Try to rename Role B to Role A
        update_resp = await client.put(
            f"{url}/{role_b_id}",
            json={"name": "Role A"},
            headers=auth_headers(tenant_admin_token),
        )
        assert update_resp.status_code == 400
        assert "already exists" in update_resp.json()["detail"]

    # -- Update same name (no-op) should succeed ------------------------

    @pytest.mark.asyncio
    async def test_update_same_name_succeeds(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        """PUT with the role's own current name does not trigger a uniqueness error."""
        url = _url(conference.id, "volunteer-roles")
        create_resp = await client.post(url, json={"name": "Usher"}, headers=auth_headers(tenant_admin_token))
        assert create_resp.status_code == 200
        role_id = create_resp.json()["id"]

        update_resp = await client.put(
            f"{url}/{role_id}",
            json={"name": "Usher", "description": "Added description"},
            headers=auth_headers(tenant_admin_token),
        )
        assert update_resp.status_code == 200
        assert update_resp.json()["description"] == "Added description"

    # -- Delete ---------------------------------------------------------

    @pytest.mark.asyncio
    async def test_delete_volunteer_role(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        """DELETE removes the role and it disappears from the list."""
        url = _url(conference.id, "volunteer-roles")
        create_resp = await client.post(url, json={"name": "AV Support"}, headers=auth_headers(tenant_admin_token))
        assert create_resp.status_code == 200
        role_id = create_resp.json()["id"]

        delete_resp = await client.delete(f"{url}/{role_id}", headers=auth_headers(tenant_admin_token))
        assert delete_resp.status_code == 200
        assert "deleted successfully" in delete_resp.json()["message"]

        # Verify gone
        list_resp = await client.get(url, headers=auth_headers(tenant_admin_token))
        assert list_resp.status_code == 200
        assert list_resp.json()["total"] == 0

    # -- Delete nonexistent ---------------------------------------------

    @pytest.mark.asyncio
    async def test_delete_nonexistent_fails(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        """DELETE with a random UUID returns 404."""
        url = _url(conference.id, "volunteer-roles")
        fake_id = uuid.uuid4()
        resp = await client.delete(f"{url}/{fake_id}", headers=auth_headers(tenant_admin_token))
        assert resp.status_code == 404

    # -- Unauthenticated list -------------------------------------------

    @pytest.mark.asyncio
    async def test_unauthenticated_list_fails(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
    ) -> None:
        """GET without a token returns 401."""
        url = _url(conference.id, "volunteer-roles")
        resp = await client.get(url)
        assert resp.status_code == 401

    # -- Regular user can list ------------------------------------------

    @pytest.mark.asyncio
    async def test_regular_user_can_list(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
        regular_user_token: str,
    ) -> None:
        """Regular (non-admin) user can read volunteer roles."""
        url = _url(conference.id, "volunteer-roles")

        # Seed a role as admin
        create_resp = await client.post(url, json={"name": "Greeter"}, headers=auth_headers(tenant_admin_token))
        assert create_resp.status_code == 200

        # Regular user lists
        list_resp = await client.get(url, headers=auth_headers(regular_user_token))
        assert list_resp.status_code == 200
        assert list_resp.json()["total"] == 1

    # -- Regular user cannot create -------------------------------------

    @pytest.mark.asyncio
    async def test_regular_user_cannot_create(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        regular_user_token: str,
    ) -> None:
        """Regular user gets 403 when trying to create a volunteer role."""
        url = _url(conference.id, "volunteer-roles")
        resp = await client.post(
            url,
            json={"name": "Unauthorized Role"},
            headers=auth_headers(regular_user_token),
        )
        assert resp.status_code == 403

    # -- Conference scoping ---------------------------------------------

    @pytest.mark.asyncio
    async def test_conference_scoping(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        """Roles created for one conference do not appear in another."""
        url = _url(conference.id, "volunteer-roles")

        # Create a role in the main conference
        resp = await client.post(url, json={"name": "Usher"}, headers=auth_headers(tenant_admin_token))
        assert resp.status_code == 200

        # Create a second conference under the same tenant
        other_conf = Conference(
            id=uuid.uuid4(),
            tenant_id=conference.tenant_id,
            name="Other Conf 2026",
            abbreviation="OC26",
            is_active=True,
        )
        db_session.add(other_conf)
        await db_session.commit()

        # List volunteer roles for the other conference — should be empty
        other_url = _url(other_conf.id, "volunteer-roles")
        other_resp = await client.get(other_url, headers=auth_headers(tenant_admin_token))
        assert other_resp.status_code == 200
        assert other_resp.json()["total"] == 0

    # -- List ordering --------------------------------------------------

    @pytest.mark.asyncio
    async def test_list_ordered_by_name(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        """Volunteer roles are returned ordered by name ascending."""
        url = _url(conference.id, "volunteer-roles")
        headers = auth_headers(tenant_admin_token)
        for name in ["Zebra Wrangler", "AV Support", "Greeter"]:
            resp = await client.post(url, json={"name": name}, headers=headers)
            assert resp.status_code == 200

        list_resp = await client.get(url, headers=headers)
        names = [item["name"] for item in list_resp.json()["items"]]
        assert names == ["AV Support", "Greeter", "Zebra Wrangler"]


# ===================================================================
# 2. Session Types  (slug uniqueness + ordering + deletion constraint)
# ===================================================================


class TestSessionTypes:
    """Tests for session types CRUD (unique on slug, ordered by duration desc then name)."""

    @pytest.mark.asyncio
    async def test_create_session_type(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        """POST creates a session type with all expected fields."""
        url = _url(conference.id, "session-types")
        payload = {
            "name": "Talk",
            "slug": "talk",
            "duration_minutes": 30,
            "cfp_eligible": True,
            "is_active": True,
        }
        resp = await client.post(url, json=payload, headers=auth_headers(tenant_admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Talk"
        assert data["slug"] == "talk"
        assert data["duration_minutes"] == 30
        assert data["cfp_eligible"] is True
        assert data["is_active"] is True
        assert data["conference_id"] == str(conference.id)

    @pytest.mark.asyncio
    async def test_create_duplicate_slug_fails(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        """POST with an existing slug returns 400."""
        url = _url(conference.id, "session-types")
        headers = auth_headers(tenant_admin_token)
        payload = {"name": "Talk", "slug": "talk", "duration_minutes": 30}
        resp1 = await client.post(url, json=payload, headers=headers)
        assert resp1.status_code == 200

        # Same slug, different name
        payload2 = {"name": "Talk Variant", "slug": "talk", "duration_minutes": 45}
        resp2 = await client.post(url, json=payload2, headers=headers)
        assert resp2.status_code == 400
        assert "already exists" in resp2.json()["detail"]

    @pytest.mark.asyncio
    async def test_list_session_types_ordering(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        """Session types are ordered by duration_minutes DESC, then name ASC."""
        url = _url(conference.id, "session-types")
        headers = auth_headers(tenant_admin_token)

        types = [
            {"name": "Lightning", "slug": "lightning", "duration_minutes": 5},
            {"name": "Workshop", "slug": "workshop", "duration_minutes": 120},
            {"name": "Talk", "slug": "talk", "duration_minutes": 30},
            {"name": "Another 30min", "slug": "another-30", "duration_minutes": 30},
        ]
        for t in types:
            r = await client.post(url, json=t, headers=headers)
            assert r.status_code == 200

        list_resp = await client.get(url, headers=headers)
        assert list_resp.status_code == 200
        items = list_resp.json()["items"]
        # Expected order: Workshop (120), Another 30min (30), Talk (30), Lightning (5)
        assert items[0]["slug"] == "workshop"
        assert items[1]["slug"] == "another-30"
        assert items[2]["slug"] == "talk"
        assert items[3]["slug"] == "lightning"

    @pytest.mark.asyncio
    async def test_update_session_type(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        """PUT updates session type fields."""
        url = _url(conference.id, "session-types")
        headers = auth_headers(tenant_admin_token)
        create_resp = await client.post(
            url,
            json={"name": "Talk", "slug": "talk", "duration_minutes": 30},
            headers=headers,
        )
        assert create_resp.status_code == 200
        st_id = create_resp.json()["id"]

        update_resp = await client.put(
            f"{url}/{st_id}",
            json={"name": "Short Talk", "duration_minutes": 20, "cfp_eligible": False},
            headers=headers,
        )
        assert update_resp.status_code == 200
        data = update_resp.json()
        assert data["name"] == "Short Talk"
        assert data["duration_minutes"] == 20
        assert data["cfp_eligible"] is False
        # slug should remain unchanged
        assert data["slug"] == "talk"

    @pytest.mark.asyncio
    async def test_delete_session_type(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        """DELETE removes a session type that has no papers."""
        url = _url(conference.id, "session-types")
        headers = auth_headers(tenant_admin_token)
        create_resp = await client.post(
            url,
            json={"name": "Workshop", "slug": "workshop", "duration_minutes": 120},
            headers=headers,
        )
        assert create_resp.status_code == 200
        st_id = create_resp.json()["id"]

        delete_resp = await client.delete(f"{url}/{st_id}", headers=headers)
        assert delete_resp.status_code == 200

        list_resp = await client.get(url, headers=headers)
        assert list_resp.json()["total"] == 0

    @pytest.mark.asyncio
    async def test_update_duplicate_slug_fails(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        """PUT to change slug to an existing one returns 400."""
        url = _url(conference.id, "session-types")
        headers = auth_headers(tenant_admin_token)

        resp_a = await client.post(
            url,
            json={"name": "Talk", "slug": "talk", "duration_minutes": 30},
            headers=headers,
        )
        assert resp_a.status_code == 200

        resp_b = await client.post(
            url,
            json={"name": "Workshop", "slug": "workshop", "duration_minutes": 120},
            headers=headers,
        )
        assert resp_b.status_code == 200
        ws_id = resp_b.json()["id"]

        update_resp = await client.put(
            f"{url}/{ws_id}",
            json={"slug": "talk"},
            headers=headers,
        )
        assert update_resp.status_code == 400
        assert "already exists" in update_resp.json()["detail"]


# ===================================================================
# 3. Score Scales  (nested options, replace-all on update)
# ===================================================================


class TestScoreScales:
    """Tests for score scales CRUD including nested options."""

    @pytest.mark.asyncio
    async def test_create_score_scale_with_options(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        """POST creates a score scale with nested option objects."""
        url = _url(conference.id, "score-scales")
        payload = {
            "name": "1-5 Scale",
            "scale_type": "numeric_range",
            "options": [
                {"label": "Poor", "numeric_value": 1, "display_order": 0},
                {"label": "Fair", "numeric_value": 2, "display_order": 1},
                {"label": "Good", "numeric_value": 3, "display_order": 2},
                {"label": "Very Good", "numeric_value": 4, "display_order": 3},
                {"label": "Excellent", "numeric_value": 5, "display_order": 4},
            ],
        }
        resp = await client.post(url, json=payload, headers=auth_headers(tenant_admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "1-5 Scale"
        assert data["scale_type"] == "numeric_range"
        assert len(data["options"]) == 5
        assert data["options"][0]["label"] == "Poor"
        assert data["options"][4]["label"] == "Excellent"
        assert data["conference_id"] == str(conference.id)

    @pytest.mark.asyncio
    async def test_create_score_scale_no_options(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        """POST can create a scale with an empty options list."""
        url = _url(conference.id, "score-scales")
        payload = {
            "name": "Bare Scale",
            "scale_type": "custom",
            "options": [],
        }
        resp = await client.post(url, json=payload, headers=auth_headers(tenant_admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Bare Scale"
        assert data["options"] == []

    @pytest.mark.asyncio
    async def test_create_duplicate_name_fails(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        """POST with a duplicate scale name returns 400."""
        url = _url(conference.id, "score-scales")
        headers = auth_headers(tenant_admin_token)
        payload = {"name": "Binary", "scale_type": "binary", "options": []}

        resp1 = await client.post(url, json=payload, headers=headers)
        assert resp1.status_code == 200

        resp2 = await client.post(url, json=payload, headers=headers)
        assert resp2.status_code == 400
        assert "already exists" in resp2.json()["detail"]

    @pytest.mark.asyncio
    async def test_list_score_scales(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        """GET returns scales with their nested options."""
        url = _url(conference.id, "score-scales")
        headers = auth_headers(tenant_admin_token)

        await client.post(
            url,
            json={
                "name": "Yes/No",
                "scale_type": "binary",
                "options": [
                    {"label": "No", "numeric_value": 0, "display_order": 0},
                    {"label": "Yes", "numeric_value": 1, "display_order": 1},
                ],
            },
            headers=headers,
        )

        list_resp = await client.get(url, headers=headers)
        assert list_resp.status_code == 200
        body = list_resp.json()
        assert body["total"] == 1
        scale = body["items"][0]
        assert scale["name"] == "Yes/No"
        assert len(scale["options"]) == 2

    @pytest.mark.asyncio
    async def test_update_score_scale_replaces_options(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        """PUT with a new options array replaces all existing options."""
        url = _url(conference.id, "score-scales")
        headers = auth_headers(tenant_admin_token)

        # Create with 2 options
        create_resp = await client.post(
            url,
            json={
                "name": "Likert",
                "scale_type": "numeric_range",
                "options": [
                    {"label": "Low", "numeric_value": 1, "display_order": 0},
                    {"label": "High", "numeric_value": 5, "display_order": 1},
                ],
            },
            headers=headers,
        )
        assert create_resp.status_code == 200
        scale_id = create_resp.json()["id"]

        # Update: replace with 3 options
        update_resp = await client.put(
            f"{url}/{scale_id}",
            json={
                "name": "Likert 3-point",
                "options": [
                    {"label": "Low", "numeric_value": 1, "display_order": 0},
                    {"label": "Medium", "numeric_value": 3, "display_order": 1},
                    {"label": "High", "numeric_value": 5, "display_order": 2},
                ],
            },
            headers=headers,
        )
        assert update_resp.status_code == 200
        data = update_resp.json()
        assert data["name"] == "Likert 3-point"
        assert len(data["options"]) == 3
        labels = [o["label"] for o in data["options"]]
        assert "Medium" in labels

    @pytest.mark.asyncio
    async def test_update_score_scale_name_only(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        """PUT that updates only the name leaves existing options intact."""
        url = _url(conference.id, "score-scales")
        headers = auth_headers(tenant_admin_token)

        create_resp = await client.post(
            url,
            json={
                "name": "Old Name",
                "scale_type": "custom",
                "options": [
                    {"label": "A", "numeric_value": 1, "display_order": 0},
                    {"label": "B", "numeric_value": 2, "display_order": 1},
                ],
            },
            headers=headers,
        )
        assert create_resp.status_code == 200
        scale_id = create_resp.json()["id"]

        update_resp = await client.put(
            f"{url}/{scale_id}",
            json={"name": "Renamed Scale"},
            headers=headers,
        )
        assert update_resp.status_code == 200
        data = update_resp.json()
        assert data["name"] == "Renamed Scale"
        # Options should still have 2 entries (not replaced because options wasn't sent)
        assert len(data["options"]) == 2

    @pytest.mark.asyncio
    async def test_delete_score_scale(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        """DELETE removes the score scale."""
        url = _url(conference.id, "score-scales")
        headers = auth_headers(tenant_admin_token)

        create_resp = await client.post(
            url,
            json={
                "name": "Disposable",
                "scale_type": "binary",
                "options": [{"label": "Yes", "numeric_value": 1, "display_order": 0}],
            },
            headers=headers,
        )
        assert create_resp.status_code == 200
        scale_id = create_resp.json()["id"]

        delete_resp = await client.delete(f"{url}/{scale_id}", headers=headers)
        assert delete_resp.status_code == 200

        list_resp = await client.get(url, headers=headers)
        assert list_resp.json()["total"] == 0

    @pytest.mark.asyncio
    async def test_delete_nonexistent_score_scale_fails(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        """DELETE with a random UUID returns 404."""
        url = _url(conference.id, "score-scales")
        fake_id = uuid.uuid4()
        resp = await client.delete(f"{url}/{fake_id}", headers=auth_headers(tenant_admin_token))
        assert resp.status_code == 404


# ===================================================================
# 4. Email Templates  (upsert / default pattern)
# ===================================================================


class TestEmailTemplates:
    """Tests for the email template endpoints (defaults, upsert, reset)."""

    @pytest.mark.asyncio
    async def test_list_returns_defaults(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        """GET returns default templates even before any saves."""
        url = _url(conference.id, "email-templates")
        resp = await client.get(url, headers=auth_headers(tenant_admin_token))
        assert resp.status_code == 200
        body = resp.json()
        # Should include all conference-level default types
        types = {item["template_type"] for item in body["items"]}
        assert "applicant_verification" in types
        assert "submission_confirmation" in types
        assert "password_reset" in types
        assert "paper_acceptance" in types
        assert "paper_rejection" in types
        assert "co_speaker_invitation" in types
        assert "committee_verification" in types
        assert "new_message_notification" in types
        # All default items should have id=None (not yet persisted)
        for item in body["items"]:
            assert item["id"] is None

    @pytest.mark.asyncio
    async def test_get_single_default_template(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        """GET for a specific template type returns its default before any save."""
        url = _url(conference.id, "email-templates")
        resp = await client.get(
            f"{url}/applicant_verification",
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["template_type"] == "applicant_verification"
        assert data["id"] is None
        assert "confirm your email" in data["subject"].lower()

    @pytest.mark.asyncio
    async def test_update_creates_template(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        """PUT on an unsaved template type creates it (upsert)."""
        url = _url(conference.id, "email-templates")
        headers = auth_headers(tenant_admin_token)

        update_resp = await client.put(
            f"{url}/submission_confirmation",
            json={
                "subject": "Custom Submission Subject",
                "body_html": "<p>Custom body</p>",
            },
            headers=headers,
        )
        assert update_resp.status_code == 200
        data = update_resp.json()
        assert data["subject"] == "Custom Submission Subject"
        assert data["body_html"] == "<p>Custom body</p>"
        # Now it should have a real ID
        assert data["id"] is not None
        assert data["template_type"] == "submission_confirmation"

    @pytest.mark.asyncio
    async def test_update_existing_template(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        """PUT on an already-saved template updates it in place."""
        url = _url(conference.id, "email-templates")
        headers = auth_headers(tenant_admin_token)

        # First upsert to create it
        resp1 = await client.put(
            f"{url}/password_reset",
            json={"subject": "Reset v1", "body_html": "<p>v1</p>"},
            headers=headers,
        )
        assert resp1.status_code == 200
        original_id = resp1.json()["id"]

        # Second update
        resp2 = await client.put(
            f"{url}/password_reset",
            json={"subject": "Reset v2"},
            headers=headers,
        )
        assert resp2.status_code == 200
        data = resp2.json()
        assert data["subject"] == "Reset v2"
        assert data["id"] == original_id  # Same row updated

    @pytest.mark.asyncio
    async def test_delete_resets_to_default(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        """DELETE removes the custom template so the default is returned again."""
        url = _url(conference.id, "email-templates")
        headers = auth_headers(tenant_admin_token)

        # Create a custom template
        await client.put(
            f"{url}/applicant_verification",
            json={"subject": "Custom Subject", "body_html": "<p>Custom</p>"},
            headers=headers,
        )

        # Delete (reset)
        delete_resp = await client.delete(f"{url}/applicant_verification", headers=headers)
        assert delete_resp.status_code == 200
        assert "reset to default" in delete_resp.json()["message"]

        # Verify the default is returned
        get_resp = await client.get(f"{url}/applicant_verification", headers=headers)
        assert get_resp.status_code == 200
        data = get_resp.json()
        assert data["id"] is None  # Back to unsaved default
        assert data["subject"] != "Custom Subject"

    @pytest.mark.asyncio
    async def test_delete_unsaved_template_returns_404(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        """DELETE on a template that was never saved returns 404."""
        url = _url(conference.id, "email-templates")
        resp = await client.delete(
            f"{url}/co_speaker_invitation",
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 404
        assert "already using default" in resp.json()["detail"]

    @pytest.mark.asyncio
    async def test_invalid_template_type_returns_error(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        """GET/PUT/DELETE with an invalid template type returns an error."""
        url = _url(conference.id, "email-templates")
        headers = auth_headers(tenant_admin_token)

        get_resp = await client.get(f"{url}/nonexistent_type", headers=headers)
        assert get_resp.status_code == 400

        put_resp = await client.put(
            f"{url}/nonexistent_type",
            json={"subject": "X", "body_html": "<p>X</p>"},
            headers=headers,
        )
        assert put_resp.status_code == 400

    @pytest.mark.asyncio
    async def test_list_includes_saved_and_defaults(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        """After saving one template, the list still contains all template types."""
        url = _url(conference.id, "email-templates")
        headers = auth_headers(tenant_admin_token)

        # Save one template
        await client.put(
            f"{url}/paper_acceptance",
            json={"subject": "Accepted!", "body_html": "<p>Congrats</p>"},
            headers=headers,
        )

        list_resp = await client.get(url, headers=headers)
        assert list_resp.status_code == 200
        items = list_resp.json()["items"]
        types = {item["template_type"] for item in items}

        # Should have all 19 conference template types
        assert len(types) == 19

        # The saved one should have an id
        saved = [i for i in items if i["template_type"] == "paper_acceptance"]
        assert len(saved) == 1
        assert saved[0]["id"] is not None
        assert saved[0]["subject"] == "Accepted!"


# ===================================================================
# 5. Review Form Settings  (singleton pattern)
# ===================================================================


class TestReviewFormSettings:
    """Tests for the review form settings singleton endpoints."""

    @pytest.mark.asyncio
    async def test_get_creates_defaults(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        """GET creates default settings on first access and returns them."""
        url = _url(conference.id, "review-form-settings")
        resp = await client.get(url, headers=auth_headers(tenant_admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["conference_id"] == str(conference.id)
        assert data["enable_speaker_feedback"] is True
        assert data["enable_internal_comment"] is True
        assert data["enable_must_have"] is True
        assert "id" in data
        assert "created_at" in data

    @pytest.mark.asyncio
    async def test_get_returns_same_record(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        """Calling GET twice returns the same record (no duplicates)."""
        url = _url(conference.id, "review-form-settings")
        headers = auth_headers(tenant_admin_token)
        resp1 = await client.get(url, headers=headers)
        resp2 = await client.get(url, headers=headers)
        assert resp1.json()["id"] == resp2.json()["id"]

    @pytest.mark.asyncio
    async def test_update_form_settings(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        """PUT updates the singleton settings."""
        url = _url(conference.id, "review-form-settings")
        headers = auth_headers(tenant_admin_token)

        # Ensure defaults exist
        get_resp = await client.get(url, headers=headers)
        assert get_resp.status_code == 200

        # Update
        update_resp = await client.put(
            url,
            json={
                "enable_speaker_feedback": False,
                "enable_must_have": False,
            },
            headers=headers,
        )
        assert update_resp.status_code == 200
        data = update_resp.json()
        assert data["enable_speaker_feedback"] is False
        assert data["enable_must_have"] is False
        # Unchanged field retains its default
        assert data["enable_internal_comment"] is True

    @pytest.mark.asyncio
    async def test_update_creates_if_not_exists(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        """PUT on settings that do not yet exist creates them with the given values."""
        url = _url(conference.id, "review-form-settings")
        headers = auth_headers(tenant_admin_token)

        resp = await client.put(
            url,
            json={"enable_internal_comment": False},
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["enable_internal_comment"] is False
        assert data["id"] is not None

    @pytest.mark.asyncio
    async def test_regular_user_can_read_settings(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
        regular_user_token: str,
    ) -> None:
        """Regular (non-admin) user can read review form settings."""
        url = _url(conference.id, "review-form-settings")
        # Seed via admin
        await client.get(url, headers=auth_headers(tenant_admin_token))

        # Read via regular user
        resp = await client.get(url, headers=auth_headers(regular_user_token))
        assert resp.status_code == 200
        assert "enable_speaker_feedback" in resp.json()

    @pytest.mark.asyncio
    async def test_regular_user_cannot_update_settings(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        regular_user_token: str,
    ) -> None:
        """Regular user gets 403 when trying to update review form settings."""
        url = _url(conference.id, "review-form-settings")
        resp = await client.put(
            url,
            json={"enable_speaker_feedback": False},
            headers=auth_headers(regular_user_token),
        )
        assert resp.status_code == 403
