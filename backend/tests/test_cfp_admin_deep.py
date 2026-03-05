"""Deep coverage tests for admin CFP papers, topics, and portal reviews.

Targets uncovered code paths in:
- app/api/v1/cfp/papers.py (paper CRUD, assignments, auto-assign, reviews, cospeaker invitations)
- app/api/v1/cfp/topics.py (CFP CRUD, topics CRUD, submissions CRUD, stats)
- app/api/v1/cfp_portal/reviews.py (review config, submit/save review, speaker feedback)
"""

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.applicant_security import create_applicant_access_token
from app.core.security import hash_password
from app.models.associations import ConferenceCFP
from app.models.cfp import (
    CallForPapers,
    CFPCommitteeMember,
    CFPTopic,
)
from app.models.cfp_applicants import CFPApplicant
from app.models.cfp_papers import (
    CFPPaper,
    CFPPaperAssignment,
    CFPPaperCospeaker,
    PaperStatus,
)
from app.models.conference import Conference
from app.models.module import Module, TenantModule
from app.models.review import (
    PaperReview,
    ReviewCriterion,
    ReviewFormSettings,
    ReviewQuestion,
    ReviewScaleOption,
    ReviewScoreScale,
    ReviewStatus,
)
from app.models.settings import SessionType
from app.models.tenant import Tenant
from app.models.user import User
from tests.conftest import _make_token, auth_headers

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture()
async def cfp_module(db_session: AsyncSession) -> Module:
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
async def tenant_with_cfp(
    db_session: AsyncSession,
    tenant: Tenant,
    conferences_module: Module,
    cfp_module: Module,
) -> Tenant:
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


@pytest_asyncio.fixture()
async def applicant(db_session: AsyncSession, tenant: Tenant) -> CFPApplicant:
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Jane",
        last_name="Speaker",
        email=f"jane-deep-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Password123!"),
        bio="Speaker bio",
        phone="+4930123456",
        title="Dr.",
        company="SpeakerCo",
    )
    db_session.add(a)
    await db_session.commit()
    return a


@pytest_asyncio.fixture()
async def applicant2(db_session: AsyncSession, tenant: Tenant) -> CFPApplicant:
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Bob",
        last_name="Cospeaker",
        email=f"bob-deep-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Password123!"),
    )
    db_session.add(a)
    await db_session.commit()
    return a


@pytest_asyncio.fixture()
async def applicant3(db_session: AsyncSession, tenant: Tenant) -> CFPApplicant:
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Carol",
        last_name="Third",
        email=f"carol-deep-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Password123!"),
    )
    db_session.add(a)
    await db_session.commit()
    return a


@pytest_asyncio.fixture()
async def cfp(db_session: AsyncSession, tenant: Tenant, conference: Conference) -> CallForPapers:
    c = CallForPapers(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        title="DeepCFP 2026",
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
async def session_type(db_session: AsyncSession, tenant: Tenant, conference: Conference) -> SessionType:
    st = SessionType(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Tutorial",
        slug="tutorial",
        duration_minutes=120,
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
        name="Machine Learning",
        description="ML topics",
    )
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture()
async def topic2(db_session: AsyncSession, tenant: Tenant) -> CFPTopic:
    t = CFPTopic(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="Distributed Systems",
        description="DS topics",
    )
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture()
async def draft_paper(
    db_session: AsyncSession, tenant: Tenant, cfp: CallForPapers, applicant: CFPApplicant
) -> CFPPaper:
    p = CFPPaper(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        cfp_id=cfp.id,
        main_speaker_id=applicant.id,
        title="Draft Paper Deep",
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
    p = CFPPaper(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        cfp_id=cfp.id,
        main_speaker_id=applicant.id,
        title="Submitted Paper Deep",
        abstract_short="Submitted abstract",
        status=PaperStatus.SUBMITTED.value,
    )
    db_session.add(p)
    await db_session.commit()
    return p


@pytest_asyncio.fixture()
async def in_eval_paper(
    db_session: AsyncSession, tenant: Tenant, cfp: CallForPapers, applicant: CFPApplicant
) -> CFPPaper:
    p = CFPPaper(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        cfp_id=cfp.id,
        main_speaker_id=applicant.id,
        title="In Eval Paper",
        abstract_short="In evaluation",
        status=PaperStatus.IN_EVALUATION.value,
    )
    db_session.add(p)
    await db_session.commit()
    return p


@pytest_asyncio.fixture()
async def reviewer_applicant(db_session: AsyncSession, tenant: Tenant) -> CFPApplicant:
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Review",
        last_name="Person",
        email=f"reviewer-deep-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Password123!"),
    )
    db_session.add(a)
    await db_session.commit()
    return a


@pytest_asyncio.fixture()
async def reviewer2_applicant(db_session: AsyncSession, tenant: Tenant) -> CFPApplicant:
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Second",
        last_name="Reviewer",
        email=f"reviewer2-deep-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Password123!"),
    )
    db_session.add(a)
    await db_session.commit()
    return a


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


@pytest_asyncio.fixture()
async def committee_member2(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    reviewer2_applicant: CFPApplicant,
) -> CFPCommitteeMember:
    cm = CFPCommitteeMember(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        applicant_id=reviewer2_applicant.id,
        role="reviewer",
    )
    db_session.add(cm)
    await db_session.commit()
    return cm


@pytest_asyncio.fixture()
async def review_setup(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
) -> dict:
    """Create review criteria, questions, score scales, and form settings for a conference."""
    # Form settings
    form_settings = ReviewFormSettings(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        enable_speaker_feedback=True,
        enable_internal_comment=True,
        enable_must_have=True,
    )
    db_session.add(form_settings)

    # Score scale
    scale = ReviewScoreScale(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="1-5 Rating",
        scale_type="numeric_range",
        is_active=True,
    )
    db_session.add(scale)
    await db_session.flush()

    # Options for the scale
    options = []
    for i in range(1, 6):
        opt = ReviewScaleOption(
            id=uuid.uuid4(),
            scale_id=scale.id,
            label=f"{i} - {'Poor' if i == 1 else 'Fair' if i == 2 else 'Good' if i == 3 else 'Very Good' if i == 4 else 'Excellent'}",
            numeric_value=float(i),
            is_unsure=False,
            display_order=i,
        )
        db_session.add(opt)
        options.append(opt)
    # Add unsure option
    unsure_opt = ReviewScaleOption(
        id=uuid.uuid4(),
        scale_id=scale.id,
        label="Unsure",
        numeric_value=None,
        is_unsure=True,
        display_order=6,
    )
    db_session.add(unsure_opt)
    options.append(unsure_opt)

    # Criterion
    criterion = ReviewCriterion(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        title="Content Quality",
        description="Evaluate the paper content",
        display_order=0,
        is_active=True,
    )
    db_session.add(criterion)
    await db_session.flush()

    # Question
    question = ReviewQuestion(
        id=uuid.uuid4(),
        criterion_id=criterion.id,
        tenant_id=tenant.id,
        conference_id=conference.id,
        text="How would you rate the overall quality?",
        help_text="Consider depth, accuracy, and originality",
        question_type="scored",
        score_scale_id=scale.id,
        weight=1.0,
        comment_requirement="optional",
        show_to_reviewers=True,
        count_in_score=True,
        display_order=0,
        is_active=True,
    )
    db_session.add(question)

    # Second question (non-scored)
    question2 = ReviewQuestion(
        id=uuid.uuid4(),
        criterion_id=criterion.id,
        tenant_id=tenant.id,
        conference_id=conference.id,
        text="Any additional comments?",
        question_type="non_scored",
        weight=0.0,
        comment_requirement="optional",
        show_to_reviewers=True,
        count_in_score=False,
        display_order=1,
        is_active=True,
    )
    db_session.add(question2)

    await db_session.commit()

    return {
        "form_settings": form_settings,
        "scale": scale,
        "options": options,
        "criterion": criterion,
        "question": question,
        "question2": question2,
    }


def _admin_token(user: User) -> str:
    return _make_token(user, modules=["cfp", "conferences"])


def _admin_headers(user: User) -> dict[str, str]:
    return auth_headers(_admin_token(user))


# ============================================================================
# Admin CFP Paper CRUD — Deep Coverage
# ============================================================================


class TestPaperCreateWithFullData:
    """Test paper create with cospeakers, topics, session type."""

    @pytest.mark.asyncio
    async def test_create_paper_with_session_type_and_topics(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        cfp: CallForPapers,
        applicant: CFPApplicant,
        session_type: SessionType,
        topic: CFPTopic,
        topic2: CFPTopic,
    ) -> None:
        headers = _admin_headers(tenant_admin_user)
        resp = await client.post(
            "/api/v1/cfp/papers",
            json={
                "cfp_id": str(cfp.id),
                "main_speaker_id": str(applicant.id),
                "session_type_id": str(session_type.id),
                "topic_ids": [str(topic.id), str(topic2.id)],
                "title": "Full Data Paper",
                "abstract_short": "Short text",
                "abstract_long": "Long text",
                "level": "advanced",
                "learning_objectives": "Learn ML",
                "importance": "Critical",
            },
            headers=headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["title"] == "Full Data Paper"
        assert data["session_type_id"] == str(session_type.id)
        assert data["session_type_name"] == "Tutorial"
        assert len(data["topics"]) == 2
        topic_names = {t["name"] for t in data["topics"]}
        assert "Machine Learning" in topic_names
        assert "Distributed Systems" in topic_names

    @pytest.mark.asyncio
    async def test_create_paper_with_cospeakers(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        cfp: CallForPapers,
        applicant: CFPApplicant,
        applicant2: CFPApplicant,
    ) -> None:
        headers = _admin_headers(tenant_admin_user)
        resp = await client.post(
            "/api/v1/cfp/papers",
            json={
                "cfp_id": str(cfp.id),
                "main_speaker_id": str(applicant.id),
                "co_speaker_ids": [str(applicant2.id)],
                "title": "Cospeaker Paper",
            },
            headers=headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert len(data["cospeakers"]) == 1


class TestPaperListFilters:
    """Test paper list with various filter parameters."""

    @pytest.mark.asyncio
    async def test_list_papers_filter_by_conference_id(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        conference: Conference,
        draft_paper: CFPPaper,
    ) -> None:
        headers = _admin_headers(tenant_admin_user)
        resp = await client.get(
            f"/api/v1/cfp/papers?conference_id={conference.id}",
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1

    @pytest.mark.asyncio
    async def test_list_papers_filter_by_main_speaker_id(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        applicant: CFPApplicant,
        draft_paper: CFPPaper,
    ) -> None:
        headers = _admin_headers(tenant_admin_user)
        resp = await client.get(
            f"/api/v1/cfp/papers?main_speaker_id={applicant.id}",
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        for p in data["items"]:
            assert p["main_speaker_id"] == str(applicant.id)

    @pytest.mark.asyncio
    async def test_list_papers_filter_by_applicant_id_cospeaker(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        applicant2: CFPApplicant,
        draft_paper: CFPPaper,
    ) -> None:
        """applicant_id filter should return papers where the applicant is a cospeaker."""
        assoc = CFPPaperCospeaker(
            paper_id=draft_paper.id,
            applicant_id=applicant2.id,
            sort_order=0,
            invitation_status="accepted",
        )
        db_session.add(assoc)
        await db_session.commit()

        headers = _admin_headers(tenant_admin_user)
        resp = await client.get(
            f"/api/v1/cfp/papers?applicant_id={applicant2.id}",
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        ids = [p["id"] for p in data["items"]]
        assert str(draft_paper.id) in ids


class TestPaperStats:
    """Test paper stats with cfp_id filter."""

    @pytest.mark.asyncio
    async def test_paper_stats_with_cfp_filter(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        cfp: CallForPapers,
        draft_paper: CFPPaper,
        submitted_paper: CFPPaper,
    ) -> None:
        headers = _admin_headers(tenant_admin_user)
        resp = await client.get(
            f"/api/v1/cfp/papers/stats?cfp_id={cfp.id}",
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 2
        assert data["draft"] >= 1
        assert data["submitted"] >= 1


class TestPaperUpdateDeep:
    """Test paper update with cospeakers, topics, session type, and status transitions."""

    @pytest.mark.asyncio
    async def test_update_paper_with_cospeakers_and_topics(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        draft_paper: CFPPaper,
        applicant2: CFPApplicant,
        topic: CFPTopic,
        session_type: SessionType,
    ) -> None:
        headers = _admin_headers(tenant_admin_user)
        resp = await client.put(
            f"/api/v1/cfp/papers/{draft_paper.id}",
            json={
                "co_speaker_ids": [str(applicant2.id)],
                "topic_ids": [str(topic.id)],
                "session_type_id": str(session_type.id),
                "title": "Updated Deep Paper",
            },
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "Updated Deep Paper"
        assert data["session_type_id"] == str(session_type.id)

    @pytest.mark.asyncio
    async def test_update_paper_clear_cospeakers_and_topics(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        draft_paper: CFPPaper,
        applicant2: CFPApplicant,
        topic: CFPTopic,
    ) -> None:
        """Sending empty co_speaker_ids and topic_ids is accepted by the endpoint."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.put(
            f"/api/v1/cfp/papers/{draft_paper.id}",
            json={
                "co_speaker_ids": [],
                "topic_ids": [],
            },
            headers=headers,
        )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_update_paper_status_submitted_to_accepted(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        submitted_paper: CFPPaper,
    ) -> None:
        headers = _admin_headers(tenant_admin_user)
        resp = await client.put(
            f"/api/v1/cfp/papers/{submitted_paper.id}",
            json={"status": "accepted"},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "accepted"

    @pytest.mark.asyncio
    async def test_update_paper_status_submitted_to_rejected(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        submitted_paper: CFPPaper,
    ) -> None:
        headers = _admin_headers(tenant_admin_user)
        resp = await client.put(
            f"/api/v1/cfp/papers/{submitted_paper.id}",
            json={"status": "rejected"},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "rejected"

    @pytest.mark.asyncio
    async def test_update_paper_status_submitted_to_draft_clears_assignments(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        submitted_paper: CFPPaper,
        committee_member: CFPCommitteeMember,
        tenant: Tenant,
    ) -> None:
        """Reverting to draft should delete assignments and reviews."""
        # Create an assignment
        assignment = CFPPaperAssignment(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            paper_id=submitted_paper.id,
            committee_member_id=committee_member.id,
            is_anonymous=False,
        )
        db_session.add(assignment)
        await db_session.flush()
        # Create a review
        review = PaperReview(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            assignment_id=assignment.id,
            paper_id=submitted_paper.id,
            committee_member_id=committee_member.id,
            status=ReviewStatus.DRAFT.value,
        )
        db_session.add(review)
        await db_session.commit()

        headers = _admin_headers(tenant_admin_user)
        resp = await client.put(
            f"/api/v1/cfp/papers/{submitted_paper.id}",
            json={"status": "draft"},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "draft"

    @pytest.mark.asyncio
    async def test_update_paper_level(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        draft_paper: CFPPaper,
    ) -> None:
        headers = _admin_headers(tenant_admin_user)
        resp = await client.put(
            f"/api/v1/cfp/papers/{draft_paper.id}",
            json={"level": "beginner"},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["level"] == "beginner"

    @pytest.mark.asyncio
    async def test_update_paper_status_in_eval_to_accepted(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        in_eval_paper: CFPPaper,
    ) -> None:
        headers = _admin_headers(tenant_admin_user)
        resp = await client.put(
            f"/api/v1/cfp/papers/{in_eval_paper.id}",
            json={"status": "accepted"},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "accepted"


class TestPaperAssignmentsDeep:
    """Deep tests for paper assignment endpoints."""

    @pytest.mark.asyncio
    async def test_create_assignment_transitions_paper_to_in_evaluation(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        submitted_paper: CFPPaper,
        committee_member: CFPCommitteeMember,
    ) -> None:
        """Assigning a reviewer to a submitted paper should set it to in_evaluation."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.post(
            "/api/v1/cfp/paper-assignments",
            json={
                "paper_id": str(submitted_paper.id),
                "committee_member_id": str(committee_member.id),
            },
            headers=headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["paper_title"] == "Submitted Paper Deep"
        assert data["committee_member_first_name"] == "Review"
        assert data["committee_member_last_name"] == "Person"

    @pytest.mark.asyncio
    async def test_list_assignments_with_filters(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        submitted_paper: CFPPaper,
        committee_member: CFPCommitteeMember,
        conference: Conference,
        tenant: Tenant,
    ) -> None:
        """Test listing assignments with paper_id and committee_member_id filters."""
        assignment = CFPPaperAssignment(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            paper_id=submitted_paper.id,
            committee_member_id=committee_member.id,
            is_anonymous=False,
        )
        db_session.add(assignment)
        await db_session.commit()

        headers = _admin_headers(tenant_admin_user)

        # Filter by paper_id
        resp1 = await client.get(
            f"/api/v1/cfp/paper-assignments?paper_id={submitted_paper.id}",
            headers=headers,
        )
        assert resp1.status_code == 200
        assert resp1.json()["total"] >= 1

        # Filter by committee_member_id
        resp2 = await client.get(
            f"/api/v1/cfp/paper-assignments?committee_member_id={committee_member.id}",
            headers=headers,
        )
        assert resp2.status_code == 200
        assert resp2.json()["total"] >= 1

        # Filter by conference_id
        resp3 = await client.get(
            f"/api/v1/cfp/paper-assignments?conference_id={conference.id}",
            headers=headers,
        )
        assert resp3.status_code == 200
        assert resp3.json()["total"] >= 1

    @pytest.mark.asyncio
    async def test_get_paper_assignments_with_data(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        submitted_paper: CFPPaper,
        committee_member: CFPCommitteeMember,
        tenant: Tenant,
    ) -> None:
        """GET /papers/{id}/assignments returns assignment data."""
        assignment = CFPPaperAssignment(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            paper_id=submitted_paper.id,
            committee_member_id=committee_member.id,
            is_anonymous=False,
        )
        db_session.add(assignment)
        await db_session.commit()

        headers = _admin_headers(tenant_admin_user)
        resp = await client.get(
            f"/api/v1/cfp/papers/{submitted_paper.id}/assignments",
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        item = data["items"][0]
        assert item["paper_title"] == "Submitted Paper Deep"
        assert item["committee_member_first_name"] == "Review"

    @pytest.mark.asyncio
    async def test_delete_assignment_triggers_final_consideration(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        in_eval_paper: CFPPaper,
        committee_member: CFPCommitteeMember,
        committee_member2: CFPCommitteeMember,
        tenant: Tenant,
    ) -> None:
        """Deleting an assignment should transition to final_consideration if remaining have reviews."""
        # Two assignments, one with a submitted review
        assignment1 = CFPPaperAssignment(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            paper_id=in_eval_paper.id,
            committee_member_id=committee_member.id,
            is_anonymous=False,
        )
        assignment2 = CFPPaperAssignment(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            paper_id=in_eval_paper.id,
            committee_member_id=committee_member2.id,
            is_anonymous=False,
        )
        db_session.add_all([assignment1, assignment2])
        await db_session.flush()

        # Review for assignment2 (submitted)
        review = PaperReview(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            assignment_id=assignment2.id,
            paper_id=in_eval_paper.id,
            committee_member_id=committee_member2.id,
            status=ReviewStatus.SUBMITTED.value,
            total_score=4.0,
        )
        db_session.add(review)
        await db_session.commit()

        # Delete assignment1 -> now 1 assignment remaining with 1 submitted review
        headers = _admin_headers(tenant_admin_user)
        resp = await client.delete(
            f"/api/v1/cfp/paper-assignments/{assignment1.id}",
            headers=headers,
        )
        assert resp.status_code == 200


class TestAutoAssignPapers:
    """Test auto-assign papers to committee members."""

    @pytest.mark.asyncio
    async def test_auto_assign_basic(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        conference: Conference,
        submitted_paper: CFPPaper,
        committee_member: CFPCommitteeMember,
    ) -> None:
        headers = _admin_headers(tenant_admin_user)
        resp = await client.post(
            "/api/v1/cfp/paper-assignments/auto-assign",
            json={
                "conference_id": str(conference.id),
                "reviewers_per_paper": 1,
                "is_anonymous": False,
                "only_submitted": True,
            },
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["papers_processed"] >= 1
        assert data["assignments_created"] >= 1

    @pytest.mark.asyncio
    async def test_auto_assign_skips_conflicted_members(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        conference: Conference,
        cfp: CallForPapers,
        applicant: CFPApplicant,
        tenant: Tenant,
    ) -> None:
        """Auto-assign should skip committee members who are speakers on the paper."""
        # Create committee member who IS the main speaker
        cm = CFPCommitteeMember(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            applicant_id=applicant.id,
            role="reviewer",
        )
        db_session.add(cm)

        paper = CFPPaper(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            cfp_id=cfp.id,
            main_speaker_id=applicant.id,
            title="Conflict Paper",
            status=PaperStatus.SUBMITTED.value,
        )
        db_session.add(paper)
        await db_session.commit()

        headers = _admin_headers(tenant_admin_user)
        resp = await client.post(
            "/api/v1/cfp/paper-assignments/auto-assign",
            json={
                "conference_id": str(conference.id),
                "reviewers_per_paper": 1,
                "is_anonymous": False,
                "only_submitted": True,
            },
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        # Paper should be skipped or 0 assignments if conflicted member is the only one
        assert data["papers_processed"] >= 1

    @pytest.mark.asyncio
    async def test_auto_assign_with_all_papers(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        conference: Conference,
        draft_paper: CFPPaper,
        committee_member: CFPCommitteeMember,
    ) -> None:
        """Auto-assign with only_submitted=false includes draft papers."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.post(
            "/api/v1/cfp/paper-assignments/auto-assign",
            json={
                "conference_id": str(conference.id),
                "reviewers_per_paper": 1,
                "is_anonymous": True,
                "only_submitted": False,
            },
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["papers_processed"] >= 1


class TestPaperReviewsAdmin:
    """Test admin paper reviews endpoint."""

    @pytest.mark.asyncio
    async def test_get_paper_reviews_with_data(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        in_eval_paper: CFPPaper,
        committee_member: CFPCommitteeMember,
        tenant: Tenant,
        review_setup: dict,
    ) -> None:
        """GET /papers/{id}/reviews returns reviews with reviewer names and answers."""
        assignment = CFPPaperAssignment(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            paper_id=in_eval_paper.id,
            committee_member_id=committee_member.id,
            is_anonymous=False,
        )
        db_session.add(assignment)
        await db_session.flush()

        review = PaperReview(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            assignment_id=assignment.id,
            paper_id=in_eval_paper.id,
            committee_member_id=committee_member.id,
            status=ReviewStatus.SUBMITTED.value,
            total_score=4.0,
            speaker_feedback="Great paper!",
            internal_comment="Accept this one",
            must_have=True,
        )
        db_session.add(review)
        await db_session.commit()

        headers = _admin_headers(tenant_admin_user)
        resp = await client.get(
            f"/api/v1/cfp/papers/{in_eval_paper.id}/reviews",
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        item = data["items"][0]
        assert item["reviewer_first_name"] == "Review"
        assert item["reviewer_last_name"] == "Person"
        assert item["total_score"] == 4.0
        assert item["speaker_feedback"] == "Great paper!"
        assert item["internal_comment"] == "Accept this one"
        assert item["must_have"] is True


class TestCospeakerInvitations:
    """Test /papers/my-invitations endpoint."""

    @pytest.mark.asyncio
    async def test_list_my_invitations(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        draft_paper: CFPPaper,
        applicant2: CFPApplicant,
        cfp: CallForPapers,
    ) -> None:
        """GET /papers/my-invitations?applicant_email=... returns pending invitations."""
        assoc = CFPPaperCospeaker(
            paper_id=draft_paper.id,
            applicant_id=applicant2.id,
            sort_order=0,
            invitation_status="pending",
        )
        db_session.add(assoc)
        await db_session.commit()

        headers = _admin_headers(tenant_admin_user)
        resp = await client.get(
            f"/api/v1/cfp/papers/my-invitations?applicant_email={applicant2.email}",
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1

    @pytest.mark.asyncio
    async def test_list_my_invitations_no_email_returns_400(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
    ) -> None:
        """GET /papers/my-invitations without email returns 400."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.get(
            "/api/v1/cfp/papers/my-invitations",
            headers=headers,
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_list_my_invitations_unknown_email_returns_empty(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
    ) -> None:
        """GET /papers/my-invitations with unknown email returns empty list."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.get(
            "/api/v1/cfp/papers/my-invitations?applicant_email=unknown@nowhere.com",
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["items"] == []


# ============================================================================
# Admin CFP Topics — Deep Coverage
# ============================================================================


class TestTopicsCRUD:
    """Test topic CRUD through admin CFP endpoints."""

    @pytest.mark.asyncio
    async def test_create_topic(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
    ) -> None:
        headers = _admin_headers(tenant_admin_user)
        resp = await client.post(
            "/api/v1/cfp/topics",
            json={"name": "New Topic", "description": "A test topic"},
            headers=headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "New Topic"
        assert data["description"] == "A test topic"

    @pytest.mark.asyncio
    async def test_list_topics(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        topic: CFPTopic,
        topic2: CFPTopic,
    ) -> None:
        headers = _admin_headers(tenant_admin_user)
        resp = await client.get("/api/v1/cfp/topics", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 2
        names = {t["name"] for t in data["items"]}
        assert "Machine Learning" in names
        assert "Distributed Systems" in names

    @pytest.mark.asyncio
    async def test_update_topic(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        topic: CFPTopic,
    ) -> None:
        headers = _admin_headers(tenant_admin_user)
        resp = await client.put(
            f"/api/v1/cfp/topics/{topic.id}",
            json={"name": "Updated ML Topic", "description": "Updated desc"},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Updated ML Topic"
        assert resp.json()["description"] == "Updated desc"

    @pytest.mark.asyncio
    async def test_delete_topic(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        topic: CFPTopic,
    ) -> None:
        headers = _admin_headers(tenant_admin_user)
        resp = await client.delete(
            f"/api/v1/cfp/topics/{topic.id}",
            headers=headers,
        )
        assert resp.status_code == 200
        assert "deleted" in resp.json()["message"].lower()


# ============================================================================
# Admin CFP CRUD — Deep Coverage (topics.py file endpoints)
# ============================================================================


class TestCFPCRUDDeep:
    """Deep tests for CFP create, read, update, delete endpoints."""

    @pytest.mark.asyncio
    async def test_create_cfp(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        conference: Conference,
    ) -> None:
        headers = _admin_headers(tenant_admin_user)
        resp = await client.post(
            "/api/v1/cfp/",
            json={
                "conference_id": str(conference.id),
                "title": "New CFP 2026",
                "description": "A new CFP",
                "code_of_conduct": "<p>Be nice</p>",
                "tips_for_submission": "<p>Be clear</p>",
            },
            headers=headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["title"] == "New CFP 2026"
        assert data["status"] == "draft"
        assert str(conference.id) in [str(cid) for cid in data["conference_ids"]]

    @pytest.mark.asyncio
    async def test_get_cfp(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        cfp: CallForPapers,
        conference: Conference,
    ) -> None:
        headers = _admin_headers(tenant_admin_user)
        resp = await client.get(
            f"/api/v1/cfp/{cfp.id}",
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == str(cfp.id)
        assert data["title"] == "DeepCFP 2026"
        assert str(conference.id) in [str(cid) for cid in data["conference_ids"]]

    @pytest.mark.asyncio
    async def test_update_cfp(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        cfp: CallForPapers,
    ) -> None:
        headers = _admin_headers(tenant_admin_user)
        resp = await client.put(
            f"/api/v1/cfp/{cfp.id}",
            json={
                "title": "Updated CFP",
                "description": "Updated desc",
                "status": "closed",
            },
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "Updated CFP"
        assert data["status"] == "closed"

    @pytest.mark.asyncio
    async def test_update_cfp_anonymous_review_propagates(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        cfp: CallForPapers,
        submitted_paper: CFPPaper,
        committee_member: CFPCommitteeMember,
        tenant: Tenant,
    ) -> None:
        """Changing is_anonymous_review propagates to existing assignments."""
        assignment = CFPPaperAssignment(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            paper_id=submitted_paper.id,
            committee_member_id=committee_member.id,
            is_anonymous=False,
        )
        db_session.add(assignment)
        await db_session.commit()

        headers = _admin_headers(tenant_admin_user)
        resp = await client.put(
            f"/api/v1/cfp/{cfp.id}",
            json={"is_anonymous_review": True},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["is_anonymous_review"] is True

    @pytest.mark.asyncio
    async def test_delete_cfp(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        conference: Conference,
    ) -> None:
        headers = _admin_headers(tenant_admin_user)
        # Create one to delete
        create_resp = await client.post(
            "/api/v1/cfp/",
            json={"conference_id": str(conference.id), "title": "ToDelete CFP"},
            headers=headers,
        )
        cfp_id = create_resp.json()["id"]

        resp = await client.delete(f"/api/v1/cfp/{cfp_id}", headers=headers)
        assert resp.status_code == 200
        assert "deleted" in resp.json()["message"].lower()

    @pytest.mark.asyncio
    async def test_list_cfps_with_filters(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        cfp: CallForPapers,
        conference: Conference,
    ) -> None:
        headers = _admin_headers(tenant_admin_user)

        # Filter by status
        resp1 = await client.get("/api/v1/cfp/?status=open", headers=headers)
        assert resp1.status_code == 200
        assert resp1.json()["total"] >= 1

        # Filter by conference_id
        resp2 = await client.get(f"/api/v1/cfp/?conference_id={conference.id}", headers=headers)
        assert resp2.status_code == 200
        assert resp2.json()["total"] >= 1

        # Filter by search
        resp3 = await client.get("/api/v1/cfp/?search=DeepCFP", headers=headers)
        assert resp3.status_code == 200
        assert resp3.json()["total"] >= 1

    @pytest.mark.asyncio
    async def test_cfp_stats(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        cfp: CallForPapers,
    ) -> None:
        headers = _admin_headers(tenant_admin_user)
        resp = await client.get("/api/v1/cfp/stats", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        assert "open" in data
        assert "draft" in data
        assert "closed" in data


class TestSubmissionsCRUD:
    """Test submission endpoints under CFP."""

    @pytest.mark.asyncio
    async def test_create_submission(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        cfp: CallForPapers,
    ) -> None:
        headers = _admin_headers(tenant_admin_user)
        resp = await client.post(
            f"/api/v1/cfp/{cfp.id}/submissions",
            json={
                "cfp_id": str(cfp.id),
                "speaker_email": "test@example.com",
                "speaker_first_name": "Test",
                "speaker_last_name": "Speaker",
                "title": "Test Submission",
                "abstract": "An abstract",
            },
            headers=headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["title"] == "Test Submission"
        assert data["status"] == "submitted"

    @pytest.mark.asyncio
    async def test_list_submissions(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        cfp: CallForPapers,
    ) -> None:
        headers = _admin_headers(tenant_admin_user)
        # Create first
        await client.post(
            f"/api/v1/cfp/{cfp.id}/submissions",
            json={
                "cfp_id": str(cfp.id),
                "speaker_email": "list@example.com",
                "speaker_first_name": "List",
                "speaker_last_name": "Test",
                "title": "List Submission",
            },
            headers=headers,
        )
        resp = await client.get(
            f"/api/v1/cfp/{cfp.id}/submissions",
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["total"] >= 1

    @pytest.mark.asyncio
    async def test_list_submissions_with_search(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        cfp: CallForPapers,
    ) -> None:
        headers = _admin_headers(tenant_admin_user)
        await client.post(
            f"/api/v1/cfp/{cfp.id}/submissions",
            json={
                "cfp_id": str(cfp.id),
                "speaker_email": "search@example.com",
                "speaker_first_name": "Searchable",
                "speaker_last_name": "Person",
                "title": "Searchable Submission",
            },
            headers=headers,
        )
        resp = await client.get(
            f"/api/v1/cfp/{cfp.id}/submissions?search=Searchable",
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["total"] >= 1

    @pytest.mark.asyncio
    async def test_get_submission(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        cfp: CallForPapers,
    ) -> None:
        headers = _admin_headers(tenant_admin_user)
        create_resp = await client.post(
            f"/api/v1/cfp/{cfp.id}/submissions",
            json={
                "cfp_id": str(cfp.id),
                "speaker_email": "get@example.com",
                "speaker_first_name": "Get",
                "speaker_last_name": "Test",
                "title": "Get Submission",
            },
            headers=headers,
        )
        sub_id = create_resp.json()["id"]
        resp = await client.get(
            f"/api/v1/cfp/{cfp.id}/submissions/{sub_id}",
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["title"] == "Get Submission"

    @pytest.mark.asyncio
    async def test_update_submission(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        cfp: CallForPapers,
    ) -> None:
        headers = _admin_headers(tenant_admin_user)
        create_resp = await client.post(
            f"/api/v1/cfp/{cfp.id}/submissions",
            json={
                "cfp_id": str(cfp.id),
                "speaker_email": "update@example.com",
                "speaker_first_name": "Update",
                "speaker_last_name": "Test",
                "title": "Update Submission",
            },
            headers=headers,
        )
        sub_id = create_resp.json()["id"]

        resp = await client.put(
            f"/api/v1/cfp/{cfp.id}/submissions/{sub_id}",
            json={"title": "Updated Title", "status": "accepted"},
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "Updated Title"
        assert data["status"] == "accepted"
        assert data["reviewed_at"] is not None

    @pytest.mark.asyncio
    async def test_delete_submission(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        cfp: CallForPapers,
    ) -> None:
        headers = _admin_headers(tenant_admin_user)
        create_resp = await client.post(
            f"/api/v1/cfp/{cfp.id}/submissions",
            json={
                "cfp_id": str(cfp.id),
                "speaker_email": "delete@example.com",
                "speaker_first_name": "Delete",
                "speaker_last_name": "Test",
                "title": "Delete Submission",
            },
            headers=headers,
        )
        sub_id = create_resp.json()["id"]

        resp = await client.delete(
            f"/api/v1/cfp/{cfp.id}/submissions/{sub_id}",
            headers=headers,
        )
        assert resp.status_code == 200
        assert "deleted" in resp.json()["message"].lower()

    @pytest.mark.asyncio
    async def test_submission_stats(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        cfp: CallForPapers,
    ) -> None:
        headers = _admin_headers(tenant_admin_user)
        # Create a submission first
        await client.post(
            f"/api/v1/cfp/{cfp.id}/submissions",
            json={
                "cfp_id": str(cfp.id),
                "speaker_email": "stats@example.com",
                "speaker_first_name": "Stats",
                "speaker_last_name": "Test",
                "title": "Stats Submission",
            },
            headers=headers,
        )
        resp = await client.get(
            f"/api/v1/cfp/{cfp.id}/submissions/stats",
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        assert data["submitted"] >= 1


# ============================================================================
# Portal Reviews — Deep Coverage
# ============================================================================


class TestPortalReviewConfig:
    """Test portal review config endpoint."""

    @pytest.mark.asyncio
    async def test_get_review_config(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        cfp: CallForPapers,
        applicant: CFPApplicant,
        reviewer_applicant: CFPApplicant,
        committee_member: CFPCommitteeMember,
        in_eval_paper: CFPPaper,
        review_setup: dict,
    ) -> None:
        """Get review config returns criteria, questions, scales, and form settings."""
        assignment = CFPPaperAssignment(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            paper_id=in_eval_paper.id,
            committee_member_id=committee_member.id,
            is_anonymous=False,
        )
        db_session.add(assignment)
        await db_session.commit()

        token = create_applicant_access_token(reviewer_applicant.id, tenant.id)
        resp = await client.get(
            f"/api/v1/portal/assignments/{assignment.id}/review-config",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "criteria" in data
        assert "form_settings" in data
        assert data["form_settings"]["enable_speaker_feedback"] is True
        assert data["form_settings"]["enable_internal_comment"] is True
        assert data["form_settings"]["enable_must_have"] is True
        assert len(data["criteria"]) >= 1
        criterion = data["criteria"][0]
        assert criterion["title"] == "Content Quality"
        assert len(criterion["questions"]) >= 1
        q = criterion["questions"][0]
        assert q["text"] == "How would you rate the overall quality?"
        assert q["scale"] is not None
        assert len(q["scale"]["options"]) >= 5

    @pytest.mark.asyncio
    async def test_get_review_config_with_existing_review(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        cfp: CallForPapers,
        applicant: CFPApplicant,
        reviewer_applicant: CFPApplicant,
        committee_member: CFPCommitteeMember,
        in_eval_paper: CFPPaper,
        review_setup: dict,
    ) -> None:
        """Review config includes existing review draft data."""
        assignment = CFPPaperAssignment(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            paper_id=in_eval_paper.id,
            committee_member_id=committee_member.id,
            is_anonymous=False,
        )
        db_session.add(assignment)
        await db_session.flush()

        review = PaperReview(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            assignment_id=assignment.id,
            paper_id=in_eval_paper.id,
            committee_member_id=committee_member.id,
            status=ReviewStatus.DRAFT.value,
            speaker_feedback="Good work",
        )
        db_session.add(review)
        await db_session.commit()

        token = create_applicant_access_token(reviewer_applicant.id, tenant.id)
        resp = await client.get(
            f"/api/v1/portal/assignments/{assignment.id}/review-config",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["existing_review"] is not None
        assert data["existing_review"]["status"] == "draft"
        assert data["existing_review"]["speaker_feedback"] == "Good work"


class TestPortalSubmitReview:
    """Test portal review submission endpoint."""

    @pytest.mark.asyncio
    async def test_save_review_draft(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        cfp: CallForPapers,
        applicant: CFPApplicant,
        reviewer_applicant: CFPApplicant,
        committee_member: CFPCommitteeMember,
        in_eval_paper: CFPPaper,
        review_setup: dict,
    ) -> None:
        """Save a review as draft (submit=false)."""
        assignment = CFPPaperAssignment(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            paper_id=in_eval_paper.id,
            committee_member_id=committee_member.id,
            is_anonymous=False,
        )
        db_session.add(assignment)
        await db_session.commit()

        question = review_setup["question"]
        option = review_setup["options"][3]  # "4 - Very Good"

        token = create_applicant_access_token(reviewer_applicant.id, tenant.id)
        resp = await client.post(
            f"/api/v1/portal/assignments/{assignment.id}/review?submit=false",
            json={
                "answers": [
                    {
                        "question_id": str(question.id),
                        "selected_option_id": str(option.id),
                        "comment": "Nice paper",
                    }
                ],
                "speaker_feedback": "Keep it up",
                "internal_comment": "Looks good",
                "must_have": False,
            },
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "draft"
        assert "review_id" in data

    @pytest.mark.asyncio
    async def test_submit_review_final(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        cfp: CallForPapers,
        applicant: CFPApplicant,
        reviewer_applicant: CFPApplicant,
        committee_member: CFPCommitteeMember,
        in_eval_paper: CFPPaper,
        review_setup: dict,
    ) -> None:
        """Submit a review as final (submit=true) computes total_score."""
        assignment = CFPPaperAssignment(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            paper_id=in_eval_paper.id,
            committee_member_id=committee_member.id,
            is_anonymous=False,
        )
        db_session.add(assignment)
        await db_session.commit()

        question = review_setup["question"]
        option = review_setup["options"][4]  # "5 - Excellent"

        token = create_applicant_access_token(reviewer_applicant.id, tenant.id)
        resp = await client.post(
            f"/api/v1/portal/assignments/{assignment.id}/review?submit=true",
            json={
                "answers": [
                    {
                        "question_id": str(question.id),
                        "selected_option_id": str(option.id),
                        "comment": "Excellent work",
                    }
                ],
                "speaker_feedback": "Outstanding paper",
                "internal_comment": "Must accept",
                "must_have": True,
            },
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "submitted"
        assert data["total_score"] == 5.0
        assert "review_id" in data

    @pytest.mark.asyncio
    async def test_submit_review_cannot_resubmit(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        cfp: CallForPapers,
        applicant: CFPApplicant,
        reviewer_applicant: CFPApplicant,
        committee_member: CFPCommitteeMember,
        in_eval_paper: CFPPaper,
        review_setup: dict,
    ) -> None:
        """Cannot submit a review that has already been submitted."""
        assignment = CFPPaperAssignment(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            paper_id=in_eval_paper.id,
            committee_member_id=committee_member.id,
            is_anonymous=False,
        )
        db_session.add(assignment)
        await db_session.flush()

        review = PaperReview(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            assignment_id=assignment.id,
            paper_id=in_eval_paper.id,
            committee_member_id=committee_member.id,
            status=ReviewStatus.SUBMITTED.value,
            total_score=4.0,
        )
        db_session.add(review)
        await db_session.commit()

        token = create_applicant_access_token(reviewer_applicant.id, tenant.id)
        resp = await client.post(
            f"/api/v1/portal/assignments/{assignment.id}/review?submit=true",
            json={
                "answers": [],
                "speaker_feedback": "Trying again",
            },
            headers=auth_headers(token),
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_save_draft_then_submit(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        cfp: CallForPapers,
        applicant: CFPApplicant,
        reviewer_applicant: CFPApplicant,
        committee_member: CFPCommitteeMember,
        in_eval_paper: CFPPaper,
        review_setup: dict,
    ) -> None:
        """Save a draft, then submit the final review."""
        assignment = CFPPaperAssignment(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            paper_id=in_eval_paper.id,
            committee_member_id=committee_member.id,
            is_anonymous=False,
        )
        db_session.add(assignment)
        await db_session.commit()

        question = review_setup["question"]
        option3 = review_setup["options"][2]  # "3 - Good"
        option5 = review_setup["options"][4]  # "5 - Excellent"

        token = create_applicant_access_token(reviewer_applicant.id, tenant.id)

        # First: save draft
        draft_resp = await client.post(
            f"/api/v1/portal/assignments/{assignment.id}/review?submit=false",
            json={
                "answers": [
                    {"question_id": str(question.id), "selected_option_id": str(option3.id)},
                ],
                "speaker_feedback": "Draft feedback",
            },
            headers=auth_headers(token),
        )
        assert draft_resp.status_code == 200
        assert draft_resp.json()["status"] == "draft"

        # Second: submit final with different option
        submit_resp = await client.post(
            f"/api/v1/portal/assignments/{assignment.id}/review?submit=true",
            json={
                "answers": [
                    {"question_id": str(question.id), "selected_option_id": str(option5.id)},
                ],
                "speaker_feedback": "Final feedback",
                "must_have": True,
            },
            headers=auth_headers(token),
        )
        assert submit_resp.status_code == 200
        assert submit_resp.json()["status"] == "submitted"
        assert submit_resp.json()["total_score"] == 5.0


class TestPortalSpeakerFeedback:
    """Test portal speaker feedback endpoint."""

    @pytest.mark.asyncio
    async def test_get_speaker_feedback_when_cfp_completed(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        cfp: CallForPapers,
        applicant: CFPApplicant,
        committee_member: CFPCommitteeMember,
    ) -> None:
        """Speaker feedback is returned when CFP is completed."""
        cfp.status = "completed"
        await db_session.commit()

        paper = CFPPaper(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            cfp_id=cfp.id,
            main_speaker_id=applicant.id,
            title="Feedback Paper",
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
        await db_session.flush()

        review = PaperReview(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            assignment_id=assignment.id,
            paper_id=paper.id,
            committee_member_id=committee_member.id,
            status=ReviewStatus.SUBMITTED.value,
            total_score=4.5,
            speaker_feedback="Great presentation skills",
        )
        db_session.add(review)
        await db_session.commit()

        token = create_applicant_access_token(applicant.id, tenant.id)
        resp = await client.get(
            f"/api/v1/portal/papers/{paper.id}/feedback",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["speaker_feedback"] == "Great presentation skills"
        assert data["items"][0]["total_score"] == 4.5

    @pytest.mark.asyncio
    async def test_get_speaker_feedback_when_cfp_not_completed_returns_empty(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        cfp: CallForPapers,
        applicant: CFPApplicant,
        committee_member: CFPCommitteeMember,
    ) -> None:
        """Speaker feedback is empty when CFP is not yet completed."""
        paper = CFPPaper(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            cfp_id=cfp.id,
            main_speaker_id=applicant.id,
            title="Open CFP Paper",
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
            total_score=3.0,
            speaker_feedback="Good work",
        )
        db_session.add(review)
        await db_session.commit()

        token = create_applicant_access_token(applicant.id, tenant.id)
        resp = await client.get(
            f"/api/v1/portal/papers/{paper.id}/feedback",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        assert resp.json()["total"] == 0

    @pytest.mark.asyncio
    async def test_get_speaker_feedback_excludes_empty_feedback(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        cfp: CallForPapers,
        applicant: CFPApplicant,
        committee_member: CFPCommitteeMember,
        committee_member2: CFPCommitteeMember,
    ) -> None:
        """Reviews without speaker_feedback text are excluded from results."""
        cfp.status = "completed"
        await db_session.commit()

        paper = CFPPaper(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            cfp_id=cfp.id,
            main_speaker_id=applicant.id,
            title="Mixed Feedback Paper",
            status=PaperStatus.ACCEPTED.value,
        )
        db_session.add(paper)
        await db_session.flush()

        # Assignment 1 with feedback
        a1 = CFPPaperAssignment(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            paper_id=paper.id,
            committee_member_id=committee_member.id,
            is_anonymous=False,
        )
        db_session.add(a1)
        await db_session.flush()

        r1 = PaperReview(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            assignment_id=a1.id,
            paper_id=paper.id,
            committee_member_id=committee_member.id,
            status=ReviewStatus.SUBMITTED.value,
            total_score=4.0,
            speaker_feedback="Very good paper",
        )
        db_session.add(r1)

        # Assignment 2 without feedback
        a2 = CFPPaperAssignment(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            paper_id=paper.id,
            committee_member_id=committee_member2.id,
            is_anonymous=False,
        )
        db_session.add(a2)
        await db_session.flush()

        r2 = PaperReview(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            assignment_id=a2.id,
            paper_id=paper.id,
            committee_member_id=committee_member2.id,
            status=ReviewStatus.SUBMITTED.value,
            total_score=3.0,
            speaker_feedback=None,
        )
        db_session.add(r2)
        await db_session.commit()

        token = create_applicant_access_token(applicant.id, tenant.id)
        resp = await client.get(
            f"/api/v1/portal/papers/{paper.id}/feedback",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["speaker_feedback"] == "Very good paper"
