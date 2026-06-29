"""Portal-side speaker expense tests.

Covers:
- Speaker can create a draft, update it, and submit it
- GET /portal/expenses returns only the caller's expenses (cross-applicant isolation)
- Submitting draft → submitted and triggers send_expense_submitted
- Tenant isolation holds
"""

import os
import uuid
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://saasconf:saasconf_dev_password@localhost:5432/saasconf_test")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-unit-tests-minimum-32-chars")
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "testpassword123")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")
os.environ["RATELIMIT_ENABLED"] = "false"

from app.core.applicant_security import create_applicant_access_token
from app.core.security import hash_password
from app.models.cfp_applicants import CFPApplicant
from app.models.conference import Conference
from app.models.speaker_expense import SpeakerExpense
from app.models.tenant import Tenant


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture()
async def applicant(db_session: AsyncSession, tenant: Tenant) -> CFPApplicant:
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
    await db_session.refresh(a)
    return a


@pytest_asyncio.fixture()
async def applicant2(db_session: AsyncSession, tenant: Tenant) -> CFPApplicant:
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Bob",
        last_name="Other",
        email=f"bob-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Password123!"),
    )
    db_session.add(a)
    await db_session.commit()
    await db_session.refresh(a)
    return a


@pytest.fixture()
def token(applicant: CFPApplicant, tenant: Tenant) -> str:
    return create_applicant_access_token(applicant.id, tenant.id)


@pytest.fixture()
def token2(applicant2: CFPApplicant, tenant: Tenant) -> str:
    return create_applicant_access_token(applicant2.id, tenant.id)


def _expense_payload(conference_id: uuid.UUID) -> dict:
    return {
        "conference_id": str(conference_id),
        "title": "Flight to conf",
        "expense_date": str(date.today()),
        "original_amount": "320.00",
        "original_currency": "EUR",
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestPortalExpenseLifecycle:
    """Speaker can create, update, and submit their own expense."""

    async def test_create_draft(
        self,
        client: AsyncClient,
        conference: Conference,
        applicant: CFPApplicant,
        token: str,
    ) -> None:
        resp = await client.post(
            "/api/v1/portal/expenses",
            json=_expense_payload(conference.id),
            headers=_auth(token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["status"] == "draft"
        assert "id" in data

    async def test_update_draft(
        self,
        client: AsyncClient,
        conference: Conference,
        applicant: CFPApplicant,
        token: str,
    ) -> None:
        create_resp = await client.post(
            "/api/v1/portal/expenses",
            json=_expense_payload(conference.id),
            headers=_auth(token),
        )
        assert create_resp.status_code == 201
        expense_id = create_resp.json()["id"]

        update_resp = await client.put(
            f"/api/v1/portal/expenses/{expense_id}",
            json={"title": "Updated title", "original_amount": "400.00"},
            headers=_auth(token),
        )
        assert update_resp.status_code == 200

    async def test_submit_transitions_to_submitted(
        self,
        client: AsyncClient,
        conference: Conference,
        applicant: CFPApplicant,
        token: str,
    ) -> None:
        create_resp = await client.post(
            "/api/v1/portal/expenses",
            json=_expense_payload(conference.id),
            headers=_auth(token),
        )
        assert create_resp.status_code == 201
        expense_id = create_resp.json()["id"]

        with patch(
            "app.api.v1.cfp_portal.speaker_expenses.send_expense_submitted",
            new_callable=AsyncMock,
            return_value=True,
        ):
            submit_resp = await client.post(
                f"/api/v1/portal/expenses/{expense_id}/submit",
                headers=_auth(token),
            )
        assert submit_resp.status_code == 200
        assert submit_resp.json()["status"] == "submitted"

    async def test_submit_calls_expense_submitted_email(
        self,
        client: AsyncClient,
        conference: Conference,
        applicant: CFPApplicant,
        token: str,
    ) -> None:
        create_resp = await client.post(
            "/api/v1/portal/expenses",
            json=_expense_payload(conference.id),
            headers=_auth(token),
        )
        assert create_resp.status_code == 201
        expense_id = create_resp.json()["id"]

        mock_send = AsyncMock(return_value=True)
        with patch(
            "app.api.v1.cfp_portal.speaker_expenses.send_expense_submitted",
            mock_send,
        ):
            submit_resp = await client.post(
                f"/api/v1/portal/expenses/{expense_id}/submit",
                headers=_auth(token),
            )
        assert submit_resp.status_code == 200
        mock_send.assert_awaited_once()

    async def test_cannot_submit_already_submitted(
        self,
        client: AsyncClient,
        conference: Conference,
        applicant: CFPApplicant,
        token: str,
    ) -> None:
        create_resp = await client.post(
            "/api/v1/portal/expenses",
            json=_expense_payload(conference.id),
            headers=_auth(token),
        )
        expense_id = create_resp.json()["id"]

        with patch("app.api.v1.cfp_portal.speaker_expenses.send_expense_submitted", new_callable=AsyncMock):
            await client.post(f"/api/v1/portal/expenses/{expense_id}/submit", headers=_auth(token))
            resp = await client.post(f"/api/v1/portal/expenses/{expense_id}/submit", headers=_auth(token))
        assert resp.status_code == 400


@pytest.mark.asyncio
class TestPortalExpenseIsolation:
    """Cross-applicant and tenant isolation."""

    async def test_list_returns_only_own_expenses(
        self,
        client: AsyncClient,
        conference: Conference,
        applicant: CFPApplicant,
        applicant2: CFPApplicant,
        token: str,
        token2: str,
    ) -> None:
        # applicant1 creates one expense
        r1 = await client.post(
            "/api/v1/portal/expenses",
            json=_expense_payload(conference.id),
            headers=_auth(token),
        )
        assert r1.status_code == 201

        # applicant2 creates one expense
        r2 = await client.post(
            "/api/v1/portal/expenses",
            json=_expense_payload(conference.id),
            headers=_auth(token2),
        )
        assert r2.status_code == 201

        # applicant1 can only see their own
        list_resp = await client.get("/api/v1/portal/expenses", headers=_auth(token))
        assert list_resp.status_code == 200
        items = list_resp.json()["items"]
        ids = [i["id"] for i in items]
        assert r1.json()["id"] in ids
        assert r2.json()["id"] not in ids

    async def test_cannot_update_other_applicants_expense(
        self,
        client: AsyncClient,
        conference: Conference,
        applicant: CFPApplicant,
        applicant2: CFPApplicant,
        token: str,
        token2: str,
    ) -> None:
        # applicant1 creates expense
        r1 = await client.post(
            "/api/v1/portal/expenses",
            json=_expense_payload(conference.id),
            headers=_auth(token),
        )
        expense_id = r1.json()["id"]

        # applicant2 tries to update it
        resp = await client.put(
            f"/api/v1/portal/expenses/{expense_id}",
            json={"title": "Hacked"},
            headers=_auth(token2),
        )
        assert resp.status_code == 404

    async def test_cannot_submit_other_applicants_expense(
        self,
        client: AsyncClient,
        conference: Conference,
        applicant: CFPApplicant,
        applicant2: CFPApplicant,
        token: str,
        token2: str,
    ) -> None:
        r1 = await client.post(
            "/api/v1/portal/expenses",
            json=_expense_payload(conference.id),
            headers=_auth(token),
        )
        expense_id = r1.json()["id"]

        resp = await client.post(
            f"/api/v1/portal/expenses/{expense_id}/submit",
            headers=_auth(token2),
        )
        assert resp.status_code == 404

    async def test_unauthenticated_request_rejected(
        self,
        client: AsyncClient,
    ) -> None:
        resp = await client.get("/api/v1/portal/expenses")
        assert resp.status_code == 401


@pytest.mark.asyncio
class TestPortalExpenseThreadCreation:
    """Submitting an expense creates a MessageThread that lights up the admin bell."""

    async def test_submit_creates_message_thread(
        self,
        client: AsyncClient,
        conference: Conference,
        applicant: CFPApplicant,
        token: str,
        db_session: AsyncSession,
    ) -> None:
        from app.models.messaging import MessageThread

        create_resp = await client.post(
            "/api/v1/portal/expenses",
            json=_expense_payload(conference.id),
            headers=_auth(token),
        )
        expense_id = create_resp.json()["id"]

        await client.post(
            f"/api/v1/portal/expenses/{expense_id}/submit",
            headers=_auth(token),
        )

        threads = (
            await db_session.execute(
                select(MessageThread).where(
                    MessageThread.conference_id == conference.id,
                    MessageThread.tenant_id == conference.tenant_id,
                )
            )
        ).scalars().all()
        assert len(threads) == 1
        assert "expense" in threads[0].subject.lower()

    async def test_submit_thread_participants_read_state(
        self,
        client: AsyncClient,
        conference: Conference,
        applicant: CFPApplicant,
        token: str,
        db_session: AsyncSession,
        tenant_admin_user,
    ) -> None:
        from app.models.messaging import MessageParticipant, MessageThread

        create_resp = await client.post(
            "/api/v1/portal/expenses",
            json=_expense_payload(conference.id),
            headers=_auth(token),
        )
        expense_id = create_resp.json()["id"]
        await client.post(f"/api/v1/portal/expenses/{expense_id}/submit", headers=_auth(token))

        thread = (
            await db_session.execute(
                select(MessageThread).where(MessageThread.conference_id == conference.id)
            )
        ).scalar_one()

        participants = (
            await db_session.execute(
                select(MessageParticipant).where(MessageParticipant.thread_id == thread.id)
            )
        ).scalars().all()

        # Speaker is the submitter — already-read
        speaker_parts = [p for p in participants if p.participant_type == "applicant"]
        assert len(speaker_parts) == 1
        assert speaker_parts[0].last_read_at is not None

        # Admin participant is unread — lights up the bell
        admin_parts = [p for p in participants if p.participant_type == "user"]
        assert len(admin_parts) >= 1
        admin_for_this_user = next(
            (p for p in admin_parts if p.participant_id == tenant_admin_user.id), None
        )
        assert admin_for_this_user is not None
        assert admin_for_this_user.last_read_at is None
