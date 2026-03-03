"""Tests for Alumni, CFP Topics, and User Conference Access API endpoints.

Covers all CRUD operations, auth checks, edge cases, CSV import/export,
search, pagination, bulk grant/revoke, and cross-conference alumni lookup.
"""

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

from app.models.alumni import Alumni, AlumniSource
from app.models.associations import ConferenceCFP
from app.models.cfp import CFPTopic, CallForPapers
from app.models.conference import Conference
from app.models.module import Module, TenantModule
from app.models.tenant import Tenant
from app.models.user import User
from app.models.user_conference_access import UserConferenceAccess
from tests.conftest import _make_token, auth_headers

# ── URL constants ────────────────────────────────────────────────────

ALUMNI_URL = "/api/v1/conferences/{cid}/alumni"
TOPICS_URL = "/api/v1/cfp/topics"
ACCESS_URL = "/api/v1/user-conference-access"


# ── Shared fixtures ──────────────────────────────────────────────────


@pytest_asyncio.fixture()
async def cfp_module(db_session: AsyncSession) -> Module:
    """Create the 'cfp' module."""
    m = Module(
        id=uuid.uuid4(),
        name="CFP",
        code="cfp",
        description="Call for Papers",
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
    cfp_module: Module,
) -> Tenant:
    """Associate conferences + cfp modules with the test tenant."""
    for mod in [conferences_module, cfp_module]:
        db_session.add(
            TenantModule(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                module_id=mod.id,
                is_enabled=True,
            )
        )
    await db_session.commit()
    return tenant


@pytest.fixture()
def admin_token(tenant_admin_user: User) -> str:
    """Return a valid access token for the tenant admin with conferences + cfp modules."""
    return _make_token(tenant_admin_user, modules=["conferences", "cfp"])


@pytest.fixture()
def user_token(regular_user: User) -> str:
    """Return a valid access token for a regular user with conferences + cfp modules."""
    return _make_token(regular_user, modules=["conferences", "cfp"])


@pytest.fixture()
def sa_token(super_admin_user: User) -> str:
    """Return a valid access token for the super admin."""
    return _make_token(super_admin_user)


@pytest_asyncio.fixture()
async def second_conference(db_session: AsyncSession, tenant: Tenant) -> Conference:
    """Create a second conference for cross-conference tests."""
    c = Conference(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="OtherConf 2025",
        abbreviation="OC25",
        is_active=True,
    )
    db_session.add(c)
    await db_session.commit()
    return c


@pytest_asyncio.fixture()
async def alumni_record(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
) -> Alumni:
    """Create a single alumni record."""
    a = Alumni(
        tenant_id=tenant.id,
        conference_id=conference.id,
        email="alice@example.com",
        first_name="Alice",
        last_name="Smith",
        company="Acme Corp",
        source=AlumniSource.MANUAL.value,
    )
    db_session.add(a)
    await db_session.commit()
    return a


@pytest_asyncio.fixture()
async def cfp_record(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
) -> CallForPapers:
    """Create a CallForPapers and link it to the conference."""
    cfp = CallForPapers(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        title="Test CFP 2026",
        status="draft",
    )
    db_session.add(cfp)
    await db_session.flush()

    assoc = ConferenceCFP(
        conference_id=conference.id,
        cfp_id=cfp.id,
    )
    db_session.add(assoc)
    await db_session.commit()
    return cfp


@pytest_asyncio.fixture()
async def topic_record(
    db_session: AsyncSession,
    tenant: Tenant,
) -> CFPTopic:
    """Create a single CFP topic."""
    t = CFPTopic(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="Machine Learning",
        description="All things ML",
    )
    db_session.add(t)
    await db_session.commit()
    return t


# =====================================================================
#  ALUMNI TESTS
# =====================================================================


class TestAlumniList:
    """Tests for GET /conferences/{cid}/alumni."""

    @pytest.mark.asyncio
    async def test_list_alumni_empty(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_all_modules: Tenant,
        admin_token: str,
    ) -> None:
        """Empty conference returns zero alumni."""
        url = ALUMNI_URL.format(cid=conference.id)
        resp = await client.get(url, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["items"] == []

    @pytest.mark.asyncio
    async def test_list_alumni_returns_items(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_all_modules: Tenant,
        alumni_record: Alumni,
        admin_token: str,
    ) -> None:
        """Listing alumni returns previously created records."""
        url = ALUMNI_URL.format(cid=conference.id)
        resp = await client.get(url, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["email"] == "alice@example.com"

    @pytest.mark.asyncio
    async def test_list_alumni_search(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_all_modules: Tenant,
        alumni_record: Alumni,
        admin_token: str,
    ) -> None:
        """Search filters alumni by name/email/company."""
        url = ALUMNI_URL.format(cid=conference.id)
        resp = await client.get(url, params={"search": "alice"}, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        assert resp.json()["total"] == 1

        resp2 = await client.get(url, params={"search": "nonexistent"}, headers=auth_headers(admin_token))
        assert resp2.status_code == 200
        assert resp2.json()["total"] == 0

    @pytest.mark.asyncio
    async def test_list_alumni_pagination(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_all_modules: Tenant,
        alumni_record: Alumni,
        admin_token: str,
    ) -> None:
        """Pagination params are respected."""
        url = ALUMNI_URL.format(cid=conference.id)
        resp = await client.get(url, params={"page": 1, "page_size": 1}, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["items"]) <= 1

    @pytest.mark.asyncio
    async def test_list_alumni_unauthenticated(
        self,
        client: AsyncClient,
        conference: Conference,
    ) -> None:
        """Unauthenticated request is rejected."""
        url = ALUMNI_URL.format(cid=conference.id)
        resp = await client.get(url)
        assert resp.status_code == 401


class TestAlumniCreate:
    """Tests for POST /conferences/{cid}/alumni."""

    @pytest.mark.asyncio
    async def test_create_alumni(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_all_modules: Tenant,
        admin_token: str,
    ) -> None:
        """Successfully create an alumni record."""
        url = ALUMNI_URL.format(cid=conference.id)
        payload = {
            "email": "bob@example.com",
            "first_name": "Bob",
            "last_name": "Jones",
            "company": "WidgetCo",
        }
        resp = await client.post(url, json=payload, headers=auth_headers(admin_token))
        assert resp.status_code == 201
        data = resp.json()
        assert data["email"] == "bob@example.com"
        assert data["first_name"] == "Bob"
        assert data["source"] == "manual"

    @pytest.mark.asyncio
    async def test_create_alumni_duplicate_email(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_all_modules: Tenant,
        alumni_record: Alumni,
        admin_token: str,
    ) -> None:
        """Duplicate email in same conference is rejected."""
        url = ALUMNI_URL.format(cid=conference.id)
        payload = {
            "email": "alice@example.com",
            "first_name": "Alice",
            "last_name": "Duplicate",
        }
        resp = await client.post(url, json=payload, headers=auth_headers(admin_token))
        assert resp.status_code == 409

    @pytest.mark.asyncio
    async def test_create_alumni_invalid_email(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_all_modules: Tenant,
        admin_token: str,
    ) -> None:
        """Invalid email fails validation."""
        url = ALUMNI_URL.format(cid=conference.id)
        payload = {
            "email": "not-an-email",
            "first_name": "Bad",
            "last_name": "Email",
        }
        resp = await client.post(url, json=payload, headers=auth_headers(admin_token))
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_create_alumni_regular_user_forbidden(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_all_modules: Tenant,
        user_token: str,
    ) -> None:
        """Regular user cannot create alumni (requires conference admin)."""
        url = ALUMNI_URL.format(cid=conference.id)
        payload = {
            "email": "new@example.com",
            "first_name": "New",
            "last_name": "User",
        }
        resp = await client.post(url, json=payload, headers=auth_headers(user_token))
        assert resp.status_code == 403


class TestAlumniUpdate:
    """Tests for PUT /conferences/{cid}/alumni/{alumni_id}."""

    @pytest.mark.asyncio
    async def test_update_alumni(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_all_modules: Tenant,
        alumni_record: Alumni,
        admin_token: str,
    ) -> None:
        """Successfully update alumni fields."""
        url = f"{ALUMNI_URL.format(cid=conference.id)}/{alumni_record.id}"
        payload = {"first_name": "Alicia", "company": "NewCorp"}
        resp = await client.put(url, json=payload, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["first_name"] == "Alicia"
        assert data["company"] == "NewCorp"

    @pytest.mark.asyncio
    async def test_update_alumni_not_found(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_all_modules: Tenant,
        admin_token: str,
    ) -> None:
        """Updating a non-existent alumni returns 404."""
        fake_id = uuid.uuid4()
        url = f"{ALUMNI_URL.format(cid=conference.id)}/{fake_id}"
        payload = {"first_name": "Ghost"}
        resp = await client.put(url, json=payload, headers=auth_headers(admin_token))
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_update_alumni_empty_body(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_all_modules: Tenant,
        alumni_record: Alumni,
        admin_token: str,
    ) -> None:
        """Empty update body returns the record unchanged."""
        url = f"{ALUMNI_URL.format(cid=conference.id)}/{alumni_record.id}"
        resp = await client.put(url, json={}, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        assert resp.json()["first_name"] == "Alice"


class TestAlumniDelete:
    """Tests for DELETE /conferences/{cid}/alumni/{alumni_id}."""

    @pytest.mark.asyncio
    async def test_delete_alumni(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_all_modules: Tenant,
        alumni_record: Alumni,
        admin_token: str,
    ) -> None:
        """Successfully delete an alumni record."""
        url = f"{ALUMNI_URL.format(cid=conference.id)}/{alumni_record.id}"
        resp = await client.delete(url, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        assert "deleted" in resp.json()["message"].lower()

    @pytest.mark.asyncio
    async def test_delete_alumni_not_found(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_all_modules: Tenant,
        admin_token: str,
    ) -> None:
        """Deleting a non-existent alumni returns 404."""
        fake_id = uuid.uuid4()
        url = f"{ALUMNI_URL.format(cid=conference.id)}/{fake_id}"
        resp = await client.delete(url, headers=auth_headers(admin_token))
        assert resp.status_code == 404


class TestAlumniCSVImport:
    """Tests for POST /conferences/{cid}/alumni/import."""

    @pytest.mark.asyncio
    async def test_import_csv_success(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_all_modules: Tenant,
        admin_token: str,
    ) -> None:
        """Import a valid CSV with two rows."""
        url = f"{ALUMNI_URL.format(cid=conference.id)}/import"
        csv_content = "email,first_name,last_name,company\nbob@test.com,Bob,Builder,BuildCo\ncarl@test.com,Carl,Sagan,NASA\n"
        resp = await client.post(
            url,
            files={"file": ("alumni.csv", csv_content.encode(), "text/csv")},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["imported"] == 2
        assert data["skipped"] == 0
        assert data["errors"] == []

    @pytest.mark.asyncio
    async def test_import_csv_skips_duplicates(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_all_modules: Tenant,
        alumni_record: Alumni,
        admin_token: str,
    ) -> None:
        """Duplicate emails are skipped during import."""
        url = f"{ALUMNI_URL.format(cid=conference.id)}/import"
        csv_content = "email,first_name,last_name\nalice@example.com,Alice,Smith\nnew@test.com,New,Person\n"
        resp = await client.post(
            url,
            files={"file": ("alumni.csv", csv_content.encode(), "text/csv")},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["imported"] == 1
        assert data["skipped"] == 1

    @pytest.mark.asyncio
    async def test_import_csv_invalid_emails(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_all_modules: Tenant,
        admin_token: str,
    ) -> None:
        """Invalid emails generate errors in the result."""
        url = f"{ALUMNI_URL.format(cid=conference.id)}/import"
        csv_content = "email,first_name,last_name\nnot-an-email,Bad,Row\n"
        resp = await client.post(
            url,
            files={"file": ("alumni.csv", csv_content.encode(), "text/csv")},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["imported"] == 0
        assert len(data["errors"]) > 0

    @pytest.mark.asyncio
    async def test_import_csv_no_email_column(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_all_modules: Tenant,
        admin_token: str,
    ) -> None:
        """CSV without an email column returns an error."""
        url = f"{ALUMNI_URL.format(cid=conference.id)}/import"
        csv_content = "name,company\nBob,Acme\n"
        resp = await client.post(
            url,
            files={"file": ("alumni.csv", csv_content.encode(), "text/csv")},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["imported"] == 0
        assert any("email" in e.lower() for e in data["errors"])


class TestAlumniCSVExport:
    """Tests for GET /conferences/{cid}/alumni/export."""

    @pytest.mark.asyncio
    async def test_export_csv(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_all_modules: Tenant,
        alumni_record: Alumni,
        admin_token: str,
    ) -> None:
        """Export returns a CSV file with the alumni data."""
        url = f"{ALUMNI_URL.format(cid=conference.id)}/export"
        resp = await client.get(url, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        assert "text/csv" in resp.headers["content-type"]
        body = resp.content.decode("utf-8-sig")
        assert "alice@example.com" in body
        assert "Email" in body  # header row

    @pytest.mark.asyncio
    async def test_export_csv_empty(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_all_modules: Tenant,
        admin_token: str,
    ) -> None:
        """Export with no alumni returns CSV header only."""
        url = f"{ALUMNI_URL.format(cid=conference.id)}/export"
        resp = await client.get(url, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        body = resp.content.decode("utf-8-sig")
        assert "Email" in body
        lines = [line for line in body.strip().split("\n") if line.strip()]
        assert len(lines) == 1  # header only


class TestAlumniCheck:
    """Tests for GET /conferences/{cid}/alumni/check?email=..."""

    @pytest.mark.asyncio
    async def test_check_alumni_found(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        second_conference: Conference,
        tenant: Tenant,
        tenant_with_all_modules: Tenant,
        admin_token: str,
    ) -> None:
        """Alumni check finds records in other conferences."""
        # Create alumni in second_conference
        a = Alumni(
            tenant_id=tenant.id,
            conference_id=second_conference.id,
            email="crosscheck@example.com",
            first_name="Cross",
            last_name="Check",
            source=AlumniSource.MANUAL.value,
        )
        db_session.add(a)
        await db_session.commit()

        url = f"{ALUMNI_URL.format(cid=conference.id)}/check"
        resp = await client.get(
            url,
            params={"email": "crosscheck@example.com"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_alumni"] is True
        assert len(data["conferences"]) == 1
        assert data["conferences"][0]["conference_name"] == "OtherConf 2025"

    @pytest.mark.asyncio
    async def test_check_alumni_not_found(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_all_modules: Tenant,
        admin_token: str,
    ) -> None:
        """Alumni check returns false when no matches."""
        url = f"{ALUMNI_URL.format(cid=conference.id)}/check"
        resp = await client.get(
            url,
            params={"email": "nobody@nowhere.com"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_alumni"] is False
        assert data["conferences"] == []

    @pytest.mark.asyncio
    async def test_check_alumni_excludes_current_conference(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_all_modules: Tenant,
        alumni_record: Alumni,
        admin_token: str,
    ) -> None:
        """Alumni check excludes the current conference from results."""
        url = f"{ALUMNI_URL.format(cid=conference.id)}/check"
        resp = await client.get(
            url,
            params={"email": "alice@example.com"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        # alice exists only in the current conference, so she should not appear
        assert data["is_alumni"] is False


# =====================================================================
#  CFP TOPICS TESTS
# =====================================================================


class TestTopicsList:
    """Tests for GET /cfp/topics."""

    @pytest.mark.asyncio
    async def test_list_topics_empty(
        self,
        client: AsyncClient,
        tenant_with_all_modules: Tenant,
        admin_token: str,
    ) -> None:
        """Listing topics when none exist returns empty list."""
        resp = await client.get(TOPICS_URL, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["items"] == []

    @pytest.mark.asyncio
    async def test_list_topics_returns_items(
        self,
        client: AsyncClient,
        tenant_with_all_modules: Tenant,
        topic_record: CFPTopic,
        admin_token: str,
    ) -> None:
        """Listing topics returns existing topics."""
        resp = await client.get(TOPICS_URL, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["name"] == "Machine Learning"


class TestTopicsCreate:
    """Tests for POST /cfp/topics."""

    @pytest.mark.asyncio
    async def test_create_topic(
        self,
        client: AsyncClient,
        tenant_with_all_modules: Tenant,
        admin_token: str,
    ) -> None:
        """Successfully create a topic."""
        resp = await client.post(
            TOPICS_URL,
            json={"name": "Cloud Computing", "description": "AWS, GCP, Azure"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Cloud Computing"
        assert data["description"] == "AWS, GCP, Azure"

    @pytest.mark.asyncio
    async def test_create_topic_regular_user_forbidden(
        self,
        client: AsyncClient,
        tenant_with_all_modules: Tenant,
        user_token: str,
    ) -> None:
        """Regular user cannot create topics (requires tenant admin)."""
        resp = await client.post(
            TOPICS_URL,
            json={"name": "Forbidden Topic"},
            headers=auth_headers(user_token),
        )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_create_topic_unauthenticated(
        self,
        client: AsyncClient,
    ) -> None:
        """Unauthenticated request is rejected."""
        resp = await client.post(TOPICS_URL, json={"name": "Nope"})
        assert resp.status_code == 401


class TestTopicsUpdate:
    """Tests for PUT /cfp/topics/{topic_id}."""

    @pytest.mark.asyncio
    async def test_update_topic(
        self,
        client: AsyncClient,
        tenant_with_all_modules: Tenant,
        topic_record: CFPTopic,
        admin_token: str,
    ) -> None:
        """Successfully update a topic."""
        url = f"{TOPICS_URL}/{topic_record.id}"
        resp = await client.put(
            url,
            json={"name": "Deep Learning", "description": "Neural networks"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Deep Learning"
        assert data["description"] == "Neural networks"

    @pytest.mark.asyncio
    async def test_update_topic_not_found(
        self,
        client: AsyncClient,
        tenant_with_all_modules: Tenant,
        admin_token: str,
    ) -> None:
        """Updating a non-existent topic returns 404."""
        fake_id = uuid.uuid4()
        url = f"{TOPICS_URL}/{fake_id}"
        resp = await client.put(
            url,
            json={"name": "Ghost"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 404


class TestTopicsDelete:
    """Tests for DELETE /cfp/topics/{topic_id}."""

    @pytest.mark.asyncio
    async def test_delete_topic(
        self,
        client: AsyncClient,
        tenant_with_all_modules: Tenant,
        topic_record: CFPTopic,
        admin_token: str,
    ) -> None:
        """Successfully delete a topic."""
        url = f"{TOPICS_URL}/{topic_record.id}"
        resp = await client.delete(url, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        assert "deleted" in resp.json()["message"].lower()

        # Verify it is gone
        list_resp = await client.get(TOPICS_URL, headers=auth_headers(admin_token))
        assert list_resp.json()["total"] == 0

    @pytest.mark.asyncio
    async def test_delete_topic_not_found(
        self,
        client: AsyncClient,
        tenant_with_all_modules: Tenant,
        admin_token: str,
    ) -> None:
        """Deleting a non-existent topic returns 404."""
        fake_id = uuid.uuid4()
        url = f"{TOPICS_URL}/{fake_id}"
        resp = await client.delete(url, headers=auth_headers(admin_token))
        assert resp.status_code == 404


# =====================================================================
#  USER CONFERENCE ACCESS TESTS
# =====================================================================


class TestMyAccess:
    """Tests for GET /user-conference-access/my-access/{conference_id}."""

    @pytest.mark.asyncio
    async def test_my_access_tenant_admin(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_all_modules: Tenant,
        admin_token: str,
    ) -> None:
        """Tenant admin always gets admin access level."""
        url = f"{ACCESS_URL}/my-access/{conference.id}"
        resp = await client.get(url, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["has_access"] is True
        assert data["access_level"] == "admin"
        assert data["is_conference_admin"] is True

    @pytest.mark.asyncio
    async def test_my_access_regular_user_no_explicit_access(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_all_modules: Tenant,
        user_token: str,
    ) -> None:
        """Regular user without explicit access gets read_only."""
        url = f"{ACCESS_URL}/my-access/{conference.id}"
        resp = await client.get(url, headers=auth_headers(user_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["has_access"] is True
        assert data["access_level"] == "read_only"
        assert data["is_conference_admin"] is False

    @pytest.mark.asyncio
    async def test_my_access_with_explicit_admin_grant(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        tenant_with_all_modules: Tenant,
        regular_user: User,
        user_token: str,
    ) -> None:
        """User with explicit admin access sees admin level."""
        access = UserConferenceAccess(
            user_id=regular_user.id,
            conference_id=conference.id,
            access_level="admin",
        )
        db_session.add(access)
        await db_session.commit()

        url = f"{ACCESS_URL}/my-access/{conference.id}"
        resp = await client.get(url, headers=auth_headers(user_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["access_level"] == "admin"
        assert data["is_conference_admin"] is True

    @pytest.mark.asyncio
    async def test_my_access_super_admin(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_all_modules: Tenant,
        sa_token: str,
    ) -> None:
        """Super admin always gets admin access level."""
        url = f"{ACCESS_URL}/my-access/{conference.id}"
        resp = await client.get(url, headers=auth_headers(sa_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["access_level"] == "admin"


class TestGrantAccess:
    """Tests for POST /user-conference-access."""

    @pytest.mark.asyncio
    async def test_grant_access(
        self,
        client: AsyncClient,
        conference: Conference,
        regular_user: User,
        tenant_with_all_modules: Tenant,
        admin_token: str,
    ) -> None:
        """Tenant admin can grant access to a user."""
        payload = {
            "user_id": str(regular_user.id),
            "conference_id": str(conference.id),
            "access_level": "read_only",
        }
        resp = await client.post(ACCESS_URL, json=payload, headers=auth_headers(admin_token))
        assert resp.status_code == 201
        data = resp.json()
        assert data["user_id"] == str(regular_user.id)
        assert data["access_level"] == "read_only"

    @pytest.mark.asyncio
    async def test_grant_access_duplicate(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        regular_user: User,
        tenant_with_all_modules: Tenant,
        admin_token: str,
    ) -> None:
        """Granting access twice is rejected."""
        access = UserConferenceAccess(
            user_id=regular_user.id,
            conference_id=conference.id,
            access_level="read_only",
        )
        db_session.add(access)
        await db_session.commit()

        payload = {
            "user_id": str(regular_user.id),
            "conference_id": str(conference.id),
            "access_level": "admin",
        }
        resp = await client.post(ACCESS_URL, json=payload, headers=auth_headers(admin_token))
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_grant_access_user_not_found(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_all_modules: Tenant,
        admin_token: str,
    ) -> None:
        """Granting access to a non-existent user returns 404."""
        payload = {
            "user_id": str(uuid.uuid4()),
            "conference_id": str(conference.id),
            "access_level": "read_only",
        }
        resp = await client.post(ACCESS_URL, json=payload, headers=auth_headers(admin_token))
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_grant_access_regular_user_forbidden(
        self,
        client: AsyncClient,
        conference: Conference,
        regular_user: User,
        tenant_with_all_modules: Tenant,
        user_token: str,
    ) -> None:
        """Regular user cannot grant access (requires tenant admin)."""
        payload = {
            "user_id": str(regular_user.id),
            "conference_id": str(conference.id),
            "access_level": "read_only",
        }
        resp = await client.post(ACCESS_URL, json=payload, headers=auth_headers(user_token))
        assert resp.status_code == 403


class TestListAccess:
    """Tests for GET /user-conference-access/user/{user_id}
    and GET /user-conference-access/conference/{conference_id}."""

    @pytest.mark.asyncio
    async def test_list_user_access(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        regular_user: User,
        tenant_with_all_modules: Tenant,
        admin_token: str,
    ) -> None:
        """List conferences a user has access to."""
        access = UserConferenceAccess(
            user_id=regular_user.id,
            conference_id=conference.id,
            access_level="read_only",
        )
        db_session.add(access)
        await db_session.commit()

        url = f"{ACCESS_URL}/user/{regular_user.id}"
        resp = await client.get(url, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["conference_name"] == "TestConf 2026"

    @pytest.mark.asyncio
    async def test_list_conference_users(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        regular_user: User,
        tenant_with_all_modules: Tenant,
        admin_token: str,
    ) -> None:
        """List users who have access to a conference."""
        access = UserConferenceAccess(
            user_id=regular_user.id,
            conference_id=conference.id,
            access_level="admin",
        )
        db_session.add(access)
        await db_session.commit()

        url = f"{ACCESS_URL}/conference/{conference.id}"
        resp = await client.get(url, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["access_level"] == "admin"

    @pytest.mark.asyncio
    async def test_list_user_access_empty(
        self,
        client: AsyncClient,
        regular_user: User,
        tenant_with_all_modules: Tenant,
        admin_token: str,
    ) -> None:
        """User with no access records returns empty list."""
        url = f"{ACCESS_URL}/user/{regular_user.id}"
        resp = await client.get(url, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        assert resp.json()["total"] == 0


class TestUpdateAccess:
    """Tests for PUT /user-conference-access/{access_id}."""

    @pytest.mark.asyncio
    async def test_update_access_level(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        regular_user: User,
        tenant_with_all_modules: Tenant,
        admin_token: str,
    ) -> None:
        """Successfully update access level from read_only to admin."""
        access = UserConferenceAccess(
            user_id=regular_user.id,
            conference_id=conference.id,
            access_level="read_only",
        )
        db_session.add(access)
        await db_session.commit()
        await db_session.refresh(access)

        url = f"{ACCESS_URL}/{access.id}"
        resp = await client.put(
            url,
            json={"access_level": "admin"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["access_level"] == "admin"

    @pytest.mark.asyncio
    async def test_update_access_not_found(
        self,
        client: AsyncClient,
        tenant_with_all_modules: Tenant,
        admin_token: str,
    ) -> None:
        """Updating a non-existent access record returns 404."""
        fake_id = uuid.uuid4()
        url = f"{ACCESS_URL}/{fake_id}"
        resp = await client.put(
            url,
            json={"access_level": "admin"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 404


class TestRevokeAccess:
    """Tests for DELETE /user-conference-access/{access_id}."""

    @pytest.mark.asyncio
    async def test_revoke_access(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        regular_user: User,
        tenant_with_all_modules: Tenant,
        admin_token: str,
    ) -> None:
        """Successfully revoke access."""
        access = UserConferenceAccess(
            user_id=regular_user.id,
            conference_id=conference.id,
            access_level="read_only",
        )
        db_session.add(access)
        await db_session.commit()
        await db_session.refresh(access)

        url = f"{ACCESS_URL}/{access.id}"
        resp = await client.delete(url, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        assert "revoked" in resp.json()["message"].lower()

    @pytest.mark.asyncio
    async def test_revoke_access_not_found(
        self,
        client: AsyncClient,
        tenant_with_all_modules: Tenant,
        admin_token: str,
    ) -> None:
        """Revoking a non-existent access record returns 404."""
        fake_id = uuid.uuid4()
        url = f"{ACCESS_URL}/{fake_id}"
        resp = await client.delete(url, headers=auth_headers(admin_token))
        assert resp.status_code == 404


class TestBulkGrant:
    """Tests for POST /user-conference-access/user/{user_id}/bulk-grant."""

    @pytest.mark.asyncio
    async def test_bulk_grant_access(
        self,
        client: AsyncClient,
        conference: Conference,
        second_conference: Conference,
        regular_user: User,
        tenant_with_all_modules: Tenant,
        admin_token: str,
    ) -> None:
        """Bulk grant access to multiple conferences."""
        url = f"{ACCESS_URL}/user/{regular_user.id}/bulk-grant"
        payload = {
            "conference_ids": [str(conference.id), str(second_conference.id)],
            "access_level": "read_only",
        }
        resp = await client.post(url, json=payload, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["granted"] == 2
        assert data["skipped"] == 0

    @pytest.mark.asyncio
    async def test_bulk_grant_skips_existing(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        second_conference: Conference,
        regular_user: User,
        tenant_with_all_modules: Tenant,
        admin_token: str,
    ) -> None:
        """Bulk grant skips conferences where access already exists."""
        access = UserConferenceAccess(
            user_id=regular_user.id,
            conference_id=conference.id,
            access_level="read_only",
        )
        db_session.add(access)
        await db_session.commit()

        url = f"{ACCESS_URL}/user/{regular_user.id}/bulk-grant"
        payload = {
            "conference_ids": [str(conference.id), str(second_conference.id)],
            "access_level": "admin",
        }
        resp = await client.post(url, json=payload, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["granted"] == 1
        assert data["skipped"] == 1

    @pytest.mark.asyncio
    async def test_bulk_grant_user_not_found(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_all_modules: Tenant,
        admin_token: str,
    ) -> None:
        """Bulk grant to non-existent user returns 404."""
        fake_user_id = uuid.uuid4()
        url = f"{ACCESS_URL}/user/{fake_user_id}/bulk-grant"
        payload = {
            "conference_ids": [str(conference.id)],
            "access_level": "read_only",
        }
        resp = await client.post(url, json=payload, headers=auth_headers(admin_token))
        assert resp.status_code == 404


class TestBulkRevoke:
    """Tests for POST /user-conference-access/user/{user_id}/bulk-revoke."""

    @pytest.mark.asyncio
    async def test_bulk_revoke_access(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        second_conference: Conference,
        regular_user: User,
        tenant_with_all_modules: Tenant,
        admin_token: str,
    ) -> None:
        """Bulk revoke access from multiple conferences."""
        for conf in [conference, second_conference]:
            db_session.add(
                UserConferenceAccess(
                    user_id=regular_user.id,
                    conference_id=conf.id,
                    access_level="read_only",
                )
            )
        await db_session.commit()

        url = f"{ACCESS_URL}/user/{regular_user.id}/bulk-revoke"
        payload = {
            "conference_ids": [str(conference.id), str(second_conference.id)],
        }
        resp = await client.post(url, json=payload, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["revoked"] == 2

    @pytest.mark.asyncio
    async def test_bulk_revoke_nonexistent_access(
        self,
        client: AsyncClient,
        conference: Conference,
        regular_user: User,
        tenant_with_all_modules: Tenant,
        admin_token: str,
    ) -> None:
        """Bulk revoke when no access exists reports zero revoked."""
        url = f"{ACCESS_URL}/user/{regular_user.id}/bulk-revoke"
        payload = {
            "conference_ids": [str(conference.id)],
        }
        resp = await client.post(url, json=payload, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["revoked"] == 0

    @pytest.mark.asyncio
    async def test_bulk_revoke_user_not_found(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_all_modules: Tenant,
        admin_token: str,
    ) -> None:
        """Bulk revoke for non-existent user returns 404."""
        fake_user_id = uuid.uuid4()
        url = f"{ACCESS_URL}/user/{fake_user_id}/bulk-revoke"
        payload = {
            "conference_ids": [str(conference.id)],
        }
        resp = await client.post(url, json=payload, headers=auth_headers(admin_token))
        assert resp.status_code == 404
