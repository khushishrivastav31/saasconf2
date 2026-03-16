"""Deep-coverage tests for conference core, associations, user access, and alumni.

Targets uncovered code paths in:
- app/api/v1/conferences/core.py (create, get single, stats, delete, status filters)
- app/api/v1/conferences/associations.py (list with data, CFP submission counts)
- app/api/v1/user_conference_access.py (grant, list details, update, bulk ops)
- app/api/v1/alumni.py (update with propagation, import edge cases, check)
"""

import uuid
from datetime import date, timedelta

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.alumni import Alumni, AlumniSource
from app.models.associations import ConferenceCFP, ConferenceLocation
from app.models.cfp import CallForPapers
from app.models.conference import Conference
from app.models.location import Location
from app.models.module import Module, TenantModule
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from app.models.user_conference_access import UserConferenceAccess
from tests.conftest import _make_token, auth_headers

# ── URL constants ────────────────────────────────────────────────────

CONF_URL = "/api/v1/conferences"
ACCESS_URL = "/api/v1/user-conference-access"
ALUMNI_URL = "/api/v1/conferences/{cid}/alumni"


# ── Shared fixtures ──────────────────────────────────────────────────


@pytest_asyncio.fixture()
async def conferences_module(db_session: AsyncSession) -> Module:
    m = Module(
        id=uuid.uuid4(),
        name="Conferences",
        code="conferences",
        description="Conference management",
        is_active=True,
    )
    db_session.add(m)
    await db_session.commit()
    return m


@pytest_asyncio.fixture()
async def tenant_with_modules(db_session: AsyncSession, tenant: Tenant, conferences_module: Module) -> Tenant:
    tm = TenantModule(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        module_id=conferences_module.id,
        is_enabled=True,
    )
    db_session.add(tm)
    await db_session.commit()
    return tenant


@pytest.fixture()
def admin_token(tenant_admin_user: User) -> str:
    return _make_token(tenant_admin_user, modules=["conferences"])


@pytest.fixture()
def user_token(regular_user: User) -> str:
    return _make_token(regular_user, modules=["conferences"])


@pytest.fixture()
def sa_token(super_admin_user: User) -> str:
    return _make_token(super_admin_user)


@pytest_asyncio.fixture()
async def restricted_user(db_session: AsyncSession, tenant: Tenant) -> User:
    """Create a regular user with has_all_conference_access=False."""
    u = User(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        email=f"restricted-{uuid.uuid4().hex[:8]}@test.com",
        password_hash=hash_password("Password123!"),
        first_name="Restricted",
        last_name="User",
        role=UserRole.USER.value,
        is_active=True,
        has_all_conference_access=False,
    )
    db_session.add(u)
    await db_session.commit()
    return u


@pytest.fixture()
def restricted_token(restricted_user: User) -> str:
    return _make_token(restricted_user, modules=["conferences"])


@pytest_asyncio.fixture()
async def second_conference(db_session: AsyncSession, tenant: Tenant) -> Conference:
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
async def location(db_session: AsyncSession, tenant: Tenant) -> Location:
    loc = Location(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="Deep Hall",
        location_type="venue",
        city="Munich",
        country="Germany",
    )
    db_session.add(loc)
    await db_session.commit()
    return loc


@pytest_asyncio.fixture()
async def cfp(db_session: AsyncSession, tenant: Tenant) -> CallForPapers:
    c = CallForPapers(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        title="DeepCFP 2026",
        status="draft",
    )
    db_session.add(c)
    await db_session.commit()
    return c


@pytest_asyncio.fixture()
async def alumni_record(db_session: AsyncSession, tenant: Tenant, conference: Conference) -> Alumni:
    a = Alumni(
        tenant_id=tenant.id,
        conference_id=conference.id,
        email="deepalumni@example.com",
        first_name="Deep",
        last_name="Alumni",
        company="DeepCo",
        source=AlumniSource.MANUAL.value,
    )
    db_session.add(a)
    await db_session.commit()
    return a


# =====================================================================
# 1. CONFERENCE CORE - CREATE
# =====================================================================


class TestConferenceCreate:
    """POST /conferences - create a new conference."""

    @pytest.mark.asyncio
    async def test_create_conference_minimal(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Create a conference with minimal required fields."""
        resp = await client.post(
            CONF_URL,
            json={"name": "Brand New Conf"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Brand New Conf"
        assert data["is_active"] is True
        assert data["status"] == "draft"
        assert data["tenant_id"] == str(tenant_with_modules.id)

    @pytest.mark.asyncio
    async def test_create_conference_full_fields(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Create a conference with all optional fields."""
        today = date.today()
        payload = {
            "name": "Full Conf 2026",
            "abbreviation": "FC26",
            "description": "A fully-specified conference",
            "website": "https://fullconf.org",
            "start_date": str(today + timedelta(days=30)),
            "end_date": str(today + timedelta(days=33)),
            "venue_name": "Grand Hall",
            "venue_address": "123 Main St",
            "city": "Berlin",
            "state": "Berlin",
            "postal_code": "10115",
            "country": "Germany",
            "timezone": "Europe/Berlin",
            "locale": "de",
            "venue_type": "hybrid",
            "venue_url": "https://venue.test",
            "virtual_platform_url": "https://zoom.us/meeting/123",
            "social_links": {
                "twitter": "https://twitter.com/fullconf",
                "linkedin": "https://linkedin.com/company/fullconf",
            },
            "team_members": [
                {
                    "first_name": "Jane",
                    "last_name": "Doe",
                    "email": "jane@fullconf.org",
                    "role": "Chair",
                    "is_manager": True,
                },
            ],
            "settings": {"email_sending_enabled": True},
            "currency": "EUR",
        }
        resp = await client.post(
            CONF_URL,
            json=payload,
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["abbreviation"] == "FC26"
        assert data["city"] == "Berlin"
        assert data["locale"] == "de"
        assert data["venue_type"] == "hybrid"
        assert data["social_links"]["twitter"] == "https://twitter.com/fullconf"
        assert len(data["team_members"]) == 1
        assert data["team_members"][0]["is_manager"] is True
        assert data["managers_count"] == 1
        assert data["team_count"] == 1
        assert data["currency"] == "EUR"
        assert data["status"] == "upcoming"
        assert data["tenant_slug"] is not None

    @pytest.mark.asyncio
    async def test_create_conference_with_social_links_none(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Create a conference without social_links."""
        resp = await client.post(
            CONF_URL,
            json={"name": "No Social Conf"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["social_links"] == {}


# =====================================================================
# 2. CONFERENCE CORE - GET SINGLE
# =====================================================================


class TestConferenceGetSingle:
    """GET /conferences/{id} - get a single conference."""

    @pytest.mark.asyncio
    async def test_get_conference_by_id(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
    ) -> None:
        """Retrieve a conference by its ID returns full data."""
        resp = await client.get(
            f"{CONF_URL}/{conference.id}",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == str(conference.id)
        assert data["name"] == "TestConf 2026"
        assert data["tenant_slug"] is not None

    @pytest.mark.asyncio
    async def test_get_conference_not_found(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Getting a nonexistent conference returns 404."""
        fake_id = uuid.uuid4()
        resp = await client.get(
            f"{CONF_URL}/{fake_id}",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 404


# =====================================================================
# 3. CONFERENCE CORE - STATS
# =====================================================================


class TestConferenceStats:
    """GET /conferences/stats - aggregate statistics."""

    @pytest.mark.asyncio
    async def test_stats_with_conferences(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Stats endpoint returns correct counts for various conference states."""
        today = date.today()
        # upcoming
        db_session.add(
            Conference(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                name="Upcoming Conf",
                abbreviation="UP",
                is_active=True,
                is_published=True,
                start_date=today + timedelta(days=30),
                end_date=today + timedelta(days=33),
            )
        )
        # past
        db_session.add(
            Conference(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                name="Past Conf",
                abbreviation="PA",
                is_active=True,
                start_date=today - timedelta(days=60),
                end_date=today - timedelta(days=57),
            )
        )
        # draft (no dates)
        db_session.add(
            Conference(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                name="Draft Conf",
                abbreviation="DR",
                is_active=False,
            )
        )
        await db_session.commit()

        resp = await client.get(
            f"{CONF_URL}/stats",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 3
        assert data["upcoming"] >= 1
        assert data["past"] >= 1
        assert data["active"] >= 1
        assert data["published"] >= 1

    @pytest.mark.asyncio
    async def test_stats_empty_tenant(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Stats for a tenant with no conferences returns zeros."""
        resp = await client.get(
            f"{CONF_URL}/stats",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0


# =====================================================================
# 4. CONFERENCE CORE - LIST WITH STATUS FILTERS
# =====================================================================


class TestConferenceListStatusFilters:
    """List conferences with status=upcoming|ongoing|past|draft."""

    @pytest.mark.asyncio
    async def test_list_filter_upcoming(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Filter by status=upcoming returns only future conferences."""
        today = date.today()
        db_session.add(
            Conference(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                name="Future Conf",
                abbreviation="FU",
                is_active=True,
                start_date=today + timedelta(days=30),
                end_date=today + timedelta(days=33),
            )
        )
        db_session.add(
            Conference(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                name="Past Conf",
                abbreviation="PA",
                is_active=True,
                start_date=today - timedelta(days=60),
                end_date=today - timedelta(days=57),
            )
        )
        await db_session.commit()

        resp = await client.get(
            CONF_URL,
            params={"status": "upcoming"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        assert all(c["status"] == "upcoming" for c in data["items"])

    @pytest.mark.asyncio
    async def test_list_filter_past(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Filter by status=past returns only past conferences."""
        today = date.today()
        db_session.add(
            Conference(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                name="Old Conf",
                abbreviation="OC",
                is_active=True,
                start_date=today - timedelta(days=90),
                end_date=today - timedelta(days=87),
            )
        )
        await db_session.commit()

        resp = await client.get(
            CONF_URL,
            params={"status": "past"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        assert all(c["status"] == "past" for c in data["items"])

    @pytest.mark.asyncio
    async def test_list_filter_draft(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Filter by status=draft returns conferences with no start_date."""
        db_session.add(
            Conference(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                name="Draft Only Conf",
                abbreviation="DO",
                is_active=True,
            )
        )
        await db_session.commit()

        resp = await client.get(
            CONF_URL,
            params={"status": "draft"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        assert all(c["status"] == "draft" for c in data["items"])

    @pytest.mark.asyncio
    async def test_list_filter_ongoing(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Filter by status=ongoing returns conferences happening now."""
        today = date.today()
        db_session.add(
            Conference(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                name="Ongoing Conf",
                abbreviation="ON",
                is_active=True,
                start_date=today - timedelta(days=1),
                end_date=today + timedelta(days=1),
            )
        )
        await db_session.commit()

        resp = await client.get(
            CONF_URL,
            params={"status": "ongoing"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        assert all(c["status"] == "ongoing" for c in data["items"])


# =====================================================================
# 5. CONFERENCE CORE - DELETE
# =====================================================================


class TestConferenceDelete:
    """DELETE /conferences/{id} - delete a deactivated conference."""

    @pytest.mark.asyncio
    async def test_delete_deactivated_conference(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Tenant super user can delete a deactivated conference."""
        # Set tenant super_user to the admin user
        tenant.super_user_id = tenant_admin_user.id
        await db_session.commit()

        c = Conference(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            name="ToDelete Conf",
            abbreviation="TD",
            is_active=False,
        )
        db_session.add(c)
        await db_session.commit()

        resp = await client.delete(
            f"{CONF_URL}/{c.id}",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "deleted successfully" in data["message"]
        assert data["deleted_volunteers"] == 0
        assert data["deleted_locations"] == 0
        assert data["deleted_cfps"] == 0

    @pytest.mark.asyncio
    async def test_delete_active_conference_rejected(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
    ) -> None:
        """Cannot delete an active conference - must deactivate first."""
        tenant.super_user_id = tenant_admin_user.id
        await db_session.commit()

        resp = await client.delete(
            f"{CONF_URL}/{conference.id}",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 400
        assert "deactivate" in resp.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_delete_conference_with_linked_entities(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Delete a conference with linked location and CFP."""
        tenant.super_user_id = tenant_admin_user.id
        await db_session.commit()

        c = Conference(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            name="Rich Conf",
            abbreviation="RC",
            is_active=False,
        )
        db_session.add(c)
        await db_session.flush()

        loc = Location(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            name="Del Hall",
            location_type="venue",
        )
        db_session.add(loc)
        await db_session.flush()
        db_session.add(ConferenceLocation(conference_id=c.id, location_id=loc.id))

        cfp_obj = CallForPapers(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            title="Del CFP",
            status="draft",
        )
        db_session.add(cfp_obj)
        await db_session.flush()
        db_session.add(ConferenceCFP(conference_id=c.id, cfp_id=cfp_obj.id))

        await db_session.commit()

        resp = await client.delete(
            f"{CONF_URL}/{c.id}",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["deleted_locations"] == 1
        assert data["deleted_cfps"] == 1

    @pytest.mark.asyncio
    async def test_delete_preview_with_super_admin(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        super_admin_user: User,
        sa_token: str,
        conference: Conference,
    ) -> None:
        """Super admin can preview delete and sees can_delete=true."""
        resp = await client.get(
            f"{CONF_URL}/{conference.id}/delete-preview",
            headers=auth_headers(sa_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["can_delete"] is True
        assert data["conference_name"] == "TestConf 2026"


# =====================================================================
# 6. CONFERENCE CORE - UPDATE WITH SPECIAL FIELDS
# =====================================================================


class TestConferenceUpdateDeep:
    """Update conference with team_members empty strings, social_links, settings."""

    @pytest.mark.asyncio
    async def test_update_team_members_empty_strings_sanitized(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
    ) -> None:
        """Empty strings in team member optional fields are sanitized to None."""
        resp = await client.put(
            f"{CONF_URL}/{conference.id}",
            json={
                "team_members": [
                    {
                        "first_name": "Test",
                        "last_name": "Person",
                        "email": "",
                        "phone": "",
                        "role": "",
                    },
                ],
            },
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["team_members"]) == 1
        tm = data["team_members"][0]
        assert tm["first_name"] == "Test"
        # Empty strings should be sanitized to None
        assert tm["email"] is None
        assert tm["phone"] is None
        assert tm["role"] is None

    @pytest.mark.asyncio
    async def test_update_conference_is_active(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
    ) -> None:
        """Deactivate a conference via update."""
        resp = await client.put(
            f"{CONF_URL}/{conference.id}",
            json={"is_active": False},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["is_active"] is False

    @pytest.mark.asyncio
    async def test_update_conference_dates_and_location(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
    ) -> None:
        """Update dates, location, and venue details."""
        today = date.today()
        resp = await client.put(
            f"{CONF_URL}/{conference.id}",
            json={
                "start_date": str(today + timedelta(days=60)),
                "end_date": str(today + timedelta(days=63)),
                "city": "Hamburg",
                "country": "Germany",
                "venue_name": "Congress Center",
                "venue_type": "onsite",
                "timezone": "Europe/Berlin",
            },
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["city"] == "Hamburg"
        assert data["venue_name"] == "Congress Center"
        assert data["status"] == "upcoming"


# =====================================================================
# 7. CONFERENCE ASSOCIATIONS - LOCATIONS (deeper coverage)
# =====================================================================


class TestLocationAssociationsDeep:
    """Deeper location association tests."""

    @pytest.mark.asyncio
    async def test_list_locations_with_conference_ids(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
    ) -> None:
        """List returns locations with conference_ids populated."""
        loc = Location(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            name="Deep Location",
            location_type="venue",
        )
        db_session.add(loc)
        await db_session.flush()
        db_session.add(ConferenceLocation(conference_id=conference.id, location_id=loc.id))
        await db_session.commit()

        resp = await client.get(
            f"{CONF_URL}/{conference.id}/locations",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert str(conference.id) in data["items"][0]["conference_ids"]

    @pytest.mark.asyncio
    async def test_list_locations_empty(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
    ) -> None:
        """Listing locations for a conference with none linked returns empty."""
        resp = await client.get(
            f"{CONF_URL}/{conference.id}/locations",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["total"] == 0


# =====================================================================
# 9. CONFERENCE ASSOCIATIONS - CFPs (deeper coverage)
# =====================================================================


class TestCFPAssociationsDeep:
    """Deeper CFP association tests with submission counts."""

    @pytest.mark.asyncio
    async def test_list_cfps_with_conference_ids(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
    ) -> None:
        """List returns CFPs with conference_ids populated."""
        cfp_obj = CallForPapers(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            title="Deep CFP",
            status="open",
        )
        db_session.add(cfp_obj)
        await db_session.flush()
        db_session.add(ConferenceCFP(conference_id=conference.id, cfp_id=cfp_obj.id))
        await db_session.commit()

        resp = await client.get(
            f"{CONF_URL}/{conference.id}/cfps",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        item = data["items"][0]
        assert str(conference.id) in item["conference_ids"]
        assert item["title"] == "Deep CFP"
        # submission_count should be present
        assert "submission_count" in item
        assert item["submission_count"] == 0

    @pytest.mark.asyncio
    async def test_list_cfps_empty(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        conference: Conference,
    ) -> None:
        """Listing CFPs for a conference with none linked returns empty."""
        resp = await client.get(
            f"{CONF_URL}/{conference.id}/cfps",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["total"] == 0


# =====================================================================
# 10. USER CONFERENCE ACCESS - GRANT WITH ADMIN LEVEL
# =====================================================================


class TestUserAccessGrantDeep:
    """Deeper tests for user conference access grant."""

    @pytest.mark.asyncio
    async def test_grant_admin_access(
        self,
        client: AsyncClient,
        conference: Conference,
        regular_user: User,
        tenant_with_modules: Tenant,
        admin_token: str,
    ) -> None:
        """Grant admin-level access to a user."""
        payload = {
            "user_id": str(regular_user.id),
            "conference_id": str(conference.id),
            "access_level": "admin",
        }
        resp = await client.post(ACCESS_URL, json=payload, headers=auth_headers(admin_token))
        assert resp.status_code == 201
        data = resp.json()
        assert data["access_level"] == "admin"
        assert data["user_id"] == str(regular_user.id)
        assert data["conference_id"] == str(conference.id)
        assert data["granted_by"] == str(regular_user.id) or data["granted_by"] is not None

    @pytest.mark.asyncio
    async def test_grant_access_conference_not_found(
        self,
        client: AsyncClient,
        regular_user: User,
        tenant_with_modules: Tenant,
        admin_token: str,
    ) -> None:
        """Grant access to a nonexistent conference returns 404."""
        payload = {
            "user_id": str(regular_user.id),
            "conference_id": str(uuid.uuid4()),
            "access_level": "read_only",
        }
        resp = await client.post(ACCESS_URL, json=payload, headers=auth_headers(admin_token))
        assert resp.status_code == 404


# =====================================================================
# 11. USER CONFERENCE ACCESS - LIST WITH DETAILS
# =====================================================================


class TestUserAccessListDeep:
    """Deeper tests for listing user conference access with details."""

    @pytest.mark.asyncio
    async def test_list_user_access_with_details(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        regular_user: User,
        tenant_admin_user: User,
        tenant_with_modules: Tenant,
        admin_token: str,
    ) -> None:
        """List user access includes conference_name and user details."""
        access = UserConferenceAccess(
            user_id=regular_user.id,
            conference_id=conference.id,
            access_level="admin",
            granted_by=tenant_admin_user.id,
        )
        db_session.add(access)
        await db_session.commit()

        url = f"{ACCESS_URL}/user/{regular_user.id}"
        resp = await client.get(url, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        item = data["items"][0]
        assert item["conference_name"] == "TestConf 2026"
        assert item["conference_abbreviation"] == "TC26"
        assert item["user_email"] == regular_user.email
        assert item["user_name"] is not None  # "Regular User"
        assert item["granted_by"] == str(tenant_admin_user.id)

    @pytest.mark.asyncio
    async def test_list_conference_users_with_details(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        regular_user: User,
        tenant_with_modules: Tenant,
        admin_token: str,
    ) -> None:
        """List conference users includes user_email and user_name."""
        access = UserConferenceAccess(
            user_id=regular_user.id,
            conference_id=conference.id,
            access_level="read_only",
        )
        db_session.add(access)
        await db_session.commit()

        url = f"{ACCESS_URL}/conference/{conference.id}"
        resp = await client.get(url, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        item = data["items"][0]
        assert item["user_email"] == regular_user.email
        assert item["access_level"] == "read_only"


# =====================================================================
# 12. USER CONFERENCE ACCESS - UPDATE AND REVOKE
# =====================================================================


class TestUserAccessUpdateRevokeDeep:
    """Deeper tests for update and revoke access."""

    @pytest.mark.asyncio
    async def test_update_access_read_only_to_admin(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        regular_user: User,
        tenant_with_modules: Tenant,
        admin_token: str,
    ) -> None:
        """Update from read_only to admin access."""
        access = UserConferenceAccess(
            user_id=regular_user.id,
            conference_id=conference.id,
            access_level="read_only",
        )
        db_session.add(access)
        await db_session.commit()
        await db_session.refresh(access)

        resp = await client.put(
            f"{ACCESS_URL}/{access.id}",
            json={"access_level": "admin"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["access_level"] == "admin"

    @pytest.mark.asyncio
    async def test_revoke_then_verify_gone(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        regular_user: User,
        tenant_with_modules: Tenant,
        admin_token: str,
    ) -> None:
        """After revoking, listing user access returns empty."""
        access = UserConferenceAccess(
            user_id=regular_user.id,
            conference_id=conference.id,
            access_level="admin",
        )
        db_session.add(access)
        await db_session.commit()
        await db_session.refresh(access)

        # Revoke
        resp = await client.delete(
            f"{ACCESS_URL}/{access.id}",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200

        # Verify empty
        list_resp = await client.get(
            f"{ACCESS_URL}/user/{regular_user.id}",
            headers=auth_headers(admin_token),
        )
        assert list_resp.status_code == 200
        assert list_resp.json()["total"] == 0


# =====================================================================
# 13. USER CONFERENCE ACCESS - BULK GRANT AND REVOKE (deeper)
# =====================================================================


class TestUserAccessBulkDeep:
    """Deeper tests for bulk grant and revoke with skips."""

    @pytest.mark.asyncio
    async def test_bulk_grant_skips_nonexistent_conferences(
        self,
        client: AsyncClient,
        conference: Conference,
        regular_user: User,
        tenant_with_modules: Tenant,
        admin_token: str,
    ) -> None:
        """Bulk grant skips conferences that don't exist."""
        fake_conf_id = str(uuid.uuid4())
        url = f"{ACCESS_URL}/user/{regular_user.id}/bulk-grant"
        payload = {
            "conference_ids": [str(conference.id), fake_conf_id],
            "access_level": "read_only",
        }
        resp = await client.post(url, json=payload, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["granted"] == 1
        assert data["skipped"] == 1

    @pytest.mark.asyncio
    async def test_bulk_revoke_mixed(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        second_conference: Conference,
        regular_user: User,
        tenant_with_modules: Tenant,
        admin_token: str,
    ) -> None:
        """Bulk revoke only revokes conferences where access exists."""
        # Grant access to one conference only
        access = UserConferenceAccess(
            user_id=regular_user.id,
            conference_id=conference.id,
            access_level="read_only",
        )
        db_session.add(access)
        await db_session.commit()

        url = f"{ACCESS_URL}/user/{regular_user.id}/bulk-revoke"
        payload = {
            "conference_ids": [str(conference.id), str(second_conference.id)],
        }
        resp = await client.post(url, json=payload, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["revoked"] == 1

    @pytest.mark.asyncio
    async def test_bulk_grant_all_new(
        self,
        client: AsyncClient,
        conference: Conference,
        second_conference: Conference,
        regular_user: User,
        tenant_with_modules: Tenant,
        admin_token: str,
    ) -> None:
        """Bulk grant to two fresh conferences succeeds with granted=2."""
        url = f"{ACCESS_URL}/user/{regular_user.id}/bulk-grant"
        payload = {
            "conference_ids": [str(conference.id), str(second_conference.id)],
            "access_level": "admin",
        }
        resp = await client.post(url, json=payload, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["granted"] == 2
        assert data["skipped"] == 0


# =====================================================================
# 14. USER CONFERENCE ACCESS - MY-ACCESS WITH EXPLICIT GRANTS
# =====================================================================


class TestMyAccessDeep:
    """Deeper my-access tests."""

    @pytest.mark.asyncio
    async def test_my_access_with_explicit_read_only(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        regular_user: User,
        tenant_with_modules: Tenant,
        user_token: str,
    ) -> None:
        """User with explicit read_only access sees read_only level."""
        access = UserConferenceAccess(
            user_id=regular_user.id,
            conference_id=conference.id,
            access_level="read_only",
        )
        db_session.add(access)
        await db_session.commit()

        url = f"{ACCESS_URL}/my-access/{conference.id}"
        resp = await client.get(url, headers=auth_headers(user_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["access_level"] == "read_only"
        assert data["is_conference_admin"] is False


# =====================================================================
# 15. ALUMNI - UPDATE WITH EMAIL CHANGE
# =====================================================================


class TestAlumniUpdateDeep:
    """Deeper alumni update tests with propagation logic."""

    @pytest.mark.asyncio
    async def test_update_alumni_email_change(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        alumni_record: Alumni,
        admin_token: str,
    ) -> None:
        """Updating alumni email normalizes to lowercase."""
        url = f"{ALUMNI_URL.format(cid=conference.id)}/{alumni_record.id}"
        payload = {"email": "NewEmail@Example.COM"}
        resp = await client.put(url, json=payload, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == "newemail@example.com"

    @pytest.mark.asyncio
    async def test_update_alumni_name_change(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        alumni_record: Alumni,
        admin_token: str,
    ) -> None:
        """Updating alumni first and last name succeeds."""
        url = f"{ALUMNI_URL.format(cid=conference.id)}/{alumni_record.id}"
        payload = {"first_name": "Updated", "last_name": "Name"}
        resp = await client.put(url, json=payload, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["first_name"] == "Updated"
        assert data["last_name"] == "Name"

    @pytest.mark.asyncio
    async def test_update_alumni_duplicate_email_rejected(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        tenant_with_modules: Tenant,
        alumni_record: Alumni,
        admin_token: str,
    ) -> None:
        """Changing alumni email to one that already exists is rejected."""
        # Create another alumni with a different email
        other = Alumni(
            tenant_id=tenant.id,
            conference_id=conference.id,
            email="other@example.com",
            first_name="Other",
            last_name="Person",
            source=AlumniSource.MANUAL.value,
        )
        db_session.add(other)
        await db_session.commit()

        url = f"{ALUMNI_URL.format(cid=conference.id)}/{alumni_record.id}"
        payload = {"email": "other@example.com"}
        resp = await client.put(url, json=payload, headers=auth_headers(admin_token))
        assert resp.status_code == 409

    @pytest.mark.asyncio
    async def test_update_alumni_with_notes(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        alumni_record: Alumni,
        admin_token: str,
    ) -> None:
        """Update alumni with notes field."""
        url = f"{ALUMNI_URL.format(cid=conference.id)}/{alumni_record.id}"
        payload = {"notes": "VIP attendee, keynote speaker"}
        resp = await client.put(url, json=payload, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        assert resp.json()["notes"] == "VIP attendee, keynote speaker"


# =====================================================================
# 16. ALUMNI - CSV IMPORT EDGE CASES
# =====================================================================


class TestAlumniImportDeep:
    """Deeper alumni CSV import tests."""

    @pytest.mark.asyncio
    async def test_import_csv_missing_name_defaults(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        admin_token: str,
    ) -> None:
        """Import with missing first/last name defaults to email prefix and dash."""
        url = f"{ALUMNI_URL.format(cid=conference.id)}/import"
        csv_content = "email\njohn.doe@example.com\n"
        resp = await client.post(
            url,
            files={"file": ("alumni.csv", csv_content.encode(), "text/csv")},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["imported"] == 1
        assert data["skipped"] == 0

        # Verify the defaults were applied by listing
        list_resp = await client.get(
            ALUMNI_URL.format(cid=conference.id),
            params={"search": "john.doe"},
            headers=auth_headers(admin_token),
        )
        assert list_resp.status_code == 200
        items = list_resp.json()["items"]
        assert len(items) == 1
        assert items[0]["first_name"] == "john.doe"  # email prefix
        assert items[0]["last_name"] == "-"  # default

    @pytest.mark.asyncio
    async def test_import_csv_with_company_column(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        admin_token: str,
    ) -> None:
        """Import CSV with company/organization column alias."""
        url = f"{ALUMNI_URL.format(cid=conference.id)}/import"
        csv_content = "email,first_name,last_name,organization\ncompany@test.com,Test,User,ACME Corp\n"
        resp = await client.post(
            url,
            files={"file": ("alumni.csv", csv_content.encode(), "text/csv")},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["imported"] == 1

        # Verify company was mapped
        list_resp = await client.get(
            ALUMNI_URL.format(cid=conference.id),
            params={"search": "company@test.com"},
            headers=auth_headers(admin_token),
        )
        assert list_resp.status_code == 200
        items = list_resp.json()["items"]
        assert len(items) == 1
        assert items[0]["company"] == "ACME Corp"

    @pytest.mark.asyncio
    async def test_import_csv_missing_email_rows(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        admin_token: str,
    ) -> None:
        """Rows with empty email produce errors."""
        url = f"{ALUMNI_URL.format(cid=conference.id)}/import"
        csv_content = "email,first_name,last_name\n,Missing,Email\nvalid@test.com,Valid,User\n"
        resp = await client.post(
            url,
            files={"file": ("alumni.csv", csv_content.encode(), "text/csv")},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["imported"] == 1
        assert len(data["errors"]) >= 1
        assert "missing email" in data["errors"][0].lower()

    @pytest.mark.asyncio
    async def test_import_csv_with_alternate_header_aliases(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        admin_token: str,
    ) -> None:
        """Import CSV with alternate header names (e-mail, vorname, nachname)."""
        url = f"{ALUMNI_URL.format(cid=conference.id)}/import"
        csv_content = "e-mail,vorname,nachname,firma\nalias@test.com,Hans,Mueller,TestGmbH\n"
        resp = await client.post(
            url,
            files={"file": ("alumni.csv", csv_content.encode(), "text/csv")},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["imported"] == 1

    @pytest.mark.asyncio
    async def test_import_csv_empty_file(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        admin_token: str,
    ) -> None:
        """Import an empty CSV (no rows, header only) succeeds with 0 imported."""
        url = f"{ALUMNI_URL.format(cid=conference.id)}/import"
        csv_content = "email,first_name,last_name\n"
        resp = await client.post(
            url,
            files={"file": ("alumni.csv", csv_content.encode(), "text/csv")},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["imported"] == 0
        assert data["skipped"] == 0
        assert data["errors"] == []


# =====================================================================
# 17. ALUMNI - EXPORT (deeper)
# =====================================================================


class TestAlumniExportDeep:
    """Deeper alumni CSV export tests."""

    @pytest.mark.asyncio
    async def test_export_csv_with_multiple_alumni(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        tenant_with_modules: Tenant,
        admin_token: str,
    ) -> None:
        """Export multiple alumni rows with all fields."""
        for i in range(3):
            db_session.add(
                Alumni(
                    tenant_id=tenant.id,
                    conference_id=conference.id,
                    email=f"export{i}@test.com",
                    first_name=f"Export{i}",
                    last_name="User",
                    company=f"Co{i}",
                    source=AlumniSource.MANUAL.value,
                )
            )
        await db_session.commit()

        url = f"{ALUMNI_URL.format(cid=conference.id)}/export"
        resp = await client.get(url, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        assert "text/csv" in resp.headers["content-type"]
        body = resp.content.decode("utf-8-sig")
        lines = [line for line in body.strip().split("\n") if line.strip()]
        assert len(lines) == 4  # header + 3 data rows
        assert "export0@test.com" in body
        assert "export2@test.com" in body


# =====================================================================
# 18. ALUMNI - CHECK CROSS-CONFERENCE
# =====================================================================


class TestAlumniCheckDeep:
    """Deeper alumni check tests."""

    @pytest.mark.asyncio
    async def test_check_alumni_multiple_conferences(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        second_conference: Conference,
        tenant_with_modules: Tenant,
        admin_token: str,
    ) -> None:
        """Alumni in multiple other conferences returns all of them."""
        # Create a third conference
        third_conf = Conference(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            name="Third Conf",
            abbreviation="TC",
            is_active=True,
        )
        db_session.add(third_conf)
        await db_session.flush()

        # Add alumni to second and third conferences
        for conf in [second_conference, third_conf]:
            db_session.add(
                Alumni(
                    tenant_id=tenant.id,
                    conference_id=conf.id,
                    email="multicheck@example.com",
                    first_name="Multi",
                    last_name="Check",
                    source=AlumniSource.MANUAL.value,
                )
            )
        await db_session.commit()

        url = f"{ALUMNI_URL.format(cid=conference.id)}/check"
        resp = await client.get(
            url,
            params={"email": "multicheck@example.com"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_alumni"] is True
        assert len(data["conferences"]) == 2

    @pytest.mark.asyncio
    async def test_check_alumni_case_insensitive(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        second_conference: Conference,
        tenant_with_modules: Tenant,
        admin_token: str,
    ) -> None:
        """Alumni check is case-insensitive on email."""
        db_session.add(
            Alumni(
                tenant_id=tenant.id,
                conference_id=second_conference.id,
                email="casecheck@example.com",
                first_name="Case",
                last_name="Check",
                source=AlumniSource.MANUAL.value,
            )
        )
        await db_session.commit()

        url = f"{ALUMNI_URL.format(cid=conference.id)}/check"
        resp = await client.get(
            url,
            params={"email": "CaseCheck@Example.COM"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["is_alumni"] is True


# =====================================================================
# 19. CONFERENCE CORE - RESTRICTED USER ACCESS FILTERING
# =====================================================================


class TestConferenceAccessFiltering:
    """Tests for restricted user conference access filtering in list/get/stats."""

    @pytest.mark.asyncio
    async def test_restricted_user_only_sees_granted_conferences(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        tenant_with_modules: Tenant,
        restricted_user: User,
        restricted_token: str,
        conference: Conference,
        second_conference: Conference,
    ) -> None:
        """User with has_all_conference_access=False only sees explicitly granted."""
        # Grant access to first conference only
        access = UserConferenceAccess(
            user_id=restricted_user.id,
            conference_id=conference.id,
            access_level="read_only",
        )
        db_session.add(access)
        await db_session.commit()

        resp = await client.get(
            CONF_URL,
            headers=auth_headers(restricted_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        conf_ids = [c["id"] for c in data["items"]]
        assert str(conference.id) in conf_ids
        assert str(second_conference.id) not in conf_ids

    @pytest.mark.asyncio
    async def test_restricted_user_no_access_sees_empty(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        restricted_user: User,
        restricted_token: str,
        conference: Conference,
    ) -> None:
        """User with no conference access sees empty list."""
        resp = await client.get(
            CONF_URL,
            headers=auth_headers(restricted_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["items"] == []

    @pytest.mark.asyncio
    async def test_restricted_user_stats_no_access(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        restricted_user: User,
        restricted_token: str,
        conference: Conference,
    ) -> None:
        """User with no conference access sees zero stats."""
        resp = await client.get(
            f"{CONF_URL}/stats",
            headers=auth_headers(restricted_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0

    @pytest.mark.asyncio
    async def test_restricted_user_cannot_get_non_granted_conference(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        restricted_user: User,
        restricted_token: str,
        conference: Conference,
    ) -> None:
        """User without access to a specific conference gets 403."""
        resp = await client.get(
            f"{CONF_URL}/{conference.id}",
            headers=auth_headers(restricted_token),
        )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_restricted_user_can_get_granted_conference(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_with_modules: Tenant,
        restricted_user: User,
        restricted_token: str,
        conference: Conference,
    ) -> None:
        """User with access can retrieve the specific conference."""
        access = UserConferenceAccess(
            user_id=restricted_user.id,
            conference_id=conference.id,
            access_level="read_only",
        )
        db_session.add(access)
        await db_session.commit()

        resp = await client.get(
            f"{CONF_URL}/{conference.id}",
            headers=auth_headers(restricted_token),
        )
        assert resp.status_code == 200
        assert resp.json()["id"] == str(conference.id)


# =====================================================================
# 20. ALUMNI - CREATE WITH NOTES
# =====================================================================


class TestAlumniCreateDeep:
    """Deeper alumni create tests."""

    @pytest.mark.asyncio
    async def test_create_alumni_with_notes(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        admin_token: str,
    ) -> None:
        """Create alumni with optional notes field."""
        url = ALUMNI_URL.format(cid=conference.id)
        payload = {
            "email": "noted@example.com",
            "first_name": "Noted",
            "last_name": "User",
            "company": "NotesCo",
            "notes": "Important VIP guest",
        }
        resp = await client.post(url, json=payload, headers=auth_headers(admin_token))
        assert resp.status_code == 201
        data = resp.json()
        assert data["notes"] == "Important VIP guest"
        assert data["company"] == "NotesCo"

    @pytest.mark.asyncio
    async def test_create_alumni_email_normalized(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        admin_token: str,
    ) -> None:
        """Alumni email is normalized to lowercase on create."""
        url = ALUMNI_URL.format(cid=conference.id)
        payload = {
            "email": "Upper@Example.COM",
            "first_name": "Upper",
            "last_name": "Case",
        }
        resp = await client.post(url, json=payload, headers=auth_headers(admin_token))
        assert resp.status_code == 201
        assert resp.json()["email"] == "upper@example.com"


# =====================================================================
# 21. ALUMNI - DELETE
# =====================================================================


class TestAlumniDeleteDeep:
    """Deeper alumni delete tests."""

    @pytest.mark.asyncio
    async def test_delete_alumni_and_verify_gone(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        alumni_record: Alumni,
        admin_token: str,
    ) -> None:
        """Delete alumni and confirm it's no longer listed."""
        url = f"{ALUMNI_URL.format(cid=conference.id)}/{alumni_record.id}"
        resp = await client.delete(url, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        assert "deleted" in resp.json()["message"].lower()

        # Verify gone
        list_resp = await client.get(
            ALUMNI_URL.format(cid=conference.id),
            headers=auth_headers(admin_token),
        )
        assert list_resp.status_code == 200
        assert list_resp.json()["total"] == 0
