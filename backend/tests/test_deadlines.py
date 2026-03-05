"""Tests for deadline management endpoints."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.conference import Conference
from app.models.deadline import Deadline
from app.models.tenant import Tenant
from app.models.user import User
from tests.conftest import auth_headers

pytestmark = pytest.mark.asyncio


# ── Helpers ─────────────────────────────────────────────────────────────


def _url(conference_id: uuid.UUID, deadline_id: uuid.UUID | None = None) -> str:
    base = f"/api/v1/conferences/{conference_id}/deadlines"
    return f"{base}/{deadline_id}" if deadline_id else base


async def _seed_deadline(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    user: User,
    *,
    title: str = "Test Deadline",
    description: str | None = "A test deadline",
    due_date: datetime | None = None,
    is_active: bool = True,
) -> Deadline:
    deadline = Deadline(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        title=title,
        description=description,
        due_date=due_date or (datetime.now(UTC) + timedelta(days=14)),
        is_active=is_active,
        created_by=user.id,
    )
    db_session.add(deadline)
    await db_session.commit()
    return deadline


# ── List ────────────────────────────────────────────────────────────────


class TestListDeadlines:
    async def test_list_empty(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_admin_token: str,
    ):
        resp = await client.get(
            _url(conference.id),
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["items"] == []
        assert body["total"] == 0

    async def test_list_with_deadlines(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        tenant_admin_user: User,
        tenant_admin_token: str,
    ):
        await _seed_deadline(db_session, tenant, conference, tenant_admin_user, title="First")
        await _seed_deadline(db_session, tenant, conference, tenant_admin_user, title="Second")

        resp = await client.get(
            _url(conference.id),
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 2
        assert len(body["items"]) == 2

    async def test_list_unauthenticated(
        self,
        client: AsyncClient,
        conference: Conference,
    ):
        resp = await client.get(_url(conference.id))
        assert resp.status_code == 401


# ── Create ──────────────────────────────────────────────────────────────


class TestCreateDeadline:
    async def test_create_success(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_admin_token: str,
    ):
        due = (datetime.now(UTC) + timedelta(days=30)).isoformat()
        resp = await client.post(
            _url(conference.id),
            headers=auth_headers(tenant_admin_token),
            json={"title": "Contract Deadline", "description": "Sign sponsor contract", "due_date": due},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["title"] == "Contract Deadline"
        assert body["description"] == "Sign sponsor contract"
        assert body["is_active"] is True
        assert body["reminder_7d_sent"] is False
        assert body["reminder_1d_sent"] is False
        assert body["reminder_due_sent"] is False

    async def test_create_minimal(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_admin_token: str,
    ):
        due = (datetime.now(UTC) + timedelta(days=10)).isoformat()
        resp = await client.post(
            _url(conference.id),
            headers=auth_headers(tenant_admin_token),
            json={"title": "Simple Deadline", "due_date": due},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["title"] == "Simple Deadline"
        assert body["description"] is None

    async def test_create_missing_title(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_admin_token: str,
    ):
        due = (datetime.now(UTC) + timedelta(days=10)).isoformat()
        resp = await client.post(
            _url(conference.id),
            headers=auth_headers(tenant_admin_token),
            json={"due_date": due},
        )
        assert resp.status_code == 422

    async def test_create_missing_due_date(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_admin_token: str,
    ):
        resp = await client.post(
            _url(conference.id),
            headers=auth_headers(tenant_admin_token),
            json={"title": "No Date"},
        )
        assert resp.status_code == 422

    async def test_create_not_admin(
        self,
        client: AsyncClient,
        conference: Conference,
        regular_user_token: str,
    ):
        due = (datetime.now(UTC) + timedelta(days=10)).isoformat()
        resp = await client.post(
            _url(conference.id),
            headers=auth_headers(regular_user_token),
            json={"title": "Should Fail", "due_date": due},
        )
        assert resp.status_code == 403


# ── Update ──────────────────────────────────────────────────────────────


class TestUpdateDeadline:
    async def test_update_title(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        tenant_admin_user: User,
        tenant_admin_token: str,
    ):
        deadline = await _seed_deadline(db_session, tenant, conference, tenant_admin_user)

        resp = await client.put(
            _url(conference.id, deadline.id),
            headers=auth_headers(tenant_admin_token),
            json={"title": "Updated Title"},
        )
        assert resp.status_code == 200
        assert resp.json()["title"] == "Updated Title"

    async def test_update_due_date_resets_reminders(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        tenant_admin_user: User,
        tenant_admin_token: str,
    ):
        # Create a deadline with reminders already sent
        deadline = Deadline(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            title="Reminder Test",
            due_date=datetime.now(UTC) - timedelta(days=1),
            is_active=True,
            reminder_7d_sent=True,
            reminder_1d_sent=True,
            reminder_due_sent=True,
            created_by=tenant_admin_user.id,
        )
        db_session.add(deadline)
        await db_session.commit()

        # Push due date far into the future
        new_due = (datetime.now(UTC) + timedelta(days=30)).isoformat()
        resp = await client.put(
            _url(conference.id, deadline.id),
            headers=auth_headers(tenant_admin_token),
            json={"due_date": new_due},
        )
        assert resp.status_code == 200
        body = resp.json()
        # All reminder flags should be reset
        assert body["reminder_7d_sent"] is False
        assert body["reminder_1d_sent"] is False
        assert body["reminder_due_sent"] is False

    async def test_update_not_found(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_admin_token: str,
    ):
        resp = await client.put(
            _url(conference.id, uuid.uuid4()),
            headers=auth_headers(tenant_admin_token),
            json={"title": "Ghost"},
        )
        assert resp.status_code == 404


# ── Toggle ──────────────────────────────────────────────────────────────


class TestToggleDeadline:
    async def test_toggle_deactivate(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        tenant_admin_user: User,
        tenant_admin_token: str,
    ):
        deadline = await _seed_deadline(db_session, tenant, conference, tenant_admin_user)
        assert deadline.is_active is True

        resp = await client.patch(
            f"{_url(conference.id, deadline.id)}/toggle",
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["is_active"] is False

    async def test_toggle_reactivate(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        tenant_admin_user: User,
        tenant_admin_token: str,
    ):
        deadline = await _seed_deadline(
            db_session,
            tenant,
            conference,
            tenant_admin_user,
            is_active=False,
        )

        resp = await client.patch(
            f"{_url(conference.id, deadline.id)}/toggle",
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["is_active"] is True


# ── Delete ──────────────────────────────────────────────────────────────


class TestDeleteDeadline:
    async def test_delete_success(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        tenant_admin_user: User,
        tenant_admin_token: str,
    ):
        deadline = await _seed_deadline(db_session, tenant, conference, tenant_admin_user, title="To Delete")

        resp = await client.delete(
            _url(conference.id, deadline.id),
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200
        assert "To Delete" in resp.json()["message"]

        # Verify it's gone
        resp2 = await client.get(
            _url(conference.id),
            headers=auth_headers(tenant_admin_token),
        )
        assert resp2.json()["total"] == 0

    async def test_delete_not_found(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_admin_token: str,
    ):
        resp = await client.delete(
            _url(conference.id, uuid.uuid4()),
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 404

    async def test_delete_not_admin(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        tenant_admin_user: User,
        regular_user_token: str,
    ):
        deadline = await _seed_deadline(db_session, tenant, conference, tenant_admin_user)

        resp = await client.delete(
            _url(conference.id, deadline.id),
            headers=auth_headers(regular_user_token),
        )
        assert resp.status_code == 403
