"""Comprehensive reviewer workflow tests for the CFP portal.

Tests the end-to-end reviewer workflow from assignment access through review
submission, covering:
  - Assigned-paper access and access-control enforcement
  - Review config retrieval with existing drafts
  - Review submission (draft and final) with score calculation
  - Duplicate-review prevention (submitted review cannot be re-submitted)
  - Cross-conference paper isolation (reviewer in Conf-A cannot see Conf-B)
  - Author-cannot-review-own-paper (applicant who submitted cannot also review)
  - Non-assigned reviewer cannot post a review for another assignment
  - Update (re-save draft) cycle before final submission
  - Speaker feedback visibility rules (gated on CFP "completed" status)
  - Unauthenticated and non-committee access returns 401 / 404
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

from app.core.applicant_security import create_applicant_access_token
from app.core.security import hash_password
from app.models.associations import ConferenceCFP
from app.models.cfp import (
    CallForPapers,
    CFPApplicant,
    CFPCommitteeMember,
    CFPPaper,
    CFPPaperAssignment,
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


# ── Helper factories ─────────────────────────────────────────────────────────


def _make_applicant(tenant: Tenant, first_name: str = "Test", last_name: str = "User") -> CFPApplicant:
    """Return an unsaved CFPApplicant for the given tenant."""
    return CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name=first_name,
        last_name=last_name,
        email=f"{first_name.lower()}-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Password123!"),
    )


def _make_cfp(tenant: Tenant, status: str = "open") -> CallForPapers:
    """Return an unsaved CallForPapers for the given tenant."""
    return CallForPapers(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        title=f"CFP-{uuid.uuid4().hex[:6]}",
        status=status,
    )


def _make_conference(tenant: Tenant) -> Conference:
    """Return an unsaved Conference for the given tenant."""
    return Conference(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name=f"Conf-{uuid.uuid4().hex[:6]}",
        abbreviation=f"C{uuid.uuid4().hex[:4].upper()}",
        is_active=True,
    )


async def _link_cfp_to_conference(
    db: AsyncSession,
    cfp: CallForPapers,
    conference: Conference,
) -> ConferenceCFP:
    """Persist a ConferenceCFP association and return it."""
    assoc = ConferenceCFP(
        id=uuid.uuid4(),
        conference_id=conference.id,
        cfp_id=cfp.id,
    )
    db.add(assoc)
    await db.flush()
    return assoc


async def _create_scale_with_option(
    db: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    numeric_value: float = 3.0,
) -> tuple[ReviewScoreScale, ReviewScaleOption, ReviewCriterion, ReviewQuestion]:
    """Create a complete review form: scale → criterion → question, all active."""
    scale = ReviewScoreScale(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name=f"Scale-{uuid.uuid4().hex[:4]}",
        scale_type="numeric_range",
        is_active=True,
    )
    db.add(scale)
    await db.flush()

    option = None
    for display_order, value in enumerate([1.0, 2.0, 3.0, 4.0, 5.0]):
        scale_option = ReviewScaleOption(
            id=uuid.uuid4(),
            scale_id=scale.id,
            label=f"{int(value)} - Score",
            numeric_value=value,
            is_unsure=False,
            display_order=display_order,
        )
        db.add(scale_option)
        if value == numeric_value:
            option = scale_option
    await db.flush()
    assert option is not None

    criterion = ReviewCriterion(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        title=f"Criterion-{uuid.uuid4().hex[:4]}",
        is_active=True,
        display_order=0,
    )
    db.add(criterion)
    await db.flush()

    question = ReviewQuestion(
        id=uuid.uuid4(),
        criterion_id=criterion.id,
        tenant_id=tenant.id,
        conference_id=conference.id,
        text="How good is this paper?",
        question_type="scored",
        score_scale_id=scale.id,
        weight=1.0,
        show_to_reviewers=True,
        count_in_score=True,
        is_active=True,
        display_order=0,
    )
    db.add(question)
    await db.flush()

    return scale, option, criterion, question


# ── Module-level fixtures (shared across all test classes) ───────────────────


@pytest_asyncio.fixture()
async def author_applicant(db_session: AsyncSession, tenant: Tenant) -> CFPApplicant:
    """The applicant who authored the paper under review."""
    a = _make_applicant(tenant, "Author", "Writer")
    db_session.add(a)
    await db_session.commit()
    return a


@pytest.fixture()
def author_token(author_applicant: CFPApplicant, tenant: Tenant) -> str:
    """JWT token for the paper author."""
    return create_applicant_access_token(author_applicant.id, tenant.id)


@pytest_asyncio.fixture()
async def reviewer_applicant(db_session: AsyncSession, tenant: Tenant) -> CFPApplicant:
    """The applicant who acts as a committee reviewer."""
    a = _make_applicant(tenant, "Carol", "Reviewer")
    db_session.add(a)
    await db_session.commit()
    return a


@pytest.fixture()
def reviewer_token(reviewer_applicant: CFPApplicant, tenant: Tenant) -> str:
    """JWT token for the reviewer applicant."""
    return create_applicant_access_token(reviewer_applicant.id, tenant.id)


@pytest_asyncio.fixture()
async def other_applicant(db_session: AsyncSession, tenant: Tenant) -> CFPApplicant:
    """An unrelated applicant with no committee membership and no papers."""
    a = _make_applicant(tenant, "Outsider", "Nobody")
    db_session.add(a)
    await db_session.commit()
    return a


@pytest.fixture()
def other_token(other_applicant: CFPApplicant, tenant: Tenant) -> str:
    """JWT token for the unrelated applicant."""
    return create_applicant_access_token(other_applicant.id, tenant.id)


@pytest_asyncio.fixture()
async def cfp_obj(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
) -> CallForPapers:
    """Create a CFP linked to the default conference fixture."""
    cfp = _make_cfp(tenant, status="open")
    db_session.add(cfp)
    await db_session.flush()
    await _link_cfp_to_conference(db_session, cfp, conference)
    await db_session.commit()
    return cfp


@pytest_asyncio.fixture()
async def committee_member(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    reviewer_applicant: CFPApplicant,
) -> CFPCommitteeMember:
    """Committee membership for reviewer_applicant in the default conference."""
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
async def paper(
    db_session: AsyncSession,
    tenant: Tenant,
    cfp_obj: CallForPapers,
    author_applicant: CFPApplicant,
) -> CFPPaper:
    """A paper in IN_EVALUATION status authored by author_applicant."""
    p = CFPPaper(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        cfp_id=cfp_obj.id,
        main_speaker_id=author_applicant.id,
        title="A Great Paper",
        abstract_short="Short abstract",
        status=PaperStatus.IN_EVALUATION.value,
    )
    db_session.add(p)
    await db_session.commit()
    return p


@pytest_asyncio.fixture()
async def assignment(
    db_session: AsyncSession,
    tenant: Tenant,
    paper: CFPPaper,
    committee_member: CFPCommitteeMember,
) -> CFPPaperAssignment:
    """Assignment of paper to committee_member."""
    a = CFPPaperAssignment(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        paper_id=paper.id,
        committee_member_id=committee_member.id,
        is_anonymous=False,
    )
    db_session.add(a)
    await db_session.commit()
    return a


@pytest_asyncio.fixture()
async def review_setup(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
) -> tuple[ReviewScoreScale, ReviewScaleOption, ReviewCriterion, ReviewQuestion]:
    """Full review form setup (scale + criterion + question) for the conference."""
    result = await _create_scale_with_option(db_session, tenant, conference, numeric_value=4.0)
    await db_session.commit()
    return result


# ── 1. Assigned papers access ────────────────────────────────────────────────


@pytest.mark.asyncio
class TestAssignedPapersAccess:
    """Verifies who can and cannot see assigned papers."""

    async def test_reviewer_sees_assigned_paper(
        self,
        client: AsyncClient,
        reviewer_token: str,
        assignment: CFPPaperAssignment,
        paper: CFPPaper,
    ) -> None:
        """A committee member can list and retrieve their assigned paper."""
        resp = await client.get(
            f"{PORTAL_BASE}/assigned-papers",
            headers=auth_headers(reviewer_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        ids = [item["id"] for item in data["items"]]
        assert str(paper.id) in ids

    async def test_reviewer_can_get_assigned_paper_detail(
        self,
        client: AsyncClient,
        reviewer_token: str,
        assignment: CFPPaperAssignment,
        paper: CFPPaper,
    ) -> None:
        """GET /assigned-papers/{paper_id} returns full detail for the reviewer."""
        resp = await client.get(
            f"{PORTAL_BASE}/assigned-papers/{paper.id}",
            headers=auth_headers(reviewer_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == str(paper.id)
        assert data["assignment_id"] == str(assignment.id)
        assert data["abstract_short"] == "Short abstract"

    async def test_non_reviewer_gets_empty_assignment_list(
        self,
        client: AsyncClient,
        other_token: str,
    ) -> None:
        """An applicant with no committee membership sees zero assigned papers."""
        resp = await client.get(
            f"{PORTAL_BASE}/assigned-papers",
            headers=auth_headers(other_token),
        )
        assert resp.status_code == 200
        assert resp.json()["total"] == 0

    async def test_non_reviewer_cannot_fetch_assigned_paper_detail(
        self,
        client: AsyncClient,
        other_token: str,
        paper: CFPPaper,
        assignment: CFPPaperAssignment,  # ensure assignment exists in DB
    ) -> None:
        """An applicant with no committee membership gets 404 on detail endpoint."""
        resp = await client.get(
            f"{PORTAL_BASE}/assigned-papers/{paper.id}",
            headers=auth_headers(other_token),
        )
        assert resp.status_code == 404

    async def test_unauthenticated_assigned_papers_returns_401(
        self,
        client: AsyncClient,
    ) -> None:
        """No token → 401 on the assigned-papers list endpoint."""
        resp = await client.get(f"{PORTAL_BASE}/assigned-papers")
        assert resp.status_code == 401

    async def test_unauthenticated_review_config_returns_401(
        self,
        client: AsyncClient,
        assignment: CFPPaperAssignment,
    ) -> None:
        """No token → 401 on the review-config endpoint."""
        resp = await client.get(f"{PORTAL_BASE}/assignments/{assignment.id}/review-config")
        assert resp.status_code == 401


# ── 2. Review config retrieval ───────────────────────────────────────────────


@pytest.mark.asyncio
class TestReviewConfig:
    """Verifies review config endpoint behaviour."""

    async def test_review_config_returns_criteria_and_questions(
        self,
        client: AsyncClient,
        reviewer_token: str,
        assignment: CFPPaperAssignment,
        review_setup: tuple,
    ) -> None:
        """Review config for an assigned paper includes criteria and questions."""
        resp = await client.get(
            f"{PORTAL_BASE}/assignments/{assignment.id}/review-config",
            headers=auth_headers(reviewer_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data["criteria"], list)
        assert len(data["criteria"]) >= 1
        assert len(data["criteria"][0]["questions"]) >= 1
        assert data["existing_review"] is None

    async def test_review_config_form_settings_defaults(
        self,
        client: AsyncClient,
        reviewer_token: str,
        assignment: CFPPaperAssignment,
        review_setup: tuple,
    ) -> None:
        """Review config form_settings defaults to all-enabled when no custom settings exist."""
        resp = await client.get(
            f"{PORTAL_BASE}/assignments/{assignment.id}/review-config",
            headers=auth_headers(reviewer_token),
        )
        assert resp.status_code == 200
        fs = resp.json()["form_settings"]
        assert fs["enable_speaker_feedback"] is True
        assert fs["enable_internal_comment"] is True
        assert fs["enable_must_have"] is True

    async def test_review_config_not_found_for_unknown_assignment(
        self,
        client: AsyncClient,
        reviewer_token: str,
        committee_member: CFPCommitteeMember,  # membership exists, but not this assignment
    ) -> None:
        """Returns 404 for an assignment UUID that does not exist."""
        resp = await client.get(
            f"{PORTAL_BASE}/assignments/{uuid.uuid4()}/review-config",
            headers=auth_headers(reviewer_token),
        )
        assert resp.status_code == 404

    async def test_review_config_not_accessible_by_non_committee_member(
        self,
        client: AsyncClient,
        other_token: str,
        assignment: CFPPaperAssignment,
    ) -> None:
        """An applicant who is not a committee member gets 404 on review-config."""
        resp = await client.get(
            f"{PORTAL_BASE}/assignments/{assignment.id}/review-config",
            headers=auth_headers(other_token),
        )
        assert resp.status_code == 404

    async def test_review_config_shows_existing_draft(
        self,
        client: AsyncClient,
        reviewer_token: str,
        assignment: CFPPaperAssignment,
        review_setup: tuple,
    ) -> None:
        """After saving a draft, review-config includes existing_review with draft status."""
        _scale, option, _criterion, question = review_setup
        payload = {
            "answers": [{"question_id": str(question.id), "selected_option_id": str(option.id)}],
            "speaker_feedback": "Initial draft feedback",
        }
        save_resp = await client.post(
            f"{PORTAL_BASE}/assignments/{assignment.id}/review",
            json=payload,
            params={"submit": "false"},
            headers=auth_headers(reviewer_token),
        )
        assert save_resp.status_code == 200

        config_resp = await client.get(
            f"{PORTAL_BASE}/assignments/{assignment.id}/review-config",
            headers=auth_headers(reviewer_token),
        )
        assert config_resp.status_code == 200
        existing = config_resp.json()["existing_review"]
        assert existing is not None
        assert existing["status"] == "draft"
        assert existing["speaker_feedback"] == "Initial draft feedback"


# ── 3. Review submission ─────────────────────────────────────────────────────


@pytest.mark.asyncio
class TestReviewSubmission:
    """Verifies review creation, draft saving, and final submission."""

    async def test_save_draft_review(
        self,
        client: AsyncClient,
        reviewer_token: str,
        assignment: CFPPaperAssignment,
        review_setup: tuple,
    ) -> None:
        """POST review with submit=false creates a draft and returns status=draft."""
        _scale, option, _criterion, question = review_setup
        payload = {
            "answers": [
                {
                    "question_id": str(question.id),
                    "selected_option_id": str(option.id),
                    "comment": "Draft comment",
                }
            ],
            "speaker_feedback": "Looks interesting",
            "internal_comment": "Needs work",
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
        assert data["total_score"] is None  # score not computed on draft

    async def test_submit_review_computes_score(
        self,
        client: AsyncClient,
        reviewer_token: str,
        assignment: CFPPaperAssignment,
        review_setup: tuple,
    ) -> None:
        """POST review with submit=true returns status=submitted and total_score."""
        _scale, option, _criterion, question = review_setup
        payload = {
            "answers": [
                {
                    "question_id": str(question.id),
                    "selected_option_id": str(option.id),
                    "comment": "Final comment",
                }
            ],
            "speaker_feedback": VALID_FEEDBACK,
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
        # The fixture creates a scale option with numeric_value=4.0, weight=1.0
        assert data["total_score"] == 4.0

    async def test_submit_review_normalizes_recommendation_scale(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        reviewer_token: str,
        assignment: CFPPaperAssignment,
        review_setup: tuple,
    ) -> None:
        """Recommendation values on a -2 to +2 scale are normalized before averaging."""
        _scale, option, criterion, question = review_setup
        recommendation_scale = ReviewScoreScale(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            name=f"Recommendation-{uuid.uuid4().hex[:4]}",
            scale_type="custom",
            is_active=True,
        )
        db_session.add(recommendation_scale)
        await db_session.flush()

        selected_recommendation = None
        for display_order, (label, value) in enumerate(
            [
                ("Strong Reject", -2.0),
                ("Reject", -1.0),
                ("Borderline", 0.0),
                ("Accept", 1.0),
                ("Strong Accept", 2.0),
            ]
        ):
            recommendation_option = ReviewScaleOption(
                id=uuid.uuid4(),
                scale_id=recommendation_scale.id,
                label=label,
                numeric_value=value,
                is_unsure=False,
                display_order=display_order,
            )
            db_session.add(recommendation_option)
            if value == 2.0:
                selected_recommendation = recommendation_option

        recommendation_question = ReviewQuestion(
            id=uuid.uuid4(),
            criterion_id=criterion.id,
            tenant_id=tenant.id,
            conference_id=conference.id,
            text="Overall Recommendation",
            question_type="scored",
            score_scale_id=recommendation_scale.id,
            weight=1.0,
            show_to_reviewers=True,
            count_in_score=True,
            is_active=True,
            display_order=1,
        )
        db_session.add(recommendation_question)
        await db_session.commit()
        assert selected_recommendation is not None

        payload = {
            "answers": [
                {
                    "question_id": str(question.id),
                    "selected_option_id": str(option.id),
                    "comment": "Quality comment",
                },
                {
                    "question_id": str(recommendation_question.id),
                    "selected_option_id": str(selected_recommendation.id),
                    "comment": "Recommendation comment",
                },
            ],
            "speaker_feedback": VALID_FEEDBACK,
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
        assert data["total_score"] == 4.5

    async def test_submit_review_without_answers_still_saves(
        self,
        client: AsyncClient,
        reviewer_token: str,
        assignment: CFPPaperAssignment,
        review_setup: tuple,
    ) -> None:
        """Submitting an empty answers list is allowed; score will be None."""
        payload = {
            "answers": [],
            "speaker_feedback": VALID_FEEDBACK,
            "must_have": False,
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
        assert data["total_score"] is None

    async def test_cannot_resubmit_an_already_submitted_review(
        self,
        client: AsyncClient,
        reviewer_token: str,
        assignment: CFPPaperAssignment,
        review_setup: tuple,
    ) -> None:
        """A second submission attempt on a submitted review returns 400."""
        _scale, option, _criterion, question = review_setup
        payload = {
            "answers": [{"question_id": str(question.id), "selected_option_id": str(option.id)}],
            "speaker_feedback": VALID_FEEDBACK,
        }
        # First submission
        resp1 = await client.post(
            f"{PORTAL_BASE}/assignments/{assignment.id}/review",
            json=payload,
            params={"submit": "true"},
            headers=auth_headers(reviewer_token),
        )
        assert resp1.status_code == 200
        assert resp1.json()["status"] == "submitted"

        # Duplicate submission attempt
        resp2 = await client.post(
            f"{PORTAL_BASE}/assignments/{assignment.id}/review",
            json=payload,
            params={"submit": "true"},
            headers=auth_headers(reviewer_token),
        )
        assert resp2.status_code == 400

    async def test_can_save_draft_multiple_times(
        self,
        client: AsyncClient,
        reviewer_token: str,
        assignment: CFPPaperAssignment,
        review_setup: tuple,
    ) -> None:
        """A reviewer can overwrite a draft with updated content multiple times."""
        _scale, option, _criterion, question = review_setup
        payload_v1 = {
            "answers": [{"question_id": str(question.id), "selected_option_id": str(option.id)}],
            "speaker_feedback": "Version 1",
        }
        resp1 = await client.post(
            f"{PORTAL_BASE}/assignments/{assignment.id}/review",
            json=payload_v1,
            params={"submit": "false"},
            headers=auth_headers(reviewer_token),
        )
        assert resp1.status_code == 200
        review_id_v1 = resp1.json()["review_id"]

        payload_v2 = {
            "answers": [{"question_id": str(question.id), "selected_option_id": str(option.id)}],
            "speaker_feedback": "Version 2 — updated",
        }
        resp2 = await client.post(
            f"{PORTAL_BASE}/assignments/{assignment.id}/review",
            json=payload_v2,
            params={"submit": "false"},
            headers=auth_headers(reviewer_token),
        )
        assert resp2.status_code == 200
        # Same review record is updated (same review_id)
        assert resp2.json()["review_id"] == review_id_v1

        # Config should reflect the latest draft content
        config_resp = await client.get(
            f"{PORTAL_BASE}/assignments/{assignment.id}/review-config",
            headers=auth_headers(reviewer_token),
        )
        assert config_resp.json()["existing_review"]["speaker_feedback"] == "Version 2 — updated"

    async def test_review_submission_by_non_assigned_reviewer_fails(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        other_applicant: CFPApplicant,
        other_token: str,
        assignment: CFPPaperAssignment,
        review_setup: tuple,
    ) -> None:
        """A reviewer not assigned to this paper gets 404 when trying to submit."""
        # Make other_applicant a committee member but NOT assigned to this paper
        cm = CFPCommitteeMember(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            applicant_id=other_applicant.id,
            role="reviewer",
        )
        db_session.add(cm)
        await db_session.commit()

        _scale, option, _criterion, question = review_setup
        payload = {
            "answers": [{"question_id": str(question.id), "selected_option_id": str(option.id)}],
            "speaker_feedback": "Should not be allowed",
        }
        resp = await client.post(
            f"{PORTAL_BASE}/assignments/{assignment.id}/review",
            json=payload,
            params={"submit": "true"},
            headers=auth_headers(other_token),
        )
        # The assignment doesn't belong to other_applicant's committee member record
        assert resp.status_code == 404

    async def test_unauthenticated_review_submission_returns_401(
        self,
        client: AsyncClient,
        assignment: CFPPaperAssignment,
    ) -> None:
        """Submitting a review without authentication returns 401."""
        payload = {"answers": [], "speaker_feedback": ""}
        resp = await client.post(
            f"{PORTAL_BASE}/assignments/{assignment.id}/review",
            json=payload,
            params={"submit": "true"},
        )
        assert resp.status_code == 401


# ── 4. Cross-conference paper isolation ─────────────────────────────────────


@pytest.mark.asyncio
class TestCrossConferenceIsolation:
    """A reviewer assigned to Conference A cannot see papers from Conference B."""

    async def test_reviewer_cannot_see_papers_from_other_conference(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        reviewer_applicant: CFPApplicant,
        reviewer_token: str,
        committee_member: CFPCommitteeMember,
    ) -> None:
        """Reviewer in Conf-A gets 404 when trying to access a paper from Conf-B."""
        # Create a second, independent conference with its own CFP and paper
        conf_b = _make_conference(tenant)
        db_session.add(conf_b)
        await db_session.flush()

        cfp_b = _make_cfp(tenant, status="open")
        db_session.add(cfp_b)
        await db_session.flush()
        await _link_cfp_to_conference(db_session, cfp_b, conf_b)

        author_b = _make_applicant(tenant, "AuthorB", "Other")
        db_session.add(author_b)
        await db_session.flush()

        paper_b = CFPPaper(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            cfp_id=cfp_b.id,
            main_speaker_id=author_b.id,
            title="Conf-B Paper",
            status=PaperStatus.IN_EVALUATION.value,
        )
        db_session.add(paper_b)

        # reviewer_applicant is NOT a member in conf_b
        # Create a different committee member for conf_b and assign the paper there
        reviewer_b = _make_applicant(tenant, "ReviewerB", "Separate")
        db_session.add(reviewer_b)
        await db_session.flush()

        cm_b = CFPCommitteeMember(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conf_b.id,
            applicant_id=reviewer_b.id,
            role="reviewer",
        )
        db_session.add(cm_b)
        await db_session.flush()

        assignment_b = CFPPaperAssignment(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            paper_id=paper_b.id,
            committee_member_id=cm_b.id,
        )
        db_session.add(assignment_b)
        await db_session.commit()

        # reviewer_token belongs to reviewer_applicant (only in Conf-A)
        # Trying to access the Conf-B assignment's review-config should 404
        resp = await client.get(
            f"{PORTAL_BASE}/assignments/{assignment_b.id}/review-config",
            headers=auth_headers(reviewer_token),
        )
        assert resp.status_code == 404

    async def test_reviewer_cannot_post_review_for_other_conference_assignment(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        reviewer_applicant: CFPApplicant,
        reviewer_token: str,
        committee_member: CFPCommitteeMember,
    ) -> None:
        """POST review for an assignment in Conf-B returns 404 for a Conf-A reviewer."""
        conf_b = _make_conference(tenant)
        db_session.add(conf_b)
        await db_session.flush()

        cfp_b = _make_cfp(tenant, status="open")
        db_session.add(cfp_b)
        await db_session.flush()
        await _link_cfp_to_conference(db_session, cfp_b, conf_b)

        author_b = _make_applicant(tenant, "Author2B", "Other")
        db_session.add(author_b)
        await db_session.flush()

        paper_b = CFPPaper(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            cfp_id=cfp_b.id,
            main_speaker_id=author_b.id,
            title="Another Conf-B Paper",
            status=PaperStatus.IN_EVALUATION.value,
        )
        db_session.add(paper_b)

        reviewer_b2 = _make_applicant(tenant, "ReviewerB2", "Other")
        db_session.add(reviewer_b2)
        await db_session.flush()

        cm_b = CFPCommitteeMember(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conf_b.id,
            applicant_id=reviewer_b2.id,
            role="reviewer",
        )
        db_session.add(cm_b)
        await db_session.flush()

        assignment_b = CFPPaperAssignment(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            paper_id=paper_b.id,
            committee_member_id=cm_b.id,
        )
        db_session.add(assignment_b)
        await db_session.commit()

        payload = {"answers": [], "speaker_feedback": "Cross-conference attempt"}
        resp = await client.post(
            f"{PORTAL_BASE}/assignments/{assignment_b.id}/review",
            json=payload,
            params={"submit": "false"},
            headers=auth_headers(reviewer_token),
        )
        assert resp.status_code == 404


# ── 5. Author cannot review own paper ────────────────────────────────────────


@pytest.mark.asyncio
class TestAuthorCannotReviewOwnPaper:
    """An applicant who submitted a paper cannot also be assigned as its reviewer."""

    async def test_author_cannot_access_own_paper_as_assigned_paper(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        author_applicant: CFPApplicant,
        author_token: str,
        paper: CFPPaper,
        cfp_obj: CallForPapers,
    ) -> None:
        """Author has no committee membership, so assigned-papers list is empty."""
        resp = await client.get(
            f"{PORTAL_BASE}/assigned-papers",
            headers=auth_headers(author_token),
        )
        assert resp.status_code == 200
        assert resp.json()["total"] == 0

    async def test_author_made_committee_member_cannot_review_own_paper(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        author_applicant: CFPApplicant,
        author_token: str,
        paper: CFPPaper,
    ) -> None:
        """If author is added as a committee member AND assigned their own paper,
        the API must return 403 when they attempt to access or submit a review.
        This enforces the conflict-of-interest rule at the API layer."""
        # Make the author a committee member
        cm = CFPCommitteeMember(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            applicant_id=author_applicant.id,
            role="reviewer",
        )
        db_session.add(cm)
        await db_session.flush()

        # Assign their own paper to them
        self_assignment = CFPPaperAssignment(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            paper_id=paper.id,
            committee_member_id=cm.id,
        )
        db_session.add(self_assignment)
        await db_session.commit()

        # Author can still see their own paper in the assigned-papers list
        # (the list endpoint is not gated; only the review access/submit are)
        resp = await client.get(
            f"{PORTAL_BASE}/assigned-papers",
            headers=auth_headers(author_token),
        )
        assert resp.status_code == 200
        ids = [item["id"] for item in resp.json()["items"]]
        assert str(paper.id) in ids

        # Attempting to access the review config must return 403
        resp_config = await client.get(
            f"{PORTAL_BASE}/assignments/{self_assignment.id}/review-config",
            headers=auth_headers(author_token),
        )
        assert resp_config.status_code == 403
        assert "cannot review your own paper" in resp_config.json()["detail"]

        # Attempting to submit a review must also return 403
        resp_submit = await client.post(
            f"{PORTAL_BASE}/assignments/{self_assignment.id}/review",
            json={"answers": [], "speaker_feedback": None, "must_have": False},
            params={"submit": "false"},
            headers=auth_headers(author_token),
        )
        assert resp_submit.status_code == 403
        assert "cannot review your own paper" in resp_submit.json()["detail"]


# ── 6. Draft update cycle ─────────────────────────────────────────────────────


@pytest.mark.asyncio
class TestDraftUpdateCycle:
    """Verifies the save-draft → update-draft → submit cycle."""

    async def test_update_draft_then_submit(
        self,
        client: AsyncClient,
        reviewer_token: str,
        assignment: CFPPaperAssignment,
        review_setup: tuple,
    ) -> None:
        """A reviewer can save a draft, update it, then submit the final version."""
        _scale, option, _criterion, question = review_setup

        # Step 1: save draft
        draft_payload = {
            "answers": [{"question_id": str(question.id), "selected_option_id": str(option.id)}],
            "speaker_feedback": "Initial thoughts",
            "must_have": False,
        }
        resp1 = await client.post(
            f"{PORTAL_BASE}/assignments/{assignment.id}/review",
            json=draft_payload,
            params={"submit": "false"},
            headers=auth_headers(reviewer_token),
        )
        assert resp1.status_code == 200
        review_id = resp1.json()["review_id"]
        assert resp1.json()["status"] == "draft"

        # Step 2: update draft with new feedback
        update_payload = {
            "answers": [{"question_id": str(question.id), "selected_option_id": str(option.id)}],
            "speaker_feedback": "Refined feedback",
            "must_have": True,
        }
        resp2 = await client.post(
            f"{PORTAL_BASE}/assignments/{assignment.id}/review",
            json=update_payload,
            params={"submit": "false"},
            headers=auth_headers(reviewer_token),
        )
        assert resp2.status_code == 200
        assert resp2.json()["review_id"] == review_id  # same review record

        # Step 3: submit final version
        final_payload = {
            "answers": [{"question_id": str(question.id), "selected_option_id": str(option.id)}],
            "speaker_feedback": VALID_FEEDBACK,
            "must_have": True,
        }
        resp3 = await client.post(
            f"{PORTAL_BASE}/assignments/{assignment.id}/review",
            json=final_payload,
            params={"submit": "true"},
            headers=auth_headers(reviewer_token),
        )
        assert resp3.status_code == 200
        assert resp3.json()["status"] == "submitted"
        assert resp3.json()["review_id"] == review_id

    async def test_cannot_save_draft_after_submitted(
        self,
        client: AsyncClient,
        reviewer_token: str,
        assignment: CFPPaperAssignment,
        review_setup: tuple,
    ) -> None:
        """Once a review is submitted, attempting to save a draft also returns 400."""
        _scale, option, _criterion, question = review_setup
        payload = {
            "answers": [{"question_id": str(question.id), "selected_option_id": str(option.id)}],
            "speaker_feedback": VALID_FEEDBACK,
        }
        # Submit
        submit_resp = await client.post(
            f"{PORTAL_BASE}/assignments/{assignment.id}/review",
            json=payload,
            params={"submit": "true"},
            headers=auth_headers(reviewer_token),
        )
        assert submit_resp.status_code == 200

        # Try to re-save as draft — should fail too
        draft_resp = await client.post(
            f"{PORTAL_BASE}/assignments/{assignment.id}/review",
            json=payload,
            params={"submit": "false"},
            headers=auth_headers(reviewer_token),
        )
        assert draft_resp.status_code == 400


# ── 7. Speaker feedback visibility ───────────────────────────────────────────


@pytest.mark.asyncio
class TestSpeakerFeedbackVisibility:
    """Feedback visibility is gated on CFP 'completed' status."""

    async def test_author_sees_no_feedback_while_cfp_open(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        author_applicant: CFPApplicant,
        author_token: str,
        paper: CFPPaper,
        assignment: CFPPaperAssignment,
        committee_member: CFPCommitteeMember,
        cfp_obj: CallForPapers,
    ) -> None:
        """Feedback endpoint returns empty list when CFP is still open."""
        # Create a submitted review with feedback
        review = PaperReview(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            assignment_id=assignment.id,
            paper_id=paper.id,
            committee_member_id=committee_member.id,
            status=ReviewStatus.SUBMITTED.value,
            speaker_feedback="Hidden feedback",
            total_score=3.0,
        )
        db_session.add(review)
        await db_session.commit()

        resp = await client.get(
            f"{PORTAL_BASE}/papers/{paper.id}/feedback",
            headers=auth_headers(author_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"] == []
        assert data["total"] == 0

    async def test_author_sees_feedback_when_cfp_completed(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        author_applicant: CFPApplicant,
        author_token: str,
        paper: CFPPaper,
        assignment: CFPPaperAssignment,
        committee_member: CFPCommitteeMember,
        cfp_obj: CallForPapers,
    ) -> None:
        """Feedback is visible once CFP status transitions to 'completed'."""
        cfp_obj.status = "completed"
        await db_session.commit()

        review = PaperReview(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            assignment_id=assignment.id,
            paper_id=paper.id,
            committee_member_id=committee_member.id,
            status=ReviewStatus.SUBMITTED.value,
            speaker_feedback="You did a great job!",
            total_score=4.5,
        )
        db_session.add(review)
        await db_session.commit()

        resp = await client.get(
            f"{PORTAL_BASE}/papers/{paper.id}/feedback",
            headers=auth_headers(author_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        feedback_item = data["items"][0]
        assert feedback_item["speaker_feedback"] == "You did a great job!"
        assert feedback_item["total_score"] == 4.5

    async def test_only_submitted_reviews_appear_in_feedback(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        author_applicant: CFPApplicant,
        author_token: str,
        paper: CFPPaper,
        assignment: CFPPaperAssignment,
        committee_member: CFPCommitteeMember,
        cfp_obj: CallForPapers,
    ) -> None:
        """Draft reviews are not returned in speaker feedback even after CFP completes."""
        cfp_obj.status = "completed"
        await db_session.commit()

        # Create a DRAFT review (should not appear in feedback)
        draft_review = PaperReview(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            assignment_id=assignment.id,
            paper_id=paper.id,
            committee_member_id=committee_member.id,
            status=ReviewStatus.DRAFT.value,
            speaker_feedback="Draft not visible",
            total_score=None,
        )
        db_session.add(draft_review)
        await db_session.commit()

        resp = await client.get(
            f"{PORTAL_BASE}/papers/{paper.id}/feedback",
            headers=auth_headers(author_token),
        )
        assert resp.status_code == 200
        # Draft review should not surface to the author
        assert resp.json()["total"] == 0

    async def test_other_applicant_cannot_access_feedback_of_another_paper(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        other_applicant: CFPApplicant,
        other_token: str,
        paper: CFPPaper,
        cfp_obj: CallForPapers,
    ) -> None:
        """A third-party applicant (not the author) cannot retrieve feedback."""
        cfp_obj.status = "completed"
        await db_session.commit()

        resp = await client.get(
            f"{PORTAL_BASE}/papers/{paper.id}/feedback",
            headers=auth_headers(other_token),
        )
        # other_applicant is neither the main speaker nor a cospeaker → 404
        assert resp.status_code == 404

    async def test_unauthenticated_feedback_returns_401(
        self,
        client: AsyncClient,
        paper: CFPPaper,
    ) -> None:
        """Accessing the feedback endpoint without authentication returns 401."""
        resp = await client.get(f"{PORTAL_BASE}/papers/{paper.id}/feedback")
        assert resp.status_code == 401


# ── 8. Pending-count accuracy ────────────────────────────────────────────────


@pytest.mark.asyncio
class TestPendingCount:
    """Verifies the pending-count endpoint reflects actual review state."""

    async def test_pending_count_decreases_after_submission(
        self,
        client: AsyncClient,
        reviewer_token: str,
        assignment: CFPPaperAssignment,
        review_setup: tuple,
    ) -> None:
        """After submitting a review, the pending count drops by 1."""
        # Count before
        before = await client.get(
            f"{PORTAL_BASE}/assigned-papers/pending-count",
            headers=auth_headers(reviewer_token),
        )
        assert before.status_code == 200
        count_before = before.json()["pending_count"]

        # Submit the review
        _scale, option, _criterion, question = review_setup
        payload = {
            "answers": [{"question_id": str(question.id), "selected_option_id": str(option.id)}],
            "speaker_feedback": VALID_FEEDBACK,
        }
        submit_resp = await client.post(
            f"{PORTAL_BASE}/assignments/{assignment.id}/review",
            json=payload,
            params={"submit": "true"},
            headers=auth_headers(reviewer_token),
        )
        assert submit_resp.status_code == 200

        # Count after
        after = await client.get(
            f"{PORTAL_BASE}/assigned-papers/pending-count",
            headers=auth_headers(reviewer_token),
        )
        assert after.status_code == 200
        count_after = after.json()["pending_count"]

        assert count_after == count_before - 1

    async def test_pending_count_stays_same_for_draft(
        self,
        client: AsyncClient,
        reviewer_token: str,
        assignment: CFPPaperAssignment,
        review_setup: tuple,
    ) -> None:
        """Saving a draft does not reduce the pending count (not yet submitted)."""
        before = await client.get(
            f"{PORTAL_BASE}/assigned-papers/pending-count",
            headers=auth_headers(reviewer_token),
        )
        count_before = before.json()["pending_count"]

        _scale, option, _criterion, question = review_setup
        payload = {
            "answers": [{"question_id": str(question.id), "selected_option_id": str(option.id)}],
            "speaker_feedback": "Still a draft",
        }
        await client.post(
            f"{PORTAL_BASE}/assignments/{assignment.id}/review",
            json=payload,
            params={"submit": "false"},
            headers=auth_headers(reviewer_token),
        )

        after = await client.get(
            f"{PORTAL_BASE}/assigned-papers/pending-count",
            headers=auth_headers(reviewer_token),
        )
        # Draft should not change pending count
        assert after.json()["pending_count"] == count_before


# ── 9. Speaker feedback validation ───────────────────────────────────────────

VALID_FEEDBACK = "A" * 200  # exactly 200 plain-text chars — meets minimum


@pytest.mark.asyncio
class TestSpeakerFeedbackValidation:
    """Verifies that speaker feedback is required and >= 200 chars on final submit."""

    async def test_submit_with_no_feedback_when_enabled_returns_422(
        self,
        client: AsyncClient,
        reviewer_token: str,
        assignment: CFPPaperAssignment,
        review_setup: tuple,
    ) -> None:
        """Final submit with speaker_feedback=None and the field enabled → 422."""
        _scale, option, _criterion, question = review_setup
        payload = {
            "answers": [{"question_id": str(question.id), "selected_option_id": str(option.id)}],
            "speaker_feedback": None,
            "must_have": False,
        }
        resp = await client.post(
            f"{PORTAL_BASE}/assignments/{assignment.id}/review",
            json=payload,
            params={"submit": "true"},
            headers=auth_headers(reviewer_token),
        )
        assert resp.status_code == 422

    async def test_submit_with_short_feedback_returns_422(
        self,
        client: AsyncClient,
        reviewer_token: str,
        assignment: CFPPaperAssignment,
        review_setup: tuple,
    ) -> None:
        """Final submit with speaker_feedback < 200 plain-text chars → 422."""
        _scale, option, _criterion, question = review_setup
        payload = {
            "answers": [{"question_id": str(question.id), "selected_option_id": str(option.id)}],
            "speaker_feedback": "Too short",
            "must_have": False,
        }
        resp = await client.post(
            f"{PORTAL_BASE}/assignments/{assignment.id}/review",
            json=payload,
            params={"submit": "true"},
            headers=auth_headers(reviewer_token),
        )
        assert resp.status_code == 422

    async def test_submit_with_199_char_feedback_returns_422(
        self,
        client: AsyncClient,
        reviewer_token: str,
        assignment: CFPPaperAssignment,
        review_setup: tuple,
    ) -> None:
        """Exactly 199 plain-text chars is still too short → 422."""
        _scale, option, _criterion, question = review_setup
        payload = {
            "answers": [{"question_id": str(question.id), "selected_option_id": str(option.id)}],
            "speaker_feedback": "A" * 199,
            "must_have": False,
        }
        resp = await client.post(
            f"{PORTAL_BASE}/assignments/{assignment.id}/review",
            json=payload,
            params={"submit": "true"},
            headers=auth_headers(reviewer_token),
        )
        assert resp.status_code == 422

    async def test_submit_with_exactly_200_char_feedback_passes(
        self,
        client: AsyncClient,
        reviewer_token: str,
        assignment: CFPPaperAssignment,
        review_setup: tuple,
    ) -> None:
        """Exactly 200 plain-text chars is the minimum and should pass → 200."""
        _scale, option, _criterion, question = review_setup
        payload = {
            "answers": [{"question_id": str(question.id), "selected_option_id": str(option.id)}],
            "speaker_feedback": VALID_FEEDBACK,
            "must_have": False,
        }
        resp = await client.post(
            f"{PORTAL_BASE}/assignments/{assignment.id}/review",
            json=payload,
            params={"submit": "true"},
            headers=auth_headers(reviewer_token),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "submitted"

    async def test_submit_with_html_feedback_counts_plain_text(
        self,
        client: AsyncClient,
        reviewer_token: str,
        assignment: CFPPaperAssignment,
        review_setup: tuple,
    ) -> None:
        """HTML tags are stripped before length check; 200 plain-text chars in HTML passes."""
        _scale, option, _criterion, question = review_setup
        html_feedback = f"<p>{'A' * 200}</p>"
        payload = {
            "answers": [{"question_id": str(question.id), "selected_option_id": str(option.id)}],
            "speaker_feedback": html_feedback,
            "must_have": False,
        }
        resp = await client.post(
            f"{PORTAL_BASE}/assignments/{assignment.id}/review",
            json=payload,
            params={"submit": "true"},
            headers=auth_headers(reviewer_token),
        )
        assert resp.status_code == 200

    async def test_save_draft_with_short_feedback_passes(
        self,
        client: AsyncClient,
        reviewer_token: str,
        assignment: CFPPaperAssignment,
        review_setup: tuple,
    ) -> None:
        """Draft save with short feedback is always allowed; validation only fires on submit."""
        _scale, option, _criterion, question = review_setup
        payload = {
            "answers": [{"question_id": str(question.id), "selected_option_id": str(option.id)}],
            "speaker_feedback": "Short draft",
            "must_have": False,
        }
        resp = await client.post(
            f"{PORTAL_BASE}/assignments/{assignment.id}/review",
            json=payload,
            params={"submit": "false"},
            headers=auth_headers(reviewer_token),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "draft"

    async def test_submit_with_feedback_disabled_and_no_feedback_passes(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        reviewer_token: str,
        assignment: CFPPaperAssignment,
        review_setup: tuple,
    ) -> None:
        """When enable_speaker_feedback=False, feedback is not required on submit."""
        from app.models.review import ReviewFormSettings

        settings = ReviewFormSettings(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            enable_speaker_feedback=False,
            enable_internal_comment=True,
            enable_must_have=True,
        )
        db_session.add(settings)
        await db_session.commit()

        _scale, option, _criterion, question = review_setup
        payload = {
            "answers": [{"question_id": str(question.id), "selected_option_id": str(option.id)}],
            "speaker_feedback": None,
            "must_have": False,
        }
        resp = await client.post(
            f"{PORTAL_BASE}/assignments/{assignment.id}/review",
            json=payload,
            params={"submit": "true"},
            headers=auth_headers(reviewer_token),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "submitted"


# ── Session type validity in reviewer view ───────────────────────────────────


@pytest.mark.asyncio
class TestAssignedPaperSessionTypeDisplay:
    """Reviewer-facing session_type_name must only show valid CFP session types.

    A paper can have a stale session_type_id pointing to an inactive or
    non-cfp-eligible session type. The reviewer should see session_type_name=None
    in that case, matching what the management form shows.
    """

    async def test_invalid_session_type_hidden_from_reviewer(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        reviewer_token: str,
        cfp_obj: CallForPapers,
        reviewer_applicant: CFPApplicant,
        committee_member: CFPCommitteeMember,
    ) -> None:
        """Paper linked to non-cfp-eligible session type → session_type_name is null."""
        from app.models.settings import SessionType

        invalid_st = SessionType(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            name="Masterclass",
            slug="masterclass",
            duration_minutes=360,
            cfp_eligible=False,
            is_active=True,
        )
        db_session.add(invalid_st)
        await db_session.flush()

        author = _make_applicant(tenant, "Author", "Smith")
        db_session.add(author)
        await db_session.flush()

        paper = CFPPaper(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            cfp_id=cfp_obj.id,
            main_speaker_id=author.id,
            title="Paper With Invalid Type",
            abstract_short="Short abstract",
            status=PaperStatus.IN_EVALUATION.value,
            session_type_id=invalid_st.id,
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
            f"{PORTAL_BASE}/assigned-papers",
            headers=auth_headers(reviewer_token),
        )
        assert resp.status_code == 200
        items = resp.json()["items"]
        match = next((i for i in items if i["id"] == str(paper.id)), None)
        assert match is not None
        assert match["session_type_name"] is None

    async def test_valid_session_type_shown_to_reviewer(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        reviewer_token: str,
        cfp_obj: CallForPapers,
        reviewer_applicant: CFPApplicant,
        committee_member: CFPCommitteeMember,
    ) -> None:
        """Paper linked to active, cfp-eligible session type → session_type_name resolves."""
        from app.models.settings import SessionType

        valid_st = SessionType(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            name="Talk",
            slug="talk",
            duration_minutes=45,
            cfp_eligible=True,
            is_active=True,
        )
        db_session.add(valid_st)
        await db_session.flush()

        author = _make_applicant(tenant, "Author2", "Jones")
        db_session.add(author)
        await db_session.flush()

        paper = CFPPaper(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            cfp_id=cfp_obj.id,
            main_speaker_id=author.id,
            title="Paper With Valid Type",
            abstract_short="Short abstract",
            status=PaperStatus.IN_EVALUATION.value,
            session_type_id=valid_st.id,
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
            f"{PORTAL_BASE}/assigned-papers",
            headers=auth_headers(reviewer_token),
        )
        assert resp.status_code == 200
        items = resp.json()["items"]
        match = next((i for i in items if i["id"] == str(paper.id)), None)
        assert match is not None
        assert match["session_type_name"] == "Talk"

    async def test_no_session_type_returns_null(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        reviewer_token: str,
        cfp_obj: CallForPapers,
        committee_member: CFPCommitteeMember,
    ) -> None:
        """Paper with no session_type_id → session_type_name is null."""
        author = _make_applicant(tenant, "Author3", "Brown")
        db_session.add(author)
        await db_session.flush()

        paper = CFPPaper(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            cfp_id=cfp_obj.id,
            main_speaker_id=author.id,
            title="Paper With No Type",
            abstract_short="Short abstract",
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
            f"{PORTAL_BASE}/assigned-papers",
            headers=auth_headers(reviewer_token),
        )
        assert resp.status_code == 200
        items = resp.json()["items"]
        match = next((i for i in items if i["id"] == str(paper.id)), None)
        assert match is not None
        assert match["session_type_name"] is None
