"""Tests for ``CustomerEventService`` + portal admin write-path.

Phase 3 of the unified customer architecture (see
``.claude/plans/smooth-sprouting-perlis.md``) introduced
``CustomerEventService`` as the single write path into
``customer_events``. The legacy ``portal_user_history`` table was
dropped in migration 208; these tests assert the canonical row lands in
``customer_events``.

Covers:

* Service-level validation: enum-only ``event_type``, domain/prefix
  match, non-empty ``subject_email_hash``, known ``actor_kind`` /
  ``domain``.
* Admin write-path: every action through the ``/portal-users/*``
  router writes a ``customer_events`` row with the canonical
  namespaced ``event_type`` and the right ``notes`` / ``meta`` /
  ``created_by``.
"""

from __future__ import annotations

import os
import uuid
from unittest.mock import AsyncMock, patch

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
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.core.security.pii_crypto import hash_email
from app.models.customer_event import (
    ACTOR_ADMIN,
    ACTOR_SYSTEM,
    DOMAIN_PORTAL,
    DOMAIN_TRAINING,
    CustomerEvent,
    CustomerEventType,
)
from app.models.portal_user import PortalUser
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from app.services.customer_event_service import CustomerEventService
from tests.conftest import auth_headers


def _admin_token(user: User) -> str:
    return create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role,
        modules=["trainings", "conferences"],
    )


# ── Fixtures ────────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def tenant_ces(db_session: AsyncSession) -> Tenant:
    t = Tenant(
        id=uuid.uuid4(),
        name="CES Tenant",
        slug=f"ces-tenant-{uuid.uuid4().hex[:6]}",
        is_active=True,
        country="Germany",
        city="Berlin",
    )
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture
async def admin_ces(db_session: AsyncSession, tenant_ces: Tenant) -> User:
    u = User(
        id=uuid.uuid4(),
        tenant_id=tenant_ces.id,
        email=f"admin-ces-{uuid.uuid4().hex[:6]}@test.com",
        first_name="Admin",
        last_name="CES",
        role=UserRole.TENANT_ADMIN.value,
        password_hash=hash_password("Password123!"),
        is_active=True,
    )
    db_session.add(u)
    await db_session.commit()
    return u


@pytest_asyncio.fixture
async def portal_user_ces(db_session: AsyncSession, tenant_ces: Tenant) -> PortalUser:
    pu = PortalUser(
        id=uuid.uuid4(),
        tenant_id=tenant_ces.id,
        email=f"ces-{uuid.uuid4().hex[:8]}@test.de",
        first_name="Ces",
        last_name="Test",
        is_active=True,
    )
    db_session.add(pu)
    await db_session.commit()
    return pu


# ── Service-level validation ────────────────────────────────────────────


class TestServiceValidation:
    @pytest.mark.asyncio
    async def test_rejects_raw_string_event_type(
        self,
        db_session: AsyncSession,
        tenant_ces: Tenant,
        portal_user_ces: PortalUser,
    ):
        """Raw string ``event_type`` must be refused — enum is the source of truth."""
        assert portal_user_ces.email_hash is not None
        with pytest.raises(ValueError, match="CustomerEventType"):
            CustomerEventService.record(
                db_session,
                tenant_id=tenant_ces.id,
                portal_user_id=portal_user_ces.id,
                subject_email_hash=portal_user_ces.email_hash,
                domain=DOMAIN_PORTAL,
                event_type="portal.activated",  # type: ignore[arg-type]
            )

    @pytest.mark.asyncio
    async def test_rejects_domain_mismatch(
        self,
        db_session: AsyncSession,
        tenant_ces: Tenant,
        portal_user_ces: PortalUser,
    ):
        """``domain`` must match the event_type's namespace prefix."""
        assert portal_user_ces.email_hash is not None
        with pytest.raises(ValueError, match="does not belong to domain"):
            CustomerEventService.record(
                db_session,
                tenant_id=tenant_ces.id,
                portal_user_id=portal_user_ces.id,
                subject_email_hash=portal_user_ces.email_hash,
                domain=DOMAIN_PORTAL,
                event_type=CustomerEventType.TRAINING_REGISTERED,
            )

    @pytest.mark.asyncio
    async def test_rejects_unknown_domain(
        self,
        db_session: AsyncSession,
        tenant_ces: Tenant,
        portal_user_ces: PortalUser,
    ):
        assert portal_user_ces.email_hash is not None
        with pytest.raises(ValueError, match="unknown domain"):
            CustomerEventService.record(
                db_session,
                tenant_id=tenant_ces.id,
                portal_user_id=portal_user_ces.id,
                subject_email_hash=portal_user_ces.email_hash,
                domain="bogus",
                event_type=CustomerEventType.PORTAL_ACTIVATED,
            )

    @pytest.mark.asyncio
    async def test_rejects_missing_email_hash(
        self,
        db_session: AsyncSession,
        tenant_ces: Tenant,
        portal_user_ces: PortalUser,
    ):
        """Empty ``subject_email_hash`` must be refused — it's the merge-safe identity."""
        with pytest.raises(ValueError, match="subject_email_hash"):
            CustomerEventService.record(
                db_session,
                tenant_id=tenant_ces.id,
                portal_user_id=portal_user_ces.id,
                subject_email_hash="",
                domain=DOMAIN_PORTAL,
                event_type=CustomerEventType.PORTAL_ACTIVATED,
            )

    @pytest.mark.asyncio
    async def test_rejects_unknown_actor_kind(
        self,
        db_session: AsyncSession,
        tenant_ces: Tenant,
        portal_user_ces: PortalUser,
    ):
        assert portal_user_ces.email_hash is not None
        with pytest.raises(ValueError, match="unknown actor_kind"):
            CustomerEventService.record(
                db_session,
                tenant_id=tenant_ces.id,
                portal_user_id=portal_user_ces.id,
                subject_email_hash=portal_user_ces.email_hash,
                domain=DOMAIN_PORTAL,
                event_type=CustomerEventType.PORTAL_ACTIVATED,
                actor_kind="stranger",
            )

    @pytest.mark.asyncio
    async def test_persists_event_without_portal_user_id(
        self,
        db_session: AsyncSession,
        tenant_ces: Tenant,
    ):
        """``portal_user_id`` is optional — unlinked attendees still record events."""
        hash_ = hash_email("loose@test.de")
        CustomerEventService.record(
            db_session,
            tenant_id=tenant_ces.id,
            portal_user_id=None,
            subject_email_hash=hash_,
            domain=DOMAIN_TRAINING,
            event_type=CustomerEventType.TRAINING_REGISTERED,
            actor_kind=ACTOR_SYSTEM,
        )
        await db_session.commit()
        result = await db_session.execute(select(CustomerEvent).where(CustomerEvent.subject_email_hash == hash_))
        row = result.scalar_one()
        assert row.portal_user_id is None
        assert row.event_type == "training.registered"
        assert row.domain == "training"


# ── Admin-router write path → customer_events ──────────────────────────


async def _customer_event(db: AsyncSession, portal_user_id: uuid.UUID, event_type: str) -> CustomerEvent | None:
    res = await db.execute(
        select(CustomerEvent).where(
            CustomerEvent.portal_user_id == portal_user_id,
            CustomerEvent.event_type == event_type,
        )
    )
    return res.scalar_one_or_none()


class TestPortalAdminWritesCustomerEvent:
    @pytest.mark.asyncio
    async def test_toggle_access_writes_customer_event(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_ces: Tenant,
        admin_ces: User,
        portal_user_ces: PortalUser,
    ):
        """Deactivate → one customer_events row with namespaced event_type."""
        token = _admin_token(admin_ces)
        r = await client.put(
            f"/api/v1/portal-users/{portal_user_ces.id}/toggle-access",
            headers=auth_headers(token),
        )
        assert r.status_code == 200

        ev = await _customer_event(db_session, portal_user_ces.id, "portal.deactivated")
        assert ev is not None
        assert ev.domain == "portal"
        assert ev.actor_kind == ACTOR_ADMIN
        assert ev.created_by == admin_ces.id
        assert ev.subject_email_hash == portal_user_ces.email_hash
        assert ev.notes == "Portal account deactivated"

    @pytest.mark.asyncio
    async def test_resend_invite_writes_customer_event(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_ces: Tenant,
        admin_ces: User,
        portal_user_ces: PortalUser,
    ):
        token = _admin_token(admin_ces)
        with patch("app.core.email.send_email", new=AsyncMock(return_value=None)):
            r = await client.post(
                f"/api/v1/portal-users/{portal_user_ces.id}/resend-invite",
                headers=auth_headers(token),
            )
        assert r.status_code == 200

        ev = await _customer_event(db_session, portal_user_ces.id, "portal.invite_resent")
        assert ev is not None
        assert ev.notes == "Invite email resent"
        assert ev.created_by == admin_ces.id

    @pytest.mark.asyncio
    async def test_reset_password_writes_customer_event(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_ces: Tenant,
        admin_ces: User,
        portal_user_ces: PortalUser,
    ):
        token = _admin_token(admin_ces)
        with patch("app.core.email.send_email", new=AsyncMock(return_value=None)):
            r = await client.post(
                f"/api/v1/portal-users/{portal_user_ces.id}/reset-password",
                headers=auth_headers(token),
            )
        assert r.status_code == 200

        ev = await _customer_event(db_session, portal_user_ces.id, "portal.password_reset_sent")
        assert ev is not None
        assert ev.domain == "portal"
        assert ev.notes == "Admin-initiated password reset email sent"

    @pytest.mark.asyncio
    async def test_impersonate_writes_customer_event(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_ces: Tenant,
        admin_ces: User,
        portal_user_ces: PortalUser,
    ):
        token = _admin_token(admin_ces)
        r = await client.post(
            f"/api/v1/portal-users/{portal_user_ces.id}/impersonate",
            headers=auth_headers(token),
        )
        assert r.status_code == 200

        ev = await _customer_event(db_session, portal_user_ces.id, "portal.impersonated")
        assert ev is not None
        assert ev.actor_kind == ACTOR_ADMIN
        assert ev.notes == "Admin started an impersonation session"

    @pytest.mark.asyncio
    async def test_merge_writes_merged_into_customer_event(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_ces: Tenant,
        admin_ces: User,
    ):
        """Merge writes ``portal.merged_into`` on target — survives the source CASCADE."""
        target = PortalUser(
            id=uuid.uuid4(),
            tenant_id=tenant_ces.id,
            email=f"target-{uuid.uuid4().hex[:6]}@test.de",
            first_name="Target",
            last_name="User",
            is_active=True,
        )
        source = PortalUser(
            id=uuid.uuid4(),
            tenant_id=tenant_ces.id,
            email=f"source-{uuid.uuid4().hex[:6]}@test.de",
            first_name="Source",
            last_name="User",
            is_active=True,
        )
        db_session.add_all([target, source])
        await db_session.commit()

        token = _admin_token(admin_ces)
        r = await client.post(
            f"/api/v1/portal-users/{target.id}/merge",
            headers=auth_headers(token),
            json={"source_user_id": str(source.id)},
        )
        assert r.status_code == 200

        ev = await _customer_event(db_session, target.id, "portal.merged_into")
        assert ev is not None
        assert ev.meta is not None
        assert ev.meta["source_user_id"] == str(source.id)
