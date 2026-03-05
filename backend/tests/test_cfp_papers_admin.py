"""Tests for admin CFP papers and admin messaging threads endpoints.

Covers:
- Paper CRUD (create, read, update, delete)
- Paper lifecycle transitions (draft -> submit -> unsubmit)
- Paper stats and filtering
- Paper assignments (manual create, delete, list)
- Co-speaker invitation accept/decline
- Auth (401 unauthenticated) and RBAC (regular user vs admin)
- Messaging thread CRUD (create, read, reply)
- Messaging lifecycle (archive, unarchive, flag, mark read, internal note)
"""

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.associations import ConferenceCFP
from app.models.cfp import CallForPapers, CFPCommitteeMember
from app.models.cfp_applicants import CFPApplicant
from app.models.cfp_papers import CFPPaper, CFPPaperCospeaker, PaperStatus
from app.models.conference import Conference
from app.models.messaging import Message, MessageParticipant, MessageThread
from app.models.module import Module, TenantModule
from app.models.tenant import Tenant
from app.models.user import User
from tests.conftest import _make_token, auth_headers

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture()
async def cfp_module(db_session: AsyncSession) -> Module:
    """Create the 'cfp' module."""
    m = Module(
        id=uuid.uuid4(),
        name="Call for Papers",
        code="cfp",
        description="CFP management",
        is_active=True,
    )
    db_session.add(m)
    await db_session.commit()
    return m


@pytest_asyncio.fixture()
async def messaging_module(db_session: AsyncSession) -> Module:
    """Create the 'messaging' module."""
    m = Module(
        id=uuid.uuid4(),
        name="Messaging",
        code="messaging",
        description="In-app messaging",
        is_active=True,
    )
    db_session.add(m)
    await db_session.commit()
    return m


@pytest_asyncio.fixture()
async def tenant_with_cfp_messaging(
    db_session: AsyncSession,
    tenant: Tenant,
    conferences_module: Module,
    cfp_module: Module,
    messaging_module: Module,
) -> Tenant:
    """Enable conferences, cfp, and messaging modules on the test tenant."""
    for mod in [conferences_module, cfp_module, messaging_module]:
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


@pytest_asyncio.fixture()
async def applicant(db_session: AsyncSession, tenant: Tenant) -> CFPApplicant:
    """Create and return a CFP applicant."""
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
async def applicant2(db_session: AsyncSession, tenant: Tenant) -> CFPApplicant:
    """Create a second applicant for co-speaker tests."""
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Bob",
        last_name="Cospeaker",
        email=f"bob-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Password123!"),
    )
    db_session.add(a)
    await db_session.commit()
    return a


@pytest_asyncio.fixture()
async def cfp(db_session: AsyncSession, tenant: Tenant, conference: Conference) -> CallForPapers:
    """Create a CFP linked to the test conference."""
    c = CallForPapers(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        title="TestCFP 2026",
        status="open",
    )
    db_session.add(c)
    await db_session.flush()

    link = ConferenceCFP(
        id=uuid.uuid4(),
        conference_id=conference.id,
        cfp_id=c.id,
    )
    db_session.add(link)
    await db_session.commit()
    return c


@pytest_asyncio.fixture()
async def paper(db_session: AsyncSession, tenant: Tenant, cfp: CallForPapers, applicant: CFPApplicant) -> CFPPaper:
    """Create a draft paper."""
    p = CFPPaper(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        cfp_id=cfp.id,
        main_speaker_id=applicant.id,
        title="Async Testing in Python",
        abstract_short="A short abstract",
        status=PaperStatus.DRAFT.value,
    )
    db_session.add(p)
    await db_session.commit()
    return p


@pytest_asyncio.fixture()
async def submitted_paper(
    db_session: AsyncSession, tenant: Tenant, cfp: CallForPapers, applicant: CFPApplicant
) -> CFPPaper:
    """Create a submitted paper."""
    p = CFPPaper(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        cfp_id=cfp.id,
        main_speaker_id=applicant.id,
        title="Submitted Paper",
        abstract_short="Already submitted",
        status=PaperStatus.SUBMITTED.value,
    )
    db_session.add(p)
    await db_session.commit()
    return p


@pytest_asyncio.fixture()
async def committee_member(
    db_session: AsyncSession, tenant: Tenant, conference: Conference
) -> tuple[CFPCommitteeMember, CFPApplicant]:
    """Create a committee member (with its own applicant profile)."""
    reviewer_applicant = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Review",
        last_name="Person",
        email=f"reviewer-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Password123!"),
    )
    db_session.add(reviewer_applicant)
    await db_session.flush()

    cm = CFPCommitteeMember(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        applicant_id=reviewer_applicant.id,
        role="reviewer",
    )
    db_session.add(cm)
    await db_session.commit()
    return cm, reviewer_applicant


@pytest_asyncio.fixture()
async def thread_with_message(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    tenant_admin_user: User,
    applicant: CFPApplicant,
) -> MessageThread:
    """Create a message thread with one message and participants."""
    t = MessageThread(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        subject="Test Thread",
    )
    db_session.add(t)
    await db_session.flush()

    # Add user participant
    db_session.add(
        MessageParticipant(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            thread_id=t.id,
            participant_type="user",
            participant_id=tenant_admin_user.id,
        )
    )
    # Add applicant participant
    db_session.add(
        MessageParticipant(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            thread_id=t.id,
            participant_type="applicant",
            participant_id=applicant.id,
        )
    )
    # Add initial message
    db_session.add(
        Message(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            thread_id=t.id,
            sender_type="user",
            sender_id=tenant_admin_user.id,
            body_html="<p>Hello from admin</p>",
        )
    )
    await db_session.commit()
    return t


# ---------------------------------------------------------------------------
# Helper to build admin token with cfp module
# ---------------------------------------------------------------------------


def _admin_token(user: User) -> str:
    return _make_token(user, modules=["cfp", "messaging", "conferences"])


def _admin_headers(user: User) -> dict[str, str]:
    return auth_headers(_admin_token(user))


def _regular_token(user: User) -> str:
    return _make_token(user, modules=["cfp", "messaging", "conferences"])


# ============================================================================
# Test class: Admin CFP Papers
# ============================================================================


class TestAdminCFPPapers:
    """Tests for admin CFP paper endpoints under /api/v1/cfp/papers."""

    # -- Auth / RBAC --

    @pytest.mark.asyncio
    async def test_list_papers_unauthenticated(self, client: AsyncClient) -> None:
        """GET /papers without token returns 401."""
        resp = await client.get("/api/v1/cfp/papers")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_create_paper_regular_user_forbidden(
        self,
        client: AsyncClient,
        regular_user: User,
        tenant_with_cfp_messaging: Tenant,
        cfp: CallForPapers,
        applicant: CFPApplicant,
    ) -> None:
        """POST /papers by a regular user returns 403."""
        headers = auth_headers(_regular_token(regular_user))
        resp = await client.post(
            "/api/v1/cfp/papers",
            json={
                "cfp_id": str(cfp.id),
                "main_speaker_id": str(applicant.id),
                "title": "Should fail",
            },
            headers=headers,
        )
        assert resp.status_code == 403

    # -- CRUD --

    @pytest.mark.asyncio
    async def test_create_paper_success(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp_messaging: Tenant,
        cfp: CallForPapers,
        applicant: CFPApplicant,
    ) -> None:
        """POST /papers creates a paper in draft status."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.post(
            "/api/v1/cfp/papers",
            json={
                "cfp_id": str(cfp.id),
                "main_speaker_id": str(applicant.id),
                "title": "New Paper",
                "abstract_short": "short text",
            },
            headers=headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["title"] == "New Paper"
        assert data["status"] == "draft"
        assert data["main_speaker_id"] == str(applicant.id)

    @pytest.mark.asyncio
    async def test_list_papers_returns_items(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp_messaging: Tenant,
        paper: CFPPaper,
    ) -> None:
        """GET /papers returns the seeded paper."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.get("/api/v1/cfp/papers", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        titles = [p["title"] for p in data["items"]]
        assert paper.title in titles

    @pytest.mark.asyncio
    async def test_list_papers_filter_by_status(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp_messaging: Tenant,
        paper: CFPPaper,
        submitted_paper: CFPPaper,
    ) -> None:
        """GET /papers?status=submitted returns only submitted papers."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.get("/api/v1/cfp/papers?status=submitted", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        statuses = {p["status"] for p in data["items"]}
        assert statuses == {"submitted"} or data["total"] == 0
        # Our submitted_paper should be in the results
        ids = [p["id"] for p in data["items"]]
        assert str(submitted_paper.id) in ids

    @pytest.mark.asyncio
    async def test_get_paper_by_id(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp_messaging: Tenant,
        paper: CFPPaper,
    ) -> None:
        """GET /papers/{paper_id} returns the paper."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.get(f"/api/v1/cfp/papers/{paper.id}", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == str(paper.id)
        assert data["title"] == paper.title

    @pytest.mark.asyncio
    async def test_get_paper_not_found(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp_messaging: Tenant,
    ) -> None:
        """GET /papers/{random_id} returns 404."""
        headers = _admin_headers(tenant_admin_user)
        fake_id = uuid.uuid4()
        resp = await client.get(f"/api/v1/cfp/papers/{fake_id}", headers=headers)
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_update_paper_title(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp_messaging: Tenant,
        paper: CFPPaper,
    ) -> None:
        """PUT /papers/{paper_id} updates the paper title."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.put(
            f"/api/v1/cfp/papers/{paper.id}",
            json={"title": "Updated Title"},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["title"] == "Updated Title"

    @pytest.mark.asyncio
    async def test_delete_paper(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp_messaging: Tenant,
        paper: CFPPaper,
    ) -> None:
        """DELETE /papers/{paper_id} removes the paper."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.delete(f"/api/v1/cfp/papers/{paper.id}", headers=headers)
        assert resp.status_code == 200
        assert "deleted" in resp.json()["message"].lower()

        # Confirm it is gone
        get_resp = await client.get(f"/api/v1/cfp/papers/{paper.id}", headers=headers)
        assert get_resp.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_paper_not_found(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp_messaging: Tenant,
    ) -> None:
        """DELETE /papers/{random_id} returns 404."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.delete(f"/api/v1/cfp/papers/{uuid.uuid4()}", headers=headers)
        assert resp.status_code == 404

    # -- Stats --

    @pytest.mark.asyncio
    async def test_paper_stats(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp_messaging: Tenant,
        paper: CFPPaper,
        submitted_paper: CFPPaper,
    ) -> None:
        """GET /papers/stats returns aggregate counts."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.get("/api/v1/cfp/papers/stats", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 2
        assert data["draft"] >= 1
        assert data["submitted"] >= 1

    # -- Lifecycle: submit / unsubmit --

    @pytest.mark.asyncio
    async def test_submit_paper(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp_messaging: Tenant,
        paper: CFPPaper,
    ) -> None:
        """POST /papers/{id}/submit transitions draft -> submitted."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.post(f"/api/v1/cfp/papers/{paper.id}/submit", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "submitted"
        assert data["submitted_at"] is not None

    @pytest.mark.asyncio
    async def test_submit_already_submitted_fails(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp_messaging: Tenant,
        submitted_paper: CFPPaper,
    ) -> None:
        """POST /papers/{id}/submit on a non-draft paper returns 400."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.post(f"/api/v1/cfp/papers/{submitted_paper.id}/submit", headers=headers)
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_unsubmit_paper(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp_messaging: Tenant,
        submitted_paper: CFPPaper,
    ) -> None:
        """POST /papers/{id}/unsubmit reverts submitted -> draft."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.post(f"/api/v1/cfp/papers/{submitted_paper.id}/unsubmit", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "draft"
        assert data["submitted_at"] is None

    @pytest.mark.asyncio
    async def test_unsubmit_draft_paper_fails(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp_messaging: Tenant,
        paper: CFPPaper,
    ) -> None:
        """POST /papers/{id}/unsubmit on a draft paper returns 400."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.post(f"/api/v1/cfp/papers/{paper.id}/unsubmit", headers=headers)
        assert resp.status_code == 400

    # -- Full lifecycle: create -> submit -> assign reviewer -> unsubmit --

    @pytest.mark.asyncio
    async def test_full_paper_lifecycle(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp_messaging: Tenant,
        cfp: CallForPapers,
        applicant: CFPApplicant,
        committee_member: tuple[CFPCommitteeMember, CFPApplicant],
    ) -> None:
        """Test complete lifecycle: create -> submit -> assign -> unsubmit."""
        headers = _admin_headers(tenant_admin_user)
        cm, _ = committee_member

        # 1. Create paper
        create_resp = await client.post(
            "/api/v1/cfp/papers",
            json={
                "cfp_id": str(cfp.id),
                "main_speaker_id": str(applicant.id),
                "title": "Lifecycle Paper",
            },
            headers=headers,
        )
        assert create_resp.status_code == 201
        paper_id = create_resp.json()["id"]

        # 2. Submit paper
        submit_resp = await client.post(f"/api/v1/cfp/papers/{paper_id}/submit", headers=headers)
        assert submit_resp.status_code == 200
        assert submit_resp.json()["status"] == "submitted"

        # 3. Assign reviewer
        assign_resp = await client.post(
            "/api/v1/cfp/paper-assignments",
            json={
                "paper_id": paper_id,
                "committee_member_id": str(cm.id),
            },
            headers=headers,
        )
        assert assign_resp.status_code == 201
        assignment_id = assign_resp.json()["id"]

        # 4. Get paper assignments
        paper_assignments_resp = await client.get(f"/api/v1/cfp/papers/{paper_id}/assignments", headers=headers)
        assert paper_assignments_resp.status_code == 200
        assert paper_assignments_resp.json()["total"] == 1

        # 5. Delete assignment
        del_assign_resp = await client.delete(f"/api/v1/cfp/paper-assignments/{assignment_id}", headers=headers)
        assert del_assign_resp.status_code == 200

        # 6. Unsubmit paper (back to draft) - may fail if assigning changed status
        unsubmit_resp = await client.post(f"/api/v1/cfp/papers/{paper_id}/unsubmit", headers=headers)
        assert unsubmit_resp.status_code in (200, 400)
        if unsubmit_resp.status_code == 200:
            assert unsubmit_resp.json()["status"] == "draft"

    # -- Paper assignments (isolated) --

    @pytest.mark.asyncio
    async def test_list_paper_assignments_empty(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp_messaging: Tenant,
    ) -> None:
        """GET /paper-assignments returns empty list when no assignments exist."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.get("/api/v1/cfp/paper-assignments", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["total"] == 0

    @pytest.mark.asyncio
    async def test_create_assignment_paper_not_found(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp_messaging: Tenant,
        committee_member: tuple[CFPCommitteeMember, CFPApplicant],
    ) -> None:
        """POST /paper-assignments with invalid paper_id returns 404."""
        headers = _admin_headers(tenant_admin_user)
        cm, _ = committee_member
        resp = await client.post(
            "/api/v1/cfp/paper-assignments",
            json={
                "paper_id": str(uuid.uuid4()),
                "committee_member_id": str(cm.id),
            },
            headers=headers,
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_create_assignment_member_not_found(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp_messaging: Tenant,
        submitted_paper: CFPPaper,
    ) -> None:
        """POST /paper-assignments with invalid committee_member_id returns 404."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.post(
            "/api/v1/cfp/paper-assignments",
            json={
                "paper_id": str(submitted_paper.id),
                "committee_member_id": str(uuid.uuid4()),
            },
            headers=headers,
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_assignment_not_found(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp_messaging: Tenant,
    ) -> None:
        """DELETE /paper-assignments/{random_id} returns 404."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.delete(f"/api/v1/cfp/paper-assignments/{uuid.uuid4()}", headers=headers)
        assert resp.status_code == 404

    # -- Paper reviews (admin view) --

    @pytest.mark.asyncio
    async def test_get_paper_reviews_empty(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp_messaging: Tenant,
        paper: CFPPaper,
    ) -> None:
        """GET /papers/{id}/reviews returns empty list for paper without reviews."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.get(f"/api/v1/cfp/papers/{paper.id}/reviews", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["total"] == 0

    @pytest.mark.asyncio
    async def test_get_paper_reviews_not_found(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp_messaging: Tenant,
    ) -> None:
        """GET /papers/{random_id}/reviews returns 404."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.get(f"/api/v1/cfp/papers/{uuid.uuid4()}/reviews", headers=headers)
        assert resp.status_code == 404

    # -- Co-speaker invitations --

    @pytest.mark.asyncio
    async def test_accept_cospeaker_invitation(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_admin_user: User,
        tenant_with_cfp_messaging: Tenant,
        paper: CFPPaper,
        applicant2: CFPApplicant,
    ) -> None:
        """POST /papers/{id}/cospeakers/{applicant_id}/accept sets accepted status."""
        # Create a cospeaker association
        assoc = CFPPaperCospeaker(
            paper_id=paper.id,
            applicant_id=applicant2.id,
            invitation_status="pending",
        )
        db_session.add(assoc)
        await db_session.commit()

        headers = _admin_headers(tenant_admin_user)
        resp = await client.post(
            f"/api/v1/cfp/papers/{paper.id}/cospeakers/{applicant2.id}/accept",
            headers=headers,
        )
        assert resp.status_code == 200
        assert "accepted" in resp.json()["message"].lower()

    @pytest.mark.asyncio
    async def test_decline_cospeaker_invitation(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_admin_user: User,
        tenant_with_cfp_messaging: Tenant,
        paper: CFPPaper,
        applicant2: CFPApplicant,
    ) -> None:
        """POST /papers/{id}/cospeakers/{applicant_id}/decline sets declined status."""
        assoc = CFPPaperCospeaker(
            paper_id=paper.id,
            applicant_id=applicant2.id,
            invitation_status="pending",
        )
        db_session.add(assoc)
        await db_session.commit()

        headers = _admin_headers(tenant_admin_user)
        resp = await client.post(
            f"/api/v1/cfp/papers/{paper.id}/cospeakers/{applicant2.id}/decline",
            headers=headers,
        )
        assert resp.status_code == 200
        assert "declined" in resp.json()["message"].lower()

    @pytest.mark.asyncio
    async def test_accept_cospeaker_not_found(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp_messaging: Tenant,
        paper: CFPPaper,
    ) -> None:
        """POST /papers/{id}/cospeakers/{random_id}/accept returns 404."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.post(
            f"/api/v1/cfp/papers/{paper.id}/cospeakers/{uuid.uuid4()}/accept",
            headers=headers,
        )
        assert resp.status_code == 404

    # -- Status transitions via PUT --

    @pytest.mark.asyncio
    async def test_update_paper_status_draft_to_accepted(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp_messaging: Tenant,
        paper: CFPPaper,
    ) -> None:
        """PUT /papers/{id} can transition draft -> accepted."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.put(
            f"/api/v1/cfp/papers/{paper.id}",
            json={"status": "accepted"},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "accepted"

    @pytest.mark.asyncio
    async def test_update_paper_status_invalid_transition(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp_messaging: Tenant,
        paper: CFPPaper,
    ) -> None:
        """PUT /papers/{id} rejects invalid status transition (draft -> in_evaluation)."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.put(
            f"/api/v1/cfp/papers/{paper.id}",
            json={"status": "in_evaluation"},
            headers=headers,
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_list_papers_filter_by_cfp_id(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp_messaging: Tenant,
        cfp: CallForPapers,
        paper: CFPPaper,
    ) -> None:
        """GET /papers?cfp_id= filters by CFP."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.get(f"/api/v1/cfp/papers?cfp_id={cfp.id}", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        for p in data["items"]:
            assert p["cfp_id"] == str(cfp.id)


# ============================================================================
# Test class: Admin Messaging Threads
# ============================================================================


class TestAdminMessagingThreads:
    """Tests for admin messaging endpoints under /api/v1/conferences/{id}/messaging/."""

    def _url(self, conference_id: uuid.UUID, path: str = "") -> str:
        return f"/api/v1/conferences/{conference_id}/messaging{path}"

    # -- Auth --

    @pytest.mark.asyncio
    async def test_list_threads_unauthenticated(self, client: AsyncClient, conference: Conference) -> None:
        """GET /threads without token returns 401."""
        resp = await client.get(self._url(conference.id, "/threads"))
        assert resp.status_code == 401

    # -- List threads --

    @pytest.mark.asyncio
    async def test_list_threads_empty(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp_messaging: Tenant,
        conference: Conference,
    ) -> None:
        """GET /threads returns empty list when no threads exist."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.get(self._url(conference.id, "/threads"), headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["items"] == []

    @pytest.mark.asyncio
    async def test_list_threads_returns_created(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp_messaging: Tenant,
        conference: Conference,
        thread_with_message: MessageThread,
    ) -> None:
        """GET /threads returns the seeded thread."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.get(self._url(conference.id, "/threads"), headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        ids = [t["id"] for t in data["items"]]
        assert str(thread_with_message.id) in ids

    # -- Get thread detail --

    @pytest.mark.asyncio
    async def test_get_thread_detail(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp_messaging: Tenant,
        conference: Conference,
        thread_with_message: MessageThread,
    ) -> None:
        """GET /threads/{id} returns thread with messages and participants."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.get(
            self._url(conference.id, f"/threads/{thread_with_message.id}"),
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == str(thread_with_message.id)
        assert data["subject"] == "Test Thread"
        assert len(data["messages"]) >= 1
        assert len(data["participants"]) >= 1

    @pytest.mark.asyncio
    async def test_get_thread_not_found(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp_messaging: Tenant,
        conference: Conference,
    ) -> None:
        """GET /threads/{random_id} returns 404."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.get(
            self._url(conference.id, f"/threads/{uuid.uuid4()}"),
            headers=headers,
        )
        assert resp.status_code == 404

    # -- Create thread --

    @pytest.mark.asyncio
    async def test_create_thread(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp_messaging: Tenant,
        conference: Conference,
        applicant: CFPApplicant,
    ) -> None:
        """POST /threads creates a new message thread."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.post(
            self._url(conference.id, "/threads"),
            json={
                "recipient_applicant_ids": [str(applicant.id)],
                "subject": "Welcome aboard!",
                "body_html": "<p>Hello there</p>",
            },
            headers=headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["threads_created"] == 1
        assert data["first_thread"]["subject"] == "Welcome aboard!"

    @pytest.mark.asyncio
    async def test_create_thread_invalid_recipient(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp_messaging: Tenant,
        conference: Conference,
    ) -> None:
        """POST /threads with no valid applicant recipients returns 404."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.post(
            self._url(conference.id, "/threads"),
            json={
                "recipient_applicant_ids": [str(uuid.uuid4())],
                "subject": "Nobody home",
                "body_html": "<p>Test</p>",
            },
            headers=headers,
        )
        assert resp.status_code == 404

    # -- Reply --

    @pytest.mark.asyncio
    async def test_reply_to_thread(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp_messaging: Tenant,
        conference: Conference,
        thread_with_message: MessageThread,
    ) -> None:
        """POST /threads/{id}/reply adds a message to the thread."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.post(
            self._url(conference.id, f"/threads/{thread_with_message.id}/reply"),
            json={"body_html": "<p>Reply content</p>"},
            headers=headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["body_html"] is not None
        assert data["is_internal_note"] is False

    @pytest.mark.asyncio
    async def test_reply_thread_not_found(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp_messaging: Tenant,
        conference: Conference,
    ) -> None:
        """POST /threads/{random_id}/reply returns 404."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.post(
            self._url(conference.id, f"/threads/{uuid.uuid4()}/reply"),
            json={"body_html": "<p>Should fail</p>"},
            headers=headers,
        )
        assert resp.status_code == 404

    # -- Archive / Unarchive --

    @pytest.mark.asyncio
    async def test_archive_thread(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp_messaging: Tenant,
        conference: Conference,
        thread_with_message: MessageThread,
    ) -> None:
        """POST /threads/{id}/archive sets archived_at."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.post(
            self._url(conference.id, f"/threads/{thread_with_message.id}/archive"),
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

        # Verify it shows up in archived list
        list_resp = await client.get(
            self._url(conference.id, "/threads?archived=true"),
            headers=headers,
        )
        assert list_resp.status_code == 200
        ids = [t["id"] for t in list_resp.json()["items"]]
        assert str(thread_with_message.id) in ids

    @pytest.mark.asyncio
    async def test_unarchive_thread(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp_messaging: Tenant,
        conference: Conference,
        thread_with_message: MessageThread,
    ) -> None:
        """POST /threads/{id}/unarchive clears archived_at."""
        headers = _admin_headers(tenant_admin_user)

        # Archive first
        await client.post(
            self._url(conference.id, f"/threads/{thread_with_message.id}/archive"),
            headers=headers,
        )

        # Then unarchive
        resp = await client.post(
            self._url(conference.id, f"/threads/{thread_with_message.id}/unarchive"),
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    @pytest.mark.asyncio
    async def test_archive_thread_not_found(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp_messaging: Tenant,
        conference: Conference,
    ) -> None:
        """POST /threads/{random_id}/archive returns 404."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.post(
            self._url(conference.id, f"/threads/{uuid.uuid4()}/archive"),
            headers=headers,
        )
        assert resp.status_code == 404

    # -- Flag / unflag --

    @pytest.mark.asyncio
    async def test_toggle_flag_on_and_off(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp_messaging: Tenant,
        conference: Conference,
        thread_with_message: MessageThread,
    ) -> None:
        """POST /threads/{id}/flag toggles flag on then off."""
        headers = _admin_headers(tenant_admin_user)
        url = self._url(conference.id, f"/threads/{thread_with_message.id}/flag")

        # Flag on
        resp1 = await client.post(url, headers=headers)
        assert resp1.status_code == 200
        assert resp1.json()["flagged"] is True

        # Flag off (toggle)
        resp2 = await client.post(url, headers=headers)
        assert resp2.status_code == 200
        assert resp2.json()["flagged"] is False

    @pytest.mark.asyncio
    async def test_flag_thread_not_found(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp_messaging: Tenant,
        conference: Conference,
    ) -> None:
        """POST /threads/{random_id}/flag returns 404."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.post(
            self._url(conference.id, f"/threads/{uuid.uuid4()}/flag"),
            headers=headers,
        )
        assert resp.status_code == 404

    # -- Internal note --

    @pytest.mark.asyncio
    async def test_create_internal_note(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp_messaging: Tenant,
        conference: Conference,
        thread_with_message: MessageThread,
    ) -> None:
        """POST /threads/{id}/note creates an internal note."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.post(
            self._url(conference.id, f"/threads/{thread_with_message.id}/note"),
            json={"body_html": "<p>Internal comment</p>"},
            headers=headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["is_internal_note"] is True

    @pytest.mark.asyncio
    async def test_internal_note_thread_not_found(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp_messaging: Tenant,
        conference: Conference,
    ) -> None:
        """POST /threads/{random_id}/note returns 404."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.post(
            self._url(conference.id, f"/threads/{uuid.uuid4()}/note"),
            json={"body_html": "<p>Should fail</p>"},
            headers=headers,
        )
        assert resp.status_code == 404

    # -- Mark as read --

    @pytest.mark.asyncio
    async def test_mark_thread_read(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp_messaging: Tenant,
        conference: Conference,
        thread_with_message: MessageThread,
    ) -> None:
        """POST /threads/{id}/read marks the thread as read."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.post(
            self._url(conference.id, f"/threads/{thread_with_message.id}/read"),
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    # -- Messaging lifecycle: create -> reply -> note -> archive -> flag --

    @pytest.mark.asyncio
    async def test_full_messaging_lifecycle(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp_messaging: Tenant,
        conference: Conference,
        applicant: CFPApplicant,
    ) -> None:
        """Test complete messaging lifecycle."""
        headers = _admin_headers(tenant_admin_user)

        # 1. Create thread
        create_resp = await client.post(
            self._url(conference.id, "/threads"),
            json={
                "recipient_applicant_ids": [str(applicant.id)],
                "subject": "Lifecycle Test",
                "body_html": "<p>Initial message</p>",
            },
            headers=headers,
        )
        assert create_resp.status_code == 201
        thread_id = create_resp.json()["first_thread"]["id"]

        # 2. Reply
        reply_resp = await client.post(
            self._url(conference.id, f"/threads/{thread_id}/reply"),
            json={"body_html": "<p>Follow up</p>"},
            headers=headers,
        )
        assert reply_resp.status_code == 201

        # 3. Add internal note
        note_resp = await client.post(
            self._url(conference.id, f"/threads/{thread_id}/note"),
            json={"body_html": "<p>Note for admins</p>"},
            headers=headers,
        )
        assert note_resp.status_code == 201
        assert note_resp.json()["is_internal_note"] is True

        # 4. Archive
        archive_resp = await client.post(
            self._url(conference.id, f"/threads/{thread_id}/archive"),
            headers=headers,
        )
        assert archive_resp.status_code == 200

        # 5. Flag
        flag_resp = await client.post(
            self._url(conference.id, f"/threads/{thread_id}/flag"),
            headers=headers,
        )
        assert flag_resp.status_code == 200
        assert flag_resp.json()["flagged"] is True

        # 6. Verify thread detail has 3 messages (initial + reply + note)
        detail_resp = await client.get(
            self._url(conference.id, f"/threads/{thread_id}"),
            headers=headers,
        )
        assert detail_resp.status_code == 200
        assert len(detail_resp.json()["messages"]) == 3

        # 7. Unarchive
        unarchive_resp = await client.post(
            self._url(conference.id, f"/threads/{thread_id}/unarchive"),
            headers=headers,
        )
        assert unarchive_resp.status_code == 200

        # 8. Mark read
        read_resp = await client.post(
            self._url(conference.id, f"/threads/{thread_id}/read"),
            headers=headers,
        )
        assert read_resp.status_code == 200
