"""Comprehensive tests for the messaging module.

Covers models, schemas, and all admin messaging API endpoints:
- Thread CRUD (list, create, get detail)
- Reply to thread
- Mark as read
- Unread count
- Bulk send
"""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient
from pydantic import ValidationError as PydanticValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.cfp import CFPApplicant
from app.models.conference import Conference
from app.models.messaging import Message, MessageParticipant, MessageThread
from app.models.module import Module, TenantModule
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from app.schemas.messaging import (
    AdminBulkSend,
    AdminCreateThread,
    BulkRecipientFilter,
    BulkSendResponse,
    CreateThreadResponse,
    MessageAttachmentInfo,
    MessageResponse,
    ParticipantInfo,
    ReplyCreate,
    SenderInfo,
    ThreadDetailResponse,
    ThreadListItem,
    ThreadListResponse,
    UnreadCountResponse,
)
from tests.conftest import auth_headers


# ── Helpers ────────────────────────────────────────────────────────────


def _make_token(user: User, modules: list[str] | None = None) -> str:
    """Create a valid JWT access token for a user."""
    return create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role,
        modules=modules or [],
    )


# ── Fixtures ───────────────────────────────────────────────────────────


@pytest_asyncio.fixture()
async def cfp_module(db_session: AsyncSession) -> Module:
    """Create the 'cfp' module."""
    m = Module(
        id=uuid.uuid4(),
        name="Call for Papers",
        code="cfp",
        description="Call for Papers management",
        is_active=True,
    )
    db_session.add(m)
    await db_session.commit()
    return m


@pytest_asyncio.fixture()
async def tenant_with_cfp(
    db_session: AsyncSession,
    tenant: Tenant,
    conferences_module: Module,
    cfp_module: Module,
) -> Tenant:
    """Associate both conferences and cfp modules with the test tenant."""
    for mod in (conferences_module, cfp_module):
        db_session.add(
            TenantModule(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                module_id=mod.id,
                is_enabled=True,
            )
        )
    await db_session.commit()
    return tenant


@pytest_asyncio.fixture()
async def messaging_admin_token(tenant_admin_user: User) -> str:
    """Return a valid access token that includes both conferences and cfp modules."""
    return _make_token(tenant_admin_user, modules=["conferences", "cfp"])


@pytest_asyncio.fixture()
async def applicant(db_session: AsyncSession, tenant: Tenant) -> CFPApplicant:
    """Create a CFP applicant for messaging tests."""
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Jane",
        last_name="Speaker",
        email=f"jane-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Password123!"),
    )
    db_session.add(a)
    await db_session.commit()
    return a


@pytest_asyncio.fixture()
async def second_applicant(db_session: AsyncSession, tenant: Tenant) -> CFPApplicant:
    """Create a second CFP applicant for multi-recipient tests."""
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="John",
        last_name="Presenter",
        email=f"john-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Password123!"),
    )
    db_session.add(a)
    await db_session.commit()
    return a


@pytest_asyncio.fixture()
async def thread_with_message(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    tenant_admin_user: User,
    applicant: CFPApplicant,
) -> MessageThread:
    """Create a thread with one message, two participants (admin + applicant)."""
    # Use a future timestamp to ensure last_read_at > message.created_at
    future = datetime.now(timezone.utc) + timedelta(minutes=5)
    thread = MessageThread(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        subject="Test Thread Subject",
    )
    db_session.add(thread)
    await db_session.flush()

    # Participants
    db_session.add(
        MessageParticipant(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            thread_id=thread.id,
            participant_type="user",
            participant_id=tenant_admin_user.id,
            last_read_at=future,
        )
    )
    db_session.add(
        MessageParticipant(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            thread_id=thread.id,
            participant_type="applicant",
            participant_id=applicant.id,
        )
    )

    # Initial message from admin
    db_session.add(
        Message(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            thread_id=thread.id,
            sender_type="user",
            sender_id=tenant_admin_user.id,
            body_html="<p>Hello, this is the first message.</p>",
        )
    )

    await db_session.commit()
    await db_session.refresh(thread)
    return thread


# ═══════════════════════════════════════════════════════════════════════
# 1. MODEL TESTS
# ═══════════════════════════════════════════════════════════════════════


class TestMessageThreadModel:
    """Tests for the MessageThread SQLAlchemy model."""

    async def test_create_message_thread(
        self, db_session: AsyncSession, tenant: Tenant, conference: Conference
    ) -> None:
        """MessageThread can be created with required fields."""
        thread = MessageThread(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            subject="Welcome to TestConf",
        )
        db_session.add(thread)
        await db_session.commit()
        await db_session.refresh(thread)

        assert thread.id is not None
        assert thread.tenant_id == tenant.id
        assert thread.conference_id == conference.id
        assert thread.subject == "Welcome to TestConf"
        assert thread.bulk_id is None
        assert thread.created_at is not None
        assert thread.updated_at is not None

    async def test_create_message_thread_with_bulk_id(
        self, db_session: AsyncSession, tenant: Tenant, conference: Conference
    ) -> None:
        """MessageThread can be created with an optional bulk_id."""
        bulk_id = uuid.uuid4()
        thread = MessageThread(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            subject="Bulk announcement",
            bulk_id=bulk_id,
        )
        db_session.add(thread)
        await db_session.commit()
        await db_session.refresh(thread)

        assert thread.bulk_id == bulk_id

    async def test_thread_relationships(
        self,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        tenant_admin_user: User,
    ) -> None:
        """Thread participants and messages relationships are populated."""
        thread = MessageThread(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            subject="Relationship test",
        )
        db_session.add(thread)
        await db_session.flush()

        participant = MessageParticipant(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            thread_id=thread.id,
            participant_type="user",
            participant_id=tenant_admin_user.id,
        )
        db_session.add(participant)

        message = Message(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            thread_id=thread.id,
            sender_type="user",
            sender_id=tenant_admin_user.id,
            body_html="<p>Test message</p>",
        )
        db_session.add(message)
        await db_session.commit()

        await db_session.refresh(thread, ["participants", "messages"])
        assert len(thread.participants) == 1
        assert len(thread.messages) == 1
        assert thread.participants[0].participant_type == "user"
        assert thread.messages[0].body_html == "<p>Test message</p>"


class TestMessageParticipantModel:
    """Tests for the MessageParticipant SQLAlchemy model."""

    async def test_create_user_participant(
        self,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        tenant_admin_user: User,
    ) -> None:
        """MessageParticipant of type 'user' can be created."""
        thread = MessageThread(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            subject="Participant test",
        )
        db_session.add(thread)
        await db_session.flush()

        participant = MessageParticipant(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            thread_id=thread.id,
            participant_type="user",
            participant_id=tenant_admin_user.id,
        )
        db_session.add(participant)
        await db_session.commit()
        await db_session.refresh(participant)

        assert participant.participant_type == "user"
        assert participant.participant_id == tenant_admin_user.id
        assert participant.last_read_at is None
        assert participant.created_at is not None

    async def test_create_applicant_participant(
        self,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        applicant: CFPApplicant,
    ) -> None:
        """MessageParticipant of type 'applicant' can be created."""
        thread = MessageThread(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            subject="Applicant participant test",
        )
        db_session.add(thread)
        await db_session.flush()

        participant = MessageParticipant(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            thread_id=thread.id,
            participant_type="applicant",
            participant_id=applicant.id,
        )
        db_session.add(participant)
        await db_session.commit()
        await db_session.refresh(participant)

        assert participant.participant_type == "applicant"
        assert participant.participant_id == applicant.id

    async def test_participant_last_read_at(
        self,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        tenant_admin_user: User,
    ) -> None:
        """last_read_at can be set on a participant."""
        now = datetime.now(timezone.utc)
        thread = MessageThread(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            subject="Read status test",
        )
        db_session.add(thread)
        await db_session.flush()

        participant = MessageParticipant(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            thread_id=thread.id,
            participant_type="user",
            participant_id=tenant_admin_user.id,
            last_read_at=now,
        )
        db_session.add(participant)
        await db_session.commit()
        await db_session.refresh(participant)

        assert participant.last_read_at is not None


class TestMessageModel:
    """Tests for the Message SQLAlchemy model."""

    async def test_create_message(
        self,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        tenant_admin_user: User,
    ) -> None:
        """Message can be created with required fields."""
        thread = MessageThread(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            subject="Message test",
        )
        db_session.add(thread)
        await db_session.flush()

        msg = Message(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            thread_id=thread.id,
            sender_type="user",
            sender_id=tenant_admin_user.id,
            body_html="<p>Hello world</p>",
        )
        db_session.add(msg)
        await db_session.commit()
        await db_session.refresh(msg)

        assert msg.id is not None
        assert msg.thread_id == thread.id
        assert msg.sender_type == "user"
        assert msg.sender_id == tenant_admin_user.id
        assert msg.body_html == "<p>Hello world</p>"
        assert msg.created_at is not None

    async def test_message_thread_relationship(
        self,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        tenant_admin_user: User,
    ) -> None:
        """Message's thread relationship is accessible."""
        thread = MessageThread(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            subject="Relationship test",
        )
        db_session.add(thread)
        await db_session.flush()

        msg = Message(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            thread_id=thread.id,
            sender_type="user",
            sender_id=tenant_admin_user.id,
            body_html="<p>Checking back-ref</p>",
        )
        db_session.add(msg)
        await db_session.commit()
        await db_session.refresh(msg, ["thread"])

        assert msg.thread is not None
        assert msg.thread.subject == "Relationship test"


# ═══════════════════════════════════════════════════════════════════════
# 2. SCHEMA TESTS
# ═══════════════════════════════════════════════════════════════════════


class TestSenderInfoSchema:
    """Tests for the SenderInfo Pydantic schema."""

    def test_valid_sender_info(self) -> None:
        info = SenderInfo(
            id=uuid.uuid4(),
            type="user",
            first_name="Alice",
            last_name="Admin",
            email="alice@example.com",
        )
        assert info.type == "user"
        assert info.first_name == "Alice"

    def test_applicant_sender_info(self) -> None:
        info = SenderInfo(
            id=uuid.uuid4(),
            type="applicant",
            first_name="Bob",
            last_name="Speaker",
            email="bob@example.com",
        )
        assert info.type == "applicant"


class TestAdminCreateThreadSchema:
    """Tests for AdminCreateThread schema validation."""

    def test_valid_create_thread(self) -> None:
        data = AdminCreateThread(
            recipient_applicant_ids=[uuid.uuid4()],
            subject="Hello",
            body_html="<p>World</p>",
        )
        assert len(data.recipient_applicant_ids) == 1
        assert data.subject == "Hello"
        assert data.attachment_ids == []

    def test_multiple_recipients(self) -> None:
        ids = [uuid.uuid4() for _ in range(3)]
        data = AdminCreateThread(
            recipient_applicant_ids=ids,
            subject="Multi",
            body_html="<p>Multiple recipients</p>",
        )
        assert len(data.recipient_applicant_ids) == 3

    def test_empty_recipients_rejected(self) -> None:
        with pytest.raises(PydanticValidationError):
            AdminCreateThread(
                recipient_applicant_ids=[],
                subject="Hello",
                body_html="<p>World</p>",
            )

    def test_empty_subject_rejected(self) -> None:
        with pytest.raises(PydanticValidationError):
            AdminCreateThread(
                recipient_applicant_ids=[uuid.uuid4()],
                subject="",
                body_html="<p>Content</p>",
            )

    def test_empty_body_rejected(self) -> None:
        with pytest.raises(PydanticValidationError):
            AdminCreateThread(
                recipient_applicant_ids=[uuid.uuid4()],
                subject="Title",
                body_html="",
            )

    def test_subject_max_length(self) -> None:
        with pytest.raises(PydanticValidationError):
            AdminCreateThread(
                recipient_applicant_ids=[uuid.uuid4()],
                subject="x" * 501,
                body_html="<p>Body</p>",
            )

    def test_with_attachment_ids(self) -> None:
        att_ids = [uuid.uuid4(), uuid.uuid4()]
        data = AdminCreateThread(
            recipient_applicant_ids=[uuid.uuid4()],
            subject="With attachments",
            body_html="<p>See attached</p>",
            attachment_ids=att_ids,
        )
        assert len(data.attachment_ids) == 2


class TestReplyCreateSchema:
    """Tests for ReplyCreate schema validation."""

    def test_valid_reply(self) -> None:
        data = ReplyCreate(body_html="<p>Thanks!</p>")
        assert data.body_html == "<p>Thanks!</p>"
        assert data.attachment_ids == []

    def test_empty_body_rejected(self) -> None:
        with pytest.raises(PydanticValidationError):
            ReplyCreate(body_html="")

    def test_reply_with_attachments(self) -> None:
        att_ids = [uuid.uuid4()]
        data = ReplyCreate(body_html="<p>Here</p>", attachment_ids=att_ids)
        assert len(data.attachment_ids) == 1


class TestThreadListItemSchema:
    """Tests for ThreadListItem schema."""

    def test_valid_thread_list_item(self) -> None:
        now = datetime.now(timezone.utc)
        sender = SenderInfo(
            id=uuid.uuid4(),
            type="user",
            first_name="Admin",
            last_name="User",
            email="admin@test.com",
        )
        item = ThreadListItem(
            id=uuid.uuid4(),
            subject="Test thread",
            last_message_at=now,
            last_message_preview="Hello there...",
            last_message_sender=sender,
            unread=True,
            message_count=5,
            created_at=now,
        )
        assert item.subject == "Test thread"
        assert item.unread is True
        assert item.message_count == 5
        assert item.bulk_id is None
        assert item.other_participants == []

    def test_thread_list_item_with_bulk_id(self) -> None:
        now = datetime.now(timezone.utc)
        bulk = uuid.uuid4()
        sender = SenderInfo(
            id=uuid.uuid4(),
            type="user",
            first_name="A",
            last_name="B",
            email="a@b.com",
        )
        item = ThreadListItem(
            id=uuid.uuid4(),
            subject="Bulk",
            last_message_at=now,
            last_message_preview="Preview",
            last_message_sender=sender,
            unread=False,
            message_count=1,
            created_at=now,
            bulk_id=bulk,
        )
        assert item.bulk_id == bulk


class TestThreadDetailResponseSchema:
    """Tests for ThreadDetailResponse schema."""

    def test_valid_thread_detail(self) -> None:
        now = datetime.now(timezone.utc)
        participant = ParticipantInfo(
            id=uuid.uuid4(),
            type="user",
            first_name="Admin",
            last_name="User",
            email="admin@test.com",
            last_read_at=now,
        )
        sender = SenderInfo(
            id=participant.id,
            type="user",
            first_name="Admin",
            last_name="User",
            email="admin@test.com",
        )
        message = MessageResponse(
            id=uuid.uuid4(),
            thread_id=uuid.uuid4(),
            sender=sender,
            body_html="<p>Hello</p>",
            created_at=now,
        )
        detail = ThreadDetailResponse(
            id=uuid.uuid4(),
            subject="Detail test",
            participants=[participant],
            messages=[message],
            created_at=now,
            updated_at=now,
        )
        assert detail.subject == "Detail test"
        assert len(detail.participants) == 1
        assert len(detail.messages) == 1
        assert detail.bulk_id is None


class TestBulkRecipientFilterSchema:
    """Tests for BulkRecipientFilter schema."""

    def test_defaults(self) -> None:
        f = BulkRecipientFilter()
        assert f.all_applicants is False
        assert f.paper_status is None
        assert f.committee_role is None
        assert f.applicant_ids is None

    def test_all_applicants(self) -> None:
        f = BulkRecipientFilter(all_applicants=True)
        assert f.all_applicants is True

    def test_specific_applicants(self) -> None:
        ids = [uuid.uuid4(), uuid.uuid4()]
        f = BulkRecipientFilter(applicant_ids=ids)
        assert len(f.applicant_ids) == 2

    def test_paper_status_filter(self) -> None:
        f = BulkRecipientFilter(paper_status="accepted")
        assert f.paper_status == "accepted"

    def test_committee_role_filter(self) -> None:
        f = BulkRecipientFilter(committee_role="reviewer")
        assert f.committee_role == "reviewer"


class TestAdminBulkSendSchema:
    """Tests for AdminBulkSend schema."""

    def test_valid_bulk_send(self) -> None:
        data = AdminBulkSend(
            subject="Announcement",
            body_html="<p>Important update</p>",
            recipients=BulkRecipientFilter(all_applicants=True),
        )
        assert data.subject == "Announcement"
        assert data.recipients.all_applicants is True

    def test_empty_subject_rejected(self) -> None:
        with pytest.raises(PydanticValidationError):
            AdminBulkSend(
                subject="",
                body_html="<p>Body</p>",
                recipients=BulkRecipientFilter(all_applicants=True),
            )


class TestUnreadCountResponseSchema:
    """Tests for UnreadCountResponse schema."""

    def test_unread_count(self) -> None:
        resp = UnreadCountResponse(unread_count=7)
        assert resp.unread_count == 7

    def test_zero_unread(self) -> None:
        resp = UnreadCountResponse(unread_count=0)
        assert resp.unread_count == 0


class TestMessageAttachmentInfoSchema:
    """Tests for MessageAttachmentInfo schema."""

    def test_valid_attachment_info(self) -> None:
        info = MessageAttachmentInfo(
            id=uuid.uuid4(),
            filename="slides.pdf",
            content_type="application/pdf",
            file_size=102400,
        )
        assert info.filename == "slides.pdf"
        assert info.file_size == 102400


class TestBulkSendResponseSchema:
    """Tests for BulkSendResponse schema."""

    def test_valid_response(self) -> None:
        resp = BulkSendResponse(
            bulk_id=uuid.uuid4(),
            threads_created=10,
        )
        assert resp.threads_created == 10
        assert resp.bulk_id is not None


class TestCreateThreadResponseSchema:
    """Tests for CreateThreadResponse schema."""

    def test_valid_response(self) -> None:
        now = datetime.now(timezone.utc)
        detail = ThreadDetailResponse(
            id=uuid.uuid4(),
            subject="New thread",
            participants=[],
            messages=[],
            created_at=now,
            updated_at=now,
        )
        resp = CreateThreadResponse(
            threads_created=1,
            first_thread=detail,
        )
        assert resp.threads_created == 1
        assert resp.first_thread.subject == "New thread"


# ═══════════════════════════════════════════════════════════════════════
# 3. API ENDPOINT TESTS
# ═══════════════════════════════════════════════════════════════════════


def _messaging_url(conference_id: uuid.UUID, path: str = "") -> str:
    """Build a messaging endpoint URL."""
    base = f"/api/v1/conferences/{conference_id}/messaging"
    if path:
        return f"{base}/{path}"
    return base


class TestListThreads:
    """GET /conferences/{id}/messaging/threads"""

    async def test_list_threads_empty(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
    ) -> None:
        """Returns empty list when no threads exist."""
        url = _messaging_url(conference.id, "threads")
        response = await client.get(url, headers=auth_headers(messaging_admin_token))

        assert response.status_code == 200
        data = response.json()
        assert data["items"] == []
        assert data["total"] == 0
        assert data["page"] == 1
        assert data["page_size"] == 50

    async def test_list_threads_with_data(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
        thread_with_message: MessageThread,
    ) -> None:
        """Returns threads when they exist."""
        url = _messaging_url(conference.id, "threads")
        response = await client.get(url, headers=auth_headers(messaging_admin_token))

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert len(data["items"]) == 1
        item = data["items"][0]
        assert item["id"] == str(thread_with_message.id)
        assert item["subject"] == "Test Thread Subject"
        assert item["message_count"] == 1

    async def test_list_threads_pagination(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
        thread_with_message: MessageThread,
    ) -> None:
        """Pagination parameters are respected."""
        url = _messaging_url(conference.id, "threads")
        response = await client.get(
            url,
            params={"page": 1, "page_size": 1},
            headers=auth_headers(messaging_admin_token),
        )

        assert response.status_code == 200
        data = response.json()
        assert data["page"] == 1
        assert data["page_size"] == 1

    async def test_list_threads_search(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
        thread_with_message: MessageThread,
    ) -> None:
        """Search filter works on subject."""
        url = _messaging_url(conference.id, "threads")

        # Search that matches
        response = await client.get(
            url,
            params={"search": "Test Thread"},
            headers=auth_headers(messaging_admin_token),
        )
        assert response.status_code == 200
        assert response.json()["total"] == 1

        # Search that does not match
        response = await client.get(
            url,
            params={"search": "nonexistent-query-xyz"},
            headers=auth_headers(messaging_admin_token),
        )
        assert response.status_code == 200
        assert response.json()["total"] == 0

    async def test_list_threads_requires_auth(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        conference: Conference,
    ) -> None:
        """Unauthenticated request is rejected."""
        url = _messaging_url(conference.id, "threads")
        response = await client.get(url)
        assert response.status_code == 401


class TestCreateThread:
    """POST /conferences/{id}/messaging/threads"""

    async def test_create_thread_success(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
    ) -> None:
        """Admin can create a new thread to an applicant."""
        url = _messaging_url(conference.id, "threads")
        payload = {
            "recipient_applicant_ids": [str(applicant.id)],
            "subject": "Welcome to the conference!",
            "body_html": "<p>We are glad to have you.</p>",
        }
        response = await client.post(
            url, json=payload, headers=auth_headers(messaging_admin_token)
        )

        assert response.status_code == 201
        data = response.json()
        assert data["threads_created"] == 1
        assert data["first_thread"]["subject"] == "Welcome to the conference!"
        assert len(data["first_thread"]["messages"]) == 1
        assert len(data["first_thread"]["participants"]) == 2

    async def test_create_thread_multiple_recipients(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
        second_applicant: CFPApplicant,
    ) -> None:
        """Creating a thread with multiple recipients creates multiple threads."""
        url = _messaging_url(conference.id, "threads")
        payload = {
            "recipient_applicant_ids": [str(applicant.id), str(second_applicant.id)],
            "subject": "Group announcement",
            "body_html": "<p>Hello everyone!</p>",
        }
        response = await client.post(
            url, json=payload, headers=auth_headers(messaging_admin_token)
        )

        assert response.status_code == 201
        data = response.json()
        assert data["threads_created"] == 2

    async def test_create_thread_invalid_applicant(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
    ) -> None:
        """Creating thread with non-existent applicant returns 404."""
        url = _messaging_url(conference.id, "threads")
        fake_id = uuid.uuid4()
        payload = {
            "recipient_applicant_ids": [str(fake_id)],
            "subject": "No one home",
            "body_html": "<p>Hello?</p>",
        }
        response = await client.post(
            url, json=payload, headers=auth_headers(messaging_admin_token)
        )

        assert response.status_code == 404

    async def test_create_thread_empty_subject(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
    ) -> None:
        """Empty subject is rejected with 422."""
        url = _messaging_url(conference.id, "threads")
        payload = {
            "recipient_applicant_ids": [str(applicant.id)],
            "subject": "",
            "body_html": "<p>Content</p>",
        }
        response = await client.post(
            url, json=payload, headers=auth_headers(messaging_admin_token)
        )

        assert response.status_code == 422

    async def test_create_thread_empty_body(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
    ) -> None:
        """Empty body_html is rejected with 422."""
        url = _messaging_url(conference.id, "threads")
        payload = {
            "recipient_applicant_ids": [str(applicant.id)],
            "subject": "Valid subject",
            "body_html": "",
        }
        response = await client.post(
            url, json=payload, headers=auth_headers(messaging_admin_token)
        )

        assert response.status_code == 422

    async def test_create_thread_requires_auth(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        conference: Conference,
    ) -> None:
        """Unauthenticated request is rejected."""
        url = _messaging_url(conference.id, "threads")
        payload = {
            "recipient_applicant_ids": [str(uuid.uuid4())],
            "subject": "Test",
            "body_html": "<p>Body</p>",
        }
        response = await client.post(url, json=payload)
        assert response.status_code == 401


class TestGetThreadDetail:
    """GET /conferences/{id}/messaging/threads/{thread_id}"""

    async def test_get_thread_detail(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
        thread_with_message: MessageThread,
    ) -> None:
        """Returns full thread detail with participants and messages."""
        url = _messaging_url(conference.id, f"threads/{thread_with_message.id}")
        response = await client.get(url, headers=auth_headers(messaging_admin_token))

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(thread_with_message.id)
        assert data["subject"] == "Test Thread Subject"
        assert len(data["participants"]) == 2
        assert len(data["messages"]) == 1
        assert data["messages"][0]["body_html"] == "<p>Hello, this is the first message.</p>"

    async def test_get_thread_not_found(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
    ) -> None:
        """Returns 404 for non-existent thread."""
        fake_id = uuid.uuid4()
        url = _messaging_url(conference.id, f"threads/{fake_id}")
        response = await client.get(url, headers=auth_headers(messaging_admin_token))

        assert response.status_code == 404

    async def test_get_thread_wrong_conference(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
        thread_with_message: MessageThread,
    ) -> None:
        """Thread is not found when queried under a different conference."""
        other_conf = Conference(
            id=uuid.uuid4(),
            tenant_id=conference.tenant_id,
            name="Other Conference",
            abbreviation="OC",
            is_active=True,
        )
        db_session.add(other_conf)
        await db_session.commit()

        url = _messaging_url(other_conf.id, f"threads/{thread_with_message.id}")
        response = await client.get(url, headers=auth_headers(messaging_admin_token))

        assert response.status_code == 404

    async def test_get_thread_detail_message_sender_info(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
        thread_with_message: MessageThread,
    ) -> None:
        """Message sender info is correctly resolved."""
        url = _messaging_url(conference.id, f"threads/{thread_with_message.id}")
        response = await client.get(url, headers=auth_headers(messaging_admin_token))

        assert response.status_code == 200
        data = response.json()
        sender = data["messages"][0]["sender"]
        assert sender["type"] == "user"
        assert sender["first_name"] == tenant_admin_user.first_name
        assert sender["last_name"] == tenant_admin_user.last_name
        assert sender["email"] == tenant_admin_user.email


class TestReplyToThread:
    """POST /conferences/{id}/messaging/threads/{thread_id}/reply"""

    async def test_reply_to_thread(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
        thread_with_message: MessageThread,
    ) -> None:
        """Admin can reply to an existing thread."""
        url = _messaging_url(conference.id, f"threads/{thread_with_message.id}/reply")
        payload = {"body_html": "<p>Thanks for reaching out!</p>"}
        response = await client.post(
            url, json=payload, headers=auth_headers(messaging_admin_token)
        )

        assert response.status_code == 201
        data = response.json()
        assert data["body_html"] == "<p>Thanks for reaching out!</p>"
        assert data["thread_id"] == str(thread_with_message.id)
        assert data["sender"]["type"] == "user"

    async def test_reply_increases_message_count(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
        thread_with_message: MessageThread,
    ) -> None:
        """After reply, thread detail shows two messages."""
        # Reply
        reply_url = _messaging_url(
            conference.id, f"threads/{thread_with_message.id}/reply"
        )
        await client.post(
            reply_url,
            json={"body_html": "<p>Reply message</p>"},
            headers=auth_headers(messaging_admin_token),
        )

        # Verify
        detail_url = _messaging_url(
            conference.id, f"threads/{thread_with_message.id}"
        )
        response = await client.get(
            detail_url, headers=auth_headers(messaging_admin_token)
        )
        assert response.status_code == 200
        assert len(response.json()["messages"]) == 2

    async def test_reply_to_nonexistent_thread(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
    ) -> None:
        """Reply to a non-existent thread returns 404."""
        fake_id = uuid.uuid4()
        url = _messaging_url(conference.id, f"threads/{fake_id}/reply")
        payload = {"body_html": "<p>Hello?</p>"}
        response = await client.post(
            url, json=payload, headers=auth_headers(messaging_admin_token)
        )

        assert response.status_code == 404

    async def test_reply_empty_body_rejected(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
        thread_with_message: MessageThread,
    ) -> None:
        """Empty body in reply is rejected with 422."""
        url = _messaging_url(conference.id, f"threads/{thread_with_message.id}/reply")
        payload = {"body_html": ""}
        response = await client.post(
            url, json=payload, headers=auth_headers(messaging_admin_token)
        )

        assert response.status_code == 422


class TestMarkThreadRead:
    """POST /conferences/{id}/messaging/threads/{thread_id}/read"""

    async def test_mark_thread_read(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
        thread_with_message: MessageThread,
    ) -> None:
        """Admin can mark a thread as read."""
        url = _messaging_url(conference.id, f"threads/{thread_with_message.id}/read")
        response = await client.post(
            url, headers=auth_headers(messaging_admin_token)
        )

        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is True

    async def test_mark_read_nonexistent_thread(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
    ) -> None:
        """Marking read on a thread where user is not a participant returns ok (no-op)."""
        fake_id = uuid.uuid4()
        url = _messaging_url(conference.id, f"threads/{fake_id}/read")
        response = await client.post(
            url, headers=auth_headers(messaging_admin_token)
        )

        # The endpoint simply does nothing if participant not found, returns ok
        assert response.status_code == 200
        assert response.json()["ok"] is True

    async def test_mark_read_updates_read_status(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_with_cfp: Tenant,
        tenant: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
    ) -> None:
        """After marking read, thread should show as not unread in list."""
        # Create a thread where admin has NOT read the last message
        thread = MessageThread(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            subject="Unread then read",
        )
        db_session.add(thread)
        await db_session.flush()

        db_session.add(
            MessageParticipant(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                thread_id=thread.id,
                participant_type="user",
                participant_id=tenant_admin_user.id,
                last_read_at=None,  # never read
            )
        )
        db_session.add(
            MessageParticipant(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                thread_id=thread.id,
                participant_type="applicant",
                participant_id=applicant.id,
            )
        )
        db_session.add(
            Message(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                thread_id=thread.id,
                sender_type="applicant",
                sender_id=applicant.id,
                body_html="<p>Question from applicant</p>",
            )
        )
        await db_session.commit()

        # Verify it shows as unread in listing
        list_url = _messaging_url(conference.id, "threads")
        response = await client.get(
            list_url, headers=auth_headers(messaging_admin_token)
        )
        assert response.status_code == 200
        items = response.json()["items"]
        unread_thread = next(i for i in items if i["id"] == str(thread.id))
        assert unread_thread["unread"] is True

        # Mark as read
        read_url = _messaging_url(conference.id, f"threads/{thread.id}/read")
        response = await client.post(
            read_url, headers=auth_headers(messaging_admin_token)
        )
        assert response.status_code == 200

        # Verify it is now marked as read
        response = await client.get(
            list_url, headers=auth_headers(messaging_admin_token)
        )
        items = response.json()["items"]
        read_thread = next(i for i in items if i["id"] == str(thread.id))
        assert read_thread["unread"] is False


class TestUnreadCount:
    """GET /conferences/{id}/messaging/unread-count"""

    async def test_unread_count_zero(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
    ) -> None:
        """Unread count is zero when there are no threads."""
        url = _messaging_url(conference.id, "unread-count")
        response = await client.get(url, headers=auth_headers(messaging_admin_token))

        assert response.status_code == 200
        data = response.json()
        assert data["unread_count"] == 0

    async def test_unread_count_with_unread_thread(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_with_cfp: Tenant,
        tenant: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
    ) -> None:
        """Unread count reflects threads with messages after last_read_at."""
        # Create thread where admin hasn't read
        thread = MessageThread(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            subject="Unread thread",
        )
        db_session.add(thread)
        await db_session.flush()

        db_session.add(
            MessageParticipant(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                thread_id=thread.id,
                participant_type="user",
                participant_id=tenant_admin_user.id,
                last_read_at=None,
            )
        )
        db_session.add(
            Message(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                thread_id=thread.id,
                sender_type="applicant",
                sender_id=applicant.id,
                body_html="<p>Unread message</p>",
            )
        )
        await db_session.commit()

        url = _messaging_url(conference.id, "unread-count")
        response = await client.get(url, headers=auth_headers(messaging_admin_token))

        assert response.status_code == 200
        assert response.json()["unread_count"] == 1

    async def test_unread_count_already_read(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
        thread_with_message: MessageThread,
    ) -> None:
        """Threads where admin has read the latest message are not counted as unread."""
        # thread_with_message has last_read_at set for the admin
        url = _messaging_url(conference.id, "unread-count")
        response = await client.get(url, headers=auth_headers(messaging_admin_token))

        assert response.status_code == 200
        # Admin's last_read_at is set to now in the fixture, which is >= message created_at
        assert response.json()["unread_count"] == 0

    async def test_unread_count_requires_auth(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        conference: Conference,
    ) -> None:
        """Unauthenticated request returns 401."""
        url = _messaging_url(conference.id, "unread-count")
        response = await client.get(url)
        assert response.status_code == 401


class TestBulkSend:
    """POST /conferences/{id}/messaging/bulk-send"""

    async def test_bulk_send_by_applicant_ids(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
        second_applicant: CFPApplicant,
    ) -> None:
        """Bulk send to specific applicant IDs creates threads."""
        url = _messaging_url(conference.id, "bulk-send")
        payload = {
            "subject": "Bulk announcement",
            "body_html": "<p>Important notice to all.</p>",
            "recipients": {
                "applicant_ids": [str(applicant.id), str(second_applicant.id)],
            },
        }
        response = await client.post(
            url, json=payload, headers=auth_headers(messaging_admin_token)
        )

        assert response.status_code == 201
        data = response.json()
        assert data["threads_created"] == 2
        assert "bulk_id" in data

    async def test_bulk_send_no_matching_recipients(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
    ) -> None:
        """Bulk send with no matching recipients creates 0 threads."""
        url = _messaging_url(conference.id, "bulk-send")
        payload = {
            "subject": "Nobody here",
            "body_html": "<p>Hello?</p>",
            "recipients": {
                "applicant_ids": [str(uuid.uuid4())],
            },
        }
        response = await client.post(
            url, json=payload, headers=auth_headers(messaging_admin_token)
        )

        assert response.status_code == 201
        assert response.json()["threads_created"] == 0

    async def test_bulk_send_threads_have_bulk_id(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
    ) -> None:
        """Bulk-sent threads carry the bulk_id."""
        url = _messaging_url(conference.id, "bulk-send")
        payload = {
            "subject": "Bulk tagged",
            "body_html": "<p>This has a bulk_id.</p>",
            "recipients": {
                "applicant_ids": [str(applicant.id)],
            },
        }
        response = await client.post(
            url, json=payload, headers=auth_headers(messaging_admin_token)
        )
        assert response.status_code == 201
        bulk_id = response.json()["bulk_id"]

        # Verify the bulk_id filter on list threads
        list_url = _messaging_url(conference.id, "threads")
        response = await client.get(
            list_url,
            params={"bulk_id": bulk_id},
            headers=auth_headers(messaging_admin_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert data["items"][0]["bulk_id"] == bulk_id

    async def test_bulk_send_empty_subject_rejected(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
    ) -> None:
        """Empty subject in bulk send is rejected with 422."""
        url = _messaging_url(conference.id, "bulk-send")
        payload = {
            "subject": "",
            "body_html": "<p>Body</p>",
            "recipients": {"all_applicants": True},
        }
        response = await client.post(
            url, json=payload, headers=auth_headers(messaging_admin_token)
        )
        assert response.status_code == 422

    async def test_bulk_send_requires_auth(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        conference: Conference,
    ) -> None:
        """Unauthenticated request is rejected."""
        url = _messaging_url(conference.id, "bulk-send")
        payload = {
            "subject": "Test",
            "body_html": "<p>Body</p>",
            "recipients": {"all_applicants": True},
        }
        response = await client.post(url, json=payload)
        assert response.status_code == 401


class TestBulkThreadsList:
    """GET /conferences/{id}/messaging/bulk-threads"""

    async def test_list_bulk_threads_empty(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
    ) -> None:
        """Returns empty list when no bulk sends have been made."""
        url = _messaging_url(conference.id, "bulk-threads")
        response = await client.get(url, headers=auth_headers(messaging_admin_token))

        assert response.status_code == 200
        assert response.json() == []

    async def test_list_bulk_threads_after_send(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
    ) -> None:
        """After a bulk send, the campaign appears in the bulk-threads list."""
        # Do a bulk send first
        send_url = _messaging_url(conference.id, "bulk-send")
        send_response = await client.post(
            send_url,
            json={
                "subject": "Campaign A",
                "body_html": "<p>Hello</p>",
                "recipients": {"applicant_ids": [str(applicant.id)]},
            },
            headers=auth_headers(messaging_admin_token),
        )
        assert send_response.status_code == 201
        bulk_id = send_response.json()["bulk_id"]

        # List bulk threads
        list_url = _messaging_url(conference.id, "bulk-threads")
        response = await client.get(
            list_url, headers=auth_headers(messaging_admin_token)
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["bulk_id"] == bulk_id
        assert data[0]["subject"] == "Campaign A"
        assert data[0]["threads_created"] == 1


class TestEndToEndFlow:
    """Integration tests combining multiple operations."""

    async def test_create_then_reply_then_read(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
    ) -> None:
        """Full conversation flow: create thread, reply, mark read."""
        # 1. Create thread
        create_url = _messaging_url(conference.id, "threads")
        create_resp = await client.post(
            create_url,
            json={
                "recipient_applicant_ids": [str(applicant.id)],
                "subject": "E2E Test",
                "body_html": "<p>Initial message</p>",
            },
            headers=auth_headers(messaging_admin_token),
        )
        assert create_resp.status_code == 201
        thread_id = create_resp.json()["first_thread"]["id"]

        # 2. Reply
        reply_url = _messaging_url(conference.id, f"threads/{thread_id}/reply")
        reply_resp = await client.post(
            reply_url,
            json={"body_html": "<p>Follow-up message</p>"},
            headers=auth_headers(messaging_admin_token),
        )
        assert reply_resp.status_code == 201

        # 3. Get thread detail -- should have 2 messages
        detail_url = _messaging_url(conference.id, f"threads/{thread_id}")
        detail_resp = await client.get(
            detail_url, headers=auth_headers(messaging_admin_token)
        )
        assert detail_resp.status_code == 200
        assert len(detail_resp.json()["messages"]) == 2

        # 4. Mark as read
        read_url = _messaging_url(conference.id, f"threads/{thread_id}/read")
        read_resp = await client.post(
            read_url, headers=auth_headers(messaging_admin_token)
        )
        assert read_resp.status_code == 200

        # 5. Verify unread count is 0
        unread_url = _messaging_url(conference.id, "unread-count")
        unread_resp = await client.get(
            unread_url, headers=auth_headers(messaging_admin_token)
        )
        assert unread_resp.status_code == 200
        assert unread_resp.json()["unread_count"] == 0

    async def test_thread_appears_in_list_after_create(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
    ) -> None:
        """A newly created thread appears immediately in the threads list."""
        create_url = _messaging_url(conference.id, "threads")
        create_resp = await client.post(
            create_url,
            json={
                "recipient_applicant_ids": [str(applicant.id)],
                "subject": "Visible in list",
                "body_html": "<p>Body</p>",
            },
            headers=auth_headers(messaging_admin_token),
        )
        assert create_resp.status_code == 201
        thread_id = create_resp.json()["first_thread"]["id"]

        list_url = _messaging_url(conference.id, "threads")
        list_resp = await client.get(
            list_url, headers=auth_headers(messaging_admin_token)
        )
        assert list_resp.status_code == 200
        thread_ids = [item["id"] for item in list_resp.json()["items"]]
        assert thread_id in thread_ids
