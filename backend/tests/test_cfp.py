"""Tests for CFP module endpoints (topics, CFP CRUD, papers, committee, assignments)."""

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

from app.core.security import hash_password
from app.models.cfp import (
    CFPApplicant,
    CFPCommitteeMember,
    CFPPaper,
    CFPTopic,
    CallForPapers,
    PaperStatus,
)
from app.models.associations import ConferenceCFP
from app.models.conference import Conference
from app.models.module import Module, TenantModule
from app.models.tenant import Tenant
from app.models.user import User
from tests.conftest import auth_headers, _make_token


# ── URLs ──────────────────────────────────────────────────────────────

CFP_BASE = "/api/v1/cfp"
TOPICS_URL = f"{CFP_BASE}/topics"
PAPERS_URL = f"{CFP_BASE}/papers"
COMMITTEE_URL = f"{CFP_BASE}/committee-members"
ASSIGNMENTS_URL = f"{CFP_BASE}/paper-assignments"


# ── Local fixtures ────────────────────────────────────────────────────


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
async def tenant_with_cfp(
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
def cfp_admin_token(tenant_admin_user: User) -> str:
    """Return a valid access token for the tenant admin with cfp module."""
    return _make_token(tenant_admin_user, modules=["conferences", "cfp"])


@pytest.fixture()
def cfp_user_token(regular_user: User) -> str:
    """Return a valid access token for a regular user with cfp module."""
    return _make_token(regular_user, modules=["conferences", "cfp"])


@pytest_asyncio.fixture()
async def applicant(db_session: AsyncSession, tenant: Tenant) -> CFPApplicant:
    """Create and return a CFP applicant (main speaker)."""
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Jane",
        last_name="Speaker",
        email=f"jane-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Password123!"),
    )
    db_session.add(a)
    await db_session.commit()
    return a


@pytest_asyncio.fixture()
async def second_applicant(db_session: AsyncSession, tenant: Tenant) -> CFPApplicant:
    """Create and return a second CFP applicant (for co-speaker / committee)."""
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Bob",
        last_name="Reviewer",
        email=f"bob-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Password123!"),
    )
    db_session.add(a)
    await db_session.commit()
    return a


@pytest_asyncio.fixture()
async def third_applicant(db_session: AsyncSession, tenant: Tenant) -> CFPApplicant:
    """Create and return a third CFP applicant (for co-speaker tests)."""
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Alice",
        last_name="Cospeaker",
        email=f"alice-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Password123!"),
    )
    db_session.add(a)
    await db_session.commit()
    return a


@pytest_asyncio.fixture()
async def cfp(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
) -> CallForPapers:
    """Create a draft CFP linked to the test conference via db_session."""
    c = CallForPapers(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        title="Test CFP 2026",
        description="A test call for papers",
        status="draft",
    )
    db_session.add(c)
    await db_session.flush()
    db_session.add(ConferenceCFP(conference_id=conference.id, cfp_id=c.id))
    await db_session.commit()
    return c


@pytest_asyncio.fixture()
async def topic(db_session: AsyncSession, tenant: Tenant) -> CFPTopic:
    """Create and return a CFP topic."""
    t = CFPTopic(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="Artificial Intelligence",
        description="All things AI",
    )
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture()
async def paper(
    db_session: AsyncSession,
    tenant: Tenant,
    cfp: CallForPapers,
    applicant: CFPApplicant,
) -> CFPPaper:
    """Create a draft paper via db_session."""
    p = CFPPaper(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        cfp_id=cfp.id,
        main_speaker_id=applicant.id,
        title="Test Paper",
        abstract_short="A short abstract for testing",
        level="intermediate",
        status=PaperStatus.DRAFT.value,
    )
    db_session.add(p)
    await db_session.commit()
    return p


@pytest_asyncio.fixture()
async def committee_member(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    second_applicant: CFPApplicant,
) -> CFPCommitteeMember:
    """Create a committee member via db_session."""
    m = CFPCommitteeMember(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        applicant_id=second_applicant.id,
        role="reviewer",
    )
    db_session.add(m)
    await db_session.commit()
    return m


# =====================================================================
# TestTopics
# =====================================================================


class TestTopics:
    """Tests for /api/v1/cfp/topics endpoints."""

    @pytest.mark.asyncio
    async def test_list_topics_empty(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
    ) -> None:
        """Listing topics when none exist returns an empty list."""
        resp = await client.get(
            TOPICS_URL,
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"] == []
        assert data["total"] == 0

    @pytest.mark.asyncio
    async def test_create_topic(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
    ) -> None:
        """Tenant admin can create a topic."""
        resp = await client.post(
            TOPICS_URL,
            json={"name": "AI", "description": "Artificial Intelligence topics"},
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "AI"
        assert data["description"] == "Artificial Intelligence topics"
        assert "id" in data

    @pytest.mark.asyncio
    async def test_create_topic_missing_name_fails(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
    ) -> None:
        """Creating a topic without a name fails with 422."""
        resp = await client.post(
            TOPICS_URL,
            json={"description": "No name provided"},
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_list_topics_after_create(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
        topic: CFPTopic,
    ) -> None:
        """Listing topics returns the created topic."""
        resp = await client.get(
            TOPICS_URL,
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["id"] == str(topic.id)
        assert data["items"][0]["name"] == "Artificial Intelligence"

    @pytest.mark.asyncio
    async def test_update_topic(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
        topic: CFPTopic,
    ) -> None:
        """Tenant admin can update a topic."""
        resp = await client.put(
            f"{TOPICS_URL}/{topic.id}",
            json={"name": "Machine Learning"},
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Machine Learning"
        assert data["id"] == str(topic.id)

    @pytest.mark.asyncio
    async def test_delete_topic(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
        topic: CFPTopic,
    ) -> None:
        """Tenant admin can delete a topic."""
        resp = await client.delete(
            f"{TOPICS_URL}/{topic.id}",
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 200
        assert "deleted" in resp.json()["message"].lower()

        # Verify it is gone
        list_resp = await client.get(
            TOPICS_URL,
            headers=auth_headers(cfp_admin_token),
        )
        assert list_resp.json()["total"] == 0

    @pytest.mark.asyncio
    async def test_delete_nonexistent_topic_fails(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
    ) -> None:
        """Deleting a topic that does not exist returns 404."""
        fake_id = uuid.uuid4()
        resp = await client.delete(
            f"{TOPICS_URL}/{fake_id}",
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_unauthenticated_fails(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
    ) -> None:
        """Requests without auth headers are rejected."""
        resp = await client.get(TOPICS_URL)
        assert resp.status_code == 401


# =====================================================================
# TestCFPCrud
# =====================================================================


class TestCFPCrud:
    """Tests for /api/v1/cfp/ CRUD endpoints."""

    @pytest.mark.asyncio
    async def test_create_cfp(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
        conference: Conference,
    ) -> None:
        """Tenant admin can create a CFP."""
        resp = await client.post(
            f"{CFP_BASE}/",
            json={
                "conference_id": str(conference.id),
                "title": "CFP 2026",
                "description": "Submit your papers!",
            },
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["title"] == "CFP 2026"
        assert data["status"] == "draft"
        assert str(conference.id) in data["conference_ids"]

    @pytest.mark.asyncio
    async def test_list_cfps(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
        cfp: CallForPapers,
        conference: Conference,
    ) -> None:
        """Listing CFPs returns the existing CFP."""
        resp = await client.get(
            f"{CFP_BASE}/",
            params={"conference_id": str(conference.id)},
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["id"] == str(cfp.id)

    @pytest.mark.asyncio
    async def test_list_cfps_empty(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
    ) -> None:
        """Listing CFPs when none exist returns an empty list."""
        resp = await client.get(
            f"{CFP_BASE}/",
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["items"] == []

    @pytest.mark.asyncio
    async def test_get_cfp_detail(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
        cfp: CallForPapers,
    ) -> None:
        """Getting a single CFP by ID returns its details."""
        resp = await client.get(
            f"{CFP_BASE}/{cfp.id}",
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == str(cfp.id)
        assert data["title"] == cfp.title
        assert data["submission_count"] == 0

    @pytest.mark.asyncio
    async def test_update_cfp(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
        cfp: CallForPapers,
    ) -> None:
        """Tenant admin can update CFP fields."""
        resp = await client.put(
            f"{CFP_BASE}/{cfp.id}",
            json={"title": "Updated CFP Title", "description": "New description"},
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "Updated CFP Title"
        assert data["description"] == "New description"

    @pytest.mark.asyncio
    async def test_update_cfp_status(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
        cfp: CallForPapers,
    ) -> None:
        """Tenant admin can change CFP status."""
        resp = await client.put(
            f"{CFP_BASE}/{cfp.id}",
            json={"status": "open"},
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "open"

    @pytest.mark.asyncio
    async def test_delete_cfp(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
        cfp: CallForPapers,
    ) -> None:
        """Tenant admin can delete a CFP."""
        resp = await client.delete(
            f"{CFP_BASE}/{cfp.id}",
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 200
        assert "deleted" in resp.json()["message"].lower()

        # Verify it is gone
        get_resp = await client.get(
            f"{CFP_BASE}/{cfp.id}",
            headers=auth_headers(cfp_admin_token),
        )
        assert get_resp.status_code == 404

    @pytest.mark.asyncio
    async def test_create_cfp_invalid_conference_fails(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
    ) -> None:
        """Creating a CFP with a non-existent conference ID returns 404."""
        fake_id = uuid.uuid4()
        resp = await client.post(
            f"{CFP_BASE}/",
            json={
                "conference_id": str(fake_id),
                "title": "Bad CFP",
                "description": "Should fail",
            },
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_get_nonexistent_cfp_fails(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
    ) -> None:
        """Getting a non-existent CFP returns 404."""
        fake_id = uuid.uuid4()
        resp = await client.get(
            f"{CFP_BASE}/{fake_id}",
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_cfp_stats(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
        cfp: CallForPapers,
    ) -> None:
        """CFP stats endpoint returns correct counts."""
        resp = await client.get(
            f"{CFP_BASE}/stats",
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["draft"] == 1
        assert data["open"] == 0
        assert data["total_submissions"] == 0


# =====================================================================
# TestPapers
# =====================================================================


class TestPapers:
    """Tests for /api/v1/cfp/papers endpoints."""

    @pytest.mark.asyncio
    async def test_create_paper(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
        cfp: CallForPapers,
        applicant: CFPApplicant,
    ) -> None:
        """Tenant admin can create a paper."""
        resp = await client.post(
            PAPERS_URL,
            json={
                "cfp_id": str(cfp.id),
                "main_speaker_id": str(applicant.id),
                "title": "My Great Paper",
                "abstract_short": "A brief description",
                "level": "intermediate",
            },
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["title"] == "My Great Paper"
        assert data["status"] == "draft"
        assert data["main_speaker_id"] == str(applicant.id)
        assert data["cfp_id"] == str(cfp.id)

    @pytest.mark.asyncio
    async def test_list_papers(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
        paper: CFPPaper,
        cfp: CallForPapers,
    ) -> None:
        """Listing papers returns existing papers."""
        resp = await client.get(
            PAPERS_URL,
            params={"cfp_id": str(cfp.id)},
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["id"] == str(paper.id)

    @pytest.mark.asyncio
    async def test_list_papers_empty(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
    ) -> None:
        """Listing papers when none exist returns an empty list."""
        resp = await client.get(
            PAPERS_URL,
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0

    @pytest.mark.asyncio
    async def test_get_paper_detail(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
        paper: CFPPaper,
    ) -> None:
        """Getting a paper by ID returns its details."""
        resp = await client.get(
            f"{PAPERS_URL}/{paper.id}",
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == str(paper.id)
        assert data["title"] == paper.title
        assert data["status"] == "draft"

    @pytest.mark.asyncio
    async def test_update_paper(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
        paper: CFPPaper,
    ) -> None:
        """Tenant admin can update paper fields."""
        resp = await client.put(
            f"{PAPERS_URL}/{paper.id}",
            json={"title": "Updated Paper Title", "abstract_short": "Updated abstract"},
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "Updated Paper Title"
        assert data["abstract_short"] == "Updated abstract"

    @pytest.mark.asyncio
    async def test_submit_paper(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
        paper: CFPPaper,
    ) -> None:
        """Submitting a draft paper transitions it to submitted status."""
        resp = await client.post(
            f"{PAPERS_URL}/{paper.id}/submit",
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "submitted"
        assert data["submitted_at"] is not None

    @pytest.mark.asyncio
    async def test_submit_non_draft_fails(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
        paper: CFPPaper,
    ) -> None:
        """Submitting a paper that is not in draft status fails."""
        # First submit the paper to move it out of draft
        paper.status = PaperStatus.SUBMITTED.value
        db_session.add(paper)
        await db_session.commit()

        resp = await client.post(
            f"{PAPERS_URL}/{paper.id}/submit",
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_unsubmit_paper(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
        paper: CFPPaper,
    ) -> None:
        """Un-submitting a submitted paper reverts it to draft."""
        # First submit the paper
        paper.status = PaperStatus.SUBMITTED.value
        db_session.add(paper)
        await db_session.commit()

        resp = await client.post(
            f"{PAPERS_URL}/{paper.id}/unsubmit",
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "draft"
        assert data["submitted_at"] is None

    @pytest.mark.asyncio
    async def test_unsubmit_non_submitted_fails(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
        paper: CFPPaper,
    ) -> None:
        """Un-submitting a paper that is not submitted fails."""
        resp = await client.post(
            f"{PAPERS_URL}/{paper.id}/unsubmit",
            headers=auth_headers(cfp_admin_token),
        )
        # Paper is in draft, can't unsubmit
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_delete_draft_paper(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
        paper: CFPPaper,
    ) -> None:
        """Tenant admin can delete a paper."""
        resp = await client.delete(
            f"{PAPERS_URL}/{paper.id}",
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 200
        assert "deleted" in resp.json()["message"].lower()

        # Verify it is gone
        get_resp = await client.get(
            f"{PAPERS_URL}/{paper.id}",
            headers=auth_headers(cfp_admin_token),
        )
        assert get_resp.status_code == 404

    @pytest.mark.asyncio
    async def test_create_paper_with_cospeakers(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
        cfp: CallForPapers,
        applicant: CFPApplicant,
        second_applicant: CFPApplicant,
        third_applicant: CFPApplicant,
    ) -> None:
        """Creating a paper with co-speakers associates them correctly."""
        resp = await client.post(
            PAPERS_URL,
            json={
                "cfp_id": str(cfp.id),
                "main_speaker_id": str(applicant.id),
                "co_speaker_ids": [str(second_applicant.id), str(third_applicant.id)],
                "title": "Co-authored Paper",
                "abstract_short": "A co-authored work",
                "level": "beginner",
            },
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert len(data["cospeakers"]) == 2
        cospeaker_ids = {cs["applicant"]["id"] for cs in data["cospeakers"]}
        assert str(second_applicant.id) in cospeaker_ids
        assert str(third_applicant.id) in cospeaker_ids

    @pytest.mark.asyncio
    async def test_paper_stats(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
        paper: CFPPaper,
        cfp: CallForPapers,
    ) -> None:
        """Paper stats endpoint returns correct counts."""
        resp = await client.get(
            f"{PAPERS_URL}/stats",
            params={"cfp_id": str(cfp.id)},
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["draft"] == 1
        assert data["submitted"] == 0

    @pytest.mark.asyncio
    async def test_create_paper_invalid_cfp_fails(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
        applicant: CFPApplicant,
    ) -> None:
        """Creating a paper with a non-existent CFP ID returns 404."""
        fake_id = uuid.uuid4()
        resp = await client.post(
            PAPERS_URL,
            json={
                "cfp_id": str(fake_id),
                "main_speaker_id": str(applicant.id),
                "title": "Bad Paper",
                "abstract_short": "Should fail",
                "level": "beginner",
            },
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_create_paper_invalid_speaker_fails(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
        cfp: CallForPapers,
    ) -> None:
        """Creating a paper with a non-existent speaker ID returns 404."""
        fake_id = uuid.uuid4()
        resp = await client.post(
            PAPERS_URL,
            json={
                "cfp_id": str(cfp.id),
                "main_speaker_id": str(fake_id),
                "title": "Bad Paper",
                "abstract_short": "Should fail",
                "level": "beginner",
            },
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_get_nonexistent_paper_fails(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
    ) -> None:
        """Getting a non-existent paper returns 404."""
        fake_id = uuid.uuid4()
        resp = await client.get(
            f"{PAPERS_URL}/{fake_id}",
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 404


# =====================================================================
# TestCommitteeMembers
# =====================================================================


class TestCommitteeMembers:
    """Tests for /api/v1/cfp/committee-members endpoints."""

    @pytest.mark.asyncio
    async def test_create_committee_member_from_applicant(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
        conference: Conference,
        second_applicant: CFPApplicant,
    ) -> None:
        """Create a committee member by linking an existing applicant."""
        resp = await client.post(
            COMMITTEE_URL,
            json={
                "conference_id": str(conference.id),
                "applicant_id": str(second_applicant.id),
                "role": "reviewer",
            },
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["applicant_id"] == str(second_applicant.id)
        assert data["role"] == "reviewer"
        assert data["first_name"] == second_applicant.first_name
        assert data["conference_id"] == str(conference.id)

    @pytest.mark.asyncio
    async def test_create_committee_member_new_user(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
        conference: Conference,
    ) -> None:
        """Create a committee member with inline new user creation."""
        unique_email = f"newreviewer-{uuid.uuid4().hex[:8]}@example.com"
        resp = await client.post(
            COMMITTEE_URL,
            json={
                "conference_id": str(conference.id),
                "first_name": "New",
                "last_name": "Reviewer",
                "email": unique_email,
                "password": "Password123!",
                "role": "reviewer",
            },
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["first_name"] == "New"
        assert data["last_name"] == "Reviewer"
        assert data["email"] == unique_email.lower()
        assert data["role"] == "reviewer"

    @pytest.mark.asyncio
    async def test_list_committee_members(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
        conference: Conference,
        committee_member: CFPCommitteeMember,
    ) -> None:
        """Listing committee members returns existing members."""
        resp = await client.get(
            COMMITTEE_URL,
            params={"conference_id": str(conference.id)},
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["id"] == str(committee_member.id)

    @pytest.mark.asyncio
    async def test_list_committee_members_empty(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
        conference: Conference,
    ) -> None:
        """Listing committee members when none exist returns an empty list."""
        resp = await client.get(
            COMMITTEE_URL,
            params={"conference_id": str(conference.id)},
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["items"] == []

    @pytest.mark.asyncio
    async def test_update_committee_member(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
        committee_member: CFPCommitteeMember,
    ) -> None:
        """Tenant admin can update committee member role and expertise."""
        resp = await client.put(
            f"{COMMITTEE_URL}/{committee_member.id}",
            json={"role": "chair", "expertise_areas": ["AI", "ML"]},
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["role"] == "chair"
        assert data["expertise_areas"] == ["AI", "ML"]

    @pytest.mark.asyncio
    async def test_delete_committee_member(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
        committee_member: CFPCommitteeMember,
        conference: Conference,
    ) -> None:
        """Tenant admin can remove a committee member."""
        resp = await client.delete(
            f"{COMMITTEE_URL}/{committee_member.id}",
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 200
        assert "removed" in resp.json()["message"].lower()

        # Verify it is gone
        list_resp = await client.get(
            COMMITTEE_URL,
            params={"conference_id": str(conference.id)},
            headers=auth_headers(cfp_admin_token),
        )
        assert list_resp.json()["total"] == 0

    @pytest.mark.asyncio
    async def test_duplicate_membership_fails(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
        conference: Conference,
        committee_member: CFPCommitteeMember,
        second_applicant: CFPApplicant,
    ) -> None:
        """Adding the same applicant as a committee member a second time fails with 409."""
        resp = await client.post(
            COMMITTEE_URL,
            json={
                "conference_id": str(conference.id),
                "applicant_id": str(second_applicant.id),
                "role": "reviewer",
            },
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 409

    @pytest.mark.asyncio
    async def test_delete_nonexistent_member_fails(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
    ) -> None:
        """Deleting a non-existent committee member returns 404."""
        fake_id = uuid.uuid4()
        resp = await client.delete(
            f"{COMMITTEE_URL}/{fake_id}",
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 404


# =====================================================================
# TestPaperAssignments
# =====================================================================


class TestPaperAssignments:
    """Tests for /api/v1/cfp/paper-assignments endpoints."""

    @pytest.mark.asyncio
    async def test_create_assignment(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
        paper: CFPPaper,
        committee_member: CFPCommitteeMember,
    ) -> None:
        """Tenant admin can assign a paper to a committee member."""
        resp = await client.post(
            ASSIGNMENTS_URL,
            json={
                "paper_id": str(paper.id),
                "committee_member_id": str(committee_member.id),
                "is_anonymous": False,
            },
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["paper_id"] == str(paper.id)
        assert data["committee_member_id"] == str(committee_member.id)
        assert data["is_anonymous"] is False
        assert data["paper_title"] == paper.title

    @pytest.mark.asyncio
    async def test_list_assignments(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
        paper: CFPPaper,
        committee_member: CFPCommitteeMember,
        conference: Conference,
    ) -> None:
        """Listing assignments returns existing assignments."""
        # First create an assignment
        create_resp = await client.post(
            ASSIGNMENTS_URL,
            json={
                "paper_id": str(paper.id),
                "committee_member_id": str(committee_member.id),
                "is_anonymous": False,
            },
            headers=auth_headers(cfp_admin_token),
        )
        assert create_resp.status_code == 201

        # List by conference
        resp = await client.get(
            ASSIGNMENTS_URL,
            params={"conference_id": str(conference.id)},
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1

    @pytest.mark.asyncio
    async def test_list_assignments_empty(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
    ) -> None:
        """Listing assignments when none exist returns an empty list."""
        resp = await client.get(
            ASSIGNMENTS_URL,
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["items"] == []

    @pytest.mark.asyncio
    async def test_duplicate_assignment_fails(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
        paper: CFPPaper,
        committee_member: CFPCommitteeMember,
    ) -> None:
        """Assigning the same paper to the same member a second time fails with 409."""
        payload = {
            "paper_id": str(paper.id),
            "committee_member_id": str(committee_member.id),
            "is_anonymous": False,
        }
        resp1 = await client.post(
            ASSIGNMENTS_URL,
            json=payload,
            headers=auth_headers(cfp_admin_token),
        )
        assert resp1.status_code == 201

        resp2 = await client.post(
            ASSIGNMENTS_URL,
            json=payload,
            headers=auth_headers(cfp_admin_token),
        )
        assert resp2.status_code == 409

    @pytest.mark.asyncio
    async def test_delete_assignment(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
        paper: CFPPaper,
        committee_member: CFPCommitteeMember,
    ) -> None:
        """Tenant admin can remove a paper assignment."""
        # Create the assignment first
        create_resp = await client.post(
            ASSIGNMENTS_URL,
            json={
                "paper_id": str(paper.id),
                "committee_member_id": str(committee_member.id),
                "is_anonymous": False,
            },
            headers=auth_headers(cfp_admin_token),
        )
        assert create_resp.status_code == 201
        assignment_id = create_resp.json()["id"]

        # Delete it
        resp = await client.delete(
            f"{ASSIGNMENTS_URL}/{assignment_id}",
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 200
        assert "removed" in resp.json()["message"].lower()

    @pytest.mark.asyncio
    async def test_assignment_transitions_paper_to_in_evaluation(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
        paper: CFPPaper,
        committee_member: CFPCommitteeMember,
    ) -> None:
        """Assigning a submitted paper transitions it to in_evaluation status."""
        # First submit the paper
        paper.status = PaperStatus.SUBMITTED.value
        db_session.add(paper)
        await db_session.commit()

        resp = await client.post(
            ASSIGNMENTS_URL,
            json={
                "paper_id": str(paper.id),
                "committee_member_id": str(committee_member.id),
                "is_anonymous": False,
            },
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 201

        # Check paper status changed to in_evaluation
        paper_resp = await client.get(
            f"{PAPERS_URL}/{paper.id}",
            headers=auth_headers(cfp_admin_token),
        )
        assert paper_resp.status_code == 200
        assert paper_resp.json()["status"] == "in_evaluation"

    @pytest.mark.asyncio
    async def test_conflict_of_interest_check(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_with_cfp: Tenant,
        tenant: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
        conference: Conference,
        cfp: CallForPapers,
        applicant: CFPApplicant,
    ) -> None:
        """Assigning a paper to a committee member who is the main speaker fails with 409."""
        # Create a committee member from the same applicant who is the paper's speaker
        cm = CFPCommitteeMember(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            applicant_id=applicant.id,
            role="reviewer",
        )
        db_session.add(cm)
        await db_session.commit()

        # Create a paper where this applicant is the main speaker
        paper_resp = await client.post(
            PAPERS_URL,
            json={
                "cfp_id": str(cfp.id),
                "main_speaker_id": str(applicant.id),
                "title": "Speaker Paper",
                "abstract_short": "I wrote this",
                "level": "advanced",
            },
            headers=auth_headers(cfp_admin_token),
        )
        assert paper_resp.status_code == 201
        paper_id = paper_resp.json()["id"]

        # Try to assign the paper to the conflicted committee member
        assign_resp = await client.post(
            ASSIGNMENTS_URL,
            json={
                "paper_id": paper_id,
                "committee_member_id": str(cm.id),
                "is_anonymous": False,
            },
            headers=auth_headers(cfp_admin_token),
        )
        assert assign_resp.status_code == 409
        assert "conflict" in assign_resp.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_delete_nonexistent_assignment_fails(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        cfp_admin_token: str,
    ) -> None:
        """Deleting a non-existent assignment returns 404."""
        fake_id = uuid.uuid4()
        resp = await client.delete(
            f"{ASSIGNMENTS_URL}/{fake_id}",
            headers=auth_headers(cfp_admin_token),
        )
        assert resp.status_code == 404
