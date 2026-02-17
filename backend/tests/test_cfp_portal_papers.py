"""Tests for CFP portal paper submission endpoints."""

import os
import uuid

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://saasconf:saasconf_dev_password@localhost:5432/saasconf_test")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-unit-tests-minimum-32-chars")
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "testpassword123")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from unittest.mock import AsyncMock, patch

from app.core.applicant_security import create_applicant_access_token
from app.core.security import hash_password
from app.models.cfp import (
    CFPApplicant,
    CallForPapers,
    CFPTopic,
    CFPPaper,
    CFPPaperCospeaker,
    CospeakerInvitationStatus,
    PaperStatus,
)
from app.models.associations import ConferenceCFP
from app.models.conference import Conference
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
async def cfp(
    db_session: AsyncSession, tenant: Tenant, conference: Conference
) -> CallForPapers:
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
    @patch("app.api.v1.cfp_portal.papers.send_cospeaker_invitation_email", new_callable=AsyncMock)
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
    @patch("app.api.v1.cfp_portal.papers.send_cospeaker_invitation_email", new_callable=AsyncMock)
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
    @patch("app.api.v1.cfp_portal.papers.send_cospeaker_invitation_email", new_callable=AsyncMock)
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
    @patch("app.api.v1.cfp_portal.papers.send_cospeaker_invitation_email", new_callable=AsyncMock)
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
    @patch("app.api.v1.cfp_portal.papers.send_cospeaker_invitation_email", new_callable=AsyncMock)
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
    @patch("app.api.v1.cfp_portal.papers.send_cospeaker_invitation_email", new_callable=AsyncMock)
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
    @patch("app.api.v1.cfp_portal.papers.send_cospeaker_invitation_email", new_callable=AsyncMock)
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
    @patch("app.api.v1.cfp_portal.papers.send_cospeaker_invitation_email", new_callable=AsyncMock)
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
    @patch("app.api.v1.cfp_portal.papers.send_cospeaker_invitation_email", new_callable=AsyncMock)
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
    @patch("app.api.v1.cfp_portal.papers.send_cospeaker_invitation_email", new_callable=AsyncMock)
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
    @patch("app.api.v1.cfp_portal.papers.send_cospeaker_invitation_email", new_callable=AsyncMock)
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
    @patch("app.api.v1.cfp_portal.papers.send_cospeaker_invitation_email", new_callable=AsyncMock)
    async def test_create_paper_with_cospeakers(
        self,
        mock_email: AsyncMock,
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

        # Verify the email invitation was triggered
        mock_email.assert_called_once()

    @pytest.mark.asyncio
    @patch("app.api.v1.cfp_portal.papers.send_cospeaker_invitation_email", new_callable=AsyncMock)
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
    @patch("app.api.v1.cfp_portal.papers.send_cospeaker_invitation_email", new_callable=AsyncMock)
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
    @patch("app.api.v1.cfp_portal.papers.send_cospeaker_invitation_email", new_callable=AsyncMock)
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
    @patch("app.api.v1.cfp_portal.papers.send_cospeaker_invitation_email", new_callable=AsyncMock)
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
    @patch("app.api.v1.cfp_portal.papers.send_cospeaker_invitation_email", new_callable=AsyncMock)
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
