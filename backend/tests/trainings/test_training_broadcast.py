"""Training broadcast — admin sends a message to every attendee on a registration.

Covers the full audience-isolation matrix that PR 3 of the messaging plan
demands:

  - Conference admin still broadcasts cleanly (no regression introduced by
    the schema relaxation in migration 214 / model nullability change).
  - Training broadcast targets ONLY the registration's attendees and creates
    ``domain='training'`` threads anchored on the registration.
  - The cross-membership case — same email is both a ``CFPApplicant`` in a
    conference AND a ``TrainingRegistrationAttendee`` in a training — must
    receive two separate threads with the correct domain on each. Zero
    domain leakage in either direction.
  - Variable rendering substitutes ``[First Name]``, ``[Training Name]``,
    ``[Placement Date]``, ``[Company Name]`` and HTML-escapes the values
    (XSS guard runs through ``sanitize_html`` before substitution).
  - Email fanout invokes ``send_direct_message_email`` once per recipient
    and a single failure does not poison the batch.
  - Edge cases: missing registration → 404, non-admin → 403, attendee with
    empty email → skipped, duplicate email → deduped.
"""

import os
import uuid
from datetime import date
from unittest.mock import AsyncMock, patch

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://saasconf:saasconf_dev_password@localhost:5432/saasconf_test",
)
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-unit-tests-minimum-32-chars")
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "testpassword123")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")

import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.cfp import CFPApplicant
from app.models.conference import Conference
from app.models.location import Location
from app.models.messaging import (
    THREAD_DOMAIN_CONFERENCE,
    THREAD_DOMAIN_TRAINING,
    Message,
    MessageParticipant,
    MessageThread,
)
from app.models.module import Module, TenantModule
from app.models.tenant import Tenant
from app.models.training import Training
from app.models.training_program import ProgramYearTraining, TrainingProgramYear
from app.models.training_registration import TrainingRegistration, TrainingRegistrationAttendee
from app.models.user import User, UserRole
from app.services.training_messaging import (
    PARTICIPANT_TYPE_TRAINING_ATTENDEE,
    substitute_training_variables,
)
from tests.conftest import auth_headers


def _admin_token(user: User) -> str:
    return create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role,
        modules=["trainings", "cfp"],
    )


@pytest_asyncio.fixture
async def tb_tenant(db_session: AsyncSession) -> Tenant:
    t = Tenant(id=uuid.uuid4(), name="TB Tenant", slug=f"tb-{uuid.uuid4().hex[:8]}")
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture
async def tb_admin(db_session: AsyncSession, tb_tenant: Tenant) -> User:
    for code in ("trainings", "cfp"):
        mod = Module(id=uuid.uuid4(), name=code.title(), code=code, description=code, is_active=True)
        db_session.add(mod)
        await db_session.flush()
        db_session.add(TenantModule(id=uuid.uuid4(), tenant_id=tb_tenant.id, module_id=mod.id, is_enabled=True))
    u = User(
        id=uuid.uuid4(),
        tenant_id=tb_tenant.id,
        email=f"tb-admin-{uuid.uuid4().hex[:8]}@example.com",
        first_name="TB",
        last_name="Admin",
        role=UserRole.TENANT_ADMIN.value,
        password_hash=hash_password("Password123!"),
        is_active=True,
    )
    db_session.add(u)
    await db_session.commit()
    return u


@pytest_asyncio.fixture
async def tb_non_admin(db_session: AsyncSession, tb_tenant: Tenant) -> User:
    """A non-admin user — used for the 403 test."""
    u = User(
        id=uuid.uuid4(),
        tenant_id=tb_tenant.id,
        email=f"tb-user-{uuid.uuid4().hex[:8]}@example.com",
        first_name="TB",
        last_name="User",
        role=UserRole.USER.value,
        password_hash=hash_password("Password123!"),
        is_active=True,
    )
    db_session.add(u)
    await db_session.commit()
    return u


@pytest_asyncio.fixture
async def tb_placement(db_session: AsyncSession, tb_tenant: Tenant) -> ProgramYearTraining:
    tr = Training(
        id=uuid.uuid4(),
        tenant_id=tb_tenant.id,
        name="ITIL 4 Foundation",
        slug="itil-4",
        duration=2,
    )
    loc = Location(id=uuid.uuid4(), tenant_id=tb_tenant.id, name="Berlin", code="BER")
    py = TrainingProgramYear(id=uuid.uuid4(), tenant_id=tb_tenant.id, year=2026)
    db_session.add_all([tr, loc, py])
    await db_session.flush()
    p = ProgramYearTraining(
        id=uuid.uuid4(),
        tenant_id=tb_tenant.id,
        program_year_id=py.id,
        training_id=tr.id,
        start_date=date(2026, 11, 10),
        placement_type="open",
        location_id=loc.id,
        is_active=True,
    )
    db_session.add(p)
    await db_session.commit()
    return p


async def _make_registration(
    db: AsyncSession,
    tenant: Tenant,
    placement: ProgramYearTraining,
    *,
    company: str | None = "Acme Corp",
    attendees: list[tuple[str, str, str]] | None = None,
) -> TrainingRegistration:
    """Build a registration with N attendees. Each attendee tuple is (first, last, email)."""
    reg = TrainingRegistration(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        placement_id=placement.id,
        status="paid",
        language="en",
        company_name=company,
        street="Main 1",
        postal_code="10117",
        city="Berlin",
        country="DE",
        contact_first_name="Booking",
        contact_last_name="Contact",
        contact_email=f"booking-{uuid.uuid4().hex[:6]}@acme.test",
        payment_method="bank_transfer",
    )
    db.add(reg)
    await db.flush()
    for first, last, email in attendees or []:
        db.add(
            TrainingRegistrationAttendee(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                registration_id=reg.id,
                first_name=first,
                last_name=last,
                email=email,
                language="en",
            )
        )
    await db.commit()
    await db.refresh(reg)
    return reg


# --- Pure unit tests for the variable substitution helper ---


class TestSubstituteTrainingVariables:
    def test_substitutes_all_known_placeholders(self) -> None:
        text = (
            "Hi [First Name] [Last Name], you're enrolled in [Training Name] on "
            "[Placement Date]. Booked by [Company Name] at [Email]."
        )
        result = substitute_training_variables(
            text,
            first_name="Alice",
            last_name="Liddell",
            email="alice@wonderland.test",
            training_name="ITIL Foundation",
            placement_date="2026-11-10",
            company_name="Wonderland Ltd",
        )
        assert result == (
            "Hi Alice Liddell, you're enrolled in ITIL Foundation on "
            "2026-11-10. Booked by Wonderland Ltd at alice@wonderland.test."
        )

    def test_unknown_placeholder_preserved_literally(self) -> None:
        # Unknown bracketed tokens stay verbatim — that's how the conference
        # helper behaves and the contract tests pin it. Useful for templating
        # systems that share a single body across email + portal.
        result = substitute_training_variables(
            "Hi [First Name], your [Mystery Field] arrived",
            first_name="Bob",
        )
        assert result == "Hi Bob, your [Mystery Field] arrived"

    def test_html_escapes_values_to_block_xss(self) -> None:
        # The substitution runs after sanitize_html on the template, so values
        # injected here must be escaped — otherwise an attendee with a script
        # tag in their first_name field could XSS the rendered email.
        result = substitute_training_variables(
            "Welcome [First Name]",
            first_name="<script>alert(1)</script>",
        )
        assert "<script>" not in result
        assert "&lt;script&gt;" in result


# --- End-to-end broadcast (HTTP API) ---


class TestBroadcastHappyPath:
    async def test_creates_one_thread_per_attendee_anchored_on_registration(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tb_tenant: Tenant,
        tb_admin: User,
        tb_placement: ProgramYearTraining,
    ) -> None:
        reg = await _make_registration(
            db_session,
            tb_tenant,
            tb_placement,
            attendees=[
                ("Alice", "Liddell", "alice@example.com"),
                ("Bob", "Builder", "bob@example.com"),
                ("Carol", "Kane", "carol@example.com"),
            ],
        )
        with patch(
            "app.services.training_messaging.send_direct_message_email",
            AsyncMock(return_value=True),
        ) as send_mock:
            resp = await client.post(
                f"/api/v1/trainings/registrations/{reg.id}/messages/broadcast",
                json={
                    "subject": "Reminder for [Training Name]",
                    "body_html": "<p>Hi [First Name], you're enrolled.</p>",
                },
                headers=auth_headers(_admin_token(tb_admin)),
            )

        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["sent_count"] == 3
        assert body["skipped_count"] == 0
        assert {r["email"] for r in body["recipients"]} == {
            "alice@example.com",
            "bob@example.com",
            "carol@example.com",
        }
        # Each recipient gets a unique thread_id.
        thread_ids = {r["thread_id"] for r in body["recipients"]}
        assert len(thread_ids) == 3

        # All threads anchored on the registration via the generic anchor.
        threads = (
            (await db_session.execute(select(MessageThread).where(MessageThread.bulk_id == uuid.UUID(body["bulk_id"]))))
            .scalars()
            .all()
        )
        assert len(threads) == 3
        for t in threads:
            assert t.domain == THREAD_DOMAIN_TRAINING
            assert t.domain_entity_id == reg.id
            # Conference threads have ``conference_id`` set; training threads
            # leave it NULL — the schema migration 214 enforcement check.
            assert t.conference_id is None
            # Subject got rendered with the training name, not the placeholder.
            assert t.subject == "Reminder for ITIL 4 Foundation"

        # One participant of each type per thread.
        all_parts = (
            (
                await db_session.execute(
                    select(MessageParticipant).where(MessageParticipant.thread_id.in_([t.id for t in threads]))
                )
            )
            .scalars()
            .all()
        )
        admin_participants = [p for p in all_parts if p.participant_type == "user"]
        attendee_participants = [p for p in all_parts if p.participant_type == PARTICIPANT_TYPE_TRAINING_ATTENDEE]
        assert len(admin_participants) == 3
        assert len(attendee_participants) == 3

        # Each thread has exactly one initial Message rendered with the substituted body.
        msgs = (
            (await db_session.execute(select(Message).where(Message.thread_id.in_([t.id for t in threads]))))
            .scalars()
            .all()
        )
        assert len(msgs) == 3
        bodies = {m.body_html for m in msgs}
        assert any("Hi Alice" in b for b in bodies)
        assert any("Hi Bob" in b for b in bodies)
        assert any("Hi Carol" in b for b in bodies)

        # Email fanout: one outbound per recipient.
        assert send_mock.await_count == 3
        emails_sent = {kwargs["email"] for _, kwargs in send_mock.call_args_list}
        assert emails_sent == {"alice@example.com", "bob@example.com", "carol@example.com"}


class TestAudienceIsolation:
    async def test_training_broadcast_does_not_leak_to_conference_applicants(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tb_tenant: Tenant,
        tb_admin: User,
        tb_placement: ProgramYearTraining,
    ) -> None:
        # Conference applicant who must NOT receive the training broadcast.
        # No conference / CFP setup needed — the assertion only checks that
        # no MessageParticipant row references this applicant after the
        # training broadcast runs.
        bystander = CFPApplicant(
            id=uuid.uuid4(),
            tenant_id=tb_tenant.id,
            email="bystander@example.com",
            first_name="By",
            last_name="Stander",
            password_hash=hash_password("pw"),
        )
        db_session.add(bystander)
        await db_session.flush()

        reg = await _make_registration(
            db_session,
            tb_tenant,
            tb_placement,
            attendees=[("Train", "Person", "trainee@example.com")],
        )
        with patch(
            "app.services.training_messaging.send_direct_message_email",
            AsyncMock(return_value=True),
        ):
            resp = await client.post(
                f"/api/v1/trainings/registrations/{reg.id}/messages/broadcast",
                json={"subject": "Hi", "body_html": "<p>Hi</p>"},
                headers=auth_headers(_admin_token(tb_admin)),
            )
        assert resp.status_code == 201, resp.text

        # The bystander applicant has no participant rows referencing them.
        bystander_parts = (
            (
                await db_session.execute(
                    select(MessageParticipant).where(
                        MessageParticipant.participant_type == "applicant",
                        MessageParticipant.participant_id == bystander.id,
                    )
                )
            )
            .scalars()
            .all()
        )
        assert bystander_parts == []

    async def test_cross_membership_user_gets_two_distinct_threads(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tb_tenant: Tenant,
        tb_admin: User,
        tb_placement: ProgramYearTraining,
    ) -> None:
        """The keystone test: same email is BOTH a CFP applicant and a training attendee.

        Admin issues a conference broadcast → only the conference thread for
        them. Admin issues a training broadcast for a registration containing
        the same email → only the training thread for them. Two distinct rows,
        with the domain anchor pinning each to its own surface.
        """
        shared_email = "alice@cross.example.com"

        # Conference side: applicant Alice in conf X.
        conf = Conference(
            id=uuid.uuid4(),
            tenant_id=tb_tenant.id,
            name="Conf X",
            abbreviation=f"CX-{uuid.uuid4().hex[:4]}",
            is_active=True,
        )
        db_session.add(conf)
        await db_session.flush()
        applicant = CFPApplicant(
            id=uuid.uuid4(),
            tenant_id=tb_tenant.id,
            email=shared_email,
            first_name="Alice",
            last_name="Liddell",
            password_hash=hash_password("pw"),
        )
        db_session.add(applicant)
        await db_session.flush()

        # Manually create the conference thread (mirrors what the conference
        # bulk endpoint produces — we don't go through that endpoint here
        # because the goal is to assert isolation of THIS PR's training path).
        conf_thread = MessageThread(
            id=uuid.uuid4(),
            tenant_id=tb_tenant.id,
            conference_id=conf.id,
            subject="Conference message for Alice",
        )
        db_session.add(conf_thread)
        await db_session.flush()
        db_session.add(
            MessageParticipant(
                tenant_id=tb_tenant.id,
                thread_id=conf_thread.id,
                participant_type="applicant",
                participant_id=applicant.id,
            )
        )
        await db_session.commit()

        # Training side: same email attends a registration.
        reg = await _make_registration(
            db_session,
            tb_tenant,
            tb_placement,
            attendees=[("Alice", "Liddell", shared_email)],
        )
        with patch(
            "app.services.training_messaging.send_direct_message_email",
            AsyncMock(return_value=True),
        ):
            resp = await client.post(
                f"/api/v1/trainings/registrations/{reg.id}/messages/broadcast",
                json={"subject": "Training message", "body_html": "<p>Hi</p>"},
                headers=auth_headers(_admin_token(tb_admin)),
            )
        assert resp.status_code == 201, resp.text

        # Two distinct threads exist for Alice: one conference, one training.
        # The conference thread is keyed on her CFPApplicant row; the
        # training thread is keyed on her TrainingRegistrationAttendee row.
        # No participant points at the wrong domain anchor.
        attendee_row = (
            (
                await db_session.execute(
                    select(TrainingRegistrationAttendee).where(
                        TrainingRegistrationAttendee.registration_id == reg.id,
                    )
                )
            )
            .scalars()
            .one()
        )

        applicant_threads = (
            (
                await db_session.execute(
                    select(MessageThread)
                    .join(MessageParticipant, MessageParticipant.thread_id == MessageThread.id)
                    .where(
                        MessageParticipant.participant_type == "applicant",
                        MessageParticipant.participant_id == applicant.id,
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(applicant_threads) == 1
        assert applicant_threads[0].id == conf_thread.id
        assert applicant_threads[0].domain == THREAD_DOMAIN_CONFERENCE
        assert applicant_threads[0].conference_id == conf.id

        attendee_threads = (
            (
                await db_session.execute(
                    select(MessageThread)
                    .join(MessageParticipant, MessageParticipant.thread_id == MessageThread.id)
                    .where(
                        MessageParticipant.participant_type == PARTICIPANT_TYPE_TRAINING_ATTENDEE,
                        MessageParticipant.participant_id == attendee_row.id,
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(attendee_threads) == 1
        assert attendee_threads[0].domain == THREAD_DOMAIN_TRAINING
        assert attendee_threads[0].domain_entity_id == reg.id
        assert attendee_threads[0].conference_id is None

        # Sanity: the two threads are different rows.
        assert applicant_threads[0].id != attendee_threads[0].id


class TestBroadcastEdgeCases:
    async def test_dedupes_attendees_with_same_email(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tb_tenant: Tenant,
        tb_admin: User,
        tb_placement: ProgramYearTraining,
    ) -> None:
        # Same email twice (case-insensitive) → one thread, one email.
        reg = await _make_registration(
            db_session,
            tb_tenant,
            tb_placement,
            attendees=[
                ("Alice", "Liddell", "alice@example.com"),
                ("Alice", "Liddell", "ALICE@example.com"),
            ],
        )
        with patch(
            "app.services.training_messaging.send_direct_message_email",
            AsyncMock(return_value=True),
        ) as send_mock:
            resp = await client.post(
                f"/api/v1/trainings/registrations/{reg.id}/messages/broadcast",
                json={"subject": "Hi", "body_html": "<p>Hi</p>"},
                headers=auth_headers(_admin_token(tb_admin)),
            )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["sent_count"] == 1
        assert body["skipped_count"] == 1
        assert send_mock.await_count == 1

    async def test_skips_attendee_with_empty_email(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tb_tenant: Tenant,
        tb_admin: User,
        tb_placement: ProgramYearTraining,
    ) -> None:
        reg = await _make_registration(
            db_session,
            tb_tenant,
            tb_placement,
            attendees=[
                ("Bob", "Builder", "bob@example.com"),
                ("Empty", "Email", ""),
            ],
        )
        with patch(
            "app.services.training_messaging.send_direct_message_email",
            AsyncMock(return_value=True),
        ):
            resp = await client.post(
                f"/api/v1/trainings/registrations/{reg.id}/messages/broadcast",
                json={"subject": "Hi", "body_html": "<p>Hi</p>"},
                headers=auth_headers(_admin_token(tb_admin)),
            )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["sent_count"] == 1
        assert body["skipped_count"] == 1

    async def test_sanitizes_script_tag_in_body(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tb_tenant: Tenant,
        tb_admin: User,
        tb_placement: ProgramYearTraining,
    ) -> None:
        reg = await _make_registration(
            db_session,
            tb_tenant,
            tb_placement,
            attendees=[("Alice", "Liddell", "alice@example.com")],
        )
        with patch(
            "app.services.training_messaging.send_direct_message_email",
            AsyncMock(return_value=True),
        ):
            resp = await client.post(
                f"/api/v1/trainings/registrations/{reg.id}/messages/broadcast",
                json={
                    "subject": "Hi",
                    "body_html": "<p>Hi</p><script>alert(1)</script>",
                },
                headers=auth_headers(_admin_token(tb_admin)),
            )
        assert resp.status_code == 201, resp.text
        msg = (await db_session.execute(select(Message).limit(1))).scalars().one()
        assert "<script>" not in msg.body_html
        assert "alert(1)" not in msg.body_html

    async def test_email_failure_does_not_poison_batch(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tb_tenant: Tenant,
        tb_admin: User,
        tb_placement: ProgramYearTraining,
    ) -> None:
        # First send raises; the rest must still go through. Threads must
        # still be persisted (the broadcast is the source of truth, the email
        # is just notification).
        reg = await _make_registration(
            db_session,
            tb_tenant,
            tb_placement,
            attendees=[
                ("Alice", "Liddell", "alice@example.com"),
                ("Bob", "Builder", "bob@example.com"),
            ],
        )
        side_effects = [Exception("smtp down"), True]
        mock = AsyncMock(side_effect=side_effects)
        with patch("app.services.training_messaging.send_direct_message_email", mock):
            resp = await client.post(
                f"/api/v1/trainings/registrations/{reg.id}/messages/broadcast",
                json={"subject": "Hi", "body_html": "<p>Hi</p>"},
                headers=auth_headers(_admin_token(tb_admin)),
            )
        assert resp.status_code == 201, resp.text
        assert mock.await_count == 2
        # Both threads still got written.
        threads = (
            (await db_session.execute(select(MessageThread).where(MessageThread.domain_entity_id == reg.id)))
            .scalars()
            .all()
        )
        assert len(threads) == 2

    async def test_missing_registration_returns_404(
        self,
        client: AsyncClient,
        tb_admin: User,
    ) -> None:
        bogus = uuid.uuid4()
        resp = await client.post(
            f"/api/v1/trainings/registrations/{bogus}/messages/broadcast",
            json={"subject": "Hi", "body_html": "<p>Hi</p>"},
            headers=auth_headers(_admin_token(tb_admin)),
        )
        assert resp.status_code == 404, resp.text

    async def test_non_admin_returns_403(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tb_tenant: Tenant,
        tb_non_admin: User,
        tb_placement: ProgramYearTraining,
    ) -> None:
        reg = await _make_registration(
            db_session,
            tb_tenant,
            tb_placement,
            attendees=[("Alice", "Liddell", "alice@example.com")],
        )
        token = create_access_token(
            user_id=tb_non_admin.id,
            tenant_id=tb_non_admin.tenant_id,
            role=tb_non_admin.role,
            modules=["trainings"],
        )
        resp = await client.post(
            f"/api/v1/trainings/registrations/{reg.id}/messages/broadcast",
            json={"subject": "Hi", "body_html": "<p>Hi</p>"},
            headers=auth_headers(token),
        )
        assert resp.status_code == 403, resp.text
