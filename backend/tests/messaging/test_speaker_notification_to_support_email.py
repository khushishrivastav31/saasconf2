"""Tests that applicant (speaker) message notifications go to conference support_email
instead of each individual admin user.

Covers _notify_other_participants in:
  backend/app/api/v1/cfp_portal/messaging/_helpers.py
"""

import os
import uuid
from unittest.mock import MagicMock, patch

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://saasconf:saasconf_dev_password@localhost:5432/saasconf_test",
)
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-unit-tests-minimum-32-chars")
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "testpassword123")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")

import pytest

PORTAL_BASE = "https://portal.example.com"
FRONTEND_BASE = "https://app.example.com"
TENANT_SLUG = "acme"


def _make_settings():
    s = MagicMock()
    s.PORTAL_BASE_URL = PORTAL_BASE
    s.FRONTEND_BASE_URL = FRONTEND_BASE
    return s


def _make_thread(thread_id=None, conf_id=None):
    thread = MagicMock()
    thread.id = thread_id or uuid.uuid4()
    thread.subject = "Test subject"
    return thread


def _make_user_participant(user_id=None):
    from app.models.messaging import MessageParticipant

    p = MagicMock(spec=MessageParticipant)
    p.participant_type = "user"
    p.participant_id = user_id or uuid.uuid4()
    return p


def _make_applicant_participant(applicant_id=None):
    from app.models.messaging import MessageParticipant

    p = MagicMock(spec=MessageParticipant)
    p.participant_type = "applicant"
    p.participant_id = applicant_id or uuid.uuid4()
    return p


def _make_conference(support_email=None, contact_email=None):
    from app.models.conference import Conference

    c = MagicMock(spec=Conference)
    c.support_email = support_email
    c.contact_email = contact_email
    return c


def _make_applicant(applicant_id=None, email="speaker@example.com"):
    from app.models.cfp import CFPApplicant

    a = MagicMock(spec=CFPApplicant)
    a.id = applicant_id or uuid.uuid4()
    a.email = email
    a.first_name = "Alice"
    a.message_notifications_enabled = True
    return a


class TestSpeakerNotificationToSupportEmail:
    """When an applicant sends a message in a conference thread, only the
    conference support_email receives a notification (not each admin individually)."""

    @pytest.mark.asyncio
    async def test_support_email_used_instead_of_per_admin(self):
        """One email goes to support_email; no email goes to the admin user's address."""
        from app.api.v1.cfp_portal.messaging._helpers import _notify_other_participants

        conf_id = uuid.uuid4()
        thread = _make_thread(conf_id=conf_id)
        admin_id = uuid.uuid4()
        user_participant = _make_user_participant(admin_id)
        conference = _make_conference(support_email="support@conf.com", contact_email="contact@conf.com")

        call_count = [0]

        async def fake_execute(stmt):
            result = MagicMock()
            n = call_count[0]
            call_count[0] += 1
            if n == 0:
                # MessageParticipant query
                result.scalars.return_value = iter([user_participant])
            else:
                # Conference lookup at end
                result.scalar_one_or_none.return_value = conference
            return result

        db = MagicMock()
        db.execute = fake_execute

        sent_emails = []

        def fake_send_bg(fn, db, **kwargs):
            sent_emails.append(kwargs.get("email", ""))

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
                sender_type="applicant",
                sender_id=uuid.uuid4(),
                context_name="Conf",
                tenant_slug=TENANT_SLUG,
                domain="conference",
                domain_anchor_id=conf_id,
                tenant_id=uuid.uuid4(),
            )

        assert len(sent_emails) == 1, f"Expected 1 email, got {sent_emails}"
        assert sent_emails[0] == "support@conf.com"

    @pytest.mark.asyncio
    async def test_fallback_to_contact_email_when_no_support_email(self):
        """Falls back to contact_email when support_email is blank."""
        from app.api.v1.cfp_portal.messaging._helpers import _notify_other_participants

        conf_id = uuid.uuid4()
        thread = _make_thread()
        user_participant = _make_user_participant()
        conference = _make_conference(support_email=None, contact_email="contact@conf.com")

        call_count = [0]

        async def fake_execute(stmt):
            result = MagicMock()
            n = call_count[0]
            call_count[0] += 1
            if n == 0:
                result.scalars.return_value = iter([user_participant])
            else:
                result.scalar_one_or_none.return_value = conference
            return result

        db = MagicMock()
        db.execute = fake_execute

        sent_emails = []

        def fake_send_bg(fn, db, **kwargs):
            sent_emails.append(kwargs.get("email", ""))

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
                sender_type="applicant",
                sender_id=uuid.uuid4(),
                context_name="Conf",
                tenant_slug=TENANT_SLUG,
                domain="conference",
                domain_anchor_id=conf_id,
                tenant_id=uuid.uuid4(),
            )

        assert len(sent_emails) == 1
        assert sent_emails[0] == "contact@conf.com"

    @pytest.mark.asyncio
    async def test_no_notification_when_both_emails_blank(self):
        """No notification sent when support_email and contact_email are both absent."""
        from app.api.v1.cfp_portal.messaging._helpers import _notify_other_participants

        conf_id = uuid.uuid4()
        thread = _make_thread()
        user_participant = _make_user_participant()
        conference = _make_conference(support_email=None, contact_email=None)

        call_count = [0]

        async def fake_execute(stmt):
            result = MagicMock()
            n = call_count[0]
            call_count[0] += 1
            if n == 0:
                result.scalars.return_value = iter([user_participant])
            else:
                result.scalar_one_or_none.return_value = conference
            return result

        db = MagicMock()
        db.execute = fake_execute

        sent_emails = []

        def fake_send_bg(fn, db, **kwargs):
            sent_emails.append(kwargs.get("email", ""))

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
                sender_type="applicant",
                sender_id=uuid.uuid4(),
                context_name="Conf",
                tenant_slug=TENANT_SLUG,
                domain="conference",
                domain_anchor_id=conf_id,
                tenant_id=uuid.uuid4(),
            )

        assert sent_emails == [], f"Expected no emails, got {sent_emails}"

    @pytest.mark.asyncio
    async def test_applicant_participant_still_gets_individual_email(self):
        """Applicant participants still receive their own individual notification."""
        from app.api.v1.cfp_portal.messaging._helpers import _notify_other_participants

        conf_id = uuid.uuid4()
        thread = _make_thread()
        applicant_id = uuid.uuid4()
        applicant_participant = _make_applicant_participant(applicant_id)
        applicant = _make_applicant(applicant_id, email="speaker@example.com")

        call_count = [0]

        async def fake_execute(stmt):
            result = MagicMock()
            n = call_count[0]
            call_count[0] += 1
            if n == 0:
                # MessageParticipant query
                result.scalars.return_value = iter([applicant_participant])
            else:
                # CFPApplicant lookup
                result.scalar_one_or_none.return_value = applicant
            return result

        db = MagicMock()
        db.execute = fake_execute

        sent_emails = []

        def fake_send_bg(fn, db, **kwargs):
            sent_emails.append(kwargs.get("email", ""))

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
                domain_anchor_id=conf_id,
                tenant_id=uuid.uuid4(),
            )

        assert len(sent_emails) == 1
        assert sent_emails[0] == "speaker@example.com"

    @pytest.mark.asyncio
    async def test_training_domain_user_still_gets_individual_email(self):
        """Training domain: user participants still receive individual emails (out of scope)."""
        from app.api.v1.cfp_portal.messaging._helpers import _notify_other_participants
        from app.models.user import User

        training_id = uuid.uuid4()
        thread = _make_thread()
        admin_id = uuid.uuid4()
        user_participant = _make_user_participant(admin_id)

        user = MagicMock(spec=User)
        user.id = admin_id
        user.first_name = "Admin"
        user.message_notifications_enabled = True

        call_count = [0]

        async def fake_execute(stmt):
            result = MagicMock()
            n = call_count[0]
            call_count[0] += 1
            if n == 0:
                # MessageParticipant query
                result.scalars.return_value = iter([user_participant])
            else:
                # User lookup for training domain
                result.scalar_one_or_none.return_value = user
            return result

        db = MagicMock()
        db.execute = fake_execute

        sent_emails = []

        def fake_send_bg(fn, db, **kwargs):
            sent_emails.append(kwargs.get("email", ""))

        with (
            patch("app.core.email.send_email_background", side_effect=fake_send_bg),
            patch("app.core.email.send_new_message_notification"),
            patch("app.api.v1.cfp_portal.messaging._helpers.read_pii", return_value="admin@example.com"),
            patch(
                "app.api.v1.cfp_portal.messaging._helpers.get_settings",
                return_value=_make_settings(),
            ),
        ):
            await _notify_other_participants(
                db,
                thread,
                sender_type="applicant",
                sender_id=uuid.uuid4(),
                context_name="Training",
                tenant_slug=TENANT_SLUG,
                domain="training",
                domain_anchor_id=training_id,
                tenant_id=uuid.uuid4(),
            )

        assert len(sent_emails) == 1, f"Training user should still get individual email, got {sent_emails}"


class TestAdminReplyNotifications:
    """When an admin sends a reply via the admin messaging path, only applicant
    participants receive an individual email. Other admins (user participants)
    get no email — they monitor the thread via the admin dashboard."""

    @pytest.mark.asyncio
    async def test_admin_reply_user_participants_get_no_email(self):
        """No email is sent to user (admin) participants or support_email when admin replies."""
        from app.api.v1.messaging._shared import _notify_participants
        from app.models.messaging import MessageParticipant

        thread_id = uuid.uuid4()
        conf_id = uuid.uuid4()

        thread = MagicMock()
        thread.id = thread_id
        thread.subject = "Re: Test"

        admin_participant = MagicMock(spec=MessageParticipant)
        admin_participant.participant_type = "user"
        admin_participant.participant_id = uuid.uuid4()

        async def fake_execute(stmt):
            result = MagicMock()
            result.scalars.return_value.all.return_value = [admin_participant]
            return result

        db = MagicMock()
        db.execute = fake_execute

        sent_emails = []

        def fake_send_bg(fn, db, **kwargs):
            sent_emails.append(kwargs.get("email", ""))

        with (
            patch("app.core.email.send_email_background", side_effect=fake_send_bg),
            patch("app.core.email.send_new_message_notification"),
            patch("app.config.get_settings", return_value=_make_settings()),
        ):
            await _notify_participants(
                db,
                thread,
                sender_type="user",
                sender_id=uuid.uuid4(),
                conference_name="Conf",
                tenant_slug=TENANT_SLUG,
                conference_id=conf_id,
                base_url=PORTAL_BASE,
            )

        assert sent_emails == [], f"Expected no emails for admin participants, got {sent_emails}"

    @pytest.mark.asyncio
    async def test_admin_reply_applicant_still_gets_individual_email(self):
        from app.api.v1.messaging._shared import _notify_participants
        from app.models.messaging import MessageParticipant

        thread_id = uuid.uuid4()
        conf_id = uuid.uuid4()
        applicant_id = uuid.uuid4()

        thread = MagicMock()
        thread.id = thread_id
        thread.subject = "Re: Test"

        applicant_participant = MagicMock(spec=MessageParticipant)
        applicant_participant.participant_type = "applicant"
        applicant_participant.participant_id = applicant_id

        applicant = _make_applicant(applicant_id, email="speaker@example.com")

        call_count = [0]

        async def fake_execute(stmt):
            result = MagicMock()
            n = call_count[0]
            call_count[0] += 1
            if n == 0:
                # MessageParticipant query
                result.scalars.return_value.all.return_value = [applicant_participant]
            else:
                # CFPApplicant batch — .scalars() iterable
                result.scalars.return_value = iter([applicant])
            return result

        db = MagicMock()
        db.execute = fake_execute

        sent_emails = []

        def fake_send_bg(fn, db, **kwargs):
            sent_emails.append(kwargs.get("email", ""))

        with (
            patch("app.core.email.send_email_background", side_effect=fake_send_bg),
            patch("app.core.email.send_new_message_notification"),
            patch("app.config.get_settings", return_value=_make_settings()),
        ):
            await _notify_participants(
                db,
                thread,
                sender_type="user",
                sender_id=uuid.uuid4(),
                conference_name="Conf",
                tenant_slug=TENANT_SLUG,
                conference_id=conf_id,
                base_url=PORTAL_BASE,
            )

        assert len(sent_emails) == 1
        assert sent_emails[0] == "speaker@example.com"
