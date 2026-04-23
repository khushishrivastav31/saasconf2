"""Comprehensive tests for conference core, associations, and misc low-coverage modules.

Covers:
- Conference core: advanced listing (pagination, search, status filter), publish/unpublish,
  update with social_links/team_members, delete-preview
- Conference associations: volunteer, location, CFP link/unlink
- Conference service providers: CRUD
- Screen overlays: CRUD (additional edge cases beyond test_screen_overlays.py)
- Tenant company (MyCompany): GET/PUT
- Modules: list, create, get, update
- Attachments: list, upload, download, delete
"""

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.associations import ConferenceCFP, ConferenceLocation
from app.models.cfp import CallForPapers
from app.models.conference import Conference
from app.models.location import Location
from app.models.module import Module, TenantModule
from app.models.screen_overlay import ScreenOverlay
from app.models.tenant import Tenant
from app.models.user import User
from tests.conftest import auth_headers

# ── Helpers ────────────────────────────────────────────────────────────

BASE_URL = "/api/v1/conferences"
MY_COMPANY_URL = "/api/v1/my-company"
MODULES_URL = "/api/v1/admin/modules"
ATTACHMENTS_URL = "/api/v1/attachments"


def _make_token(user: User, modules: list[str] | None = None) -> str:
    """Create a valid JWT access token for a user."""
    return create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role,
        modules=modules or [],
    )


# Minimal valid 1x1 white PNG (67 bytes)
VALID_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
    b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00"
    b"\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00"
    b"\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
)


# ── Extra fixtures ────────────────────────────────────────────────────


@pytest.fixture()
def admin_token(tenant_admin_user: User) -> str:
    return _make_token(tenant_admin_user, modules=["conferences", "service_providers"])


@pytest.fixture()
def user_token(regular_user: User) -> str:
    return _make_token(regular_user, modules=["conferences"])


@pytest_asyncio.fixture()
async def sp_module(db_session: AsyncSession) -> Module:
    """Create the 'service_providers' module."""
    m = Module(
        id=uuid.uuid4(),
        name="Service Providers",
        code="service_providers",
        description="Service provider management",
        is_active=True,
    )
    db_session.add(m)
    await db_session.commit()
    return m


@pytest_asyncio.fixture()
async def tenant_with_all_modules(
    db_session: AsyncSession,
    tenant: Tenant,
    conferences_module: Module,
    sp_module: Module,
) -> Tenant:
    """Associate conferences + service_providers modules with the test tenant."""
    for mod in [conferences_module, sp_module]:
        tm = TenantModule(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            module_id=mod.id,
            is_enabled=True,
        )
        db_session.add(tm)
    await db_session.commit()
    return tenant


@pytest_asyncio.fixture()
async def location(db_session: AsyncSession, tenant: Tenant) -> Location:
    """Create a test location."""
    loc = Location(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="Main Hall",
        location_type="venue",
        city="Berlin",
        country="Germany",
    )
    db_session.add(loc)
    await db_session.commit()
    return loc


@pytest_asyncio.fixture()
async def cfp(db_session: AsyncSession, tenant: Tenant) -> CallForPapers:
    """Create a test Call for Papers."""
    c = CallForPapers(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        title="TestCFP 2026",
        status="draft",
    )
    db_session.add(c)
    await db_session.commit()
    return c


@pytest_asyncio.fixture()
async def second_conference(db_session: AsyncSession, tenant: Tenant) -> Conference:
    """Create a second conference for multi-conference association tests."""
    c = Conference(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="SecondConf 2026",
        abbreviation="SC26",
        is_active=True,
    )
    db_session.add(c)
    await db_session.commit()
    return c


@pytest_asyncio.fixture()
async def linked_location(
    db_session: AsyncSession,
    conference: Conference,
    location: Location,
) -> Location:
    """Link a location to the conference."""
    db_session.add(
        ConferenceLocation(
            conference_id=conference.id,
            location_id=location.id,
        )
    )
    await db_session.commit()
    return location


@pytest_asyncio.fixture()
async def linked_cfp(
    db_session: AsyncSession,
    conference: Conference,
    cfp: CallForPapers,
) -> CallForPapers:
    """Link a CFP to the conference."""
    db_session.add(
        ConferenceCFP(
            conference_id=conference.id,
            cfp_id=cfp.id,
        )
    )
    await db_session.commit()
    return cfp


# ═══════════════════════════════════════════════════════════════════════
# 1. CONFERENCE CORE - ADVANCED LISTING & LIFECYCLE
# ═══════════════════════════════════════════════════════════════════════


class TestConferenceListAdvanced:
    """Advanced listing: search, pagination, status filter, is_active filter."""

    async def test_list_with_search(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
    ) -> None:
        """Search by conference name returns matching results."""
        resp = await client.get(
            BASE_URL,
            params={"search": "TestConf"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        assert any(c["name"] == "TestConf 2026" for c in data["items"])

    async def test_list_search_no_results(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
    ) -> None:
        """Search for non-existent term returns empty."""
        resp = await client.get(
            BASE_URL,
            params={"search": "NonExistentConference999"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["total"] == 0

    async def test_list_pagination(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Pagination with page_size=1 returns correct pages."""
        for i in range(3):
            c = Conference(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                name=f"PagConf {i}",
                abbreviation=f"PG{i}",
                is_active=True,
            )
            db_session.add(c)
        await db_session.commit()

        resp = await client.get(
            BASE_URL,
            params={"page": 1, "page_size": 2},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 3
        assert len(data["items"]) == 2
        assert data["pages"] == 2

    async def test_list_filter_is_active(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Filtering by is_active=false excludes active conferences."""
        active = Conference(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            name="Active Conf",
            abbreviation="AC",
            is_active=True,
        )
        inactive = Conference(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            name="Inactive Conf",
            abbreviation="IC",
            is_active=False,
        )
        db_session.add_all([active, inactive])
        await db_session.commit()

        resp = await client.get(
            BASE_URL,
            params={"is_active": "false"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert all(item["is_active"] is False for item in data["items"])

    async def test_list_requires_auth(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
    ) -> None:
        """Listing conferences without auth returns 401."""
        resp = await client.get(BASE_URL)
        assert resp.status_code == 401


class TestConferencePublishUnpublish:
    """POST /{id}/publish and /{id}/unpublish."""

    async def test_publish_conference(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
    ) -> None:
        """Publishing a conference sets is_published to true."""
        resp = await client.post(
            f"{BASE_URL}/{conference.id}/publish",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["is_published"] is True

    async def test_unpublish_conference(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
    ) -> None:
        """Unpublishing a conference sets is_published to false."""
        # First publish
        await client.post(
            f"{BASE_URL}/{conference.id}/publish",
            headers=auth_headers(admin_token),
        )
        # Then unpublish
        resp = await client.post(
            f"{BASE_URL}/{conference.id}/unpublish",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["is_published"] is False

    async def test_publish_nonexistent_404(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Publishing a nonexistent conference returns 404."""
        fake_id = uuid.uuid4()
        resp = await client.post(
            f"{BASE_URL}/{fake_id}/publish",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 404

    async def test_publish_forbidden_for_regular_user(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        regular_user: User,
        user_token: str,
        conference: Conference,
    ) -> None:
        """Regular user cannot publish a conference."""
        resp = await client.post(
            f"{BASE_URL}/{conference.id}/publish",
            headers=auth_headers(user_token),
        )
        assert resp.status_code == 403


class TestConferenceUpdateAdvanced:
    """Conference update with JSONB fields (social_links, team_members, settings)."""

    async def test_update_social_links(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
    ) -> None:
        """Update conference with social_links."""
        resp = await client.put(
            f"{BASE_URL}/{conference.id}",
            json={
                "social_links": {
                    "twitter": "https://twitter.com/testconf",
                    "linkedin": "https://linkedin.com/company/testconf",
                },
            },
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["social_links"]["twitter"] == "https://twitter.com/testconf"

    async def test_update_team_members(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
    ) -> None:
        """Update conference with team_members."""
        resp = await client.put(
            f"{BASE_URL}/{conference.id}",
            json={
                "team_members": [
                    {"first_name": "Alice", "last_name": "Smith", "email": "alice@test.com", "role": "Chair"},
                    {"first_name": "Bob", "last_name": "Jones", "phone": "+4930123456", "role": ""},
                ],
            },
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["team_members"]) == 2
        assert data["team_members"][0]["first_name"] == "Alice"

    async def test_update_settings(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
    ) -> None:
        """Update conference settings JSON."""
        resp = await client.put(
            f"{BASE_URL}/{conference.id}",
            json={"settings": {"email_sending_enabled": True}},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["settings"]["email_sending_enabled"] is True

    async def test_update_nonexistent_404(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Updating a nonexistent conference returns 404."""
        fake_id = uuid.uuid4()
        resp = await client.put(
            f"{BASE_URL}/{fake_id}",
            json={"name": "Ghost"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 404


class TestConferenceDeletePreview:
    """GET /{id}/delete-preview."""

    async def test_delete_preview(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
    ) -> None:
        """Delete preview returns entity counts and status."""
        resp = await client.get(
            f"{BASE_URL}/{conference.id}/delete-preview",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["conference_name"] == "TestConf 2026"
        assert data["is_active"] is True
        assert data["must_deactivate_first"] is True
        assert "locations" in data
        assert "cfps" in data
        assert "papers" in data
        assert "invoices" in data

    async def test_delete_preview_nonexistent_404(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Delete preview for nonexistent conference returns 404."""
        fake_id = uuid.uuid4()
        resp = await client.get(
            f"{BASE_URL}/{fake_id}/delete-preview",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 404


# ═══════════════════════════════════════════════════════════════════════
# 2. CONFERENCE ASSOCIATIONS - LOCATIONS
# ═══════════════════════════════════════════════════════════════════════


class TestLocationAssociations:
    """Conference <-> Location link/unlink."""

    async def test_link_location(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
        location: Location,
    ) -> None:
        """Link a location to a conference returns 201."""
        resp = await client.post(
            f"{BASE_URL}/{conference.id}/locations",
            json={"id": str(location.id)},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 201

    async def test_link_location_duplicate(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
        linked_location: Location,
    ) -> None:
        """Linking an already-linked location returns 400."""
        resp = await client.post(
            f"{BASE_URL}/{conference.id}/locations",
            json={"id": str(linked_location.id)},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 400

    async def test_list_linked_locations(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
        linked_location: Location,
    ) -> None:
        """Listing locations shows the linked location."""
        resp = await client.get(
            f"{BASE_URL}/{conference.id}/locations",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["name"] == "Main Hall"

    async def test_unlink_location_only_conference_blocked(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
        linked_location: Location,
    ) -> None:
        """Cannot unlink a location from its only conference."""
        resp = await client.delete(
            f"{BASE_URL}/{conference.id}/locations/{linked_location.id}",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 400

    async def test_unlink_location_multiple_conferences(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
        second_conference: Conference,
        linked_location: Location,
    ) -> None:
        """Can unlink a location when linked to multiple conferences."""
        db_session.add(
            ConferenceLocation(
                conference_id=second_conference.id,
                location_id=linked_location.id,
            )
        )
        await db_session.commit()

        resp = await client.delete(
            f"{BASE_URL}/{conference.id}/locations/{linked_location.id}",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200


# ═══════════════════════════════════════════════════════════════════════
# 4. CONFERENCE ASSOCIATIONS - CFPs
# ═══════════════════════════════════════════════════════════════════════


class TestCFPAssociations:
    """Conference <-> CFP link/unlink."""

    async def test_link_cfp(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
        cfp: CallForPapers,
    ) -> None:
        """Link a CFP to a conference returns 201."""
        resp = await client.post(
            f"{BASE_URL}/{conference.id}/cfps",
            json={"id": str(cfp.id)},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 201

    async def test_link_cfp_duplicate(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
        linked_cfp: CallForPapers,
    ) -> None:
        """Linking an already-linked CFP returns 400."""
        resp = await client.post(
            f"{BASE_URL}/{conference.id}/cfps",
            json={"id": str(linked_cfp.id)},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 400

    async def test_list_linked_cfps(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
        linked_cfp: CallForPapers,
    ) -> None:
        """Listing CFPs shows the linked CFP."""
        resp = await client.get(
            f"{BASE_URL}/{conference.id}/cfps",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["title"] == "TestCFP 2026"

    async def test_unlink_cfp_only_conference_blocked(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
        linked_cfp: CallForPapers,
    ) -> None:
        """Cannot unlink a CFP from its only conference."""
        resp = await client.delete(
            f"{BASE_URL}/{conference.id}/cfps/{linked_cfp.id}",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 400

    async def test_unlink_cfp_multiple_conferences(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
        second_conference: Conference,
        linked_cfp: CallForPapers,
    ) -> None:
        """Can unlink a CFP when linked to multiple conferences."""
        db_session.add(
            ConferenceCFP(
                conference_id=second_conference.id,
                cfp_id=linked_cfp.id,
            )
        )
        await db_session.commit()

        resp = await client.delete(
            f"{BASE_URL}/{conference.id}/cfps/{linked_cfp.id}",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200

    async def test_link_nonexistent_cfp_404(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
    ) -> None:
        """Linking a nonexistent CFP returns 404."""
        fake_id = uuid.uuid4()
        resp = await client.post(
            f"{BASE_URL}/{conference.id}/cfps",
            json={"id": str(fake_id)},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 404


# ═══════════════════════════════════════════════════════════════════════
# 5. CONFERENCE SERVICE PROVIDERS
# ═══════════════════════════════════════════════════════════════════════


class TestConferenceServiceProviders:
    """CRUD for conference-level service providers."""

    async def test_list_empty(
        self,
        client: AsyncClient,
        tenant_with_all_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
    ) -> None:
        """Listing service providers for conference with none returns empty."""
        resp = await client.get(
            f"{BASE_URL}/{conference.id}/service-providers",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["total"] == 0

    async def test_create_service_provider(
        self,
        client: AsyncClient,
        tenant_with_all_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
    ) -> None:
        """Create a conference service provider returns 201."""
        resp = await client.post(
            f"{BASE_URL}/{conference.id}/service-providers",
            json={
                "company_name": "AV Solutions GmbH",
                "service_description": "Audio-visual equipment rental",
                "city": "Munich",
                "country": "Germany",
            },
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["company_name"] == "AV Solutions GmbH"
        assert data["conference_id"] == str(conference.id)
        assert data["location_id"] is None

    async def test_update_service_provider(
        self,
        client: AsyncClient,
        tenant_with_all_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
    ) -> None:
        """Update a conference service provider."""
        # Create first
        create_resp = await client.post(
            f"{BASE_URL}/{conference.id}/service-providers",
            json={"company_name": "Catering Co"},
            headers=auth_headers(admin_token),
        )
        sp_id = create_resp.json()["id"]

        # Update
        resp = await client.put(
            f"{BASE_URL}/{conference.id}/service-providers/{sp_id}",
            json={"company_name": "Catering Co Updated", "city": "Hamburg"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["company_name"] == "Catering Co Updated"
        assert data["city"] == "Hamburg"

    async def test_delete_service_provider(
        self,
        client: AsyncClient,
        tenant_with_all_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
    ) -> None:
        """Delete a conference service provider."""
        create_resp = await client.post(
            f"{BASE_URL}/{conference.id}/service-providers",
            json={"company_name": "Security Firm"},
            headers=auth_headers(admin_token),
        )
        sp_id = create_resp.json()["id"]

        resp = await client.delete(
            f"{BASE_URL}/{conference.id}/service-providers/{sp_id}",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        assert "deleted" in resp.json()["message"].lower()

    async def test_update_nonexistent_sp_404(
        self,
        client: AsyncClient,
        tenant_with_all_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
    ) -> None:
        """Updating a nonexistent service provider returns 404."""
        fake_id = uuid.uuid4()
        resp = await client.put(
            f"{BASE_URL}/{conference.id}/service-providers/{fake_id}",
            json={"company_name": "Ghost"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 404

    async def test_delete_nonexistent_sp_404(
        self,
        client: AsyncClient,
        tenant_with_all_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
    ) -> None:
        """Deleting a nonexistent service provider returns 404."""
        fake_id = uuid.uuid4()
        resp = await client.delete(
            f"{BASE_URL}/{conference.id}/service-providers/{fake_id}",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 404


# ═══════════════════════════════════════════════════════════════════════
# 6. SCREEN OVERLAYS - ADDITIONAL EDGE CASES
# ═══════════════════════════════════════════════════════════════════════


class TestScreenOverlayEdgeCases:
    """Additional screen overlay tests not covered by test_screen_overlays.py."""

    @pytest_asyncio.fixture()
    async def overlay(
        self,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
    ) -> ScreenOverlay:
        o = ScreenOverlay(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            trigger_type="first_registration",
            title="First Registration Overlay",
            animation_style="sparkle",
            duration_seconds=8,
            is_active=False,
            display_order=1,
        )
        db_session.add(o)
        await db_session.commit()
        await db_session.refresh(o)
        return o

    async def test_create_first_registration_overlay(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Create an overlay with first_registration trigger type."""
        url = f"{BASE_URL}/{conference.id}/screen-overlays"
        resp = await client.post(
            url,
            json={
                "trigger_type": "first_registration",
                "title": "Congratulations!",
                "animation_style": "fireworks",
                "duration_seconds": 10,
            },
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 201
        assert resp.json()["trigger_type"] == "first_registration"

    async def test_update_overlay_to_active(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        overlay: ScreenOverlay,
    ) -> None:
        """Toggle overlay active state."""
        url = f"{BASE_URL}/{conference.id}/screen-overlays/{overlay.id}"
        resp = await client.put(
            url,
            json={"is_active": True},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["is_active"] is True

    async def test_get_overlay_wrong_conference_404(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        overlay: ScreenOverlay,
        second_conference: Conference,
    ) -> None:
        """Getting an overlay using wrong conference_id returns 404."""
        url = f"{BASE_URL}/{second_conference.id}/screen-overlays/{overlay.id}"
        resp = await client.get(url, headers=auth_headers(admin_token))
        assert resp.status_code == 404


# ═══════════════════════════════════════════════════════════════════════
# 7. TENANT COMPANY (MY COMPANY)
# ═══════════════════════════════════════════════════════════════════════


class TestTenantCompany:
    """GET/PUT /my-company."""

    async def test_get_my_company(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Tenant admin can retrieve their company info."""
        resp = await client.get(
            MY_COMPANY_URL,
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Test Corp"
        assert "id" in data

    async def test_update_my_company(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Tenant admin can update company info."""
        resp = await client.put(
            MY_COMPANY_URL,
            json={
                "name": "Updated Corp",
                "city": "Frankfurt",
                "country": "Germany",
                "website": "https://updatedcorp.com",
            },
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Updated Corp"
        assert data["city"] == "Frankfurt"

    async def test_update_my_company_slug_ignored(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Tenant admin cannot change slug via my-company endpoint."""
        original_slug = tenant.slug
        resp = await client.put(
            MY_COMPANY_URL,
            json={"slug": "hacked-slug", "name": "Still Test Corp"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        # Verify slug hasn't changed by fetching again
        get_resp = await client.get(
            MY_COMPANY_URL,
            headers=auth_headers(admin_token),
        )
        assert get_resp.json()["slug"] == original_slug

    async def test_get_my_company_requires_auth(
        self,
        client: AsyncClient,
    ) -> None:
        """Accessing my-company without auth returns 401."""
        resp = await client.get(MY_COMPANY_URL)
        assert resp.status_code == 401

    async def test_get_my_company_forbidden_for_regular_user(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        regular_user: User,
        user_token: str,
    ) -> None:
        """Regular user cannot access my-company endpoint."""
        resp = await client.get(
            MY_COMPANY_URL,
            headers=auth_headers(user_token),
        )
        assert resp.status_code == 403


# ═══════════════════════════════════════════════════════════════════════
# 8. MODULES (SUPER ADMIN)
# ═══════════════════════════════════════════════════════════════════════


class TestModules:
    """CRUD for modules (super admin only)."""

    @pytest.fixture()
    def sa_token(self, super_admin_user: User) -> str:
        return _make_token(super_admin_user)

    async def test_list_modules(
        self,
        client: AsyncClient,
        super_admin_user: User,
        sa_token: str,
        conferences_module: Module,
    ) -> None:
        """Super admin can list modules."""
        resp = await client.get(
            MODULES_URL,
            headers=auth_headers(sa_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1

    async def test_create_module(
        self,
        client: AsyncClient,
        super_admin_user: User,
        sa_token: str,
    ) -> None:
        """Super admin can create a new module."""
        resp = await client.post(
            MODULES_URL,
            json={
                "code": f"test_mod_{uuid.uuid4().hex[:6]}",
                "name": "Test Module",
                "description": "A test module",
            },
            headers=auth_headers(sa_token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Test Module"
        assert data["is_active"] is True
        assert data["tenant_count"] == 0

    async def test_create_module_duplicate_code(
        self,
        client: AsyncClient,
        super_admin_user: User,
        sa_token: str,
        conferences_module: Module,
    ) -> None:
        """Creating a module with duplicate code returns 400."""
        resp = await client.post(
            MODULES_URL,
            json={
                "code": "conferences",
                "name": "Duplicate",
                "description": "Should fail",
            },
            headers=auth_headers(sa_token),
        )
        assert resp.status_code == 400

    async def test_get_module(
        self,
        client: AsyncClient,
        super_admin_user: User,
        sa_token: str,
        conferences_module: Module,
    ) -> None:
        """Super admin can get a module by ID."""
        resp = await client.get(
            f"{MODULES_URL}/{conferences_module.id}",
            headers=auth_headers(sa_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["code"] == "conferences"

    async def test_get_module_not_found(
        self,
        client: AsyncClient,
        super_admin_user: User,
        sa_token: str,
    ) -> None:
        """Getting a nonexistent module returns 404."""
        fake_id = uuid.uuid4()
        resp = await client.get(
            f"{MODULES_URL}/{fake_id}",
            headers=auth_headers(sa_token),
        )
        assert resp.status_code == 404

    async def test_update_module(
        self,
        client: AsyncClient,
        super_admin_user: User,
        sa_token: str,
        conferences_module: Module,
    ) -> None:
        """Super admin can update a module."""
        resp = await client.put(
            f"{MODULES_URL}/{conferences_module.id}",
            json={"description": "Updated description"},
            headers=auth_headers(sa_token),
        )
        assert resp.status_code == 200
        assert resp.json()["description"] == "Updated description"

    async def test_list_modules_forbidden_for_tenant_admin(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Tenant admin cannot access modules endpoint."""
        resp = await client.get(
            MODULES_URL,
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 403

    async def test_list_modules_with_search(
        self,
        client: AsyncClient,
        super_admin_user: User,
        sa_token: str,
        conferences_module: Module,
    ) -> None:
        """Search modules by name."""
        resp = await client.get(
            MODULES_URL,
            params={"search": "Conferences"},
            headers=auth_headers(sa_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        assert any(m["code"] == "conferences" for m in data["items"])


# ═══════════════════════════════════════════════════════════════════════
# 9. ATTACHMENTS
# ═══════════════════════════════════════════════════════════════════════


class TestAttachments:
    """Attachment upload, list, download, delete."""

    async def test_list_attachments_empty(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
    ) -> None:
        """Listing attachments for an entity with none returns empty."""
        resp = await client.get(
            ATTACHMENTS_URL,
            params={"entity_type": "conference", "entity_id": str(conference.id)},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["total"] == 0

    async def test_list_attachments_invalid_entity_type(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Listing attachments with invalid entity_type returns 400."""
        resp = await client.get(
            ATTACHMENTS_URL,
            params={"entity_type": "invalid_type", "entity_id": str(uuid.uuid4())},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 400

    async def test_upload_and_download_attachment(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
    ) -> None:
        """Upload a file attachment and then download it."""
        # Upload
        upload_resp = await client.post(
            ATTACHMENTS_URL,
            files={"file": ("test.png", VALID_PNG, "image/png")},
            data={
                "entity_type": "conference",
                "entity_id": str(conference.id),
                "description": "Test attachment",
            },
            headers=auth_headers(admin_token),
        )
        assert upload_resp.status_code == 201
        att_data = upload_resp.json()
        assert att_data["filename"] == "test.png"
        assert att_data["entity_type"] == "conference"
        att_id = att_data["id"]

        # Download
        download_resp = await client.get(
            f"{ATTACHMENTS_URL}/{att_id}/download",
            headers=auth_headers(admin_token),
        )
        assert download_resp.status_code == 200
        assert "image" in download_resp.headers.get("content-type", "")

    async def test_delete_attachment(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
    ) -> None:
        """Delete an uploaded attachment."""
        # Upload
        upload_resp = await client.post(
            ATTACHMENTS_URL,
            files={"file": ("delete_me.png", VALID_PNG, "image/png")},
            data={
                "entity_type": "conference",
                "entity_id": str(conference.id),
            },
            headers=auth_headers(admin_token),
        )
        att_id = upload_resp.json()["id"]

        # Delete
        del_resp = await client.delete(
            f"{ATTACHMENTS_URL}/{att_id}",
            headers=auth_headers(admin_token),
        )
        assert del_resp.status_code == 200
        assert "deleted" in del_resp.json()["message"].lower()

        # Verify gone
        download_resp = await client.get(
            f"{ATTACHMENTS_URL}/{att_id}/download",
            headers=auth_headers(admin_token),
        )
        assert download_resp.status_code == 404

    async def test_download_nonexistent_attachment_404(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Downloading a nonexistent attachment returns 404."""
        fake_id = uuid.uuid4()
        resp = await client.get(
            f"{ATTACHMENTS_URL}/{fake_id}/download",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 404

    async def test_delete_nonexistent_attachment_404(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Deleting a nonexistent attachment returns 404."""
        fake_id = uuid.uuid4()
        resp = await client.delete(
            f"{ATTACHMENTS_URL}/{fake_id}",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 404

    async def test_upload_invalid_entity_type(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Uploading with an invalid entity_type returns 400."""
        resp = await client.post(
            ATTACHMENTS_URL,
            files={"file": ("test.png", VALID_PNG, "image/png")},
            data={
                "entity_type": "invalid_type",
                "entity_id": str(uuid.uuid4()),
            },
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 400
