"""Deep coverage tests for admin messaging threads.py and portal messaging.py.

Targets specific uncovered code paths:
- Admin: search filters (subject, body, flagged, has_attachments, unread_only, participant_name)
- Admin: thread export (html, text)
- Admin: bulk thread creation (multiple recipients) + template variable substitution
- Admin: mark_thread_read edge cases
- Admin: unarchive thread not found
- Portal: attachment upload, download, access checks
- Portal: create thread with attachments
- Portal: reply with attachments
- Portal: unarchive not participant
- Portal: unread count with/without read threads
- Portal: list threads message count excludes internal notes
"""

import os
import uuid
from datetime import datetime, timezone

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
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.applicant_security import create_applicant_access_token
from app.core.security import hash_password
from app.models.associations import ConferenceCFP
from app.models.attachment import Attachment
from app.models.cfp import CFPApplicant, CallForPapers
from app.models.cfp_papers import CFPPaper, PaperStatus
from app.models.conference import Conference
from app.models.messaging import Message, MessageParticipant, MessageThread
from app.models.module import Module, TenantModule
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from tests.conftest import _make_token, auth_headers


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture()
async def cfp_module(db_session: AsyncSession) -> Module:
    m = Module(id=uuid.uuid4(), name="Call for Papers", code="cfp", description="CFP", is_active=True)
    db_session.add(m)
    await db_session.commit()
    return m


@pytest_asyncio.fixture()
async def messaging_module(db_session: AsyncSession) -> Module:
    m = Module(id=uuid.uuid4(), name="Messaging", code="messaging", description="Messaging", is_active=True)
    db_session.add(m)
    await db_session.commit()
    return m


@pytest_asyncio.fixture()
async def tenant_with_modules_all(
    db_session: AsyncSession,
    tenant: Tenant,
    conferences_module: Module,
    cfp_module: Module,
    messaging_module: Module,
) -> Tenant:
    for mod in (conferences_module, cfp_module, messaging_module):
        db_session.add(TenantModule(id=uuid.uuid4(), tenant_id=tenant.id, module_id=mod.id, is_enabled=True))
    await db_session.commit()
    return tenant


@pytest_asyncio.fixture()
async def applicant_a(db_session: AsyncSession, tenant: Tenant) -> CFPApplicant:
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Alice",
        last_name="Wonderland",
        email=f"alice-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Password123!"),
        email_verified_at=datetime.now(timezone.utc),
    )
    db_session.add(a)
    await db_session.commit()
    return a


@pytest_asyncio.fixture()
async def applicant_b(db_session: AsyncSession, tenant: Tenant) -> CFPApplicant:
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Bob",
        last_name="Builder",
        email=f"bob-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Password123!"),
        email_verified_at=datetime.now(timezone.utc),
    )
    db_session.add(a)
    await db_session.commit()
    return a


@pytest.fixture()
def applicant_a_token(applicant_a: CFPApplicant, tenant: Tenant) -> str:
    return create_applicant_access_token(applicant_a.id, tenant.id)


@pytest.fixture()
def applicant_b_token(applicant_b: CFPApplicant, tenant: Tenant) -> str:
    return create_applicant_access_token(applicant_b.id, tenant.id)


def _admin_token(user: User) -> str:
    return _make_token(user, modules=["cfp", "messaging", "conferences"])


def _admin_headers(user: User) -> dict[str, str]:
    return auth_headers(_admin_token(user))


def _msg_url(conference_id: uuid.UUID, path: str = "") -> str:
    return f"/api/v1/conferences/{conference_id}/messaging{path}"


@pytest_asyncio.fixture()
async def thread_with_messages(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    tenant_admin_user: User,
    applicant_a: CFPApplicant,
) -> MessageThread:
    """Create a thread with multiple messages for testing list/filter scenarios."""
    thread = MessageThread(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        subject="Deep Test Thread",
    )
    db_session.add(thread)
    await db_session.flush()

    # Admin participant (unread - no last_read_at)
    db_session.add(
        MessageParticipant(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            thread_id=thread.id,
            participant_type="user",
            participant_id=tenant_admin_user.id,
        )
    )
    # Applicant participant
    db_session.add(
        MessageParticipant(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            thread_id=thread.id,
            participant_type="applicant",
            participant_id=applicant_a.id,
        )
    )
    # Admin message
    db_session.add(
        Message(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            thread_id=thread.id,
            sender_type="user",
            sender_id=tenant_admin_user.id,
            body_html="<p>Hello Alice, welcome to the conference!</p>",
        )
    )
    # Internal note (hidden from portal)
    db_session.add(
        Message(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            thread_id=thread.id,
            sender_type="user",
            sender_id=tenant_admin_user.id,
            body_html="<p>Internal: check applicant background</p>",
            is_internal_note=True,
        )
    )
    await db_session.commit()
    return thread


# ============================================================================
# ADMIN THREAD FILTER TESTS (threads.py uncovered lines)
# ============================================================================


class TestAdminThreadSearchFilters:
    """Tests for the various search/filter parameters in list_threads."""

    @pytest.mark.asyncio
    async def test_search_by_subject(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_modules_all: Tenant,
        conference: Conference,
        thread_with_messages: MessageThread,
    ) -> None:
        """Search threads by subject match."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.get(
            _msg_url(conference.id, "/threads"),
            params={"search": "Deep Test"},
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        assert any("Deep Test" in item["subject"] for item in data["items"])

    @pytest.mark.asyncio
    async def test_search_by_body_text(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_modules_all: Tenant,
        conference: Conference,
        thread_with_messages: MessageThread,
    ) -> None:
        """Search threads by message body text (search_body=true)."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.get(
            _msg_url(conference.id, "/threads"),
            params={"search": "welcome to the conference", "search_body": "true"},
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1

    @pytest.mark.asyncio
    async def test_search_no_results(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_modules_all: Tenant,
        conference: Conference,
        thread_with_messages: MessageThread,
    ) -> None:
        """Search threads returns empty when no match."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.get(
            _msg_url(conference.id, "/threads"),
            params={"search": "zzz_nonexistent_zzz"},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["total"] == 0

    @pytest.mark.asyncio
    async def test_filter_flagged_threads(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_modules_all: Tenant,
        conference: Conference,
        thread_with_messages: MessageThread,
    ) -> None:
        """Filter threads by flagged=true after flagging a thread."""
        headers = _admin_headers(tenant_admin_user)
        # Flag the thread first
        flag_resp = await client.post(
            _msg_url(conference.id, f"/threads/{thread_with_messages.id}/flag"),
            headers=headers,
        )
        assert flag_resp.status_code == 200
        assert flag_resp.json()["flagged"] is True

        # Now filter flagged
        resp = await client.get(
            _msg_url(conference.id, "/threads"),
            params={"flagged": "true"},
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        assert all(item["is_flagged"] for item in data["items"])

    @pytest.mark.asyncio
    async def test_filter_has_attachments(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_modules_all: Tenant,
        conference: Conference,
        thread_with_messages: MessageThread,
        db_session: AsyncSession,
    ) -> None:
        """Filter threads by has_attachments=true."""
        # Mark thread as having attachments
        thread_with_messages.has_attachments = True
        await db_session.commit()

        headers = _admin_headers(tenant_admin_user)
        resp = await client.get(
            _msg_url(conference.id, "/threads"),
            params={"has_attachments": "true"},
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        assert all(item["has_attachments"] for item in data["items"])

    @pytest.mark.asyncio
    async def test_filter_unread_only(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_modules_all: Tenant,
        conference: Conference,
        thread_with_messages: MessageThread,
    ) -> None:
        """Filter threads by unread_only=true (admin has no last_read_at)."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.get(
            _msg_url(conference.id, "/threads"),
            params={"unread_only": "true"},
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        # Thread has no last_read_at for admin so it should be unread
        assert data["total"] >= 1
        assert all(item["unread"] for item in data["items"])

    @pytest.mark.asyncio
    async def test_filter_participant_name(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_modules_all: Tenant,
        conference: Conference,
        thread_with_messages: MessageThread,
        applicant_a: CFPApplicant,
    ) -> None:
        """Filter threads by participant_name matching applicant first name."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.get(
            _msg_url(conference.id, "/threads"),
            params={"participant_name": "Alice"},
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        ids = [item["id"] for item in data["items"]]
        assert str(thread_with_messages.id) in ids

    @pytest.mark.asyncio
    async def test_filter_participant_name_no_match(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_modules_all: Tenant,
        conference: Conference,
        thread_with_messages: MessageThread,
    ) -> None:
        """Filter by participant_name with no matching applicant returns empty."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.get(
            _msg_url(conference.id, "/threads"),
            params={"participant_name": "Zzzznoone"},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["total"] == 0


# ============================================================================
# ADMIN THREAD EXPORT TESTS
# ============================================================================


class TestAdminThreadExport:
    """Tests for thread export in HTML and text format."""

    @pytest.mark.asyncio
    async def test_export_thread_as_text(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_modules_all: Tenant,
        conference: Conference,
        thread_with_messages: MessageThread,
    ) -> None:
        """Export a thread as plain text."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.get(
            _msg_url(conference.id, f"/threads/{thread_with_messages.id}/export"),
            params={"format": "text"},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "text/plain; charset=utf-8"
        assert "Content-Disposition" in resp.headers
        body = resp.text
        assert "Subject: Deep Test Thread" in body
        assert "Hello Alice" in body
        # Internal note should also appear in admin export
        assert "[INTERNAL NOTE]" in body

    @pytest.mark.asyncio
    async def test_export_thread_as_html(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_modules_all: Tenant,
        conference: Conference,
        thread_with_messages: MessageThread,
    ) -> None:
        """Export a thread as HTML."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.get(
            _msg_url(conference.id, f"/threads/{thread_with_messages.id}/export"),
            params={"format": "html"},
            headers=headers,
        )
        assert resp.status_code == 200
        assert "text/html" in resp.headers["content-type"]
        body = resp.text
        assert "<html>" in body
        assert "Deep Test Thread" in body
        assert "[INTERNAL NOTE]" in body

    @pytest.mark.asyncio
    async def test_export_thread_not_found(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_modules_all: Tenant,
        conference: Conference,
    ) -> None:
        """Export non-existent thread returns 404."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.get(
            _msg_url(conference.id, f"/threads/{uuid.uuid4()}/export"),
            params={"format": "text"},
            headers=headers,
        )
        assert resp.status_code == 404


# ============================================================================
# ADMIN BULK / MULTIPLE RECIPIENTS
# ============================================================================


class TestAdminBulkThreadCreation:
    """Tests for creating threads with multiple recipients."""

    @pytest.mark.asyncio
    async def test_create_thread_multiple_recipients(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_modules_all: Tenant,
        conference: Conference,
        applicant_a: CFPApplicant,
        applicant_b: CFPApplicant,
    ) -> None:
        """Create threads for multiple applicants at once."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.post(
            _msg_url(conference.id, "/threads"),
            json={
                "recipient_applicant_ids": [str(applicant_a.id), str(applicant_b.id)],
                "subject": "Bulk announcement",
                "body_html": "<p>Hello everyone!</p>",
            },
            headers=headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["threads_created"] == 2
        assert data["first_thread"]["subject"] == "Bulk announcement"

    @pytest.mark.asyncio
    async def test_create_thread_with_template_variables(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_modules_all: Tenant,
        conference: Conference,
        applicant_a: CFPApplicant,
    ) -> None:
        """Create thread with [First Name] template variable substitution."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.post(
            _msg_url(conference.id, "/threads"),
            json={
                "recipient_applicant_ids": [str(applicant_a.id)],
                "subject": "Hello [First Name]",
                "body_html": "<p>Dear [First Name] [Last Name], welcome to [Conference Name]!</p>",
            },
            headers=headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        thread = data["first_thread"]
        assert "Alice" in thread["subject"]
        # Check body has substituted values
        msg_body = thread["messages"][0]["body_html"]
        assert "Alice" in msg_body
        assert "Wonderland" in msg_body

    @pytest.mark.asyncio
    async def test_create_thread_with_paper_title_variable(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_modules_all: Tenant,
        conference: Conference,
        applicant_a: CFPApplicant,
        db_session: AsyncSession,
        tenant: Tenant,
    ) -> None:
        """Template variable [Paper Title] is substituted with the applicant's paper title."""
        # Create a CFP and paper for the applicant
        cfp = CallForPapers(
            id=uuid.uuid4(), tenant_id=tenant.id, title="TestCFP", status="open"
        )
        db_session.add(cfp)
        await db_session.flush()
        db_session.add(ConferenceCFP(id=uuid.uuid4(), conference_id=conference.id, cfp_id=cfp.id))
        db_session.add(
            CFPPaper(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                cfp_id=cfp.id,
                main_speaker_id=applicant_a.id,
                title="My Amazing Paper",
                abstract_short="Abstract",
                status=PaperStatus.SUBMITTED.value,
            )
        )
        await db_session.commit()

        headers = _admin_headers(tenant_admin_user)
        resp = await client.post(
            _msg_url(conference.id, "/threads"),
            json={
                "recipient_applicant_ids": [str(applicant_a.id)],
                "subject": "About [Paper Title]",
                "body_html": "<p>Your paper [Paper Title] has been reviewed.</p>",
            },
            headers=headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert "My Amazing Paper" in data["first_thread"]["subject"]


# ============================================================================
# ADMIN EDGE CASES
# ============================================================================


class TestAdminEdgeCases:
    """Edge cases for admin messaging endpoints."""

    @pytest.mark.asyncio
    async def test_unarchive_thread_not_found(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_modules_all: Tenant,
        conference: Conference,
    ) -> None:
        """Unarchive non-existent thread returns 404."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.post(
            _msg_url(conference.id, f"/threads/{uuid.uuid4()}/unarchive"),
            headers=headers,
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_mark_read_no_participant(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_modules_all: Tenant,
        conference: Conference,
        db_session: AsyncSession,
        tenant: Tenant,
        applicant_a: CFPApplicant,
    ) -> None:
        """Mark read on a thread where user is not a participant still returns ok."""
        # Create a thread without admin as participant
        thread = MessageThread(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            subject="No Participant Thread",
        )
        db_session.add(thread)
        await db_session.flush()
        # Only applicant is participant
        db_session.add(
            MessageParticipant(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                thread_id=thread.id,
                participant_type="applicant",
                participant_id=applicant_a.id,
            )
        )
        await db_session.commit()

        headers = _admin_headers(tenant_admin_user)
        resp = await client.post(
            _msg_url(conference.id, f"/threads/{thread.id}/read"),
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    @pytest.mark.asyncio
    async def test_internal_note_not_visible_in_portal(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_modules_all: Tenant,
        conference: Conference,
        thread_with_messages: MessageThread,
        applicant_a: CFPApplicant,
        applicant_a_token: str,
    ) -> None:
        """Internal notes created by admin are hidden in portal thread detail."""
        # The thread_with_messages already has an internal note
        resp = await client.get(
            f"/api/v1/portal/messages/{thread_with_messages.id}",
            headers=auth_headers(applicant_a_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        # Should only see 1 message (the non-internal one)
        assert len(data["messages"]) == 1
        for msg in data["messages"]:
            assert "Internal" not in msg.get("body_html", "")

    @pytest.mark.asyncio
    async def test_reply_adds_non_participant_admin(
        self,
        client: AsyncClient,
        tenant_with_modules_all: Tenant,
        conference: Conference,
        thread_with_messages: MessageThread,
        db_session: AsyncSession,
        tenant: Tenant,
    ) -> None:
        """When a different admin replies, they are auto-added as participant."""
        # Create a second admin user
        admin2 = User(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            email=f"admin2-{uuid.uuid4().hex[:8]}@test.com",
            password_hash=hash_password("Password123!"),
            first_name="Admin",
            last_name="Two",
            role=UserRole.TENANT_ADMIN.value,
            is_active=True,
        )
        db_session.add(admin2)
        await db_session.commit()

        headers = _admin_headers(admin2)
        resp = await client.post(
            _msg_url(conference.id, f"/threads/{thread_with_messages.id}/reply"),
            json={"body_html": "<p>Reply from second admin</p>"},
            headers=headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["sender"]["first_name"] == "Admin"
        assert data["sender"]["last_name"] == "Two"


# ============================================================================
# PORTAL MESSAGING DEEP TESTS
# ============================================================================


class TestPortalThreadListCoverage:
    """Tests for portal list_my_threads uncovered paths."""

    @pytest.mark.asyncio
    async def test_portal_list_excludes_internal_note_from_count(
        self,
        client: AsyncClient,
        applicant_a: CFPApplicant,
        applicant_a_token: str,
        thread_with_messages: MessageThread,
    ) -> None:
        """Portal message_count excludes internal notes."""
        resp = await client.get(
            "/api/v1/portal/messages",
            headers=auth_headers(applicant_a_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        for item in data["items"]:
            if item["id"] == str(thread_with_messages.id):
                # Only 1 visible message (the non-internal one)
                assert item["message_count"] == 1
                break
        else:
            pytest.fail("Thread not found in portal list")

    @pytest.mark.asyncio
    async def test_portal_list_shows_unread_status(
        self,
        client: AsyncClient,
        applicant_a: CFPApplicant,
        applicant_a_token: str,
        thread_with_messages: MessageThread,
    ) -> None:
        """Portal list thread has unread=true when applicant has not read."""
        resp = await client.get(
            "/api/v1/portal/messages",
            headers=auth_headers(applicant_a_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        for item in data["items"]:
            if item["id"] == str(thread_with_messages.id):
                assert item["unread"] is True
                break

    @pytest.mark.asyncio
    async def test_portal_list_shows_other_participants_as_users(
        self,
        client: AsyncClient,
        applicant_a: CFPApplicant,
        applicant_a_token: str,
        thread_with_messages: MessageThread,
    ) -> None:
        """Portal list shows admin users as other_participants."""
        resp = await client.get(
            "/api/v1/portal/messages",
            headers=auth_headers(applicant_a_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        for item in data["items"]:
            if item["id"] == str(thread_with_messages.id):
                # The admin should appear as other_participant
                assert len(item["other_participants"]) >= 1
                assert item["other_participants"][0]["type"] == "user"
                break


class TestPortalUnreadCount:
    """Tests for portal unread count edge cases."""

    @pytest.mark.asyncio
    async def test_unread_count_zero_when_no_threads(
        self,
        client: AsyncClient,
        applicant_b: CFPApplicant,
        applicant_b_token: str,
    ) -> None:
        """Unread count is 0 when applicant has no threads."""
        resp = await client.get(
            "/api/v1/portal/messages/unread-count",
            headers=auth_headers(applicant_b_token),
        )
        assert resp.status_code == 200
        assert resp.json()["unread_count"] == 0

    @pytest.mark.asyncio
    async def test_unread_count_after_reading_all(
        self,
        client: AsyncClient,
        applicant_a: CFPApplicant,
        applicant_a_token: str,
        thread_with_messages: MessageThread,
    ) -> None:
        """Unread count drops to 0 after marking threads as read."""
        headers = auth_headers(applicant_a_token)

        # Mark read
        await client.post(
            f"/api/v1/portal/messages/{thread_with_messages.id}/read",
            headers=headers,
        )

        resp = await client.get("/api/v1/portal/messages/unread-count", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["unread_count"] == 0


class TestPortalArchiveUnarchiveDeep:
    """Deep archive/unarchive tests for portal."""

    @pytest.mark.asyncio
    async def test_portal_unarchive_not_participant(
        self,
        client: AsyncClient,
        applicant_b: CFPApplicant,
        applicant_b_token: str,
        thread_with_messages: MessageThread,
    ) -> None:
        """Unarchiving a thread where applicant is not a participant returns 404."""
        resp = await client.post(
            f"/api/v1/portal/messages/{thread_with_messages.id}/unarchive",
            headers=auth_headers(applicant_b_token),
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_portal_archive_not_participant(
        self,
        client: AsyncClient,
        applicant_b: CFPApplicant,
        applicant_b_token: str,
        thread_with_messages: MessageThread,
    ) -> None:
        """Archiving a thread where applicant is not a participant returns 404."""
        resp = await client.post(
            f"/api/v1/portal/messages/{thread_with_messages.id}/archive",
            headers=auth_headers(applicant_b_token),
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_portal_unarchive_nonexistent_thread(
        self,
        client: AsyncClient,
        applicant_a: CFPApplicant,
        applicant_a_token: str,
    ) -> None:
        """Unarchiving a non-existent thread returns 404."""
        resp = await client.post(
            f"/api/v1/portal/messages/{uuid.uuid4()}/unarchive",
            headers=auth_headers(applicant_a_token),
        )
        assert resp.status_code == 404


class TestPortalAttachments:
    """Tests for portal attachment upload and download."""

    @pytest.mark.asyncio
    async def test_upload_portal_attachment(
        self,
        client: AsyncClient,
        applicant_a: CFPApplicant,
        applicant_a_token: str,
    ) -> None:
        """Upload a file attachment via portal."""
        headers = auth_headers(applicant_a_token)
        file_content = b"Hello, this is a test file content."
        resp = await client.post(
            "/api/v1/portal/messages/upload",
            headers=headers,
            files={"file": ("test.txt", file_content, "text/plain")},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["filename"] == "test.txt"
        assert data["content_type"] == "text/plain"
        assert data["file_size"] == len(file_content)
        assert data["entity_type"] == "message"

    @pytest.mark.asyncio
    async def test_download_portal_attachment(
        self,
        client: AsyncClient,
        applicant_a: CFPApplicant,
        applicant_a_token: str,
        thread_with_messages: MessageThread,
        db_session: AsyncSession,
        tenant: Tenant,
        tenant_admin_user: User,
    ) -> None:
        """Download an attachment that belongs to a message the applicant can access."""
        # Get message ID from the thread
        from sqlalchemy import select

        msg_result = await db_session.execute(
            select(Message).where(
                Message.thread_id == thread_with_messages.id,
                Message.is_internal_note.is_(False),
            )
        )
        message = msg_result.scalar_one()

        # Create an attachment linked to that message
        attachment = Attachment(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            entity_type="message",
            entity_id=message.id,
            filename="download_test.txt",
            content_type="text/plain",
            file_size=12,
            file_data=b"test content",
        )
        db_session.add(attachment)
        await db_session.commit()

        headers = auth_headers(applicant_a_token)
        resp = await client.get(
            f"/api/v1/portal/messages/attachments/{attachment.id}/download",
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.content == b"test content"

    @pytest.mark.asyncio
    async def test_download_portal_attachment_not_found(
        self,
        client: AsyncClient,
        applicant_a: CFPApplicant,
        applicant_a_token: str,
    ) -> None:
        """Download a non-existent attachment returns 404."""
        headers = auth_headers(applicant_a_token)
        resp = await client.get(
            f"/api/v1/portal/messages/attachments/{uuid.uuid4()}/download",
            headers=headers,
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_download_portal_attachment_not_participant(
        self,
        client: AsyncClient,
        applicant_b: CFPApplicant,
        applicant_b_token: str,
        thread_with_messages: MessageThread,
        db_session: AsyncSession,
        tenant: Tenant,
    ) -> None:
        """Download an attachment from a thread where applicant is not participant returns 404."""
        from sqlalchemy import select

        msg_result = await db_session.execute(
            select(Message).where(
                Message.thread_id == thread_with_messages.id,
                Message.is_internal_note.is_(False),
            )
        )
        message = msg_result.scalar_one()

        attachment = Attachment(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            entity_type="message",
            entity_id=message.id,
            filename="secret.txt",
            content_type="text/plain",
            file_size=6,
            file_data=b"secret",
        )
        db_session.add(attachment)
        await db_session.commit()

        headers = auth_headers(applicant_b_token)
        resp = await client.get(
            f"/api/v1/portal/messages/attachments/{attachment.id}/download",
            headers=headers,
        )
        assert resp.status_code == 404


class TestPortalCreateThreadDeep:
    """Tests for portal thread creation edge cases."""

    @pytest.mark.asyncio
    async def test_portal_create_thread_with_attachments(
        self,
        client: AsyncClient,
        applicant_a: CFPApplicant,
        applicant_a_token: str,
        conference: Conference,
        tenant: Tenant,
        tenant_admin_user: User,
        tenant_with_modules_all: Tenant,
        db_session: AsyncSession,
    ) -> None:
        """Create a portal thread with pre-uploaded attachment IDs."""
        headers = auth_headers(applicant_a_token)

        # Pre-upload an attachment
        file_content = b"Attachment content for new thread"
        upload_resp = await client.post(
            "/api/v1/portal/messages/upload",
            headers=headers,
            files={"file": ("attach.txt", file_content, "text/plain")},
        )
        assert upload_resp.status_code == 201
        attachment_id = upload_resp.json()["id"]

        # Create thread with attachment
        resp = await client.post(
            "/api/v1/portal/messages",
            json={
                "conference_id": str(conference.id),
                "subject": "Thread with attachment",
                "body_html": "<p>See attached file</p>",
                "attachment_ids": [attachment_id],
            },
            headers=headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["subject"] == "Thread with attachment"


class TestPortalReplyDeep:
    """Deep coverage for portal reply."""

    @pytest.mark.asyncio
    async def test_portal_reply_not_participant(
        self,
        client: AsyncClient,
        applicant_b: CFPApplicant,
        applicant_b_token: str,
        thread_with_messages: MessageThread,
    ) -> None:
        """Replying to a thread where applicant is not participant returns 404."""
        resp = await client.post(
            f"/api/v1/portal/messages/{thread_with_messages.id}/reply",
            json={"body_html": "<p>I should not be able to reply</p>"},
            headers=auth_headers(applicant_b_token),
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_portal_reply_with_attachment(
        self,
        client: AsyncClient,
        applicant_a: CFPApplicant,
        applicant_a_token: str,
        thread_with_messages: MessageThread,
    ) -> None:
        """Reply to a portal thread with a pre-uploaded attachment."""
        headers = auth_headers(applicant_a_token)

        # Pre-upload attachment
        upload_resp = await client.post(
            "/api/v1/portal/messages/upload",
            headers=headers,
            files={"file": ("reply_file.txt", b"reply file data", "text/plain")},
        )
        assert upload_resp.status_code == 201
        attachment_id = upload_resp.json()["id"]

        # Reply with attachment
        resp = await client.post(
            f"/api/v1/portal/messages/{thread_with_messages.id}/reply",
            json={
                "body_html": "<p>Here is my reply with attachment</p>",
                "attachment_ids": [attachment_id],
            },
            headers=headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert "reply with attachment" in data["body_html"]
        assert data["sender"]["type"] == "applicant"


class TestPortalMarkReadDeep:
    """Deep coverage for portal mark-read endpoint."""

    @pytest.mark.asyncio
    async def test_portal_mark_read_no_participant_record(
        self,
        client: AsyncClient,
        applicant_b: CFPApplicant,
        applicant_b_token: str,
    ) -> None:
        """Mark read on non-existent thread still returns ok (graceful)."""
        resp = await client.post(
            f"/api/v1/portal/messages/{uuid.uuid4()}/read",
            headers=auth_headers(applicant_b_token),
        )
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    @pytest.mark.asyncio
    async def test_portal_mark_read_then_list_shows_not_unread(
        self,
        client: AsyncClient,
        applicant_a: CFPApplicant,
        applicant_a_token: str,
        thread_with_messages: MessageThread,
    ) -> None:
        """After marking a thread read, it shows unread=false in list."""
        headers = auth_headers(applicant_a_token)

        # Mark as read
        await client.post(
            f"/api/v1/portal/messages/{thread_with_messages.id}/read",
            headers=headers,
        )

        # List should show unread=false
        resp = await client.get("/api/v1/portal/messages", headers=headers)
        assert resp.status_code == 200
        for item in resp.json()["items"]:
            if item["id"] == str(thread_with_messages.id):
                assert item["unread"] is False
                break
