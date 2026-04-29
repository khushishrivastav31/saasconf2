"""Placement-level training broadcast — message every attendee on a session.

Scope: ``POST /trainings/placements/{placement_id}/messages/broadcast``.

What this file pins:
  - The fan-out collects attendees from *every* registration on the
    placement (not just one), and creates one thread per surviving
    attendee.
  - Each thread anchors on that attendee's *own* registration via
    ``domain_entity_id``, so a 5-attendee booking and a 1-attendee
    booking still produce thread anchors that match the recipient's
    portal view.
  - All threads in one send share a single ``bulk_id`` (the admin
    Messages tab groups by it).
  - Cross-registration dedup: if the same email appears on two
    different registrations, only one thread is created.
  - Missing placement → 404. Other-tenant placement → 404.
  - Empty-email attendees are skipped.
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

from app.models.location import Location
from app.models.messaging import THREAD_DOMAIN_TRAINING, MessageThread
from app.models.tenant import Tenant
from app.models.training import Training
from app.models.training_program import ProgramYearTraining, TrainingProgramYear
from app.models.training_registration import TrainingRegistration, TrainingRegistrationAttendee
from app.models.user import User
from tests.conftest import auth_headers
from tests.trainings.conftest import training_admin_token


@pytest_asyncio.fixture
async def pb_placement(db_session: AsyncSession, training_tenant: Tenant) -> ProgramYearTraining:
    """Minimal placement (training + program year + location + placement
    row) anchored to ``training_tenant``. Year is randomized so tests
    using this fixture don't collide on the per-tenant year-uniqueness
    constraint when run in parallel."""
    tr = Training(
        id=uuid.uuid4(),
        tenant_id=training_tenant.id,
        name="ITIL Foundation",
        slug=f"itil-{uuid.uuid4().hex[:6]}",
        duration=2,
    )
    loc = Location(id=uuid.uuid4(), tenant_id=training_tenant.id, name="Berlin", code=f"BER{uuid.uuid4().hex[:2]}")
    year = 2030 + (uuid.uuid4().int % 50)
    py = TrainingProgramYear(id=uuid.uuid4(), tenant_id=training_tenant.id, year=year)
    db_session.add_all([tr, loc, py])
    await db_session.flush()
    p = ProgramYearTraining(
        id=uuid.uuid4(),
        tenant_id=training_tenant.id,
        program_year_id=py.id,
        training_id=tr.id,
        start_date=date(year, 11, 10),
        placement_type="open",
        location_id=loc.id,
        is_active=True,
    )
    db_session.add(p)
    await db_session.commit()
    return p


async def _make_reg(
    db: AsyncSession,
    tenant: Tenant,
    placement: ProgramYearTraining,
    *,
    company: str | None = None,
    attendees: list[tuple[str, str, str]] | None = None,
) -> TrainingRegistration:
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
        contact_email=f"booking-{uuid.uuid4().hex[:6]}@x.test",
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


def _endpoint(placement_id: uuid.UUID) -> str:
    return f"/api/v1/trainings/placements/{placement_id}/messages/broadcast"


class TestPlacementBroadcast:
    async def test_fans_out_across_all_registrations_on_placement(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        training_tenant: Tenant,
        training_admin: User,
        pb_placement: ProgramYearTraining,
    ) -> None:
        # Two registrations on the same placement, 2+1 = 3 attendees total.
        reg_a = await _make_reg(
            db_session,
            training_tenant,
            pb_placement,
            company="Acme",
            attendees=[
                ("Alice", "L", "alice@example.com"),
                ("Bob", "B", "bob@example.com"),
            ],
        )
        reg_b = await _make_reg(
            db_session,
            training_tenant,
            pb_placement,
            company="Globex",
            attendees=[("Carol", "K", "carol@example.com")],
        )

        with patch(
            "app.services.training_messaging._core.send_direct_message_email",
            AsyncMock(return_value=True),
        ) as send_mock:
            resp = await client.post(
                _endpoint(pb_placement.id),
                json={
                    "subject": "Reminder for [Training Name]",
                    "body_html": "<p>Hi [First Name] — booked by [Company Name].</p>",
                },
                headers=auth_headers(training_admin_token(training_admin)),
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
        # All threads share one bulk_id.
        bulk_id = uuid.UUID(body["bulk_id"])
        threads = (
            (await db_session.execute(select(MessageThread).where(MessageThread.bulk_id == bulk_id))).scalars().all()
        )
        assert len(threads) == 3
        # Each thread anchors on its attendee's *own* registration.
        anchors = {t.domain_entity_id for t in threads}
        assert anchors == {reg_a.id, reg_b.id}
        # All training-domain.
        for t in threads:
            assert t.domain == THREAD_DOMAIN_TRAINING
            assert t.conference_id is None
        # Email rendered "[Company Name]" per registration: Alice + Bob got "Acme",
        # Carol got "Globex".
        bodies_by_email = {kwargs["email"]: kwargs["body_html"] for _, kwargs in send_mock.call_args_list}
        assert "Acme" in bodies_by_email["alice@example.com"]
        assert "Acme" in bodies_by_email["bob@example.com"]
        assert "Globex" in bodies_by_email["carol@example.com"]
        # Subject got rendered with training name.
        for _args, kwargs in send_mock.call_args_list:
            assert "ITIL Foundation" in kwargs["subject"]

    async def test_dedupes_email_across_registrations(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        training_tenant: Tenant,
        training_admin: User,
        pb_placement: ProgramYearTraining,
    ) -> None:
        # Same email on two different registrations — should produce ONE
        # thread, with skipped_count = 1.
        await _make_reg(
            db_session,
            training_tenant,
            pb_placement,
            attendees=[("Dup", "Person", "dup@example.com")],
        )
        await _make_reg(
            db_session,
            training_tenant,
            pb_placement,
            attendees=[("Dup", "Person", "DUP@example.com")],
        )

        with patch(
            "app.services.training_messaging._core.send_direct_message_email",
            AsyncMock(return_value=True),
        ) as send_mock:
            resp = await client.post(
                _endpoint(pb_placement.id),
                json={"subject": "Hi", "body_html": "<p>Hi</p>"},
                headers=auth_headers(training_admin_token(training_admin)),
            )
        body = resp.json()
        assert body["sent_count"] == 1
        assert body["skipped_count"] == 1
        assert send_mock.await_count == 1

    async def test_missing_placement_404(
        self,
        client: AsyncClient,
        training_admin: User,
    ) -> None:
        resp = await client.post(
            _endpoint(uuid.uuid4()),
            json={"subject": "x", "body_html": "<p>x</p>"},
            headers=auth_headers(training_admin_token(training_admin)),
        )
        assert resp.status_code == 404, resp.text

    async def test_other_tenant_placement_404(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        training_admin: User,
    ) -> None:
        # Build a placement under a DIFFERENT tenant — my admin can't reach it.
        other = Tenant(id=uuid.uuid4(), name="Other", slug=f"o-{uuid.uuid4().hex[:8]}")
        db_session.add(other)
        await db_session.flush()
        tr = Training(id=uuid.uuid4(), tenant_id=other.id, name="X", slug=f"x-{uuid.uuid4().hex[:6]}", duration=1)
        loc = Location(id=uuid.uuid4(), tenant_id=other.id, name="Y", code=f"Y{uuid.uuid4().hex[:2]}")
        py = TrainingProgramYear(id=uuid.uuid4(), tenant_id=other.id, year=2026)
        db_session.add_all([tr, loc, py])
        await db_session.flush()
        other_placement = ProgramYearTraining(
            id=uuid.uuid4(),
            tenant_id=other.id,
            program_year_id=py.id,
            training_id=tr.id,
            start_date=date(2026, 12, 1),
            placement_type="open",
            location_id=loc.id,
            is_active=True,
        )
        db_session.add(other_placement)
        await db_session.commit()

        resp = await client.post(
            _endpoint(other_placement.id),
            json={"subject": "x", "body_html": "<p>x</p>"},
            headers=auth_headers(training_admin_token(training_admin)),
        )
        assert resp.status_code == 404, resp.text

    async def test_attendee_ids_filter_narrows_audience(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        training_tenant: Tenant,
        training_admin: User,
        pb_placement: ProgramYearTraining,
    ) -> None:
        """``attendee_ids`` lets the FE send to one attendee or any subset.

        Two registrations, 3 attendees total. We pin one attendee from
        each registration (cross-registration filter) and assert only
        those two get threads.
        """
        reg_a = await _make_reg(
            db_session,
            training_tenant,
            pb_placement,
            attendees=[
                ("Alice", "L", "alice@example.com"),
                ("Bob", "B", "bob@example.com"),
            ],
        )
        reg_b = await _make_reg(
            db_session,
            training_tenant,
            pb_placement,
            attendees=[("Carol", "K", "carol@example.com")],
        )
        # Pull attendee ids: Alice from reg_a, Carol from reg_b.
        attendees_a = (
            (
                await db_session.execute(
                    select(TrainingRegistrationAttendee).where(TrainingRegistrationAttendee.registration_id == reg_a.id)
                )
            )
            .scalars()
            .all()
        )
        alice = next(a for a in attendees_a if a.email == "alice@example.com")
        attendees_b = (
            (
                await db_session.execute(
                    select(TrainingRegistrationAttendee).where(TrainingRegistrationAttendee.registration_id == reg_b.id)
                )
            )
            .scalars()
            .all()
        )
        carol = next(a for a in attendees_b if a.email == "carol@example.com")

        with patch(
            "app.services.training_messaging._core.send_direct_message_email",
            AsyncMock(return_value=True),
        ) as send_mock:
            resp = await client.post(
                _endpoint(pb_placement.id),
                json={
                    "subject": "Hi",
                    "body_html": "<p>Hi</p>",
                    "attendee_ids": [str(alice.id), str(carol.id)],
                },
                headers=auth_headers(training_admin_token(training_admin)),
            )

        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["sent_count"] == 2
        assert {r["email"] for r in body["recipients"]} == {
            "alice@example.com",
            "carol@example.com",
        }
        # Bob (not in attendee_ids) gets no thread + no email.
        assert send_mock.await_count == 2
        sent_emails = {kwargs["email"] for _, kwargs in send_mock.call_args_list}
        assert "bob@example.com" not in sent_emails

    async def test_attendee_ids_with_one_id_sends_to_one(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        training_tenant: Tenant,
        training_admin: User,
        pb_placement: ProgramYearTraining,
    ) -> None:
        """The "Message this one attendee" entry point on the registrations
        view boils down to a single-element ``attendee_ids`` list."""
        reg = await _make_reg(
            db_session,
            training_tenant,
            pb_placement,
            attendees=[
                ("Alice", "L", "alice@example.com"),
                ("Bob", "B", "bob@example.com"),
            ],
        )
        attendees = (
            (
                await db_session.execute(
                    select(TrainingRegistrationAttendee).where(TrainingRegistrationAttendee.registration_id == reg.id)
                )
            )
            .scalars()
            .all()
        )
        bob = next(a for a in attendees if a.email == "bob@example.com")

        with patch(
            "app.services.training_messaging._core.send_direct_message_email",
            AsyncMock(return_value=True),
        ):
            resp = await client.post(
                _endpoint(pb_placement.id),
                json={"subject": "Hi", "body_html": "<p>Hi</p>", "attendee_ids": [str(bob.id)]},
                headers=auth_headers(training_admin_token(training_admin)),
            )
        body = resp.json()
        assert body["sent_count"] == 1
        assert body["recipients"][0]["email"] == "bob@example.com"

    async def test_empty_attendee_ids_list_is_explicit_no_op(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        training_tenant: Tenant,
        training_admin: User,
        pb_placement: ProgramYearTraining,
    ) -> None:
        """Passing an EMPTY ``attendee_ids`` list = "explicitly no recipients".

        Distinguished from ``None``/omitted (= "all attendees"). Catches an
        FE bug where a multi-select with nothing checked would otherwise
        silently broadcast to everyone.
        """
        await _make_reg(
            db_session,
            training_tenant,
            pb_placement,
            attendees=[("Alice", "L", "alice@example.com")],
        )
        with patch(
            "app.services.training_messaging._core.send_direct_message_email",
            AsyncMock(return_value=True),
        ) as send_mock:
            resp = await client.post(
                _endpoint(pb_placement.id),
                json={"subject": "Hi", "body_html": "<p>Hi</p>", "attendee_ids": []},
                headers=auth_headers(training_admin_token(training_admin)),
            )
        assert resp.status_code == 201, resp.text
        assert resp.json()["sent_count"] == 0
        assert send_mock.await_count == 0

    async def test_by_attendees_endpoint_spans_placements(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        training_tenant: Tenant,
        training_admin: User,
        pb_placement: ProgramYearTraining,
    ) -> None:
        """``POST /trainings/messaging/broadcasts/by-attendees`` lets the
        Compose dialog send to attendees from DIFFERENT placements in
        a single bulk. We pin the cross-placement case here.
        """
        # Second placement under the same tenant.
        from datetime import date as _date

        from app.models.location import Location as _Location
        from app.models.training import Training as _Training
        from app.models.training_program import (
            ProgramYearTraining as _PYT,
        )
        from app.models.training_program import (
            TrainingProgramYear as _TPY,
        )

        tr2 = _Training(
            id=uuid.uuid4(),
            tenant_id=training_tenant.id,
            name="PSM I",
            slug=f"psm-{uuid.uuid4().hex[:6]}",
            duration=2,
        )
        loc2 = _Location(
            id=uuid.uuid4(), tenant_id=training_tenant.id, name="Munich", code=f"MUC{uuid.uuid4().hex[:2]}"
        )
        py2 = _TPY(id=uuid.uuid4(), tenant_id=training_tenant.id, year=2027)
        db_session.add_all([tr2, loc2, py2])
        await db_session.flush()
        placement2 = _PYT(
            id=uuid.uuid4(),
            tenant_id=training_tenant.id,
            program_year_id=py2.id,
            training_id=tr2.id,
            start_date=_date(2027, 1, 15),
            placement_type="open",
            location_id=loc2.id,
            is_active=True,
        )
        db_session.add(placement2)
        await db_session.commit()

        # One attendee on placement 1, one on placement 2.
        reg1 = await _make_reg(
            db_session,
            training_tenant,
            pb_placement,
            attendees=[("Alice", "L", "alice@example.com")],
        )
        reg2 = await _make_reg(
            db_session,
            training_tenant,
            placement2,
            attendees=[("Bob", "B", "bob@example.com")],
        )
        attendees1 = (
            (
                await db_session.execute(
                    select(TrainingRegistrationAttendee).where(TrainingRegistrationAttendee.registration_id == reg1.id)
                )
            )
            .scalars()
            .all()
        )
        attendees2 = (
            (
                await db_session.execute(
                    select(TrainingRegistrationAttendee).where(TrainingRegistrationAttendee.registration_id == reg2.id)
                )
            )
            .scalars()
            .all()
        )
        alice = attendees1[0]
        bob = attendees2[0]

        with patch(
            "app.services.training_messaging._core.send_direct_message_email",
            AsyncMock(return_value=True),
        ) as send_mock:
            resp = await client.post(
                "/api/v1/trainings/messaging/broadcasts/by-attendees",
                json={
                    "attendee_ids": [str(alice.id), str(bob.id)],
                    "subject": "Reminder for [Training Name]",
                    "body_html": "<p>Hi [First Name]</p>",
                },
                headers=auth_headers(training_admin_token(training_admin)),
            )

        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["sent_count"] == 2
        # Both threads share one bulk_id (single send across placements).
        bulk_id = uuid.UUID(body["bulk_id"])
        threads = (
            (await db_session.execute(select(MessageThread).where(MessageThread.bulk_id == bulk_id))).scalars().all()
        )
        assert len(threads) == 2
        # Each thread anchors on its own registration (different placements).
        anchors = {t.domain_entity_id for t in threads}
        assert anchors == {reg1.id, reg2.id}
        # Subject for Alice's thread substitutes ITIL, Bob's substitutes PSM.
        subjects_by_anchor = {t.domain_entity_id: t.subject for t in threads}
        assert "ITIL Foundation" in subjects_by_anchor[reg1.id]
        assert "PSM I" in subjects_by_anchor[reg2.id]
        # Two emails dispatched.
        assert send_mock.await_count == 2

    async def test_by_attendees_endpoint_drops_other_tenant_ids(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        training_tenant: Tenant,
        training_admin: User,
        pb_placement: ProgramYearTraining,
    ) -> None:
        """Stale / cross-tenant ids are silently excluded — no 404, no
        leak of the existence of other-tenant attendees."""
        reg = await _make_reg(
            db_session,
            training_tenant,
            pb_placement,
            attendees=[("Alice", "L", "alice@example.com")],
        )
        attendees = (
            (
                await db_session.execute(
                    select(TrainingRegistrationAttendee).where(TrainingRegistrationAttendee.registration_id == reg.id)
                )
            )
            .scalars()
            .all()
        )
        alice = attendees[0]
        with patch(
            "app.services.training_messaging._core.send_direct_message_email",
            AsyncMock(return_value=True),
        ):
            resp = await client.post(
                "/api/v1/trainings/messaging/broadcasts/by-attendees",
                json={
                    "attendee_ids": [str(alice.id), str(uuid.uuid4())],
                    "subject": "Hi",
                    "body_html": "<p>Hi</p>",
                },
                headers=auth_headers(training_admin_token(training_admin)),
            )
        assert resp.status_code == 201
        # Only Alice was real; the bogus id silently dropped.
        assert resp.json()["sent_count"] == 1

    async def test_upload_endpoint_creates_staged_attachment(
        self,
        client: AsyncClient,
        training_admin: User,
    ) -> None:
        """The admin uploads a file before clicking Send; the endpoint
        returns an Attachment row with a placeholder entity_id that the
        broadcast will later duplicate per recipient."""
        # Plain text avoids ``validate_upload``'s magic-bytes check (which
        # fails for fake-PDF bytes that don't carry the ``%PDF`` header).
        resp = await client.post(
            "/api/v1/trainings/messaging/upload",
            files={"file": ("agenda.txt", b"hello", "text/plain")},
            headers=auth_headers(training_admin_token(training_admin)),
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["filename"] == "agenda.txt"
        assert body["file_size"] == 5
        assert body["entity_type"] == "message"
        # entity_id is a placeholder UUID — not yet linked to a message.
        assert body["entity_id"] is not None

    async def test_upload_rejects_oversize_file(
        self,
        client: AsyncClient,
        training_admin: User,
        monkeypatch: object,
    ) -> None:
        """Files over the configured ``MAX_UPLOAD_SIZE_MB`` get a 400.

        We monkeypatch ``MAX_UPLOAD_SIZE_MB`` down to 0 (any non-empty
        upload becomes "too large") so the test stays fast and avoids
        clashing with the upstream Starlette body-size limit.
        """
        from app.config import get_settings

        # Lower the limit to 0 MB so any upload trips it.
        get_settings().MAX_UPLOAD_SIZE_MB = 0  # type: ignore[misc]
        try:
            resp = await client.post(
                "/api/v1/trainings/messaging/upload",
                files={"file": ("any.txt", b"x", "text/plain")},
                headers=auth_headers(training_admin_token(training_admin)),
            )
            assert resp.status_code == 400, resp.text
            assert "size exceeds" in resp.text.lower()
        finally:
            # Restore default so unrelated tests aren't poisoned.
            get_settings().MAX_UPLOAD_SIZE_MB = 10  # type: ignore[misc]

    async def test_download_endpoint_returns_bytes_and_blocks_other_tenants(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        training_tenant: Tenant,
        training_admin: User,
    ) -> None:
        from app.models.attachment import Attachment

        # My own attachment — admin can download.
        mine = Attachment(
            tenant_id=training_tenant.id,
            entity_type="message",
            entity_id=uuid.uuid4(),
            filename="ours.txt",
            content_type="text/plain",
            file_size=4,
            file_data=b"ours",
            uploaded_by=training_admin.id,
        )
        db_session.add(mine)
        # Other tenant's attachment — admin must NOT see.
        other = Tenant(id=uuid.uuid4(), name="Other", slug=f"o-{uuid.uuid4().hex[:6]}")
        db_session.add(other)
        await db_session.flush()
        theirs = Attachment(
            tenant_id=other.id,
            entity_type="message",
            entity_id=uuid.uuid4(),
            filename="theirs.txt",
            content_type="text/plain",
            file_size=6,
            file_data=b"theirs",
        )
        db_session.add(theirs)
        await db_session.commit()
        await db_session.refresh(mine)
        await db_session.refresh(theirs)

        # Mine: 200 with the bytes.
        resp = await client.get(
            f"/api/v1/trainings/messaging/attachments/{mine.id}/download",
            headers=auth_headers(training_admin_token(training_admin)),
        )
        assert resp.status_code == 200, resp.text
        assert resp.content == b"ours"
        # Theirs: 404 (no leak — same response shape as if it never existed).
        resp = await client.get(
            f"/api/v1/trainings/messaging/attachments/{theirs.id}/download",
            headers=auth_headers(training_admin_token(training_admin)),
        )
        assert resp.status_code == 404, resp.text

    async def test_attachments_duplicate_per_recipient(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        training_tenant: Tenant,
        training_admin: User,
        pb_placement: ProgramYearTraining,
    ) -> None:
        """An admin upload + broadcast must duplicate the attachment row per
        recipient message so each recipient's portal can download their own
        copy. The thread also flips ``has_attachments=True``."""
        from app.models.attachment import Attachment

        # 2 recipients on the placement.
        await _make_reg(
            db_session,
            training_tenant,
            pb_placement,
            attendees=[
                ("Alice", "L", "alice@example.com"),
                ("Bob", "B", "bob@example.com"),
            ],
        )
        # Pre-stage one attachment (the admin uploaded a file before clicking Send).
        staged = Attachment(
            tenant_id=training_tenant.id,
            entity_type="message",
            entity_id=uuid.uuid4(),  # placeholder
            filename="agenda.pdf",
            content_type="application/pdf",
            file_size=1024,
            file_data=b"fake-pdf-bytes",
            uploaded_by=training_admin.id,
        )
        db_session.add(staged)
        await db_session.commit()
        await db_session.refresh(staged)

        with patch(
            "app.services.training_messaging._core.send_direct_message_email",
            AsyncMock(return_value=True),
        ):
            resp = await client.post(
                _endpoint(pb_placement.id),
                json={
                    "subject": "Hi",
                    "body_html": "<p>Hi</p>",
                    "attachment_ids": [str(staged.id)],
                },
                headers=auth_headers(training_admin_token(training_admin)),
            )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["sent_count"] == 2

        # 2 recipients × 1 source attachment = 2 *new* attachment rows
        # pointing at each recipient's first message. The original staged
        # row stays put.
        bulk_id = uuid.UUID(body["bulk_id"])
        threads = (
            (await db_session.execute(select(MessageThread).where(MessageThread.bulk_id == bulk_id))).scalars().all()
        )
        thread_ids = [t.id for t in threads]
        # All threads have has_attachments flipped to True.
        for t in threads:
            assert t.has_attachments is True
        # Pull all attachments tied to this broadcast's messages.
        from app.models.messaging import Message

        msg_rows = (await db_session.execute(select(Message).where(Message.thread_id.in_(thread_ids)))).scalars().all()
        msg_ids = [m.id for m in msg_rows]
        att_rows = (
            (
                await db_session.execute(
                    select(Attachment).where(
                        Attachment.entity_type == "message",
                        Attachment.entity_id.in_(msg_ids),
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(att_rows) == 2
        for att in att_rows:
            assert att.filename == "agenda.pdf"
            assert att.file_data == b"fake-pdf-bytes"
            # Each row points at a real message id (not the placeholder).
            assert att.entity_id in set(msg_ids)

    async def test_empty_placement_returns_zero_recipients(
        self,
        client: AsyncClient,
        training_admin: User,
        pb_placement: ProgramYearTraining,
    ) -> None:
        # No registrations under this placement — sent_count = 0, no threads.
        with patch(
            "app.services.training_messaging._core.send_direct_message_email",
            AsyncMock(return_value=True),
        ) as send_mock:
            resp = await client.post(
                _endpoint(pb_placement.id),
                json={"subject": "x", "body_html": "<p>x</p>"},
                headers=auth_headers(training_admin_token(training_admin)),
            )
        assert resp.status_code == 201, resp.text
        assert resp.json()["sent_count"] == 0
        assert send_mock.await_count == 0
