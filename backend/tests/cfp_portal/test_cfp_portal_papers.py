"""Tests for CFP portal paper, invitation, review, and assigned-paper endpoints.

Covers the applicant-facing portal API surface:
  - Topics browsing
  - Conference browsing / detail
  - Paper CRUD and lifecycle (create / update / submit / unsubmit / delete)
  - Ownership isolation between applicants
  - Co-speaker invitations (list / accept / decline)
  - Assigned papers for committee members
  - Review config retrieval, draft save, and final submission
  - Speaker feedback retrieval
"""

import os
import uuid

os.environ.setdefault(
    "DATABASE_URL", "postgresql+asyncpg://saasconf:saasconf_dev_password@localhost:5432/saasconf_test"
)
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-unit-tests-minimum-32-chars")
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "testpassword123")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.applicant_security import create_applicant_access_token
from app.core.security import hash_password
from app.models.associations import ConferenceCFP
from app.models.cfp import (
    CallForPapers,
    CFPApplicant,
    CFPCommitteeMember,
    CFPPaper,
    CFPPaperAssignment,
    CFPTopic,
    PaperStatus,
)
from app.models.conference import Conference
from app.models.review import (
    PaperReview,
    ReviewCriterion,
    ReviewQuestion,
    ReviewScaleOption,
    ReviewScoreScale,
    ReviewStatus,
)
from app.models.tenant import Tenant
from tests.conftest import auth_headers

PORTAL_BASE = "/api/v1/portal"


# ── Fixtures ────────────────────────────────────────────────────────────


@pytest_asyncio.fixture()
async def applicant(db_session: AsyncSession, tenant: Tenant) -> CFPApplicant:
    """Create and return a test applicant (portal user)."""
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


@pytest.fixture()
def applicant_token(applicant: CFPApplicant, tenant: Tenant) -> str:
    """Return a valid applicant access token."""
    return create_applicant_access_token(applicant.id, tenant.id)


@pytest_asyncio.fixture()
async def second_applicant(db_session: AsyncSession, tenant: Tenant) -> CFPApplicant:
    """Create and return a second test applicant (for cospeaker tests)."""
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Bob",
        last_name="CoSpeaker",
        email=f"bob-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Password123!"),
    )
    db_session.add(a)
    await db_session.commit()
    return a


@pytest.fixture()
def second_applicant_token(second_applicant: CFPApplicant, tenant: Tenant) -> str:
    """Return a valid access token for the second applicant."""
    return create_applicant_access_token(second_applicant.id, tenant.id)


@pytest_asyncio.fixture()
async def cfp(db_session: AsyncSession, tenant: Tenant, conference: Conference) -> CallForPapers:
    """Create a CFP linked to the test conference."""
    cfp_obj = CallForPapers(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        title="Test CFP 2026",
        description="Test CFP",
        status="open",
    )
    db_session.add(cfp_obj)
    await db_session.flush()

    assoc = ConferenceCFP(
        id=uuid.uuid4(),
        conference_id=conference.id,
        cfp_id=cfp_obj.id,
    )
    db_session.add(assoc)
    await db_session.commit()
    return cfp_obj


@pytest_asyncio.fixture()
async def topic(db_session: AsyncSession, tenant: Tenant) -> CFPTopic:
    """Create a topic for the tenant."""
    t = CFPTopic(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="Machine Learning",
        description="ML and AI topics",
    )
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture()
async def reviewer_applicant(db_session: AsyncSession, tenant: Tenant) -> CFPApplicant:
    """Create a third applicant who acts as a committee reviewer."""
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Carol",
        last_name="Reviewer",
        email=f"carol-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Password123!"),
    )
    db_session.add(a)
    await db_session.commit()
    return a


@pytest.fixture()
def reviewer_token(reviewer_applicant: CFPApplicant, tenant: Tenant) -> str:
    """Return a valid access token for the reviewer applicant."""
    return create_applicant_access_token(reviewer_applicant.id, tenant.id)


@pytest_asyncio.fixture()
async def committee_member(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    reviewer_applicant: CFPApplicant,
) -> CFPCommitteeMember:
    """Create a committee membership for the reviewer applicant."""
    cm = CFPCommitteeMember(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        applicant_id=reviewer_applicant.id,
        role="reviewer",
    )
    db_session.add(cm)
    await db_session.commit()
    return cm


@pytest_asyncio.fixture()
async def paper_for_review(
    db_session: AsyncSession,
    tenant: Tenant,
    cfp: CallForPapers,
    applicant: CFPApplicant,
) -> CFPPaper:
    """Create a submitted paper for assignment / review testing."""
    p = CFPPaper(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        cfp_id=cfp.id,
        main_speaker_id=applicant.id,
        title="Paper Under Review",
        abstract_short="Short abstract for review",
        status=PaperStatus.IN_EVALUATION.value,
    )
    db_session.add(p)
    await db_session.commit()
    return p


@pytest_asyncio.fixture()
async def assignment(
    db_session: AsyncSession,
    tenant: Tenant,
    paper_for_review: CFPPaper,
    committee_member: CFPCommitteeMember,
) -> CFPPaperAssignment:
    """Create an assignment of the paper to the committee member."""
    a = CFPPaperAssignment(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        paper_id=paper_for_review.id,
        committee_member_id=committee_member.id,
        is_anonymous=False,
    )
    db_session.add(a)
    await db_session.commit()
    return a


@pytest_asyncio.fixture()
async def review_criterion_with_question(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
) -> tuple[ReviewCriterion, ReviewQuestion, ReviewScoreScale, ReviewScaleOption]:
    """Create a review criterion with one scored question and a scale option."""
    scale = ReviewScoreScale(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="1-5 Scale",
        scale_type="numeric_range",
        is_active=True,
    )
    db_session.add(scale)
    await db_session.flush()

    option = ReviewScaleOption(
        id=uuid.uuid4(),
        scale_id=scale.id,
        label="4 - Good",
        numeric_value=4.0,
        is_unsure=False,
        display_order=0,
    )
    db_session.add(option)
    await db_session.flush()

    criterion = ReviewCriterion(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        title="Relevance",
        description="How relevant is this paper?",
        display_order=0,
        is_active=True,
    )
    db_session.add(criterion)
    await db_session.flush()

    question = ReviewQuestion(
        id=uuid.uuid4(),
        criterion_id=criterion.id,
        tenant_id=tenant.id,
        conference_id=conference.id,
        text="How relevant is this paper to the conference?",
        question_type="scored",
        score_scale_id=scale.id,
        weight=1.0,
        show_to_reviewers=True,
        count_in_score=True,
        is_active=True,
        display_order=0,
    )
    db_session.add(question)
    await db_session.commit()
    return criterion, question, scale, option


# ── TestPortalTopics ──────────────────────────────────────────────────


class TestPortalTopics:
    """Tests for portal topic browsing endpoints."""

    @pytest.mark.asyncio
    async def test_list_topics(
        self,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
        topic: CFPTopic,
    ) -> None:
        """Returns tenant topics."""
        resp = await client.get(
            f"{PORTAL_BASE}/topics",
            headers=auth_headers(applicant_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        names = [t["name"] for t in data]
        assert "Machine Learning" in names

    @pytest.mark.asyncio
    async def test_list_topics_empty(
        self,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
    ) -> None:
        """Returns empty list when no topics exist."""
        resp = await client.get(
            f"{PORTAL_BASE}/topics",
            headers=auth_headers(applicant_token),
        )
        assert resp.status_code == 200
        assert resp.json() == []

    @pytest.mark.asyncio
    async def test_topics_unauthenticated(
        self,
        client: AsyncClient,
    ) -> None:
        """Returns 401 without a token."""
        resp = await client.get(f"{PORTAL_BASE}/topics")
        assert resp.status_code == 401


# ── TestPortalConferences ───────────────────────────────────────────────


class TestPortalConferences:
    """Tests for portal conference browsing endpoints."""

    @pytest.mark.asyncio
    async def test_list_conferences(
        self,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
        conference: Conference,
        cfp: CallForPapers,
    ) -> None:
        """Returns active conferences with associated CFPs."""
        resp = await client.get(
            f"{PORTAL_BASE}/conferences",
            headers=auth_headers(applicant_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) >= 1

        conf = data[0]
        assert conf["id"] == str(conference.id)
        assert conf["name"] == conference.name
        assert isinstance(conf["cfps"], list)
        assert len(conf["cfps"]) >= 1
        assert conf["cfps"][0]["id"] == str(cfp.id)

    @pytest.mark.asyncio
    async def test_get_conference_detail(
        self,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
        conference: Conference,
        cfp: CallForPapers,
    ) -> None:
        """Returns conference detail with CFPs and session types."""
        resp = await client.get(
            f"{PORTAL_BASE}/conferences/{conference.id}",
            headers=auth_headers(applicant_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == str(conference.id)
        assert data["name"] == conference.name
        assert isinstance(data["cfps"], list)
        assert len(data["cfps"]) >= 1
        assert isinstance(data["session_types"], list)

    @pytest.mark.asyncio
    async def test_get_conference_not_found(
        self,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
    ) -> None:
        """Returns 404 for a non-existent conference ID."""
        fake_id = str(uuid.uuid4())
        resp = await client.get(
            f"{PORTAL_BASE}/conferences/{fake_id}",
            headers=auth_headers(applicant_token),
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_unauthenticated_fails(
        self,
        client: AsyncClient,
        conference: Conference,
    ) -> None:
        """Returns 401 without an applicant token."""
        resp = await client.get(f"{PORTAL_BASE}/conferences")
        assert resp.status_code == 401


# ── TestPortalPapers ────────────────────────────────────────────────────


class TestPortalPapers:
    """Tests for portal paper CRUD and lifecycle endpoints."""

    @pytest.mark.asyncio
    async def test_list_papers_empty(
        self,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
    ) -> None:
        """Initially returns no papers."""
        resp = await client.get(
            f"{PORTAL_BASE}/papers",
            headers=auth_headers(applicant_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"] == []
        assert data["total"] == 0

    @pytest.mark.asyncio
    @patch("app.api.v1.cfp_portal.papers._helpers.send_cospeaker_invitation_email", new_callable=AsyncMock)
    async def test_create_paper(
        self,
        mock_email: AsyncMock,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
        cfp: CallForPapers,
    ) -> None:
        """POST creates a draft paper linked to the given CFP."""
        payload = {
            "cfp_id": str(cfp.id),
            "title": "My Amazing Talk",
            "abstract_short": "A short abstract",
        }
        resp = await client.post(
            f"{PORTAL_BASE}/papers",
            json=payload,
            headers=auth_headers(applicant_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "My Amazing Talk"
        assert data["abstract_short"] == "A short abstract"
        assert data["status"] == "draft"
        assert data["cfp_id"] == str(cfp.id)
        assert data["is_main_speaker"] is True
        assert "id" in data

    @pytest.mark.asyncio
    async def test_create_paper_without_cfp_fails(
        self,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
    ) -> None:
        """Returns 404 when cfp_id is invalid."""
        fake_cfp_id = str(uuid.uuid4())
        payload = {
            "cfp_id": fake_cfp_id,
            "title": "Ghost Paper",
        }
        resp = await client.post(
            f"{PORTAL_BASE}/papers",
            json=payload,
            headers=auth_headers(applicant_token),
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    @patch("app.api.v1.cfp_portal.papers._helpers.send_cospeaker_invitation_email", new_callable=AsyncMock)
    async def test_list_papers_after_create(
        self,
        mock_email: AsyncMock,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
        cfp: CallForPapers,
    ) -> None:
        """After creating a paper, the list endpoint returns it."""
        create_payload = {
            "cfp_id": str(cfp.id),
            "title": "Listed Paper",
        }
        create_resp = await client.post(
            f"{PORTAL_BASE}/papers",
            json=create_payload,
            headers=auth_headers(applicant_token),
        )
        assert create_resp.status_code == 200

        list_resp = await client.get(
            f"{PORTAL_BASE}/papers",
            headers=auth_headers(applicant_token),
        )
        assert list_resp.status_code == 200
        data = list_resp.json()
        assert data["total"] >= 1
        titles = [p["title"] for p in data["items"]]
        assert "Listed Paper" in titles

    @pytest.mark.asyncio
    @patch("app.api.v1.cfp_portal.papers._helpers.send_cospeaker_invitation_email", new_callable=AsyncMock)
    async def test_get_paper_detail(
        self,
        mock_email: AsyncMock,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
        cfp: CallForPapers,
    ) -> None:
        """GET returns the full paper with speaker info and cospeakers."""
        create_resp = await client.post(
            f"{PORTAL_BASE}/papers",
            json={"cfp_id": str(cfp.id), "title": "Detail Paper", "abstract_short": "Short"},
            headers=auth_headers(applicant_token),
        )
        assert create_resp.status_code == 200
        paper_id = create_resp.json()["id"]

        detail_resp = await client.get(
            f"{PORTAL_BASE}/papers/{paper_id}",
            headers=auth_headers(applicant_token),
        )
        assert detail_resp.status_code == 200
        data = detail_resp.json()
        assert data["id"] == paper_id
        assert data["title"] == "Detail Paper"
        assert data["is_main_speaker"] is True
        assert data["main_speaker_first_name"] == "Jane"
        assert data["main_speaker_last_name"] == "Speaker"
        assert isinstance(data["cospeakers"], list)
        assert "created_at" in data
        assert "updated_at" in data

    @pytest.mark.asyncio
    async def test_get_paper_not_found(
        self,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
    ) -> None:
        """Returns 404 for a non-existent paper ID."""
        fake_id = str(uuid.uuid4())
        resp = await client.get(
            f"{PORTAL_BASE}/papers/{fake_id}",
            headers=auth_headers(applicant_token),
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    @patch("app.api.v1.cfp_portal.papers._helpers.send_cospeaker_invitation_email", new_callable=AsyncMock)
    async def test_update_paper(
        self,
        mock_email: AsyncMock,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
        cfp: CallForPapers,
    ) -> None:
        """PUT updates paper title and abstract on a draft paper."""
        create_resp = await client.post(
            f"{PORTAL_BASE}/papers",
            json={"cfp_id": str(cfp.id), "title": "Original Title"},
            headers=auth_headers(applicant_token),
        )
        paper_id = create_resp.json()["id"]

        update_resp = await client.put(
            f"{PORTAL_BASE}/papers/{paper_id}",
            json={"title": "Updated Title", "abstract_short": "New abstract"},
            headers=auth_headers(applicant_token),
        )
        assert update_resp.status_code == 200
        data = update_resp.json()
        assert data["title"] == "Updated Title"
        assert data["abstract_short"] == "New abstract"

    @pytest.mark.asyncio
    @patch("app.api.v1.cfp_portal.papers._helpers.send_cospeaker_invitation_email", new_callable=AsyncMock)
    async def test_update_non_draft_fails(
        self,
        mock_email: AsyncMock,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
        cfp: CallForPapers,
    ) -> None:
        """Cannot edit a paper that has been submitted."""
        create_resp = await client.post(
            f"{PORTAL_BASE}/papers",
            json={"cfp_id": str(cfp.id), "title": "Submit Me"},
            headers=auth_headers(applicant_token),
        )
        paper_id = create_resp.json()["id"]

        # Submit the paper
        submit_resp = await client.post(
            f"{PORTAL_BASE}/papers/{paper_id}/submit",
            headers=auth_headers(applicant_token),
        )
        assert submit_resp.status_code == 200

        # Try to update it
        update_resp = await client.put(
            f"{PORTAL_BASE}/papers/{paper_id}",
            json={"title": "Should Fail"},
            headers=auth_headers(applicant_token),
        )
        assert update_resp.status_code == 400

    @pytest.mark.asyncio
    @patch("app.api.v1.cfp_portal.papers._helpers.send_cospeaker_invitation_email", new_callable=AsyncMock)
    async def test_submit_paper(
        self,
        mock_email: AsyncMock,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
        cfp: CallForPapers,
    ) -> None:
        """POST submit transitions a draft paper to submitted status."""
        create_resp = await client.post(
            f"{PORTAL_BASE}/papers",
            json={"cfp_id": str(cfp.id), "title": "To Submit"},
            headers=auth_headers(applicant_token),
        )
        paper_id = create_resp.json()["id"]

        submit_resp = await client.post(
            f"{PORTAL_BASE}/papers/{paper_id}/submit",
            headers=auth_headers(applicant_token),
        )
        assert submit_resp.status_code == 200
        data = submit_resp.json()
        assert data["status"] == "submitted"
        assert data["submitted_at"] is not None

    @pytest.mark.asyncio
    @patch("app.api.v1.cfp_portal.papers._helpers.send_cospeaker_invitation_email", new_callable=AsyncMock)
    async def test_submit_non_draft_fails(
        self,
        mock_email: AsyncMock,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
        cfp: CallForPapers,
    ) -> None:
        """Cannot submit a paper that is already submitted."""
        create_resp = await client.post(
            f"{PORTAL_BASE}/papers",
            json={"cfp_id": str(cfp.id), "title": "Double Submit"},
            headers=auth_headers(applicant_token),
        )
        paper_id = create_resp.json()["id"]

        # First submit
        resp1 = await client.post(
            f"{PORTAL_BASE}/papers/{paper_id}/submit",
            headers=auth_headers(applicant_token),
        )
        assert resp1.status_code == 200

        # Second submit should fail
        resp2 = await client.post(
            f"{PORTAL_BASE}/papers/{paper_id}/submit",
            headers=auth_headers(applicant_token),
        )
        assert resp2.status_code == 400

    @pytest.mark.asyncio
    @patch("app.api.v1.cfp_portal.papers._helpers.send_cospeaker_invitation_email", new_callable=AsyncMock)
    async def test_unsubmit_paper(
        self,
        mock_email: AsyncMock,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
        cfp: CallForPapers,
    ) -> None:
        """POST unsubmit reverts a submitted paper back to draft."""
        create_resp = await client.post(
            f"{PORTAL_BASE}/papers",
            json={"cfp_id": str(cfp.id), "title": "Unsubmit Me"},
            headers=auth_headers(applicant_token),
        )
        paper_id = create_resp.json()["id"]

        # Submit
        await client.post(
            f"{PORTAL_BASE}/papers/{paper_id}/submit",
            headers=auth_headers(applicant_token),
        )

        # Unsubmit
        unsub_resp = await client.post(
            f"{PORTAL_BASE}/papers/{paper_id}/unsubmit",
            headers=auth_headers(applicant_token),
        )
        assert unsub_resp.status_code == 200
        data = unsub_resp.json()
        assert data["status"] == "draft"
        assert data["submitted_at"] is None

    @pytest.mark.asyncio
    @patch("app.api.v1.cfp_portal.papers._helpers.send_cospeaker_invitation_email", new_callable=AsyncMock)
    async def test_unsubmit_draft_fails(
        self,
        mock_email: AsyncMock,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
        cfp: CallForPapers,
    ) -> None:
        """Cannot unsubmit a paper that is still a draft."""
        create_resp = await client.post(
            f"{PORTAL_BASE}/papers",
            json={"cfp_id": str(cfp.id), "title": "Still Draft"},
            headers=auth_headers(applicant_token),
        )
        paper_id = create_resp.json()["id"]

        resp = await client.post(
            f"{PORTAL_BASE}/papers/{paper_id}/unsubmit",
            headers=auth_headers(applicant_token),
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    @patch("app.api.v1.cfp_portal.papers._helpers.send_cospeaker_invitation_email", new_callable=AsyncMock)
    async def test_full_lifecycle(
        self,
        mock_email: AsyncMock,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
        cfp: CallForPapers,
    ) -> None:
        """Full lifecycle: create draft -> update -> submit -> unsubmit -> resubmit."""
        headers = auth_headers(applicant_token)

        # 1. Create draft
        create_resp = await client.post(
            f"{PORTAL_BASE}/papers",
            json={"cfp_id": str(cfp.id), "title": "Lifecycle Paper"},
            headers=headers,
        )
        assert create_resp.status_code == 200
        paper_id = create_resp.json()["id"]
        assert create_resp.json()["status"] == "draft"

        # 2. Update
        update_resp = await client.put(
            f"{PORTAL_BASE}/papers/{paper_id}",
            json={"abstract_short": "Updated abstract"},
            headers=headers,
        )
        assert update_resp.status_code == 200
        assert update_resp.json()["abstract_short"] == "Updated abstract"

        # 3. Submit
        submit_resp = await client.post(
            f"{PORTAL_BASE}/papers/{paper_id}/submit",
            headers=headers,
        )
        assert submit_resp.status_code == 200
        assert submit_resp.json()["status"] == "submitted"

        # 4. Unsubmit
        unsub_resp = await client.post(
            f"{PORTAL_BASE}/papers/{paper_id}/unsubmit",
            headers=headers,
        )
        assert unsub_resp.status_code == 200
        assert unsub_resp.json()["status"] == "draft"

        # 5. Resubmit
        resub_resp = await client.post(
            f"{PORTAL_BASE}/papers/{paper_id}/submit",
            headers=headers,
        )
        assert resub_resp.status_code == 200
        assert resub_resp.json()["status"] == "submitted"

    @pytest.mark.asyncio
    @patch("app.api.v1.cfp_portal.papers._helpers.send_cospeaker_invitation_email", new_callable=AsyncMock)
    async def test_delete_draft_paper(
        self,
        mock_email: AsyncMock,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
        cfp: CallForPapers,
    ) -> None:
        """DELETE removes a draft paper."""
        create_resp = await client.post(
            f"{PORTAL_BASE}/papers",
            json={"cfp_id": str(cfp.id), "title": "Delete Me"},
            headers=auth_headers(applicant_token),
        )
        paper_id = create_resp.json()["id"]

        del_resp = await client.delete(
            f"{PORTAL_BASE}/papers/{paper_id}",
            headers=auth_headers(applicant_token),
        )
        assert del_resp.status_code == 200
        assert del_resp.json()["message"] == "Paper deleted"

        # Verify it is gone
        get_resp = await client.get(
            f"{PORTAL_BASE}/papers/{paper_id}",
            headers=auth_headers(applicant_token),
        )
        assert get_resp.status_code == 404

    @pytest.mark.asyncio
    @patch("app.api.v1.cfp_portal.papers._helpers.send_cospeaker_invitation_email", new_callable=AsyncMock)
    async def test_delete_submitted_fails(
        self,
        mock_email: AsyncMock,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
        cfp: CallForPapers,
    ) -> None:
        """Cannot delete a submitted paper."""
        create_resp = await client.post(
            f"{PORTAL_BASE}/papers",
            json={"cfp_id": str(cfp.id), "title": "No Delete"},
            headers=auth_headers(applicant_token),
        )
        paper_id = create_resp.json()["id"]

        # Submit it
        await client.post(
            f"{PORTAL_BASE}/papers/{paper_id}/submit",
            headers=auth_headers(applicant_token),
        )

        # Attempt delete
        del_resp = await client.delete(
            f"{PORTAL_BASE}/papers/{paper_id}",
            headers=auth_headers(applicant_token),
        )
        assert del_resp.status_code == 400

    @pytest.mark.asyncio
    @patch("app.api.v1.cfp_portal.papers._helpers.send_cospeaker_invitation_email", new_callable=AsyncMock)
    async def test_other_applicant_cannot_access(
        self,
        mock_email: AsyncMock,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
        second_applicant: CFPApplicant,
        second_applicant_token: str,
        cfp: CallForPapers,
    ) -> None:
        """Another applicant cannot view, update, or delete someone else's paper."""
        create_resp = await client.post(
            f"{PORTAL_BASE}/papers",
            json={"cfp_id": str(cfp.id), "title": "Private Paper"},
            headers=auth_headers(applicant_token),
        )
        paper_id = create_resp.json()["id"]

        # Second applicant tries to read
        get_resp = await client.get(
            f"{PORTAL_BASE}/papers/{paper_id}",
            headers=auth_headers(second_applicant_token),
        )
        assert get_resp.status_code == 404

        # Second applicant tries to update
        put_resp = await client.put(
            f"{PORTAL_BASE}/papers/{paper_id}",
            json={"title": "Hijacked"},
            headers=auth_headers(second_applicant_token),
        )
        assert put_resp.status_code == 404

        # Second applicant tries to delete
        del_resp = await client.delete(
            f"{PORTAL_BASE}/papers/{paper_id}",
            headers=auth_headers(second_applicant_token),
        )
        assert del_resp.status_code == 404

    @pytest.mark.asyncio
    @patch("app.api.v1.cfp_portal.papers._helpers.send_email_background")
    async def test_create_paper_with_cospeakers(
        self,
        mock_bg_email: MagicMock,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
        second_applicant: CFPApplicant,
        cfp: CallForPapers,
    ) -> None:
        """Creating a paper with cospeaker_emails adds cospeakers and sends invitations."""
        payload = {
            "cfp_id": str(cfp.id),
            "title": "Co-authored Paper",
            "cospeaker_emails": [second_applicant.email],
        }
        resp = await client.post(
            f"{PORTAL_BASE}/papers",
            json=payload,
            headers=auth_headers(applicant_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["cospeakers"]) == 1
        assert data["cospeakers"][0]["email"] == second_applicant.email
        assert data["cospeakers"][0]["invitation_status"] == "pending"

        # Verify the background email invitation was triggered
        mock_bg_email.assert_called_once()

    @pytest.mark.asyncio
    @patch("app.api.v1.cfp_portal.papers._helpers.send_cospeaker_invitation_email", new_callable=AsyncMock)
    async def test_max_cospeakers(
        self,
        mock_email: AsyncMock,
        client: AsyncClient,
        db_session: AsyncSession,
        applicant: CFPApplicant,
        applicant_token: str,
        tenant: Tenant,
        cfp: CallForPapers,
    ) -> None:
        """Cannot add more than 3 cospeakers."""
        # Create 4 extra applicants
        emails = []
        for i in range(4):
            a = CFPApplicant(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                first_name=f"Extra{i}",
                last_name="Speaker",
                email=f"extra{i}-{uuid.uuid4().hex[:8]}@example.com",
                password_hash=hash_password("Password123!"),
            )
            db_session.add(a)
            emails.append(a.email)
        await db_session.commit()

        payload = {
            "cfp_id": str(cfp.id),
            "title": "Too Many Co-speakers",
            "cospeaker_emails": emails,
        }
        resp = await client.post(
            f"{PORTAL_BASE}/papers",
            json=payload,
            headers=auth_headers(applicant_token),
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    @patch("app.api.v1.cfp_portal.papers._helpers.send_cospeaker_invitation_email", new_callable=AsyncMock)
    async def test_cannot_add_self_as_cospeaker(
        self,
        mock_email: AsyncMock,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
        cfp: CallForPapers,
    ) -> None:
        """Cannot add yourself as a co-speaker."""
        payload = {
            "cfp_id": str(cfp.id),
            "title": "Self Cospeaker",
            "cospeaker_emails": [applicant.email],
        }
        resp = await client.post(
            f"{PORTAL_BASE}/papers",
            json=payload,
            headers=auth_headers(applicant_token),
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_papers_unauthenticated(
        self,
        client: AsyncClient,
    ) -> None:
        """Returns 401 for unauthenticated paper list request."""
        resp = await client.get(f"{PORTAL_BASE}/papers")
        assert resp.status_code == 401


# ── TestPortalInvitations ───────────────────────────────────────────────


class TestPortalInvitations:
    """Tests for portal cospeaker invitation endpoints."""

    @pytest.mark.asyncio
    async def test_list_invitations_empty(
        self,
        client: AsyncClient,
        second_applicant: CFPApplicant,
        second_applicant_token: str,
    ) -> None:
        """Initially returns no invitations."""
        resp = await client.get(
            f"{PORTAL_BASE}/invitations",
            headers=auth_headers(second_applicant_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"] == []
        assert data["total"] == 0

    @pytest.mark.asyncio
    @patch("app.api.v1.cfp_portal.papers._helpers.send_cospeaker_invitation_email", new_callable=AsyncMock)
    async def test_cospeaker_sees_invitation(
        self,
        mock_email: AsyncMock,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
        second_applicant: CFPApplicant,
        second_applicant_token: str,
        cfp: CallForPapers,
    ) -> None:
        """After being added as a cospeaker, the second applicant sees the invitation."""
        # Create paper with cospeaker
        create_resp = await client.post(
            f"{PORTAL_BASE}/papers",
            json={
                "cfp_id": str(cfp.id),
                "title": "Invited Paper",
                "cospeaker_emails": [second_applicant.email],
            },
            headers=auth_headers(applicant_token),
        )
        assert create_resp.status_code == 200

        # Second applicant checks invitations
        inv_resp = await client.get(
            f"{PORTAL_BASE}/invitations",
            headers=auth_headers(second_applicant_token),
        )
        assert inv_resp.status_code == 200
        data = inv_resp.json()
        assert data["total"] >= 1
        inv = data["items"][0]
        assert inv["paper_title"] == "Invited Paper"
        assert inv["invitation_status"] == "pending"
        assert inv["main_speaker_first_name"] == "Jane"
        assert inv["main_speaker_last_name"] == "Speaker"

    @pytest.mark.asyncio
    @patch("app.api.v1.cfp_portal.papers._helpers.send_cospeaker_invitation_email", new_callable=AsyncMock)
    async def test_accept_invitation(
        self,
        mock_email: AsyncMock,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
        second_applicant: CFPApplicant,
        second_applicant_token: str,
        cfp: CallForPapers,
    ) -> None:
        """Accepting an invitation sets status to accepted."""
        create_resp = await client.post(
            f"{PORTAL_BASE}/papers",
            json={
                "cfp_id": str(cfp.id),
                "title": "Accept Me",
                "cospeaker_emails": [second_applicant.email],
            },
            headers=auth_headers(applicant_token),
        )
        paper_id = create_resp.json()["id"]

        accept_resp = await client.post(
            f"{PORTAL_BASE}/invitations/{paper_id}/accept",
            headers=auth_headers(second_applicant_token),
        )
        assert accept_resp.status_code == 200
        assert accept_resp.json()["message"] == "Invitation accepted"

        # Verify the invitation status changed
        inv_resp = await client.get(
            f"{PORTAL_BASE}/invitations",
            headers=auth_headers(second_applicant_token),
        )
        inv = inv_resp.json()["items"][0]
        assert inv["invitation_status"] == "accepted"

    @pytest.mark.asyncio
    @patch("app.api.v1.cfp_portal.papers._helpers.send_cospeaker_invitation_email", new_callable=AsyncMock)
    async def test_decline_invitation(
        self,
        mock_email: AsyncMock,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
        second_applicant: CFPApplicant,
        second_applicant_token: str,
        cfp: CallForPapers,
    ) -> None:
        """Declining an invitation sets status to declined."""
        create_resp = await client.post(
            f"{PORTAL_BASE}/papers",
            json={
                "cfp_id": str(cfp.id),
                "title": "Decline Me",
                "cospeaker_emails": [second_applicant.email],
            },
            headers=auth_headers(applicant_token),
        )
        paper_id = create_resp.json()["id"]

        decline_resp = await client.post(
            f"{PORTAL_BASE}/invitations/{paper_id}/decline",
            headers=auth_headers(second_applicant_token),
        )
        assert decline_resp.status_code == 200
        assert decline_resp.json()["message"] == "Invitation declined"

        # Verify the invitation status changed
        inv_resp = await client.get(
            f"{PORTAL_BASE}/invitations",
            headers=auth_headers(second_applicant_token),
        )
        inv = inv_resp.json()["items"][0]
        assert inv["invitation_status"] == "declined"

    @pytest.mark.asyncio
    @patch("app.api.v1.cfp_portal.papers._helpers.send_cospeaker_invitation_email", new_callable=AsyncMock)
    async def test_double_response_fails(
        self,
        mock_email: AsyncMock,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
        second_applicant: CFPApplicant,
        second_applicant_token: str,
        cfp: CallForPapers,
    ) -> None:
        """Cannot respond to the same invitation twice."""
        create_resp = await client.post(
            f"{PORTAL_BASE}/papers",
            json={
                "cfp_id": str(cfp.id),
                "title": "Once Only",
                "cospeaker_emails": [second_applicant.email],
            },
            headers=auth_headers(applicant_token),
        )
        paper_id = create_resp.json()["id"]

        # Accept the first time
        resp1 = await client.post(
            f"{PORTAL_BASE}/invitations/{paper_id}/accept",
            headers=auth_headers(second_applicant_token),
        )
        assert resp1.status_code == 200

        # Try to accept again -- should fail
        resp2 = await client.post(
            f"{PORTAL_BASE}/invitations/{paper_id}/accept",
            headers=auth_headers(second_applicant_token),
        )
        assert resp2.status_code == 400

        # Try to decline after accepting -- should also fail
        resp3 = await client.post(
            f"{PORTAL_BASE}/invitations/{paper_id}/decline",
            headers=auth_headers(second_applicant_token),
        )
        assert resp3.status_code == 400

    @pytest.mark.asyncio
    async def test_invitation_not_found(
        self,
        client: AsyncClient,
        second_applicant: CFPApplicant,
        second_applicant_token: str,
    ) -> None:
        """Returns 404 when accepting/declining a non-existent invitation."""
        fake_paper_id = str(uuid.uuid4())
        resp = await client.post(
            f"{PORTAL_BASE}/invitations/{fake_paper_id}/accept",
            headers=auth_headers(second_applicant_token),
        )
        assert resp.status_code == 404


# ── TestPortalAssignedPapers ─────────────────────────────────────────


class TestPortalAssignedPapers:
    """Tests for committee member assigned paper endpoints."""

    @pytest.mark.asyncio
    async def test_list_assigned_papers_empty(
        self,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
    ) -> None:
        """Returns empty list when applicant has no committee membership."""
        resp = await client.get(
            f"{PORTAL_BASE}/assigned-papers",
            headers=auth_headers(applicant_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"] == []
        assert data["total"] == 0

    @pytest.mark.asyncio
    async def test_list_assigned_papers(
        self,
        client: AsyncClient,
        reviewer_applicant: CFPApplicant,
        reviewer_token: str,
        assignment: CFPPaperAssignment,
        paper_for_review: CFPPaper,
    ) -> None:
        """Returns assigned papers for a committee member."""
        resp = await client.get(
            f"{PORTAL_BASE}/assigned-papers",
            headers=auth_headers(reviewer_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        paper = data["items"][0]
        assert paper["id"] == str(paper_for_review.id)
        assert paper["assignment_id"] == str(assignment.id)
        assert paper["title"] == "Paper Under Review"
        assert paper["is_anonymous"] is False
        assert paper["main_speaker_first_name"] == "Jane"

    @pytest.mark.asyncio
    async def test_get_assigned_paper_detail(
        self,
        client: AsyncClient,
        reviewer_applicant: CFPApplicant,
        reviewer_token: str,
        assignment: CFPPaperAssignment,
        paper_for_review: CFPPaper,
    ) -> None:
        """Returns a single assigned paper with detail."""
        resp = await client.get(
            f"{PORTAL_BASE}/assigned-papers/{paper_for_review.id}",
            headers=auth_headers(reviewer_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == str(paper_for_review.id)
        assert data["assignment_id"] == str(assignment.id)
        assert data["abstract_short"] == "Short abstract for review"

    @pytest.mark.asyncio
    async def test_get_assigned_paper_not_found(
        self,
        client: AsyncClient,
        reviewer_applicant: CFPApplicant,
        reviewer_token: str,
        committee_member: CFPCommitteeMember,
    ) -> None:
        """Returns 404 for a paper not assigned to this reviewer."""
        fake_id = str(uuid.uuid4())
        resp = await client.get(
            f"{PORTAL_BASE}/assigned-papers/{fake_id}",
            headers=auth_headers(reviewer_token),
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_non_committee_cannot_see_assigned(
        self,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
        assignment: CFPPaperAssignment,
        paper_for_review: CFPPaper,
    ) -> None:
        """A regular applicant (non-committee member) cannot see assigned papers."""
        resp = await client.get(
            f"{PORTAL_BASE}/assigned-papers/{paper_for_review.id}",
            headers=auth_headers(applicant_token),
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_pending_count_zero(
        self,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
    ) -> None:
        """Returns zero pending count when applicant has no committee membership."""
        resp = await client.get(
            f"{PORTAL_BASE}/assigned-papers/pending-count",
            headers=auth_headers(applicant_token),
        )
        assert resp.status_code == 200
        assert resp.json()["pending_count"] == 0

    @pytest.mark.asyncio
    async def test_pending_count_with_assignment(
        self,
        client: AsyncClient,
        reviewer_applicant: CFPApplicant,
        reviewer_token: str,
        assignment: CFPPaperAssignment,
    ) -> None:
        """Returns correct pending count for unreviewed assignments."""
        resp = await client.get(
            f"{PORTAL_BASE}/assigned-papers/pending-count",
            headers=auth_headers(reviewer_token),
        )
        assert resp.status_code == 200
        assert resp.json()["pending_count"] == 1

    @pytest.mark.asyncio
    async def test_anonymous_assignment_hides_speaker(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        cfp: CallForPapers,
        applicant: CFPApplicant,
        reviewer_applicant: CFPApplicant,
        reviewer_token: str,
        committee_member: CFPCommitteeMember,
    ) -> None:
        """Anonymous assignments hide speaker name and cospeaker info."""
        # Create a paper
        paper = CFPPaper(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            cfp_id=cfp.id,
            main_speaker_id=applicant.id,
            title="Anonymous Paper",
            status=PaperStatus.IN_EVALUATION.value,
        )
        db_session.add(paper)
        await db_session.flush()

        # Create anonymous assignment
        anon_assignment = CFPPaperAssignment(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            paper_id=paper.id,
            committee_member_id=committee_member.id,
            is_anonymous=True,
        )
        db_session.add(anon_assignment)
        await db_session.commit()

        resp = await client.get(
            f"{PORTAL_BASE}/assigned-papers/{paper.id}",
            headers=auth_headers(reviewer_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_anonymous"] is True
        assert data["main_speaker_first_name"] is None
        assert data["main_speaker_last_name"] is None
        assert data["cospeakers"] == []


# ── TestPortalReviews ────────────────────────────────────────────────


class TestPortalReviews:
    """Tests for review config and review submission endpoints."""

    @pytest.mark.asyncio
    async def test_get_review_config(
        self,
        client: AsyncClient,
        reviewer_applicant: CFPApplicant,
        reviewer_token: str,
        assignment: CFPPaperAssignment,
        review_criterion_with_question: tuple,
    ) -> None:
        """Returns the review configuration for an assignment."""
        resp = await client.get(
            f"{PORTAL_BASE}/assignments/{assignment.id}/review-config",
            headers=auth_headers(reviewer_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data["criteria"], list)
        assert len(data["criteria"]) >= 1
        assert data["criteria"][0]["title"] == "Relevance"
        assert len(data["criteria"][0]["questions"]) >= 1
        assert data["existing_review"] is None
        assert data["form_settings"]["enable_speaker_feedback"] is True

    @pytest.mark.asyncio
    async def test_get_review_config_not_found(
        self,
        client: AsyncClient,
        reviewer_applicant: CFPApplicant,
        reviewer_token: str,
        committee_member: CFPCommitteeMember,
    ) -> None:
        """Returns 404 for an assignment that does not belong to the reviewer."""
        fake_id = str(uuid.uuid4())
        resp = await client.get(
            f"{PORTAL_BASE}/assignments/{fake_id}/review-config",
            headers=auth_headers(reviewer_token),
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_save_review_draft(
        self,
        client: AsyncClient,
        reviewer_applicant: CFPApplicant,
        reviewer_token: str,
        assignment: CFPPaperAssignment,
        review_criterion_with_question: tuple,
    ) -> None:
        """Saving a review without submit=true creates a draft."""
        _criterion, question, _scale, option = review_criterion_with_question
        payload = {
            "answers": [
                {
                    "question_id": str(question.id),
                    "selected_option_id": str(option.id),
                    "comment": "Looks promising",
                }
            ],
            "speaker_feedback": "Good work so far",
            "internal_comment": "Needs more detail",
            "must_have": False,
        }
        resp = await client.post(
            f"{PORTAL_BASE}/assignments/{assignment.id}/review",
            json=payload,
            params={"submit": "false"},
            headers=auth_headers(reviewer_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "draft"
        assert "review_id" in data

    @pytest.mark.asyncio
    async def test_submit_review(
        self,
        client: AsyncClient,
        reviewer_applicant: CFPApplicant,
        reviewer_token: str,
        assignment: CFPPaperAssignment,
        review_criterion_with_question: tuple,
    ) -> None:
        """Submitting a review sets status to submitted and calculates score."""
        _criterion, question, _scale, option = review_criterion_with_question
        payload = {
            "answers": [
                {
                    "question_id": str(question.id),
                    "selected_option_id": str(option.id),
                    "comment": "Solid paper",
                }
            ],
            "speaker_feedback": "Well done",
            "internal_comment": "",
            "must_have": True,
        }
        resp = await client.post(
            f"{PORTAL_BASE}/assignments/{assignment.id}/review",
            json=payload,
            params={"submit": "true"},
            headers=auth_headers(reviewer_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "submitted"
        assert data["total_score"] is not None
        # Score should be 4.0 (only option with weight 1.0)
        assert data["total_score"] == 4.0

    @pytest.mark.asyncio
    async def test_resubmit_review_fails(
        self,
        client: AsyncClient,
        reviewer_applicant: CFPApplicant,
        reviewer_token: str,
        assignment: CFPPaperAssignment,
        review_criterion_with_question: tuple,
    ) -> None:
        """Cannot modify a review that has already been submitted."""
        _criterion, question, _scale, option = review_criterion_with_question
        payload = {
            "answers": [
                {
                    "question_id": str(question.id),
                    "selected_option_id": str(option.id),
                }
            ],
            "speaker_feedback": "",
        }

        # Submit the review
        resp1 = await client.post(
            f"{PORTAL_BASE}/assignments/{assignment.id}/review",
            json=payload,
            params={"submit": "true"},
            headers=auth_headers(reviewer_token),
        )
        assert resp1.status_code == 200

        # Try to submit again
        resp2 = await client.post(
            f"{PORTAL_BASE}/assignments/{assignment.id}/review",
            json=payload,
            params={"submit": "true"},
            headers=auth_headers(reviewer_token),
        )
        assert resp2.status_code == 400

    @pytest.mark.asyncio
    async def test_review_config_shows_existing_draft(
        self,
        client: AsyncClient,
        reviewer_applicant: CFPApplicant,
        reviewer_token: str,
        assignment: CFPPaperAssignment,
        review_criterion_with_question: tuple,
    ) -> None:
        """After saving a draft, the review config includes the existing review."""
        _criterion, question, _scale, option = review_criterion_with_question
        payload = {
            "answers": [
                {
                    "question_id": str(question.id),
                    "selected_option_id": str(option.id),
                    "comment": "Draft comment",
                }
            ],
            "speaker_feedback": "Draft feedback",
        }
        save_resp = await client.post(
            f"{PORTAL_BASE}/assignments/{assignment.id}/review",
            json=payload,
            params={"submit": "false"},
            headers=auth_headers(reviewer_token),
        )
        assert save_resp.status_code == 200

        # Check review config now includes the existing review
        config_resp = await client.get(
            f"{PORTAL_BASE}/assignments/{assignment.id}/review-config",
            headers=auth_headers(reviewer_token),
        )
        assert config_resp.status_code == 200
        data = config_resp.json()
        assert data["existing_review"] is not None
        assert data["existing_review"]["status"] == "draft"
        assert data["existing_review"]["speaker_feedback"] == "Draft feedback"
        assert len(data["existing_review"]["answers"]) >= 1

    @pytest.mark.asyncio
    async def test_non_committee_cannot_review(
        self,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
        assignment: CFPPaperAssignment,
    ) -> None:
        """A regular applicant (non-committee member) cannot access review config."""
        resp = await client.get(
            f"{PORTAL_BASE}/assignments/{assignment.id}/review-config",
            headers=auth_headers(applicant_token),
        )
        assert resp.status_code == 404


# ── TestPortalSpeakerFeedback ────────────────────────────────────────


class TestPortalSpeakerFeedback:
    """Tests for the speaker feedback endpoint."""

    @pytest.mark.asyncio
    async def test_feedback_empty_when_cfp_not_completed(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        applicant: CFPApplicant,
        applicant_token: str,
        paper_for_review: CFPPaper,
        assignment: CFPPaperAssignment,
        committee_member: CFPCommitteeMember,
    ) -> None:
        """Returns empty feedback when CFP is not completed yet."""
        # Create a submitted review with feedback
        review = PaperReview(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            assignment_id=assignment.id,
            paper_id=paper_for_review.id,
            committee_member_id=committee_member.id,
            status=ReviewStatus.SUBMITTED.value,
            speaker_feedback="Great paper!",
            total_score=4.0,
        )
        db_session.add(review)
        await db_session.commit()

        resp = await client.get(
            f"{PORTAL_BASE}/papers/{paper_for_review.id}/feedback",
            headers=auth_headers(applicant_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        # CFP status is "open" (not "completed"), so feedback should be empty
        assert data["items"] == []
        assert data["total"] == 0

    @pytest.mark.asyncio
    async def test_feedback_visible_when_cfp_completed(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        applicant: CFPApplicant,
        applicant_token: str,
        cfp: CallForPapers,
        paper_for_review: CFPPaper,
        assignment: CFPPaperAssignment,
        committee_member: CFPCommitteeMember,
    ) -> None:
        """Returns feedback when CFP status is completed."""
        # Set CFP to completed
        cfp.status = "completed"
        await db_session.commit()

        # Create a submitted review with feedback
        review = PaperReview(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            assignment_id=assignment.id,
            paper_id=paper_for_review.id,
            committee_member_id=committee_member.id,
            status=ReviewStatus.SUBMITTED.value,
            speaker_feedback="Excellent paper!",
            total_score=4.5,
        )
        db_session.add(review)
        await db_session.commit()

        resp = await client.get(
            f"{PORTAL_BASE}/papers/{paper_for_review.id}/feedback",
            headers=auth_headers(applicant_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        assert data["items"][0]["speaker_feedback"] == "Excellent paper!"
        assert data["items"][0]["total_score"] == 4.5

    @pytest.mark.asyncio
    async def test_feedback_not_accessible_by_other_applicant(
        self,
        client: AsyncClient,
        second_applicant: CFPApplicant,
        second_applicant_token: str,
        paper_for_review: CFPPaper,
    ) -> None:
        """Another applicant cannot access feedback for someone else's paper."""
        resp = await client.get(
            f"{PORTAL_BASE}/papers/{paper_for_review.id}/feedback",
            headers=auth_headers(second_applicant_token),
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_feedback_for_nonexistent_paper(
        self,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
    ) -> None:
        """Returns 404 for a non-existent paper."""
        fake_id = str(uuid.uuid4())
        resp = await client.get(
            f"{PORTAL_BASE}/papers/{fake_id}/feedback",
            headers=auth_headers(applicant_token),
        )
        assert resp.status_code == 404
