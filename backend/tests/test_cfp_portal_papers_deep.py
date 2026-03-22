"""Deep coverage tests for CFP portal papers endpoint (app/api/v1/cfp_portal/papers.py).

Targets code paths NOT covered by test_cfp_portal_papers.py:
  - Full paper response field validation (cfp_title, conference_name, session_type_name)
  - Paper status masking (accepted/rejected -> final_consideration when CFP not completed)
  - Submit validation with required paper and speaker fields
  - Co-speaker as accepted cospeaker: view, update, submit, cannot manage cospeakers
  - Cospeaker sync: add, remove, update sort order, preserve invitation status
  - List papers includes accepted cospeaker papers
  - Attachment upload/download for applicant_picture, paper_video
  - Attachment ownership and draft-only restrictions
  - Assigned papers with conference_id filter
  - Assigned papers with session type and cospeaker info (non-anonymous)
  - CFP-level is_anonymous_review hiding speaker info
  - Pending count with submitted review
  - Conference detail with session types
  - Non-existent cospeaker email error
"""

import io
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
from PIL import Image
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
    CFPPaperCospeaker,
    CFPTopic,
    CospeakerInvitationStatus,
    PaperStatus,
)
from app.models.conference import Conference
from app.models.review import PaperReview, ReviewStatus
from app.models.settings import SessionType
from app.models.tenant import Tenant
from tests.conftest import auth_headers

PORTAL_BASE = "/api/v1/portal"


def _make_test_image() -> bytes:
    """Create a minimal valid JPEG image for upload tests."""
    img = Image.new("RGB", (10, 10), color="red")
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


# ── Fixtures ────────────────────────────────────────────────────────────


@pytest_asyncio.fixture()
async def applicant(db_session: AsyncSession, tenant: Tenant) -> CFPApplicant:
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Alice",
        last_name="Deep",
        email=f"alice-deep-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Password123!"),
        bio="Expert in distributed systems",
        phone="+1234567890",
        title="Dr.",
        company="DeepTech Inc.",
    )
    db_session.add(a)
    await db_session.commit()
    return a


@pytest.fixture()
def applicant_token(applicant: CFPApplicant, tenant: Tenant) -> str:
    return create_applicant_access_token(applicant.id, tenant.id)


@pytest_asyncio.fixture()
async def second_applicant(db_session: AsyncSession, tenant: Tenant) -> CFPApplicant:
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Bob",
        last_name="CoDeep",
        email=f"bob-deep-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Password123!"),
    )
    db_session.add(a)
    await db_session.commit()
    return a


@pytest.fixture()
def second_applicant_token(second_applicant: CFPApplicant, tenant: Tenant) -> str:
    return create_applicant_access_token(second_applicant.id, tenant.id)


@pytest_asyncio.fixture()
async def third_applicant(db_session: AsyncSession, tenant: Tenant) -> CFPApplicant:
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Charlie",
        last_name="Third",
        email=f"charlie-deep-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Password123!"),
    )
    db_session.add(a)
    await db_session.commit()
    return a


@pytest_asyncio.fixture()
async def cfp(db_session: AsyncSession, tenant: Tenant, conference: Conference) -> CallForPapers:
    cfp_obj = CallForPapers(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        title="Deep CFP 2026",
        description="Deep test CFP",
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
async def session_type(db_session: AsyncSession, tenant: Tenant, conference: Conference) -> SessionType:
    st = SessionType(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Workshop",
        slug="workshop",
        duration_minutes=90,
        cfp_eligible=True,
        is_active=True,
    )
    db_session.add(st)
    await db_session.commit()
    return st


@pytest_asyncio.fixture()
async def topic(db_session: AsyncSession, tenant: Tenant) -> CFPTopic:
    t = CFPTopic(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="Deep Learning",
        description="Neural network topics",
    )
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture()
async def reviewer_applicant(db_session: AsyncSession, tenant: Tenant) -> CFPApplicant:
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Diana",
        last_name="Reviewer",
        email=f"diana-deep-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Password123!"),
    )
    db_session.add(a)
    await db_session.commit()
    return a


@pytest.fixture()
def reviewer_token(reviewer_applicant: CFPApplicant, tenant: Tenant) -> str:
    return create_applicant_access_token(reviewer_applicant.id, tenant.id)


@pytest_asyncio.fixture()
async def committee_member(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    reviewer_applicant: CFPApplicant,
) -> CFPCommitteeMember:
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


# ── TestPaperResponseFields ──────────────────────────────────────────────


class TestPaperResponseFields:
    """Verify full response field population including cfp_title, conference_name, session_type_name."""

    @pytest.mark.asyncio
    @patch("app.api.v1.cfp_portal.papers.send_cospeaker_invitation_email", new_callable=AsyncMock)
    async def test_create_paper_with_all_fields(
        self,
        mock_email: AsyncMock,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
        cfp: CallForPapers,
        session_type: SessionType,
        conference: Conference,
    ) -> None:
        """Paper created with all fields returns full response with cfp_title, conference_name, and session_type_name."""
        payload = {
            "cfp_id": str(cfp.id),
            "session_type_id": str(session_type.id),
            "title": "Full Fields Paper",
            "abstract_short": "Short abstract",
            "abstract_long": "A much longer abstract with detail",
            "level": "advanced",
            "learning_objectives": "Learn distributed systems",
        }
        resp = await client.post(
            f"{PORTAL_BASE}/papers",
            json=payload,
            headers=auth_headers(applicant_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "Full Fields Paper"
        assert data["abstract_short"] == "Short abstract"
        assert data["abstract_long"] == "A much longer abstract with detail"
        assert data["level"] == "advanced"
        assert data["learning_objectives"] == "Learn distributed systems"
        assert data["session_type_id"] == str(session_type.id)
        assert data["session_type_name"] == "Workshop"
        assert data["cfp_id"] == str(cfp.id)
        assert data["cfp_title"] == "Deep CFP 2026"
        assert data["conference_id"] == str(conference.id)
        assert data["conference_name"] == "TestConf 2026"
        assert data["status"] == "draft"
        assert data["is_main_speaker"] is True
        assert data["main_speaker_first_name"] == "Alice"
        assert data["main_speaker_last_name"] == "Deep"
        assert data["video_url"] is None
        assert data["cospeakers"] == []
        assert data["submitted_at"] is None

    @pytest.mark.asyncio
    @patch("app.api.v1.cfp_portal.papers.send_email_background")
    async def test_paper_with_multiple_cospeakers_full_response(
        self,
        mock_bg_email: MagicMock,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
        second_applicant: CFPApplicant,
        third_applicant: CFPApplicant,
        cfp: CallForPapers,
    ) -> None:
        """Paper with multiple cospeakers returns all cospeaker details correctly."""
        payload = {
            "cfp_id": str(cfp.id),
            "title": "Multi-Speaker Paper",
            "cospeaker_emails": [second_applicant.email, third_applicant.email],
        }
        resp = await client.post(
            f"{PORTAL_BASE}/papers",
            json=payload,
            headers=auth_headers(applicant_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["cospeakers"]) == 2
        emails = {cs["email"] for cs in data["cospeakers"]}
        assert second_applicant.email in emails
        assert third_applicant.email in emails
        for cs in data["cospeakers"]:
            assert cs["invitation_status"] == "pending"
            assert cs["applicant_id"] is not None
            assert cs["first_name"] is not None
            assert cs["last_name"] is not None
        assert mock_bg_email.call_count == 2


# ── TestPaperStatusMasking ───────────────────────────────────────────────


class TestPaperStatusMasking:
    """Test that accepted/rejected papers show as final_consideration until CFP is completed."""

    @pytest.mark.asyncio
    async def test_accepted_paper_shows_final_consideration_when_cfp_not_completed(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        applicant: CFPApplicant,
        applicant_token: str,
        cfp: CallForPapers,
        tenant: Tenant,
    ) -> None:
        """Accepted paper status is masked as final_consideration when CFP is open."""
        paper = CFPPaper(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            cfp_id=cfp.id,
            main_speaker_id=applicant.id,
            title="Accepted Paper",
            status=PaperStatus.ACCEPTED.value,
        )
        db_session.add(paper)
        await db_session.commit()

        resp = await client.get(
            f"{PORTAL_BASE}/papers/{paper.id}",
            headers=auth_headers(applicant_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "final_consideration"

    @pytest.mark.asyncio
    async def test_rejected_paper_shows_final_consideration_when_cfp_not_completed(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        applicant: CFPApplicant,
        applicant_token: str,
        cfp: CallForPapers,
        tenant: Tenant,
    ) -> None:
        """Rejected paper status is masked as final_consideration when CFP is open."""
        paper = CFPPaper(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            cfp_id=cfp.id,
            main_speaker_id=applicant.id,
            title="Rejected Paper",
            status=PaperStatus.REJECTED.value,
        )
        db_session.add(paper)
        await db_session.commit()

        resp = await client.get(
            f"{PORTAL_BASE}/papers/{paper.id}",
            headers=auth_headers(applicant_token),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "final_consideration"

    @pytest.mark.asyncio
    async def test_accepted_paper_shows_accepted_when_cfp_completed(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        applicant: CFPApplicant,
        applicant_token: str,
        cfp: CallForPapers,
        tenant: Tenant,
    ) -> None:
        """Accepted paper status is shown as-is when CFP is completed."""
        cfp.status = "completed"
        await db_session.commit()

        paper = CFPPaper(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            cfp_id=cfp.id,
            main_speaker_id=applicant.id,
            title="Completed CFP Accepted Paper",
            status=PaperStatus.ACCEPTED.value,
        )
        db_session.add(paper)
        await db_session.commit()

        resp = await client.get(
            f"{PORTAL_BASE}/papers/{paper.id}",
            headers=auth_headers(applicant_token),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "accepted"

    @pytest.mark.asyncio
    async def test_rejected_paper_shows_rejected_when_cfp_completed(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        applicant: CFPApplicant,
        applicant_token: str,
        cfp: CallForPapers,
        tenant: Tenant,
    ) -> None:
        """Rejected paper status is shown as-is when CFP is completed."""
        cfp.status = "completed"
        await db_session.commit()

        paper = CFPPaper(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            cfp_id=cfp.id,
            main_speaker_id=applicant.id,
            title="Completed CFP Rejected Paper",
            status=PaperStatus.REJECTED.value,
        )
        db_session.add(paper)
        await db_session.commit()

        resp = await client.get(
            f"{PORTAL_BASE}/papers/{paper.id}",
            headers=auth_headers(applicant_token),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "rejected"


# ── TestSubmitValidation ─────────────────────────────────────────────────


class TestSubmitValidation:
    """Test submit endpoint's required field validation logic."""

    @pytest.mark.asyncio
    async def test_submit_fails_with_missing_required_paper_fields(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        applicant: CFPApplicant,
        applicant_token: str,
        cfp: CallForPapers,
        tenant: Tenant,
    ) -> None:
        """Submit fails with 422 when CFP requires fields that the paper is missing."""
        cfp.required_paper_fields = ["abstract_short", "abstract_long", "level", "learning_objectives"]
        await db_session.commit()

        # Create paper without any of the required fields
        paper = CFPPaper(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            cfp_id=cfp.id,
            main_speaker_id=applicant.id,
            title="Incomplete Paper",
            status=PaperStatus.DRAFT.value,
        )
        db_session.add(paper)
        await db_session.commit()

        resp = await client.post(
            f"{PORTAL_BASE}/papers/{paper.id}/submit",
            headers=auth_headers(applicant_token),
        )
        assert resp.status_code == 422
        detail = resp.json()["detail"]
        assert detail["message"] == "Missing required fields"
        missing = detail["missing_fields"]
        assert "paper:abstract_short" in missing
        assert "paper:abstract_long" in missing
        assert "paper:level" in missing
        assert "paper:learning_objectives" in missing

    @pytest.mark.asyncio
    async def test_submit_fails_with_missing_required_speaker_fields(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        cfp: CallForPapers,
    ) -> None:
        """Submit fails with 422 when CFP requires speaker fields that are empty."""
        cfp.required_speaker_fields = ["bio", "phone", "title", "company"]
        await db_session.commit()

        # Create applicant WITHOUT bio/phone/title/company
        speaker = CFPApplicant(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            first_name="Sparse",
            last_name="Speaker",
            email=f"sparse-{uuid.uuid4().hex[:8]}@example.com",
            password_hash=hash_password("Password123!"),
        )
        db_session.add(speaker)
        await db_session.commit()

        token = create_applicant_access_token(speaker.id, tenant.id)

        paper = CFPPaper(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            cfp_id=cfp.id,
            main_speaker_id=speaker.id,
            title="Speaker Missing Fields",
            status=PaperStatus.DRAFT.value,
        )
        db_session.add(paper)
        await db_session.commit()

        resp = await client.post(
            f"{PORTAL_BASE}/papers/{paper.id}/submit",
            headers=auth_headers(token),
        )
        assert resp.status_code == 422
        detail = resp.json()["detail"]
        missing = detail["missing_fields"]
        assert "speaker:bio" in missing
        assert "speaker:phone" in missing
        assert "speaker:title" in missing
        assert "speaker:company" in missing

    @pytest.mark.asyncio
    async def test_submit_fails_when_picture_required_but_missing(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        applicant: CFPApplicant,
        applicant_token: str,
        cfp: CallForPapers,
        tenant: Tenant,
    ) -> None:
        """Submit fails when CFP requires speaker picture but none is uploaded."""
        cfp.required_speaker_fields = ["picture"]
        await db_session.commit()

        paper = CFPPaper(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            cfp_id=cfp.id,
            main_speaker_id=applicant.id,
            title="No Picture Paper",
            status=PaperStatus.DRAFT.value,
        )
        db_session.add(paper)
        await db_session.commit()

        resp = await client.post(
            f"{PORTAL_BASE}/papers/{paper.id}/submit",
            headers=auth_headers(applicant_token),
        )
        assert resp.status_code == 422
        missing = resp.json()["detail"]["missing_fields"]
        assert "speaker:picture" in missing

    @pytest.mark.asyncio
    async def test_submit_fails_when_video_required_but_missing(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        applicant: CFPApplicant,
        applicant_token: str,
        cfp: CallForPapers,
        tenant: Tenant,
    ) -> None:
        """Submit fails when CFP requires speaker video but none is uploaded."""
        cfp.required_speaker_fields = ["video"]
        await db_session.commit()

        paper = CFPPaper(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            cfp_id=cfp.id,
            main_speaker_id=applicant.id,
            title="No Video Paper",
            status=PaperStatus.DRAFT.value,
        )
        db_session.add(paper)
        await db_session.commit()

        resp = await client.post(
            f"{PORTAL_BASE}/papers/{paper.id}/submit",
            headers=auth_headers(applicant_token),
        )
        assert resp.status_code == 422
        missing = resp.json()["detail"]["missing_fields"]
        assert "speaker:video" in missing

    @pytest.mark.asyncio
    async def test_submit_succeeds_when_all_required_fields_present(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        applicant: CFPApplicant,
        applicant_token: str,
        cfp: CallForPapers,
        session_type: SessionType,
        tenant: Tenant,
    ) -> None:
        """Submit succeeds when all required fields are populated."""
        cfp.required_paper_fields = ["abstract_short", "level", "session_type"]
        cfp.required_speaker_fields = ["bio", "company"]
        await db_session.commit()

        paper = CFPPaper(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            cfp_id=cfp.id,
            main_speaker_id=applicant.id,
            title="Complete Paper",
            abstract_short="Good abstract",
            level="advanced",
            session_type_id=session_type.id,
            status=PaperStatus.DRAFT.value,
        )
        db_session.add(paper)
        await db_session.commit()

        resp = await client.post(
            f"{PORTAL_BASE}/papers/{paper.id}/submit",
            headers=auth_headers(applicant_token),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "submitted"
        assert resp.json()["submitted_at"] is not None


# ── TestCospeakerAccess ──────────────────────────────────────────────────


class TestCospeakerAccess:
    """Test that accepted cospeakers can view/update/submit papers but not manage cospeakers."""

    @pytest.mark.asyncio
    async def test_accepted_cospeaker_can_view_paper(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        applicant: CFPApplicant,
        second_applicant: CFPApplicant,
        second_applicant_token: str,
        cfp: CallForPapers,
        tenant: Tenant,
    ) -> None:
        """An accepted cospeaker can GET the paper and sees is_main_speaker=False."""
        paper = CFPPaper(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            cfp_id=cfp.id,
            main_speaker_id=applicant.id,
            title="Cospeaker View Paper",
            status=PaperStatus.DRAFT.value,
        )
        db_session.add(paper)
        await db_session.flush()

        cospeaker = CFPPaperCospeaker(
            paper_id=paper.id,
            applicant_id=second_applicant.id,
            sort_order=0,
            invitation_status=CospeakerInvitationStatus.ACCEPTED.value,
        )
        db_session.add(cospeaker)
        await db_session.commit()

        resp = await client.get(
            f"{PORTAL_BASE}/papers/{paper.id}",
            headers=auth_headers(second_applicant_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_main_speaker"] is False
        assert data["main_speaker_first_name"] == "Alice"
        assert data["main_speaker_last_name"] == "Deep"

    @pytest.mark.asyncio
    async def test_pending_cospeaker_cannot_view_paper(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        applicant: CFPApplicant,
        second_applicant: CFPApplicant,
        second_applicant_token: str,
        cfp: CallForPapers,
        tenant: Tenant,
    ) -> None:
        """A pending cospeaker cannot access the paper."""
        paper = CFPPaper(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            cfp_id=cfp.id,
            main_speaker_id=applicant.id,
            title="Pending Cospeaker Paper",
            status=PaperStatus.DRAFT.value,
        )
        db_session.add(paper)
        await db_session.flush()

        cospeaker = CFPPaperCospeaker(
            paper_id=paper.id,
            applicant_id=second_applicant.id,
            sort_order=0,
            invitation_status=CospeakerInvitationStatus.PENDING.value,
        )
        db_session.add(cospeaker)
        await db_session.commit()

        resp = await client.get(
            f"{PORTAL_BASE}/papers/{paper.id}",
            headers=auth_headers(second_applicant_token),
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_cospeaker_cannot_manage_cospeaker_emails(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        applicant: CFPApplicant,
        second_applicant: CFPApplicant,
        second_applicant_token: str,
        third_applicant: CFPApplicant,
        cfp: CallForPapers,
        tenant: Tenant,
    ) -> None:
        """An accepted cospeaker cannot modify the cospeaker list."""
        paper = CFPPaper(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            cfp_id=cfp.id,
            main_speaker_id=applicant.id,
            title="Co-manage Paper",
            status=PaperStatus.DRAFT.value,
        )
        db_session.add(paper)
        await db_session.flush()

        cospeaker = CFPPaperCospeaker(
            paper_id=paper.id,
            applicant_id=second_applicant.id,
            sort_order=0,
            invitation_status=CospeakerInvitationStatus.ACCEPTED.value,
        )
        db_session.add(cospeaker)
        await db_session.commit()

        resp = await client.put(
            f"{PORTAL_BASE}/papers/{paper.id}",
            json={"cospeaker_emails": [third_applicant.email]},
            headers=auth_headers(second_applicant_token),
        )
        assert resp.status_code == 403
        assert "main speaker" in resp.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_cospeaker_can_update_paper_fields(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        applicant: CFPApplicant,
        second_applicant: CFPApplicant,
        second_applicant_token: str,
        cfp: CallForPapers,
        tenant: Tenant,
    ) -> None:
        """An accepted cospeaker can update non-cospeaker fields."""
        paper = CFPPaper(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            cfp_id=cfp.id,
            main_speaker_id=applicant.id,
            title="Cospeaker Edit Paper",
            status=PaperStatus.DRAFT.value,
        )
        db_session.add(paper)
        await db_session.flush()

        cospeaker = CFPPaperCospeaker(
            paper_id=paper.id,
            applicant_id=second_applicant.id,
            sort_order=0,
            invitation_status=CospeakerInvitationStatus.ACCEPTED.value,
        )
        db_session.add(cospeaker)
        await db_session.commit()

        resp = await client.put(
            f"{PORTAL_BASE}/papers/{paper.id}",
            json={"title": "Updated By Cospeaker", "abstract_short": "New abstract by co"},
            headers=auth_headers(second_applicant_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "Updated By Cospeaker"
        assert data["abstract_short"] == "New abstract by co"


# ── TestCospeakerSync ────────────────────────────────────────────────────


class TestCospeakerSync:
    """Test cospeaker add/remove/update sync logic."""

    @pytest.mark.asyncio
    @patch("app.api.v1.cfp_portal.papers.send_cospeaker_invitation_email", new_callable=AsyncMock)
    async def test_remove_cospeaker_by_updating_list(
        self,
        mock_email: AsyncMock,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
        second_applicant: CFPApplicant,
        third_applicant: CFPApplicant,
        cfp: CallForPapers,
    ) -> None:
        """Removing a cospeaker from the list deletes the record."""
        # Create with two cospeakers
        create_resp = await client.post(
            f"{PORTAL_BASE}/papers",
            json={
                "cfp_id": str(cfp.id),
                "title": "Remove Cospeaker Paper",
                "cospeaker_emails": [second_applicant.email, third_applicant.email],
            },
            headers=auth_headers(applicant_token),
        )
        assert create_resp.status_code == 200
        paper_id = create_resp.json()["id"]
        assert len(create_resp.json()["cospeakers"]) == 2

        # Update: remove third_applicant, keep only second_applicant
        update_resp = await client.put(
            f"{PORTAL_BASE}/papers/{paper_id}",
            json={"cospeaker_emails": [second_applicant.email]},
            headers=auth_headers(applicant_token),
        )
        assert update_resp.status_code == 200
        cospeakers = update_resp.json()["cospeakers"]
        assert len(cospeakers) == 1
        assert cospeakers[0]["email"] == second_applicant.email

    @pytest.mark.asyncio
    @patch("app.api.v1.cfp_portal.papers.send_cospeaker_invitation_email", new_callable=AsyncMock)
    async def test_cospeaker_nonexistent_email_fails(
        self,
        mock_email: AsyncMock,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
        cfp: CallForPapers,
    ) -> None:
        """Adding a cospeaker with a non-existent email returns 400."""
        payload = {
            "cfp_id": str(cfp.id),
            "title": "Bad Email Paper",
            "cospeaker_emails": ["nonexistent@nowhere.example.com"],
        }
        resp = await client.post(
            f"{PORTAL_BASE}/papers",
            json=payload,
            headers=auth_headers(applicant_token),
        )
        assert resp.status_code == 400
        assert "no registered applicant" in resp.json()["detail"].lower()

    @pytest.mark.asyncio
    @patch("app.api.v1.cfp_portal.papers.send_cospeaker_invitation_email", new_callable=AsyncMock)
    async def test_existing_cospeaker_preserves_status_on_update(
        self,
        mock_email: AsyncMock,
        client: AsyncClient,
        db_session: AsyncSession,
        applicant: CFPApplicant,
        applicant_token: str,
        second_applicant: CFPApplicant,
        second_applicant_token: str,
        cfp: CallForPapers,
    ) -> None:
        """When cospeaker list is updated, existing cospeakers keep their invitation status."""
        # Create paper with cospeaker
        create_resp = await client.post(
            f"{PORTAL_BASE}/papers",
            json={
                "cfp_id": str(cfp.id),
                "title": "Preserve Status Paper",
                "cospeaker_emails": [second_applicant.email],
            },
            headers=auth_headers(applicant_token),
        )
        paper_id = create_resp.json()["id"]

        # Accept the invitation
        accept_resp = await client.post(
            f"{PORTAL_BASE}/invitations/{paper_id}/accept",
            headers=auth_headers(second_applicant_token),
        )
        assert accept_resp.status_code == 200

        # Update paper cospeakers - same email but should preserve accepted status
        update_resp = await client.put(
            f"{PORTAL_BASE}/papers/{paper_id}",
            json={"cospeaker_emails": [second_applicant.email]},
            headers=auth_headers(applicant_token),
        )
        assert update_resp.status_code == 200
        cospeakers = update_resp.json()["cospeakers"]
        assert len(cospeakers) == 1
        assert cospeakers[0]["invitation_status"] == "accepted"


# ── TestListPapersAsCospeaker ────────────────────────────────────────────


class TestListPapersAsCospeaker:
    """Test that list papers includes accepted cospeaker papers."""

    @pytest.mark.asyncio
    async def test_list_papers_includes_accepted_cospeaker_papers(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        applicant: CFPApplicant,
        second_applicant: CFPApplicant,
        second_applicant_token: str,
        cfp: CallForPapers,
        tenant: Tenant,
    ) -> None:
        """List papers returns papers where the user is an accepted cospeaker."""
        paper = CFPPaper(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            cfp_id=cfp.id,
            main_speaker_id=applicant.id,
            title="Cospeaker Listed Paper",
            status=PaperStatus.DRAFT.value,
        )
        db_session.add(paper)
        await db_session.flush()

        cospeaker = CFPPaperCospeaker(
            paper_id=paper.id,
            applicant_id=second_applicant.id,
            sort_order=0,
            invitation_status=CospeakerInvitationStatus.ACCEPTED.value,
        )
        db_session.add(cospeaker)
        await db_session.commit()

        resp = await client.get(
            f"{PORTAL_BASE}/papers",
            headers=auth_headers(second_applicant_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        titles = [p["title"] for p in data["items"]]
        assert "Cospeaker Listed Paper" in titles

    @pytest.mark.asyncio
    async def test_list_papers_excludes_declined_cospeaker_papers(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        applicant: CFPApplicant,
        second_applicant: CFPApplicant,
        second_applicant_token: str,
        cfp: CallForPapers,
        tenant: Tenant,
    ) -> None:
        """List papers does NOT include papers where cospeaker invitation was declined."""
        paper = CFPPaper(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            cfp_id=cfp.id,
            main_speaker_id=applicant.id,
            title="Declined Cospeaker Paper",
            status=PaperStatus.DRAFT.value,
        )
        db_session.add(paper)
        await db_session.flush()

        cospeaker = CFPPaperCospeaker(
            paper_id=paper.id,
            applicant_id=second_applicant.id,
            sort_order=0,
            invitation_status=CospeakerInvitationStatus.DECLINED.value,
        )
        db_session.add(cospeaker)
        await db_session.commit()

        resp = await client.get(
            f"{PORTAL_BASE}/papers",
            headers=auth_headers(second_applicant_token),
        )
        assert resp.status_code == 200
        titles = [p["title"] for p in resp.json()["items"]]
        assert "Declined Cospeaker Paper" not in titles


# ── TestAttachments ──────────────────────────────────────────────────────


class TestAttachments:
    """Test attachment upload/download endpoints."""

    @pytest.mark.asyncio
    async def test_upload_applicant_picture(
        self,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
    ) -> None:
        """Upload an applicant picture returns attachment info."""
        image_data = _make_test_image()
        resp = await client.post(
            f"{PORTAL_BASE}/attachments",
            data={
                "entity_type": "applicant_picture",
                "entity_id": str(applicant.id),
            },
            files={"file": ("photo.jpg", image_data, "image/jpeg")},
            headers=auth_headers(applicant_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "id" in data
        assert data["filename"] == "photo.jpg"
        assert data["file_size"] > 0

    @pytest.mark.asyncio
    async def test_download_attachment(
        self,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
    ) -> None:
        """Upload then download an attachment returns file content."""
        image_data = _make_test_image()
        upload_resp = await client.post(
            f"{PORTAL_BASE}/attachments",
            data={
                "entity_type": "applicant_picture",
                "entity_id": str(applicant.id),
            },
            files={"file": ("photo.jpg", image_data, "image/jpeg")},
            headers=auth_headers(applicant_token),
        )
        assert upload_resp.status_code == 200
        attachment_id = upload_resp.json()["id"]

        download_resp = await client.get(
            f"{PORTAL_BASE}/attachments/{attachment_id}/download",
            headers=auth_headers(applicant_token),
        )
        assert download_resp.status_code == 200
        assert download_resp.headers["content-type"] == "image/jpeg"
        assert len(download_resp.content) > 0

    @pytest.mark.asyncio
    async def test_upload_invalid_entity_type(
        self,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
    ) -> None:
        """Upload with invalid entity_type returns 400."""
        resp = await client.post(
            f"{PORTAL_BASE}/attachments",
            data={
                "entity_type": "invalid_type",
                "entity_id": str(applicant.id),
            },
            files={"file": ("file.txt", b"hello", "text/plain")},
            headers=auth_headers(applicant_token),
        )
        assert resp.status_code == 400
        assert "invalid entity_type" in resp.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_upload_to_other_applicant_profile_forbidden(
        self,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
        second_applicant: CFPApplicant,
    ) -> None:
        """Cannot upload a picture to another applicant's profile."""
        image_data = _make_test_image()
        resp = await client.post(
            f"{PORTAL_BASE}/attachments",
            data={
                "entity_type": "applicant_picture",
                "entity_id": str(second_applicant.id),
            },
            files={"file": ("photo.jpg", image_data, "image/jpeg")},
            headers=auth_headers(applicant_token),
        )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    @patch("app.api.v1.cfp_portal.papers.send_cospeaker_invitation_email", new_callable=AsyncMock)
    async def test_upload_paper_video_to_non_draft_fails(
        self,
        mock_email: AsyncMock,
        client: AsyncClient,
        db_session: AsyncSession,
        applicant: CFPApplicant,
        applicant_token: str,
        cfp: CallForPapers,
        tenant: Tenant,
    ) -> None:
        """Cannot upload paper video for a submitted paper."""
        paper = CFPPaper(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            cfp_id=cfp.id,
            main_speaker_id=applicant.id,
            title="Submitted Paper Video",
            status=PaperStatus.SUBMITTED.value,
        )
        db_session.add(paper)
        await db_session.commit()

        resp = await client.post(
            f"{PORTAL_BASE}/attachments",
            data={
                "entity_type": "paper_video",
                "entity_id": str(paper.id),
            },
            files={"file": ("video.mp4", b"\x00\x00\x00\x1cftypisom", "video/mp4")},
            headers=auth_headers(applicant_token),
        )
        assert resp.status_code == 400
        assert "draft" in resp.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_download_nonexistent_attachment(
        self,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
    ) -> None:
        """Downloading a non-existent attachment returns 404."""
        fake_id = str(uuid.uuid4())
        resp = await client.get(
            f"{PORTAL_BASE}/attachments/{fake_id}/download",
            headers=auth_headers(applicant_token),
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_upload_replaces_existing_attachment(
        self,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
    ) -> None:
        """Uploading a new picture replaces the existing one."""
        image_data = _make_test_image()
        # First upload
        resp1 = await client.post(
            f"{PORTAL_BASE}/attachments",
            data={
                "entity_type": "applicant_picture",
                "entity_id": str(applicant.id),
            },
            files={"file": ("photo1.jpg", image_data, "image/jpeg")},
            headers=auth_headers(applicant_token),
        )
        assert resp1.status_code == 200
        first_id = resp1.json()["id"]

        # Second upload replaces the first
        resp2 = await client.post(
            f"{PORTAL_BASE}/attachments",
            data={
                "entity_type": "applicant_picture",
                "entity_id": str(applicant.id),
            },
            files={"file": ("photo2.jpg", image_data, "image/jpeg")},
            headers=auth_headers(applicant_token),
        )
        assert resp2.status_code == 200
        second_id = resp2.json()["id"]
        assert first_id != second_id

        # Old attachment should be gone
        old_resp = await client.get(
            f"{PORTAL_BASE}/attachments/{first_id}/download",
            headers=auth_headers(applicant_token),
        )
        assert old_resp.status_code == 404


# ── TestAssignedPapersDeep ───────────────────────────────────────────────


class TestAssignedPapersDeep:
    """Deep coverage for assigned papers endpoint branches."""

    @pytest.mark.asyncio
    async def test_assigned_papers_with_conference_id_filter(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        cfp: CallForPapers,
        applicant: CFPApplicant,
        reviewer_applicant: CFPApplicant,
        reviewer_token: str,
        committee_member: CFPCommitteeMember,
    ) -> None:
        """Filter assigned papers by conference_id returns only matching papers."""
        paper = CFPPaper(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            cfp_id=cfp.id,
            main_speaker_id=applicant.id,
            title="Filtered Assigned Paper",
            status=PaperStatus.IN_EVALUATION.value,
        )
        db_session.add(paper)
        await db_session.flush()

        assignment = CFPPaperAssignment(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            paper_id=paper.id,
            committee_member_id=committee_member.id,
            is_anonymous=False,
        )
        db_session.add(assignment)
        await db_session.commit()

        # Filter with matching conference_id
        resp = await client.get(
            f"{PORTAL_BASE}/assigned-papers",
            params={"conference_id": str(conference.id)},
            headers=auth_headers(reviewer_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        assert data["items"][0]["conference_id"] == str(conference.id)

        # Filter with non-matching conference_id
        fake_conf_id = str(uuid.uuid4())
        resp2 = await client.get(
            f"{PORTAL_BASE}/assigned-papers",
            params={"conference_id": fake_conf_id},
            headers=auth_headers(reviewer_token),
        )
        assert resp2.status_code == 200
        assert resp2.json()["total"] == 0

    @pytest.mark.asyncio
    async def test_assigned_paper_with_session_type(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        cfp: CallForPapers,
        session_type: SessionType,
        applicant: CFPApplicant,
        reviewer_applicant: CFPApplicant,
        reviewer_token: str,
        committee_member: CFPCommitteeMember,
    ) -> None:
        """Assigned paper includes session_type_name in response."""
        paper = CFPPaper(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            cfp_id=cfp.id,
            main_speaker_id=applicant.id,
            title="Session Type Paper",
            session_type_id=session_type.id,
            status=PaperStatus.IN_EVALUATION.value,
        )
        db_session.add(paper)
        await db_session.flush()

        assignment = CFPPaperAssignment(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            paper_id=paper.id,
            committee_member_id=committee_member.id,
            is_anonymous=False,
        )
        db_session.add(assignment)
        await db_session.commit()

        resp = await client.get(
            f"{PORTAL_BASE}/assigned-papers/{paper.id}",
            headers=auth_headers(reviewer_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["session_type_name"] == "Workshop"

    @pytest.mark.asyncio
    async def test_cfp_level_anonymous_review_hides_speakers(
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
        """CFP-level is_anonymous_review hides speakers even if assignment is_anonymous=False."""
        cfp.is_anonymous_review = True
        await db_session.commit()

        paper = CFPPaper(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            cfp_id=cfp.id,
            main_speaker_id=applicant.id,
            title="CFP Anon Paper",
            status=PaperStatus.IN_EVALUATION.value,
        )
        db_session.add(paper)
        await db_session.flush()

        assignment = CFPPaperAssignment(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            paper_id=paper.id,
            committee_member_id=committee_member.id,
            is_anonymous=False,  # assignment is NOT anonymous, but CFP is
        )
        db_session.add(assignment)
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

    @pytest.mark.asyncio
    async def test_assigned_paper_with_cospeakers_non_anonymous(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        cfp: CallForPapers,
        applicant: CFPApplicant,
        second_applicant: CFPApplicant,
        reviewer_applicant: CFPApplicant,
        reviewer_token: str,
        committee_member: CFPCommitteeMember,
    ) -> None:
        """Non-anonymous assigned paper shows cospeaker details."""
        paper = CFPPaper(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            cfp_id=cfp.id,
            main_speaker_id=applicant.id,
            title="Paper With Cospeakers For Review",
            status=PaperStatus.IN_EVALUATION.value,
        )
        db_session.add(paper)
        await db_session.flush()

        cospeaker = CFPPaperCospeaker(
            paper_id=paper.id,
            applicant_id=second_applicant.id,
            sort_order=0,
            invitation_status=CospeakerInvitationStatus.ACCEPTED.value,
        )
        db_session.add(cospeaker)
        await db_session.flush()

        assignment = CFPPaperAssignment(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            paper_id=paper.id,
            committee_member_id=committee_member.id,
            is_anonymous=False,
        )
        db_session.add(assignment)
        await db_session.commit()

        resp = await client.get(
            f"{PORTAL_BASE}/assigned-papers/{paper.id}",
            headers=auth_headers(reviewer_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_anonymous"] is False
        assert data["main_speaker_first_name"] == "Alice"
        assert len(data["cospeakers"]) == 1
        assert data["cospeakers"][0]["first_name"] == "Bob"
        assert data["cospeakers"][0]["email"] == second_applicant.email

    @pytest.mark.asyncio
    async def test_pending_count_zero_when_review_submitted(
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
        """Pending count is zero when all assigned papers have submitted reviews."""
        paper = CFPPaper(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            cfp_id=cfp.id,
            main_speaker_id=applicant.id,
            title="Reviewed Paper",
            status=PaperStatus.IN_EVALUATION.value,
        )
        db_session.add(paper)
        await db_session.flush()

        assignment = CFPPaperAssignment(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            paper_id=paper.id,
            committee_member_id=committee_member.id,
            is_anonymous=False,
        )
        db_session.add(assignment)
        await db_session.flush()

        review = PaperReview(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            assignment_id=assignment.id,
            paper_id=paper.id,
            committee_member_id=committee_member.id,
            status=ReviewStatus.SUBMITTED.value,
            total_score=4.0,
        )
        db_session.add(review)
        await db_session.commit()

        resp = await client.get(
            f"{PORTAL_BASE}/assigned-papers/pending-count",
            headers=auth_headers(reviewer_token),
        )
        assert resp.status_code == 200
        assert resp.json()["pending_count"] == 0

    @pytest.mark.asyncio
    async def test_assigned_paper_status_masking(
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
        """Assigned paper masks accepted status as final_consideration when CFP is open."""
        paper = CFPPaper(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            cfp_id=cfp.id,
            main_speaker_id=applicant.id,
            title="Accepted For Review",
            status=PaperStatus.ACCEPTED.value,
        )
        db_session.add(paper)
        await db_session.flush()

        assignment = CFPPaperAssignment(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            paper_id=paper.id,
            committee_member_id=committee_member.id,
            is_anonymous=False,
        )
        db_session.add(assignment)
        await db_session.commit()

        resp = await client.get(
            f"{PORTAL_BASE}/assigned-papers/{paper.id}",
            headers=auth_headers(reviewer_token),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "final_consideration"

    @pytest.mark.asyncio
    async def test_assigned_paper_review_status_shown(
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
        """Assigned paper shows review_status when a review exists."""
        paper = CFPPaper(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            cfp_id=cfp.id,
            main_speaker_id=applicant.id,
            title="Reviewed Assignment Paper",
            status=PaperStatus.IN_EVALUATION.value,
        )
        db_session.add(paper)
        await db_session.flush()

        assignment = CFPPaperAssignment(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            paper_id=paper.id,
            committee_member_id=committee_member.id,
            is_anonymous=False,
        )
        db_session.add(assignment)
        await db_session.flush()

        review = PaperReview(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            assignment_id=assignment.id,
            paper_id=paper.id,
            committee_member_id=committee_member.id,
            status=ReviewStatus.DRAFT.value,
        )
        db_session.add(review)
        await db_session.commit()

        resp = await client.get(
            f"{PORTAL_BASE}/assigned-papers/{paper.id}",
            headers=auth_headers(reviewer_token),
        )
        assert resp.status_code == 200
        assert resp.json()["review_status"] == "draft"


# ── TestConferenceDetailWithSessionTypes ─────────────────────────────────


class TestConferenceDetailWithSessionTypes:
    """Test conference detail endpoint with session types."""

    @pytest.mark.asyncio
    async def test_conference_detail_includes_cfp_eligible_session_types(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        applicant: CFPApplicant,
        applicant_token: str,
        conference: Conference,
        cfp: CallForPapers,
        session_type: SessionType,
        tenant: Tenant,
    ) -> None:
        """Conference detail returns only active, cfp_eligible session types."""
        # Add an inactive session type (should NOT appear)
        inactive_st = SessionType(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            name="Inactive Talk",
            slug="inactive",
            duration_minutes=30,
            cfp_eligible=True,
            is_active=False,
        )
        db_session.add(inactive_st)

        # Add a non-cfp-eligible session type (should NOT appear)
        non_cfp_st = SessionType(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            name="Internal Only",
            slug="internal",
            duration_minutes=60,
            cfp_eligible=False,
            is_active=True,
        )
        db_session.add(non_cfp_st)
        await db_session.commit()

        resp = await client.get(
            f"{PORTAL_BASE}/conferences/{conference.id}",
            headers=auth_headers(applicant_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        st_names = [st["name"] for st in data["session_types"]]
        assert "Workshop" in st_names
        assert "Inactive Talk" not in st_names
        assert "Internal Only" not in st_names
        # Verify session type structure
        workshop = next(st for st in data["session_types"] if st["name"] == "Workshop")
        assert workshop["duration_minutes"] == 90


# ── TestInvitationListDetail ─────────────────────────────────────────────


class TestInvitationListDetail:
    """Test invitation list includes all enriched fields."""

    @pytest.mark.asyncio
    @patch("app.api.v1.cfp_portal.papers.send_cospeaker_invitation_email", new_callable=AsyncMock)
    async def test_invitation_includes_cfp_and_conference_info(
        self,
        mock_email: AsyncMock,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
        second_applicant: CFPApplicant,
        second_applicant_token: str,
        cfp: CallForPapers,
        conference: Conference,
    ) -> None:
        """Invitation list items include cfp_title, conference_name, and speaker details."""
        create_resp = await client.post(
            f"{PORTAL_BASE}/papers",
            json={
                "cfp_id": str(cfp.id),
                "title": "Enriched Invitation Paper",
                "cospeaker_emails": [second_applicant.email],
            },
            headers=auth_headers(applicant_token),
        )
        assert create_resp.status_code == 200

        inv_resp = await client.get(
            f"{PORTAL_BASE}/invitations",
            headers=auth_headers(second_applicant_token),
        )
        assert inv_resp.status_code == 200
        data = inv_resp.json()
        assert data["total"] >= 1
        inv = data["items"][0]
        assert inv["paper_title"] == "Enriched Invitation Paper"
        assert inv["cfp_title"] == "Deep CFP 2026"
        assert inv["conference_name"] == "TestConf 2026"
        assert inv["main_speaker_first_name"] == "Alice"
        assert inv["main_speaker_last_name"] == "Deep"
        assert inv["main_speaker_email"] == applicant.email
        assert inv["invitation_status"] == "pending"
        assert inv["invited_at"] is not None


# ── TestDeleteOwnershipRestriction ───────────────────────────────────────


class TestDeleteOwnershipRestriction:
    """Test that only the main speaker can delete a paper."""

    @pytest.mark.asyncio
    async def test_cospeaker_cannot_delete_paper(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        applicant: CFPApplicant,
        second_applicant: CFPApplicant,
        second_applicant_token: str,
        cfp: CallForPapers,
        tenant: Tenant,
    ) -> None:
        """An accepted cospeaker cannot delete a paper (delete uses _get_applicant_paper, main only)."""
        paper = CFPPaper(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            cfp_id=cfp.id,
            main_speaker_id=applicant.id,
            title="Cospeaker No Delete",
            status=PaperStatus.DRAFT.value,
        )
        db_session.add(paper)
        await db_session.flush()

        cospeaker = CFPPaperCospeaker(
            paper_id=paper.id,
            applicant_id=second_applicant.id,
            sort_order=0,
            invitation_status=CospeakerInvitationStatus.ACCEPTED.value,
        )
        db_session.add(cospeaker)
        await db_session.commit()

        resp = await client.delete(
            f"{PORTAL_BASE}/papers/{paper.id}",
            headers=auth_headers(second_applicant_token),
        )
        # Delete uses _get_applicant_paper (main speaker only), so cospeaker gets 404
        assert resp.status_code == 404


# ── TestConferenceListNoCFPs ─────────────────────────────────────────────


class TestConferenceListNoCFPs:
    """Test conference listing when no CFPs are attached."""

    @pytest.mark.asyncio
    async def test_conference_list_with_no_cfps_attached(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        applicant: CFPApplicant,
        applicant_token: str,
        tenant: Tenant,
    ) -> None:
        """Conference without CFPs returns empty cfps list."""
        # Create a conference without any CFP association
        conf = Conference(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            name="No CFP Conference",
            abbreviation="NOCFP",
            is_active=True,
        )
        db_session.add(conf)
        await db_session.commit()

        resp = await client.get(
            f"{PORTAL_BASE}/conferences",
            headers=auth_headers(applicant_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        nocfp_conf = next((c for c in data if c["name"] == "No CFP Conference"), None)
        assert nocfp_conf is not None
        assert nocfp_conf["cfps"] == []
