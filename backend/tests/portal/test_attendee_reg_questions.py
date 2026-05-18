"""RED — portal attendee registration question endpoints.

Tests for:
  GET  /portal/attendee/registration-questions/pending
  POST /portal/conferences/{conference_id}/attendee/registration-questions/answers

Three requirements:
  1. pending endpoint returns conferences where portal user is registered
     and has unanswered mandatory questions.
  2. submit endpoint stores answers with portal_user_id set, applicant_id NULL.
  3. re-submitting (idempotent) updates existing answers, not duplicates.

CFP applicant flow (existing endpoints) must be untouched.
"""

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.core.security.pii_crypto import hash_email
from app.core.portal_security import create_portal_access_token
from app.models.booking import BookingOption, BookingPeriod
from app.models.conference import Conference
from app.models.portal_user import PortalUser
from app.models.registration import BillingProfile, Registration, RegistrationStatus
from app.models.registration_question_answer import RegistrationQuestionAnswer
from app.models.tenant import Tenant

# ---------------------------------------------------------------------------
# Sample question config
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture()
async def conf_with_questions(db_session: AsyncSession, tenant: Tenant) -> Conference:
    """Conference with registration questions enabled."""
    c = Conference(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="Attendee Q Test Conf",
        abbreviation="AQTC",
        is_active=True,
        settings={
            "registration_questions": {
                "enabled": True,
                "questions": SAMPLE_QUESTIONS,
            }
        },
    )
    db_session.add(c)
    await db_session.commit()
    return c


@pytest_asyncio.fixture()
async def portal_user(db_session: AsyncSession, tenant: Tenant) -> PortalUser:
    """Portal user (attendee-only, no CFP applicant row)."""
    u = PortalUser(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Alice",
        last_name="Attendee",
        is_active=True,
    )
    u.email = f"alice-att-{uuid.uuid4().hex[:8]}@example.com"
    db_session.add(u)
    await db_session.commit()
    return u


@pytest_asyncio.fixture()
async def portal_token(portal_user: PortalUser, tenant: Tenant) -> str:
    return create_portal_access_token(portal_user.id, tenant.id)


@pytest_asyncio.fixture()
async def registered_portal_user(
    db_session: AsyncSession,
    portal_user: PortalUser,
    conf_with_questions: Conference,
    tenant: Tenant,
) -> PortalUser:
    """Portal user with an active Registration for conf_with_questions."""
    from datetime import date, timedelta

    bp = BookingPeriod(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conf_with_questions.id,
        name="Standard",
        start_date=date.today() - timedelta(days=30),
        end_date=date.today() + timedelta(days=30),
    )
    db_session.add(bp)
    await db_session.flush()

    bo = BookingOption(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conf_with_questions.id,
        name="Full Conference",
        is_active=True,
    )
    db_session.add(bo)
    await db_session.flush()

    billing = BillingProfile(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conf_with_questions.id,
        company_name="Test Co",
        street="123 Test St",
        city="Berlin",
        postal_code="10115",
        country="DE",
        contact_first_name="Alice",
        contact_last_name="Attendee",
        contact_phone="+4930123456",
        contact_email=portal_user.email,
    )
    db_session.add(billing)
    await db_session.flush()

    reg = Registration(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conf_with_questions.id,
        billing_profile_id=billing.id,
        booking_option_id=bo.id,
        status=RegistrationStatus.PAID,
        first_name="Alice",
        last_name="Attendee",
    )
    # Registration.email is set via the property that also syncs email_hash
    reg.email = portal_user.email
    db_session.add(reg)
    await db_session.commit()
    return portal_user


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# 1. Pending questions — returns conferences with unanswered mandatory Qs
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_pending_questions_returns_conference_for_attendee(
    client: AsyncClient,
    registered_portal_user: PortalUser,
    portal_token: str,
    conf_with_questions: Conference,
) -> None:
    """Attendee with a registration and no answers gets the conference listed."""
    resp = await client.get(
        "/api/v1/portal/attendee/registration-questions/pending",
        headers=_auth(portal_token),
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["has_any_mandatory_pending"] is True
    conf_ids = [c["conference_id"] for c in data["conferences"]]
    assert str(conf_with_questions.id) in conf_ids


@pytest.mark.asyncio
async def test_pending_questions_empty_when_no_registration(
    client: AsyncClient,
    portal_user: PortalUser,
    portal_token: str,
) -> None:
    """Portal user with no registration gets an empty pending list."""
    resp = await client.get(
        "/api/v1/portal/attendee/registration-questions/pending",
        headers=_auth(portal_token),
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["has_any_mandatory_pending"] is False
    assert data["conferences"] == []


# ---------------------------------------------------------------------------
# 2. Submit answers — stored with portal_user_id, applicant_id NULL
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_submit_answers_stores_portal_user_id(
    client: AsyncClient,
    db_session: AsyncSession,
    registered_portal_user: PortalUser,
    portal_token: str,
    conf_with_questions: Conference,
) -> None:
    """Submitted answers must have portal_user_id set and applicant_id NULL."""
    payload = {
        "answers": [
            {"question_id": "q-meal", "answer_value": "true"},
            {"question_id": "q-tshirt", "answer_value": "M"},
        ]
    }
    resp = await client.post(
        f"/api/v1/portal/conferences/{conf_with_questions.id}/attendee/registration-questions/answers",
        json=payload,
        headers=_auth(portal_token),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["answers_saved"] == 2

    rows = (
        await db_session.execute(
            select(RegistrationQuestionAnswer).where(
                RegistrationQuestionAnswer.conference_id == conf_with_questions.id,
                RegistrationQuestionAnswer.portal_user_id == registered_portal_user.id,
            )
        )
    ).scalars().all()

    assert len(rows) == 2
    for row in rows:
        assert row.applicant_id is None
        assert row.portal_user_id == registered_portal_user.id


@pytest.mark.asyncio
async def test_submit_answers_rejects_unregistered_attendee(
    client: AsyncClient,
    portal_user: PortalUser,
    portal_token: str,
    conf_with_questions: Conference,
) -> None:
    """Portal user without a registration must get 422."""
    payload = {
        "answers": [
            {"question_id": "q-meal", "answer_value": "true"},
            {"question_id": "q-tshirt", "answer_value": "M"},
        ]
    }
    resp = await client.post(
        f"/api/v1/portal/conferences/{conf_with_questions.id}/attendee/registration-questions/answers",
        json=payload,
        headers=_auth(portal_token),
    )
    assert resp.status_code == 400, resp.text


# ---------------------------------------------------------------------------
# 3. Idempotent re-submit — updates existing rows, no duplicates
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_resubmit_updates_existing_answers(
    client: AsyncClient,
    db_session: AsyncSession,
    registered_portal_user: PortalUser,
    portal_token: str,
    conf_with_questions: Conference,
) -> None:
    """Re-submitting the same question updates the answer value in-place."""
    headers = _auth(portal_token)
    url = f"/api/v1/portal/conferences/{conf_with_questions.id}/attendee/registration-questions/answers"

    # First submit — all mandatory questions
    await client.post(
        url,
        json={"answers": [
            {"question_id": "q-meal", "answer_value": "true"},
            {"question_id": "q-tshirt", "answer_value": "S"},
        ]},
        headers=headers,
    )

    # Second submit — update q-tshirt (mandatory Qs still included)
    resp = await client.post(
        url,
        json={"answers": [
            {"question_id": "q-meal", "answer_value": "true"},
            {"question_id": "q-tshirt", "answer_value": "XL"},
        ]},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text

    rows = (
        await db_session.execute(
            select(RegistrationQuestionAnswer).where(
                RegistrationQuestionAnswer.conference_id == conf_with_questions.id,
                RegistrationQuestionAnswer.portal_user_id == registered_portal_user.id,
                RegistrationQuestionAnswer.question_id == "q-tshirt",
            )
        )
    ).scalars().all()

    assert len(rows) == 1, "Re-submit must update, not duplicate"
    assert rows[0].answer_value == "XL"


# ---------------------------------------------------------------------------
# 4. Pending clears after answering all mandatory questions
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_pending_clears_after_all_mandatory_answered(
    client: AsyncClient,
    registered_portal_user: PortalUser,
    portal_token: str,
    conf_with_questions: Conference,
) -> None:
    """Pending endpoint shows no mandatory questions once all are answered."""
    headers = _auth(portal_token)

    await client.post(
        f"/api/v1/portal/conferences/{conf_with_questions.id}/attendee/registration-questions/answers",
        json={
            "answers": [
                {"question_id": "q-meal", "answer_value": "true"},
                {"question_id": "q-tshirt", "answer_value": "L"},
            ]
        },
        headers=headers,
    )

    resp = await client.get(
        "/api/v1/portal/attendee/registration-questions/pending",
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["has_any_mandatory_pending"] is False
