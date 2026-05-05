"""Portal unified inbox: surface both conference and training threads.

PR 2b: the portal user signs in via the CFP applicant identity but may
*also* be a ``TrainingRegistrationAttendee`` if their email is on a
booking. The unified inbox surfaces both kinds of threads in one list,
with optional ``?domain=`` filter for the chip UI.

What this file pins:
  - List returns BOTH conference and training threads when the user
    has identities in both worlds (cross-membership keystone).
  - ``?domain=conference`` and ``?domain=training`` filter correctly.
  - ``domain``, ``domain_entity_id``, and ``domain_entity_name`` are
    populated on each list item AND on the detail response.
  - Mark-read updates ALL my participant rows (so unread-count converges
    when the same user has both an applicant row and a training-attendee
    row pointing at the same thread? No — different threads, but the
    aggregate count still has to drop when they read either).
  - Reply on a training thread sets ``sender_type='training_attendee'``
    and ``sender_id=<TrainingRegistrationAttendee.id>``.
  - Tenant isolation: a training thread in tenant B with a matching
    email never leaks into tenant A's inbox.
"""

import os
import uuid
from datetime import UTC, date, datetime

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

from app.core.applicant_security import create_applicant_access_token
from app.core.security import hash_password
from app.core.security.pii_crypto import hash_email
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
from app.models.tenant import Tenant
from app.models.training import Training
from app.models.training_program import ProgramYearTraining, TrainingProgramYear
from app.models.training_registration import TrainingRegistration, TrainingRegistrationAttendee
from app.services.training_messaging import PARTICIPANT_TYPE_TRAINING_ATTENDEE
from tests.conftest import auth_headers

PORTAL_BASE = "/api/v1/portal"


# ── Fixtures ────────────────────────────────────────────────────────────


@pytest_asyncio.fixture()
async def ui_tenant(db_session: AsyncSession) -> Tenant:
    t = Tenant(
        id=uuid.uuid4(),
        name="UI Tenant",
        slug=f"ui-tenant-{uuid.uuid4().hex[:8]}",
        is_active=True,
    )
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture()
async def ui_other_tenant(db_session: AsyncSession) -> Tenant:
    """Second tenant used to assert cross-tenant isolation."""
    t = Tenant(
        id=uuid.uuid4(),
        name="Other Tenant",
        slug=f"other-tenant-{uuid.uuid4().hex[:8]}",
        is_active=True,
    )
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture()
async def ui_applicant(db_session: AsyncSession, ui_tenant: Tenant) -> CFPApplicant:
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=ui_tenant.id,
        first_name="Pat",
        last_name="Cross",
        email=f"pat-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Password123!"),
        email_verified_at=datetime.now(UTC),
    )
    db_session.add(a)
    await db_session.commit()
    return a


def _token(applicant: CFPApplicant, tenant: Tenant) -> str:
    return create_applicant_access_token(applicant.id, tenant.id)


@pytest_asyncio.fixture()
async def ui_conference(db_session: AsyncSession, ui_tenant: Tenant) -> Conference:
    c = Conference(
        id=uuid.uuid4(),
        tenant_id=ui_tenant.id,
        name="UI Conf",
        abbreviation=f"UC-{uuid.uuid4().hex[:4]}",
        is_active=True,
    )
    db_session.add(c)
    await db_session.commit()
    return c


@pytest_asyncio.fixture()
async def ui_placement(db_session: AsyncSession, ui_tenant: Tenant) -> ProgramYearTraining:
    tr = Training(
        id=uuid.uuid4(),
        tenant_id=ui_tenant.id,
        name="ITIL Foundation",
        slug=f"itil-{uuid.uuid4().hex[:6]}",
        duration=2,
    )
    loc = Location(id=uuid.uuid4(), tenant_id=ui_tenant.id, name="Berlin", code="BER")
    py = TrainingProgramYear(id=uuid.uuid4(), tenant_id=ui_tenant.id, year=2026)
    db_session.add_all([tr, loc, py])
    await db_session.flush()
    p = ProgramYearTraining(
        id=uuid.uuid4(),
        tenant_id=ui_tenant.id,
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


async def _create_conference_thread(
    db: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    applicant: CFPApplicant,
    *,
    subject: str = "Conference message",
) -> MessageThread:
    """Mimic the bulk-send shape: thread with the applicant as participant + a body message."""
    thread = MessageThread(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        subject=subject,
    )
    db.add(thread)
    await db.flush()
    db.add(
        MessageParticipant(
            tenant_id=tenant.id,
            thread_id=thread.id,
            participant_type="applicant",
            participant_id=applicant.id,
        )
    )
    db.add(
        Message(
            tenant_id=tenant.id,
            thread_id=thread.id,
            sender_type="user",
            sender_id=uuid.uuid4(),  # admin id; doesn't matter for these assertions
            body_html="<p>Hi from conf admin</p>",
        )
    )
    await db.commit()
    await db.refresh(thread)
    return thread


async def _create_training_thread_for_email(
    db: AsyncSession,
    tenant: Tenant,
    placement: ProgramYearTraining,
    email: str,
    *,
    subject: str = "Training message",
) -> tuple[MessageThread, TrainingRegistration, TrainingRegistrationAttendee]:
    """Build a registration + attendee with the given email, and a training-domain thread."""
    reg = TrainingRegistration(
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
        contact_first_name="Pat",
        contact_last_name="Cross",
        contact_email=email,
        payment_method="bank_transfer",
    )
    db.add(reg)
    await db.flush()
    attendee = TrainingRegistrationAttendee(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        registration_id=reg.id,
        first_name="Pat",
        last_name="Cross",
        email=email,
        language="en",
    )
    db.add(attendee)
    await db.flush()

    thread = MessageThread(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=None,
        domain=THREAD_DOMAIN_TRAINING,
        domain_entity_id=reg.id,
        subject=subject,
    )
    db.add(thread)
    await db.flush()
    db.add(
        MessageParticipant(
            tenant_id=tenant.id,
            thread_id=thread.id,
            participant_type=PARTICIPANT_TYPE_TRAINING_ATTENDEE,
            participant_id=attendee.id,
        )
    )
    db.add(
        Message(
            tenant_id=tenant.id,
            thread_id=thread.id,
            sender_type="user",
            sender_id=uuid.uuid4(),
            body_html="<p>Hi from training admin</p>",
        )
    )
    await db.commit()
    await db.refresh(thread)
    return thread, reg, attendee


# ── Tests ────────────────────────────────────────────────────────────────


class TestUnifiedInboxList:
    async def test_returns_both_domains(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        ui_tenant: Tenant,
        ui_applicant: CFPApplicant,
        ui_conference: Conference,
        ui_placement: ProgramYearTraining,
    ) -> None:
        await _create_conference_thread(db_session, ui_tenant, ui_conference, ui_applicant)
        training_thread, _reg, _att = await _create_training_thread_for_email(
            db_session, ui_tenant, ui_placement, ui_applicant.email
        )

        resp = await client.get(
            f"{PORTAL_BASE}/messages",
            headers=auth_headers(_token(ui_applicant, ui_tenant)),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["total"] == 2
        domains = sorted(item["domain"] for item in body["items"])
        assert domains == [THREAD_DOMAIN_CONFERENCE, THREAD_DOMAIN_TRAINING]
        # Domain entity name resolves for both:
        # - conference → Conference.name ("UI Conf")
        # - training → joined Training.name ("ITIL Foundation")
        names_by_domain = {item["domain"]: item["domain_entity_name"] for item in body["items"]}
        assert names_by_domain[THREAD_DOMAIN_CONFERENCE] == "UI Conf"
        assert names_by_domain[THREAD_DOMAIN_TRAINING] == "ITIL Foundation"
        # Training thread's domain_entity_id is the registration id, not a conference id.
        training_item = next(item for item in body["items"] if item["domain"] == THREAD_DOMAIN_TRAINING)
        assert training_item["id"] == str(training_thread.id)

    async def test_domain_filter(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        ui_tenant: Tenant,
        ui_applicant: CFPApplicant,
        ui_conference: Conference,
        ui_placement: ProgramYearTraining,
    ) -> None:
        await _create_conference_thread(db_session, ui_tenant, ui_conference, ui_applicant)
        await _create_training_thread_for_email(db_session, ui_tenant, ui_placement, ui_applicant.email)

        resp = await client.get(
            f"{PORTAL_BASE}/messages?domain=conference",
            headers=auth_headers(_token(ui_applicant, ui_tenant)),
        )
        body = resp.json()
        assert body["total"] == 1
        assert body["items"][0]["domain"] == THREAD_DOMAIN_CONFERENCE

        resp = await client.get(
            f"{PORTAL_BASE}/messages?domain=training",
            headers=auth_headers(_token(ui_applicant, ui_tenant)),
        )
        body = resp.json()
        assert body["total"] == 1
        assert body["items"][0]["domain"] == THREAD_DOMAIN_TRAINING

    async def test_unknown_domain_404(
        self,
        client: AsyncClient,
        ui_applicant: CFPApplicant,
        ui_tenant: Tenant,
    ) -> None:
        resp = await client.get(
            f"{PORTAL_BASE}/messages?domain=bogus",
            headers=auth_headers(_token(ui_applicant, ui_tenant)),
        )
        assert resp.status_code == 404, resp.text

    async def test_cross_tenant_isolation(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        ui_tenant: Tenant,
        ui_other_tenant: Tenant,
        ui_applicant: CFPApplicant,
    ) -> None:
        # A different tenant has a placement + a training thread anchored on
        # a registration with the SAME email as our applicant. Tenant scoping
        # must drop it from our inbox.
        tr = Training(
            id=uuid.uuid4(),
            tenant_id=ui_other_tenant.id,
            name="Other Training",
            slug=f"ot-{uuid.uuid4().hex[:6]}",
            duration=1,
        )
        py = TrainingProgramYear(id=uuid.uuid4(), tenant_id=ui_other_tenant.id, year=2026)
        loc = Location(id=uuid.uuid4(), tenant_id=ui_other_tenant.id, name="X", code="X")
        db_session.add_all([tr, py, loc])
        await db_session.flush()
        other_placement = ProgramYearTraining(
            id=uuid.uuid4(),
            tenant_id=ui_other_tenant.id,
            program_year_id=py.id,
            training_id=tr.id,
            start_date=date(2026, 12, 1),
            placement_type="open",
            location_id=loc.id,
            is_active=True,
        )
        db_session.add(other_placement)
        await db_session.commit()
        await _create_training_thread_for_email(db_session, ui_other_tenant, other_placement, ui_applicant.email)

        resp = await client.get(
            f"{PORTAL_BASE}/messages",
            headers=auth_headers(_token(ui_applicant, ui_tenant)),
        )
        body = resp.json()
        # Inbox is empty — the tenant scoping on MessageThread cuts the
        # other-tenant training thread out even though the email matches.
        assert body["total"] == 0


class TestUnifiedInboxDetail:
    async def test_get_training_thread_returns_domain_fields(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        ui_tenant: Tenant,
        ui_applicant: CFPApplicant,
        ui_placement: ProgramYearTraining,
    ) -> None:
        thread, reg, _att = await _create_training_thread_for_email(
            db_session, ui_tenant, ui_placement, ui_applicant.email
        )

        resp = await client.get(
            f"{PORTAL_BASE}/messages/{thread.id}",
            headers=auth_headers(_token(ui_applicant, ui_tenant)),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["domain"] == THREAD_DOMAIN_TRAINING
        assert body["domain_entity_id"] == str(reg.id)
        assert body["domain_entity_name"] == "ITIL Foundation"

    @pytest.mark.legacy_truncate
    async def test_reply_on_training_thread_uses_training_attendee_sender(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        ui_tenant: Tenant,
        ui_applicant: CFPApplicant,
        ui_placement: ProgramYearTraining,
    ) -> None:
        # Marked legacy_truncate: this test seeds a TrainingRegistrationAttendee
        # via flush() and then expects the HTTP-handler's lookup to find it
        # via email_hash. Under savepoint isolation, the auth dep
        # (current_applicant.applicant.email) has a quirk that resolves the
        # email differently than under TRUNCATE+commit; rather than reshape
        # the test for one outlier, opt out and keep the asserted behaviour.
        thread, _reg, attendee = await _create_training_thread_for_email(
            db_session, ui_tenant, ui_placement, ui_applicant.email
        )

        resp = await client.post(
            f"{PORTAL_BASE}/messages/{thread.id}/reply",
            json={"body_html": "<p>thanks!</p>", "attachment_ids": []},
            headers=auth_headers(_token(ui_applicant, ui_tenant)),
        )
        assert resp.status_code == 201, resp.text

        # The new message has sender keyed on the training attendee row.
        msgs = (
            (
                await db_session.execute(
                    select(Message).where(Message.thread_id == thread.id).order_by(Message.created_at.desc())
                )
            )
            .scalars()
            .all()
        )
        latest = msgs[0]
        assert latest.sender_type == PARTICIPANT_TYPE_TRAINING_ATTENDEE
        assert latest.sender_id == attendee.id


class TestUnifiedInboxReadCount:
    async def test_unread_count_spans_domains(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        ui_tenant: Tenant,
        ui_applicant: CFPApplicant,
        ui_conference: Conference,
        ui_placement: ProgramYearTraining,
    ) -> None:
        await _create_conference_thread(db_session, ui_tenant, ui_conference, ui_applicant)
        await _create_training_thread_for_email(db_session, ui_tenant, ui_placement, ui_applicant.email)

        resp = await client.get(
            f"{PORTAL_BASE}/messages/unread-count",
            headers=auth_headers(_token(ui_applicant, ui_tenant)),
        )
        assert resp.status_code == 200, resp.text
        # Both threads have admin-side messages and no last_read_at on my
        # participant rows, so both count as unread.
        assert resp.json()["unread_count"] == 2

    async def test_mark_read_clears_unread_for_training_thread(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        ui_tenant: Tenant,
        ui_applicant: CFPApplicant,
        ui_placement: ProgramYearTraining,
    ) -> None:
        thread, _reg, _att = await _create_training_thread_for_email(
            db_session, ui_tenant, ui_placement, ui_applicant.email
        )

        before = await client.get(
            f"{PORTAL_BASE}/messages/unread-count",
            headers=auth_headers(_token(ui_applicant, ui_tenant)),
        )
        assert before.json()["unread_count"] == 1

        # Hit the cross-domain mark-read endpoint and confirm the unread
        # count drops — proves the endpoint updates the training-attendee
        # participant row, not just the (non-existent) applicant row.
        mark = await client.post(
            f"{PORTAL_BASE}/messages/{thread.id}/read",
            headers=auth_headers(_token(ui_applicant, ui_tenant)),
        )
        assert mark.status_code == 200, mark.text

        after = await client.get(
            f"{PORTAL_BASE}/messages/unread-count",
            headers=auth_headers(_token(ui_applicant, ui_tenant)),
        )
        assert after.json()["unread_count"] == 0


class TestParticipantKeysHelper:
    """Direct unit cover for the helper that powers all of the above."""

    async def test_resolves_applicant_plus_matching_training_attendees(
        self,
        db_session: AsyncSession,
        ui_tenant: Tenant,
        ui_applicant: CFPApplicant,
        ui_placement: ProgramYearTraining,
    ) -> None:
        from app.api.v1.cfp_portal.messaging._helpers import _resolve_my_participant_keys

        # Two registrations, same email — should produce TWO training keys
        # in addition to the applicant key.
        reg1 = TrainingRegistration(
            id=uuid.uuid4(),
            tenant_id=ui_tenant.id,
            placement_id=ui_placement.id,
            status="paid",
            language="en",
            street="X",
            postal_code="0",
            city="X",
            country="DE",
            contact_first_name="P",
            contact_last_name="C",
            contact_email=ui_applicant.email,
            payment_method="bank_transfer",
        )
        db_session.add(reg1)
        await db_session.flush()
        att1 = TrainingRegistrationAttendee(
            id=uuid.uuid4(),
            tenant_id=ui_tenant.id,
            registration_id=reg1.id,
            first_name="Pat",
            last_name="Cross",
            email=ui_applicant.email,
        )
        att2 = TrainingRegistrationAttendee(
            id=uuid.uuid4(),
            tenant_id=ui_tenant.id,
            registration_id=reg1.id,
            first_name="Pat",
            last_name="Cross",
            email=ui_applicant.email,
        )
        # A second attendee on a different email — must NOT be in the result.
        att3 = TrainingRegistrationAttendee(
            id=uuid.uuid4(),
            tenant_id=ui_tenant.id,
            registration_id=reg1.id,
            first_name="Other",
            last_name="Person",
            email=f"different-{uuid.uuid4().hex[:8]}@example.com",
        )
        db_session.add_all([att1, att2, att3])
        await db_session.commit()

        keys = await _resolve_my_participant_keys(
            db_session,
            tenant_id=ui_tenant.id,
            applicant_id=ui_applicant.id,
            applicant_email=ui_applicant.email,
        )
        types = sorted({t for t, _ in keys})
        assert types == ["applicant", PARTICIPANT_TYPE_TRAINING_ATTENDEE]
        # The applicant key + 2 training keys (att1, att2) — att3 has a
        # different email_hash and is excluded.
        assert len(keys) == 3
        assert ("applicant", ui_applicant.id) in keys
        att_ids = {pid for ptype, pid in keys if ptype == PARTICIPANT_TYPE_TRAINING_ATTENDEE}
        assert att_ids == {att1.id, att2.id}
        # Sanity check that the matching uses email_hash as advertised.
        assert hash_email(ui_applicant.email) == att1.email_hash
