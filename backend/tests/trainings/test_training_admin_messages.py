"""Admin Messages tab — list training broadcasts grouped by ``bulk_id``.

The endpoint replaces the "Coming soon" stub at
``frontend/src/pages/Trainings/tabs/MessagesTab.tsx``. PR 3 created
training broadcast threads (one thread per attendee, sharing a
``bulk_id``); this list aggregates on that key so the admin sees one row
per send instead of one row per attendee.
"""

import os
import uuid
from datetime import UTC, date, datetime, timedelta

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://saasconf:saasconf_dev_password@localhost:5432/saasconf_test",
)
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-unit-tests-minimum-32-chars")
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "testpassword123")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")

import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.location import Location
from app.models.messaging import THREAD_DOMAIN_TRAINING, MessageThread
from app.models.module import Module, TenantModule
from app.models.tenant import Tenant
from app.models.training import Training
from app.models.training_program import ProgramYearTraining, TrainingProgramYear
from app.models.training_registration import TrainingRegistration
from app.models.user import User, UserRole
from tests.conftest import auth_headers

ENDPOINT = "/api/v1/trainings/messaging/broadcasts"


@pytest_asyncio.fixture
async def am_tenant(db_session: AsyncSession) -> Tenant:
    t = Tenant(id=uuid.uuid4(), name="AM Tenant", slug=f"am-{uuid.uuid4().hex[:8]}")
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture
async def am_admin(db_session: AsyncSession, am_tenant: Tenant) -> User:
    mod = Module(id=uuid.uuid4(), name="Trainings", code="trainings", description="T", is_active=True)
    db_session.add(mod)
    await db_session.flush()
    db_session.add(TenantModule(id=uuid.uuid4(), tenant_id=am_tenant.id, module_id=mod.id, is_enabled=True))
    u = User(
        id=uuid.uuid4(),
        tenant_id=am_tenant.id,
        email=f"am-admin-{uuid.uuid4().hex[:8]}@example.com",
        first_name="AM",
        last_name="Admin",
        role=UserRole.TENANT_ADMIN.value,
        password_hash=hash_password("Password123!"),
        is_active=True,
    )
    db_session.add(u)
    await db_session.commit()
    return u


def _token(user: User) -> str:
    return create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role,
        modules=["trainings"],
    )


async def _make_placement(db: AsyncSession, tenant: Tenant, training_name: str) -> ProgramYearTraining:
    tr = Training(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name=training_name,
        slug=f"slug-{uuid.uuid4().hex[:6]}",
        duration=2,
    )
    loc = Location(id=uuid.uuid4(), tenant_id=tenant.id, name="X", code=f"X{uuid.uuid4().hex[:2]}")
    py = TrainingProgramYear(id=uuid.uuid4(), tenant_id=tenant.id, year=2026)
    db.add_all([tr, loc, py])
    await db.flush()
    p = ProgramYearTraining(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        program_year_id=py.id,
        training_id=tr.id,
        start_date=date(2026, 11, 10),
        placement_type="open",
        location_id=loc.id,
        is_active=True,
    )
    db.add(p)
    await db.commit()
    return p


async def _make_registration(db: AsyncSession, tenant: Tenant, placement: ProgramYearTraining) -> TrainingRegistration:
    reg = TrainingRegistration(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        placement_id=placement.id,
        status="paid",
        language="en",
        street="X",
        postal_code="0",
        city="X",
        country="DE",
        contact_first_name="Pat",
        contact_last_name="C",
        contact_email=f"pat-{uuid.uuid4().hex[:6]}@example.com",
        payment_method="bank_transfer",
    )
    db.add(reg)
    await db.commit()
    return reg


async def _make_broadcast_threads(
    db: AsyncSession,
    tenant: Tenant,
    registration: TrainingRegistration,
    *,
    subject: str,
    recipient_count: int,
    sent_at: datetime,
) -> uuid.UUID:
    """Create N training-domain threads sharing one bulk_id."""
    bulk_id = uuid.uuid4()
    for _ in range(recipient_count):
        db.add(
            MessageThread(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                conference_id=None,
                domain=THREAD_DOMAIN_TRAINING,
                domain_entity_id=registration.id,
                subject=subject,
                bulk_id=bulk_id,
                created_at=sent_at,
            )
        )
    await db.commit()
    return bulk_id


class TestList:
    async def test_groups_threads_by_bulk_id_with_recipient_count(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        am_tenant: Tenant,
        am_admin: User,
    ) -> None:
        placement = await _make_placement(db_session, am_tenant, "ITIL Foundation")
        reg = await _make_registration(db_session, am_tenant, placement)
        now = datetime.now(UTC)
        await _make_broadcast_threads(
            db_session,
            am_tenant,
            reg,
            subject="Reminder: training tomorrow",
            recipient_count=3,
            sent_at=now,
        )

        resp = await client.get(ENDPOINT, headers=auth_headers(_token(am_admin)))
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["total"] == 1
        item = body["items"][0]
        assert item["subject"] == "Reminder: training tomorrow"
        assert item["recipient_count"] == 3
        assert item["training_name"] == "ITIL Foundation"
        assert item["registration_id"] == str(reg.id)
        # ``placement_date`` is the placement's start_date in ISO form.
        assert item["placement_date"] == "2026-11-10"

    async def test_orders_by_last_sent_desc(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        am_tenant: Tenant,
        am_admin: User,
    ) -> None:
        placement = await _make_placement(db_session, am_tenant, "Foundation")
        reg = await _make_registration(db_session, am_tenant, placement)
        now = datetime.now(UTC)
        # Older broadcast first, newer second.
        await _make_broadcast_threads(
            db_session,
            am_tenant,
            reg,
            subject="Older",
            recipient_count=1,
            sent_at=now - timedelta(hours=2),
        )
        await _make_broadcast_threads(
            db_session,
            am_tenant,
            reg,
            subject="Newer",
            recipient_count=1,
            sent_at=now,
        )

        resp = await client.get(ENDPOINT, headers=auth_headers(_token(am_admin)))
        body = resp.json()
        assert body["total"] == 2
        assert body["items"][0]["subject"] == "Newer"
        assert body["items"][1]["subject"] == "Older"

    async def test_empty_when_only_conference_threads_exist(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        am_tenant: Tenant,
        am_admin: User,
    ) -> None:
        # Threads with NULL bulk_id (= 1:1 portal-side conversations) are
        # also excluded because the listing is for *broadcasts*, which
        # always carry a bulk_id by construction.
        placement = await _make_placement(db_session, am_tenant, "Foundation")
        reg = await _make_registration(db_session, am_tenant, placement)
        # One training thread with NO bulk_id — should NOT appear.
        db_session.add(
            MessageThread(
                id=uuid.uuid4(),
                tenant_id=am_tenant.id,
                conference_id=None,
                domain=THREAD_DOMAIN_TRAINING,
                domain_entity_id=reg.id,
                subject="One-off",
                bulk_id=None,
            )
        )
        await db_session.commit()

        resp = await client.get(ENDPOINT, headers=auth_headers(_token(am_admin)))
        assert resp.json()["total"] == 0
