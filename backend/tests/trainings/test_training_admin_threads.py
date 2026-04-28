"""Admin training-thread inbox: list / detail / reply / archive.

Smoke-tests the ``GET /trainings/messaging/threads`` family added to
mirror the per-conference Messaging tab. Uses minimal hand-built
fixtures (a tenant + admin + a single training thread) so the suite
stays fast and decoupled from the broadcast fixtures.
"""

import os
import uuid
from datetime import UTC, datetime

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://saasconf:saasconf_dev_password@localhost:5432/saasconf_test",
)
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-unit-tests-minimum-32-chars")
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "testpassword123")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")

from datetime import date

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.location import Location
from app.models.messaging import THREAD_DOMAIN_TRAINING, Message, MessageParticipant, MessageThread
from app.models.module import Module, TenantModule
from app.models.tenant import Tenant
from app.models.training import Training
from app.models.training_program import ProgramYearTraining, TrainingProgramYear
from app.models.training_registration import TrainingRegistration, TrainingRegistrationAttendee
from app.models.user import User, UserRole
from app.services.training_messaging import PARTICIPANT_TYPE_TRAINING_ATTENDEE
from tests.conftest import auth_headers


def _admin_token(user: User) -> str:
    return create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role,
        modules=["trainings"],
    )


@pytest_asyncio.fixture
async def at_tenant(db_session: AsyncSession) -> Tenant:
    t = Tenant(id=uuid.uuid4(), name="AT Tenant", slug=f"at-{uuid.uuid4().hex[:8]}")
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture
async def at_admin(db_session: AsyncSession, at_tenant: Tenant) -> User:
    mod = Module(id=uuid.uuid4(), name="Trainings", code="trainings", description="T", is_active=True)
    db_session.add(mod)
    await db_session.flush()
    db_session.add(TenantModule(id=uuid.uuid4(), tenant_id=at_tenant.id, module_id=mod.id, is_enabled=True))
    u = User(
        id=uuid.uuid4(),
        tenant_id=at_tenant.id,
        email=f"at-admin-{uuid.uuid4().hex[:8]}@example.com",
        first_name="AT",
        last_name="Admin",
        role=UserRole.TENANT_ADMIN.value,
        password_hash=hash_password("Password123!"),
        is_active=True,
    )
    db_session.add(u)
    await db_session.commit()
    return u


async def _make_training_thread(
    db: AsyncSession,
    tenant: Tenant,
    admin: User,
    *,
    subject: str = "Pre-class instructions",
) -> tuple[MessageThread, TrainingRegistrationAttendee]:
    """Build one training thread with admin + attendee participants and one
    initial message from the admin. Includes the minimum scaffolding the
    domain-entity-name resolver needs (training → program-year → placement
    → registration → attendee).
    """
    training = Training(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="ITIL Foundation",
        slug=f"itil-{uuid.uuid4().hex[:6]}",
        duration=2,
    )
    location = Location(id=uuid.uuid4(), tenant_id=tenant.id, name="Berlin", code=f"BER{uuid.uuid4().hex[:2]}")
    # Year must be unique per tenant — derive a fresh one each call.
    year = 2030 + (uuid.uuid4().int % 50)
    program_year = TrainingProgramYear(id=uuid.uuid4(), tenant_id=tenant.id, year=year)
    db.add_all([training, location, program_year])
    await db.flush()
    placement = ProgramYearTraining(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        program_year_id=program_year.id,
        training_id=training.id,
        start_date=date(year, 5, 10),
        placement_type="open",
        location_id=location.id,
        is_active=True,
    )
    db.add(placement)
    await db.flush()
    registration = TrainingRegistration(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        placement_id=placement.id,
        status="paid",
        language="en",
        company_name="Acme",
        street="Main 1",
        postal_code="10117",
        city="Berlin",
        country="DE",
        contact_first_name="Booking",
        contact_last_name="Contact",
        contact_email=f"booking-{uuid.uuid4().hex[:6]}@x.test",
        payment_method="bank_transfer",
    )
    db.add(registration)
    await db.flush()
    attendee = TrainingRegistrationAttendee(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        registration_id=registration.id,
        first_name="Carol",
        last_name="Tester",
        email="carol@example.com",
        language="en",
    )
    db.add(attendee)
    await db.flush()

    thread = MessageThread(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        domain=THREAD_DOMAIN_TRAINING,
        domain_entity_id=registration.id,
        subject=subject,
    )
    db.add(thread)
    await db.flush()

    db.add(
        MessageParticipant(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            thread_id=thread.id,
            participant_type="user",
            participant_id=admin.id,
            last_read_at=datetime.now(UTC),
        )
    )
    db.add(
        MessageParticipant(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            thread_id=thread.id,
            participant_type=PARTICIPANT_TYPE_TRAINING_ATTENDEE,
            participant_id=attendee.id,
        )
    )
    db.add(
        Message(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            thread_id=thread.id,
            sender_type="user",
            sender_id=admin.id,
            body_html="<p>Initial broadcast body.</p>",
        )
    )
    await db.commit()
    await db.refresh(thread)
    return thread, attendee


class TestAdminTrainingThreads:
    @pytest.mark.asyncio
    async def test_list_returns_tenant_threads(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        at_tenant: Tenant,
        at_admin: User,
    ):
        thread, _ = await _make_training_thread(db_session, at_tenant, at_admin)

        resp = await client.get(
            "/api/v1/trainings/messaging/threads",
            headers=auth_headers(_admin_token(at_admin)),
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["total"] >= 1
        ids = {item["id"] for item in data["items"]}
        assert str(thread.id) in ids

    @pytest.mark.asyncio
    async def test_detail_returns_messages_and_participants(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        at_tenant: Tenant,
        at_admin: User,
    ):
        thread, attendee = await _make_training_thread(db_session, at_tenant, at_admin)

        resp = await client.get(
            f"/api/v1/trainings/messaging/threads/{thread.id}",
            headers=auth_headers(_admin_token(at_admin)),
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["subject"] == "Pre-class instructions"
        assert len(data["messages"]) == 1
        assert data["messages"][0]["sender"]["is_me"] is True
        # Participants include both the admin (is_me) and the training_attendee.
        types = {p["type"] for p in data["participants"]}
        assert "user" in types
        assert "training_attendee" in types
        # Attendee email surfaces via the cfp_portal sender resolver.
        attendee_part = next(p for p in data["participants"] if p["type"] == "training_attendee")
        assert attendee_part["email"] == attendee.email

    @pytest.mark.asyncio
    async def test_reply_appends_message_and_marks_read(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        at_tenant: Tenant,
        at_admin: User,
    ):
        thread, _ = await _make_training_thread(db_session, at_tenant, at_admin)
        resp = await client.post(
            f"/api/v1/trainings/messaging/threads/{thread.id}/reply",
            headers=auth_headers(_admin_token(at_admin)),
            json={"body_html": "<p>Thanks for the question!</p>"},
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["sender"]["is_me"] is True
        assert "Thanks" in body["body_html"]

        # Detail now lists 2 messages.
        detail = await client.get(
            f"/api/v1/trainings/messaging/threads/{thread.id}",
            headers=auth_headers(_admin_token(at_admin)),
        )
        assert len(detail.json()["messages"]) == 2

    @pytest.mark.asyncio
    async def test_archive_and_unarchive(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        at_tenant: Tenant,
        at_admin: User,
    ):
        thread, _ = await _make_training_thread(db_session, at_tenant, at_admin)
        # Archive.
        resp = await client.post(
            f"/api/v1/trainings/messaging/threads/{thread.id}/archive",
            headers=auth_headers(_admin_token(at_admin)),
        )
        assert resp.status_code == 200
        # Default list (archived=False) excludes it.
        listing = await client.get(
            "/api/v1/trainings/messaging/threads",
            headers=auth_headers(_admin_token(at_admin)),
        )
        ids = {i["id"] for i in listing.json()["items"]}
        assert str(thread.id) not in ids
        # archived=true list includes it.
        archived = await client.get(
            "/api/v1/trainings/messaging/threads?archived=true",
            headers=auth_headers(_admin_token(at_admin)),
        )
        ids2 = {i["id"] for i in archived.json()["items"]}
        assert str(thread.id) in ids2
        # Unarchive restores it.
        resp = await client.post(
            f"/api/v1/trainings/messaging/threads/{thread.id}/unarchive",
            headers=auth_headers(_admin_token(at_admin)),
        )
        assert resp.status_code == 200
        listing2 = await client.get(
            "/api/v1/trainings/messaging/threads",
            headers=auth_headers(_admin_token(at_admin)),
        )
        ids3 = {i["id"] for i in listing2.json()["items"]}
        assert str(thread.id) in ids3

    @pytest.mark.asyncio
    async def test_search_by_subject(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        at_tenant: Tenant,
        at_admin: User,
    ):
        await _make_training_thread(db_session, at_tenant, at_admin, subject="Welcome aboard")
        await _make_training_thread(db_session, at_tenant, at_admin, subject="Pre-class instructions")
        resp = await client.get(
            "/api/v1/trainings/messaging/threads?search=Welcome",
            headers=auth_headers(_admin_token(at_admin)),
        )
        assert resp.status_code == 200
        subjects = [i["subject"] for i in resp.json()["items"]]
        assert "Welcome aboard" in subjects
        assert "Pre-class instructions" not in subjects

    @pytest.mark.asyncio
    async def test_other_tenant_cannot_see_threads(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        at_tenant: Tenant,
        at_admin: User,
    ):
        thread, _ = await _make_training_thread(db_session, at_tenant, at_admin)
        # Different tenant + admin.
        other_tenant = Tenant(id=uuid.uuid4(), name="Other", slug=f"other-{uuid.uuid4().hex[:6]}")
        db_session.add(other_tenant)
        await db_session.flush()
        mod = Module(id=uuid.uuid4(), name="T", code=f"t-{uuid.uuid4().hex[:6]}", description="T", is_active=True)
        db_session.add(mod)
        await db_session.flush()
        db_session.add(TenantModule(id=uuid.uuid4(), tenant_id=other_tenant.id, module_id=mod.id, is_enabled=True))
        other_admin = User(
            id=uuid.uuid4(),
            tenant_id=other_tenant.id,
            email=f"other-{uuid.uuid4().hex[:8]}@example.com",
            first_name="Other",
            last_name="Admin",
            role=UserRole.TENANT_ADMIN.value,
            password_hash=hash_password("Password123!"),
            is_active=True,
        )
        db_session.add(other_admin)
        await db_session.commit()

        # Other admin's list omits our thread.
        resp = await client.get(
            "/api/v1/trainings/messaging/threads",
            headers=auth_headers(_admin_token(other_admin)),
        )
        ids = {i["id"] for i in resp.json()["items"]}
        assert str(thread.id) not in ids
        # And direct detail GET 404s.
        detail = await client.get(
            f"/api/v1/trainings/messaging/threads/{thread.id}",
            headers=auth_headers(_admin_token(other_admin)),
        )
        assert detail.status_code == 404
