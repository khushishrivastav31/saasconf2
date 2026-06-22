"""Tests that portal message-notification emails use query-param link format.

Each builder must emit:  …/portal/messages?thread=<id>
NOT the old path style: …/portal/messages/<id>

Covered builders:
- app/api/v1/messaging/_shared.py              (_notify_participants, applicant branch)
- app/api/v1/cfp_portal/messaging/_helpers.py  (_notify_other_participants, applicant branch)
- app/services/training_messaging/_core.py     (_dispatch_broadcast_emails, in_app branch)
"""

import os
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://saasconf:saasconf_dev_password@localhost:5432/saasconf_test",
)
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-unit-tests-minimum-32-chars")
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "testpassword123")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")

import pytest

PORTAL_BASE = "https://portal.example.com"
TENANT_SLUG = "acme"


def _make_settings():
    s = MagicMock()
    s.PORTAL_BASE_URL = PORTAL_BASE
    s.FRONTEND_BASE_URL = "https://app.example.com"
    return s


# ── _shared.py: _notify_participants ──────────────────────────────────────────


class TestNotifyParticipantsQueryLink:
    """_notify_participants builds a query-param portal link for applicants."""

    @pytest.mark.asyncio
    async def test_applicant_link_is_query_param(self):
        from app.api.v1.messaging._shared import _notify_participants
        from app.models.cfp import CFPApplicant
        from app.models.messaging import MessageParticipant

        thread_id = uuid.uuid4()
        applicant_id = uuid.uuid4()
        conference_id = uuid.uuid4()

        thread = MagicMock()
        thread.id = thread_id
        thread.subject = "Test subject"

        applicant = MagicMock(spec=CFPApplicant)
        applicant.id = applicant_id
        applicant.email = "speaker@example.com"
        applicant.first_name = "Alice"
        applicant.message_notifications_enabled = True

        participant = MagicMock(spec=MessageParticipant)
        participant.participant_type = "applicant"
        participant.participant_id = applicant_id

        call_count = [0]

        async def fake_execute(stmt):
            result = MagicMock()
            n = call_count[0]
            call_count[0] += 1
            if n == 0:
                # MessageParticipant query — .scalars().all()
                result.scalars.return_value.all.return_value = [participant]
            elif n == 1:
                # CFPApplicant batch — .scalars() iterable
                result.scalars.return_value = iter([applicant])
            else:
                # User batch — .scalars() iterable (empty)
                result.scalars.return_value = iter([])
            return result

        db = MagicMock()
        db.execute = fake_execute

        captured_links = []

        def fake_send_bg(fn, db, **kwargs):
            captured_links.append(kwargs.get("messages_link", ""))

        # send_email_background is imported inside _notify_participants via
        # `from app.core.email import send_email_background` — patch at source.
        with (
            patch("app.core.email.send_email_background", side_effect=fake_send_bg),
            patch("app.core.email.send_new_message_notification"),
        ):
            await _notify_participants(
                db,
                thread,
                sender_type="user",
                sender_id=uuid.uuid4(),
                conference_name="Conf",
                tenant_slug=TENANT_SLUG,
                conference_id=conference_id,
                base_url=PORTAL_BASE,
            )

        assert len(captured_links) == 1, f"Expected 1 notification, got {len(captured_links)}"
        link = captured_links[0]
        expected = f"{PORTAL_BASE}/{TENANT_SLUG}/portal/messages?thread={thread_id}"
        assert link == expected, f"Expected query-param link, got: {link!r}"


# ── _helpers.py: _notify_other_participants ────────────────────────────────────


class TestNotifyOtherParticipantsQueryLink:
    """_notify_other_participants builds a query-param portal link for applicants."""

    @pytest.mark.asyncio
    async def test_applicant_participant_link_is_query_param(self):
        from app.api.v1.cfp_portal.messaging._helpers import _notify_other_participants
        from app.models.cfp import CFPApplicant
        from app.models.messaging import MessageParticipant

        thread_id = uuid.uuid4()
        applicant_id = uuid.uuid4()

        thread = MagicMock()
        thread.id = thread_id
        thread.subject = "Test subject"

        applicant = MagicMock(spec=CFPApplicant)
        applicant.id = applicant_id
        applicant.email = "speaker@example.com"
        applicant.first_name = "Alice"
        applicant.message_notifications_enabled = True

        participant = MagicMock(spec=MessageParticipant)
        participant.participant_type = "applicant"
        participant.participant_id = applicant_id

        call_count = [0]

        async def fake_execute(stmt):
            result = MagicMock()
            n = call_count[0]
            call_count[0] += 1
            if n == 0:
                # MessageParticipant query — iterated with for p in result.scalars()
                result.scalars.return_value = iter([participant])
            else:
                # CFPApplicant lookup — scalar_one_or_none
                result.scalar_one_or_none.return_value = applicant
            return result

        db = MagicMock()
        db.execute = fake_execute

        captured_links = []

        def fake_send_bg(fn, db, **kwargs):
            captured_links.append(kwargs.get("messages_link", ""))

        # Both send_email_background and get_settings are imported inside the
        # function; patch at the canonical module paths.
        with (
            patch("app.core.email.send_email_background", side_effect=fake_send_bg),
            patch("app.core.email.send_new_message_notification"),
            patch(
                "app.api.v1.cfp_portal.messaging._helpers.get_settings",
                return_value=_make_settings(),
            ),
        ):
            await _notify_other_participants(
                db,
                thread,
                sender_type="user",
                sender_id=uuid.uuid4(),
                context_name="Conf",
                tenant_slug=TENANT_SLUG,
                domain="conference",
                domain_anchor_id=uuid.uuid4(),
                tenant_id=uuid.uuid4(),
            )

        assert len(captured_links) == 1, f"Expected 1 notification, got {len(captured_links)}"
        link = captured_links[0]
        expected = f"{PORTAL_BASE}/{TENANT_SLUG}/portal/messages?thread={thread_id}"
        assert link == expected, f"Expected query-param link, got: {link!r}"


# ── training_messaging/_core.py: _dispatch_broadcast_emails ───────────────────


class TestDispatchBroadcastEmailsQueryLink:
    """_dispatch_broadcast_emails (in_app mode) builds a query-param portal link."""

    @pytest.mark.asyncio
    async def test_in_app_link_is_query_param(self):
        from app.services.training_messaging._core import (
            _PreparedRecipient,
            _dispatch_broadcast_emails,
        )

        thread_id = uuid.uuid4()
        tenant_id = uuid.uuid4()
        sender_user_id = uuid.uuid4()

        recipient = _PreparedRecipient(
            attendee_id=uuid.uuid4(),
            email="attendee@example.com",
            first_name="Carol",
            last_name="Test",
            subject="Hello",
            body_html="<p>Hello</p>",
            thread_id=thread_id,
            message_id=uuid.uuid4(),
        )

        # DB mock: sender lookup returns None (sender_name becomes "")
        execute_result = MagicMock()
        execute_result.scalar_one_or_none.return_value = None
        db = MagicMock()
        db.execute = AsyncMock(return_value=execute_result)

        captured_links = []

        async def fake_notify(db, **kwargs):
            captured_links.append(kwargs.get("messages_link", ""))

        # send_new_message_notification and get_settings are imported lazily
        # inside the in_app branch; patch at the canonical source module.
        with (
            patch("app.core.email.send_new_message_notification", side_effect=fake_notify),
            patch("app.config.get_settings", return_value=_make_settings()),
        ):
            await _dispatch_broadcast_emails(
                db,
                tenant_id=tenant_id,
                sender_user_id=sender_user_id,
                training_name="My Training",
                prepared=[recipient],
                messaging_mode="in_app",
                tenant_slug=TENANT_SLUG,
            )

        assert len(captured_links) == 1, f"Expected 1 notification, got {len(captured_links)}"
        link = captured_links[0]
        expected = f"{PORTAL_BASE}/{TENANT_SLUG}/portal/messages?thread={thread_id}"
        assert link == expected, f"Expected query-param link, got: {link!r}"
