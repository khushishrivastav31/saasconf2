"""Tests for registration questions settings and portal answer endpoints."""

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.core.applicant_security import create_applicant_access_token
from app.core.security import hash_password
from app.models.booking import BookingOption, BookingPeriod
from app.models.cfp_applicants import CFPApplicant
from app.models.conference import Conference
from app.models.registration import BillingProfile, Registration, RegistrationStatus
from app.models.tenant import Tenant


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# --- Fixtures ---


SAMPLE_QUESTIONS = [
    {
        "id": "q-meal",
        "text": "Do you need a vegetarian meal?",
        "type": "checkbox",
        "required": True,
        "options": [],
        "sort_order": 0,
        "is_active": True,
    },
    {
        "id": "q-tshirt",
        "text": "What T-shirt size do you prefer?",
        "type": "radio",
        "required": True,
        "options": ["S", "M", "L", "XL"],
        "sort_order": 1,
        "is_active": True,
    },
    {
        "id": "q-dietary",
        "text": "Any dietary requirements?",
        "type": "text",
        "required": False,
        "options": [],
        "sort_order": 2,
        "is_active": True,
    },
]


@pytest_asyncio.fixture
async def questions_conference(db_session: AsyncSession, conference: Conference) -> Conference:
    """Conference with registration questions configured."""
    conference.settings = {
        **(conference.settings or {}),
        "registration_questions": {
            "enabled": True,
            "questions": SAMPLE_QUESTIONS,
        },
    }
    flag_modified(conference, "settings")
    await db_session.commit()
    await db_session.refresh(conference)
    return conference


@pytest_asyncio.fixture
async def applicant(db_session: AsyncSession, tenant: Tenant) -> CFPApplicant:
    """Create a CFP applicant."""
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Jane",
        last_name="Tester",
        email=f"jane-rq-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Password123!"),
    )
    db_session.add(a)
    await db_session.commit()
    return a


@pytest.fixture
def applicant_token(applicant: CFPApplicant, tenant: Tenant) -> str:
    return create_applicant_access_token(applicant.id, tenant.id)


@pytest_asyncio.fixture
async def registered_applicant(
    db_session: AsyncSession,
    applicant: CFPApplicant,
    questions_conference: Conference,
    tenant: Tenant,
) -> CFPApplicant:
    """Applicant with a registration for the conference (needs billing profile + booking option)."""
    from datetime import date, timedelta

    # Create booking period
    bp = BookingPeriod(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=questions_conference.id,
        name="Standard",
        start_date=date.today() - timedelta(days=30),
        end_date=date.today() + timedelta(days=30),
    )
    db_session.add(bp)
    await db_session.flush()

    # Create booking option
    bo = BookingOption(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=questions_conference.id,
        name="Full Conference",
    )
    db_session.add(bo)
    await db_session.flush()

    # Create billing profile
    billing = BillingProfile(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=questions_conference.id,
        company_name="Test Co",
        street="123 Test St",
        city="Berlin",
        postal_code="10115",
        country="DE",
        contact_first_name="Jane",
        contact_last_name="Tester",
        contact_phone="+4930123456",
        contact_email=applicant.email,
    )
    db_session.add(billing)
    await db_session.flush()

    reg = Registration(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=questions_conference.id,
        billing_profile_id=billing.id,
        booking_option_id=bo.id,
        first_name=applicant.first_name,
        last_name=applicant.last_name,
        email=applicant.email,
        status=RegistrationStatus.REGISTERED_PENDING_INVOICE,
    )
    db_session.add(reg)
    await db_session.commit()
    return applicant


# --- Admin Settings Tests ---


@pytest.mark.asyncio
async def test_get_questions_default(
    client: AsyncClient, conference: Conference, tenant_admin_token: str
):
    """GET returns defaults when no questions configured."""
    resp = await client.get(
        f"/api/v1/conferences/{conference.id}/settings/registration-questions",
        headers=auth(tenant_admin_token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["enabled"] is False
    assert data["questions"] == []


@pytest.mark.asyncio
async def test_get_questions_configured(
    client: AsyncClient, questions_conference: Conference, tenant_admin_token: str
):
    """GET returns configured questions."""
    resp = await client.get(
        f"/api/v1/conferences/{questions_conference.id}/settings/registration-questions",
        headers=auth(tenant_admin_token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["enabled"] is True
    assert len(data["questions"]) == 3
    assert data["questions"][0]["id"] == "q-meal"
    assert data["questions"][1]["type"] == "radio"
    assert len(data["questions"][1]["options"]) == 4


@pytest.mark.asyncio
async def test_update_questions(
    client: AsyncClient, conference: Conference, tenant_admin_token: str
):
    """PUT saves questions correctly."""
    resp = await client.put(
        f"/api/v1/conferences/{conference.id}/settings/registration-questions",
        headers=auth(tenant_admin_token),
        json={
            "enabled": True,
            "questions": [
                {
                    "id": "q1",
                    "text": "Are you attending the dinner?",
                    "type": "checkbox",
                    "required": False,
                    "options": [],
                    "sort_order": 0,
                    "is_active": True,
                }
            ],
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["enabled"] is True
    assert len(data["questions"]) == 1
    assert data["questions"][0]["text"] == "Are you attending the dinner?"


@pytest.mark.asyncio
async def test_update_radio_requires_options(
    client: AsyncClient, conference: Conference, tenant_admin_token: str
):
    """PUT rejects radio questions with fewer than 2 options."""
    resp = await client.put(
        f"/api/v1/conferences/{conference.id}/settings/registration-questions",
        headers=auth(tenant_admin_token),
        json={
            "enabled": True,
            "questions": [
                {
                    "id": "q1",
                    "text": "Choose one",
                    "type": "radio",
                    "required": True,
                    "options": ["Only one"],
                    "sort_order": 0,
                    "is_active": True,
                }
            ],
        },
    )
    assert resp.status_code == 400
    assert "at least 2 options" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_update_duplicate_ids_rejected(
    client: AsyncClient, conference: Conference, tenant_admin_token: str
):
    """PUT rejects duplicate question IDs."""
    resp = await client.put(
        f"/api/v1/conferences/{conference.id}/settings/registration-questions",
        headers=auth(tenant_admin_token),
        json={
            "enabled": True,
            "questions": [
                {"id": "same-id", "text": "Q1", "type": "text", "required": False, "options": [], "sort_order": 0, "is_active": True},
                {"id": "same-id", "text": "Q2", "type": "text", "required": False, "options": [], "sort_order": 1, "is_active": True},
            ],
        },
    )
    assert resp.status_code == 400
    assert "Duplicate" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_requires_admin(
    client: AsyncClient, conference: Conference, regular_user_token: str
):
    """PUT requires admin access."""
    resp = await client.put(
        f"/api/v1/conferences/{conference.id}/settings/registration-questions",
        headers=auth(regular_user_token),
        json={"enabled": True, "questions": []},
    )
    assert resp.status_code == 403


# --- Portal Pending Questions Tests ---


@pytest.mark.asyncio
async def test_pending_questions_no_registration(
    client: AsyncClient,
    questions_conference: Conference,
    applicant_token: str,
):
    """Applicant without registration sees no pending questions."""
    resp = await client.get(
        "/api/v1/portal/registration-questions/pending",
        headers=auth(applicant_token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["has_any_mandatory_pending"] is False
    assert len(data["conferences"]) == 0


@pytest.mark.asyncio
async def test_pending_questions_with_registration(
    client: AsyncClient,
    registered_applicant: CFPApplicant,
    applicant_token: str,
    questions_conference: Conference,
):
    """Registered applicant sees pending questions."""
    resp = await client.get(
        "/api/v1/portal/registration-questions/pending",
        headers=auth(applicant_token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["has_any_mandatory_pending"] is True
    assert len(data["conferences"]) == 1
    conf = data["conferences"][0]
    assert conf["conference_name"] == questions_conference.name
    assert len(conf["questions"]) == 3
    assert conf["has_mandatory_pending"] is True


# --- Portal Submit Answers Tests ---


@pytest.mark.asyncio
async def test_submit_answers_success(
    client: AsyncClient,
    registered_applicant: CFPApplicant,
    applicant_token: str,
    questions_conference: Conference,
):
    """Submit valid answers succeeds."""
    resp = await client.post(
        f"/api/v1/portal/conferences/{questions_conference.id}/registration-questions/answers",
        headers=auth(applicant_token),
        json={
            "answers": [
                {"question_id": "q-meal", "answer_value": "true"},
                {"question_id": "q-tshirt", "answer_value": "L"},
                {"question_id": "q-dietary", "answer_value": "No nuts"},
            ]
        },
    )
    assert resp.status_code == 200
    assert resp.json()["answers_saved"] == 3

    # Verify pending questions are now empty
    pending = await client.get(
        "/api/v1/portal/registration-questions/pending",
        headers=auth(applicant_token),
    )
    assert pending.json()["has_any_mandatory_pending"] is False


@pytest.mark.asyncio
async def test_submit_missing_mandatory(
    client: AsyncClient,
    registered_applicant: CFPApplicant,
    applicant_token: str,
    questions_conference: Conference,
):
    """Submit without mandatory answer fails."""
    resp = await client.post(
        f"/api/v1/portal/conferences/{questions_conference.id}/registration-questions/answers",
        headers=auth(applicant_token),
        json={
            "answers": [
                {"question_id": "q-dietary", "answer_value": "Vegan"},
            ]
        },
    )
    assert resp.status_code == 400
    assert "Mandatory question" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_submit_invalid_radio_option(
    client: AsyncClient,
    registered_applicant: CFPApplicant,
    applicant_token: str,
    questions_conference: Conference,
):
    """Submit with invalid radio option fails."""
    resp = await client.post(
        f"/api/v1/portal/conferences/{questions_conference.id}/registration-questions/answers",
        headers=auth(applicant_token),
        json={
            "answers": [
                {"question_id": "q-meal", "answer_value": "true"},
                {"question_id": "q-tshirt", "answer_value": "XXL"},
            ]
        },
    )
    assert resp.status_code == 400
    assert "Invalid option" in resp.json()["detail"]


# --- Admin Answers View Tests ---


@pytest.mark.asyncio
async def test_admin_answers_empty(
    client: AsyncClient, questions_conference: Conference, tenant_admin_token: str
):
    """Admin sees empty answers when none submitted."""
    resp = await client.get(
        f"/api/v1/conferences/{questions_conference.id}/registration-question-answers",
        headers=auth(tenant_admin_token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 0
    assert data["items"] == []


@pytest.mark.asyncio
async def test_admin_answers_after_submission(
    client: AsyncClient,
    registered_applicant: CFPApplicant,
    applicant_token: str,
    questions_conference: Conference,
    tenant_admin_token: str,
):
    """Admin sees answers after applicant submits."""
    # Submit answers first
    await client.post(
        f"/api/v1/portal/conferences/{questions_conference.id}/registration-questions/answers",
        headers=auth(applicant_token),
        json={
            "answers": [
                {"question_id": "q-meal", "answer_value": "true"},
                {"question_id": "q-tshirt", "answer_value": "M"},
            ]
        },
    )

    # Admin views
    resp = await client.get(
        f"/api/v1/conferences/{questions_conference.id}/registration-question-answers",
        headers=auth(tenant_admin_token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    item = data["items"][0]
    assert item["applicant_email"] == registered_applicant.email
    assert len(item["answers"]) == 2
    answer_map = {a["question_id"]: a["answer_value"] for a in item["answers"]}
    assert answer_map["q-meal"] == "true"
    assert answer_map["q-tshirt"] == "M"
