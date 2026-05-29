"""Comprehensive tests for the messaging module.

Covers models, schemas, and all admin messaging API endpoints:
- Thread CRUD (list, create, get detail)
- Reply to thread
- Mark as read
- Unread count
- Bulk send
- Message templates CRUD
- Recipient lists CRUD
- Thread flags, archive, notes, export
- Bulk send filters (all_applicants, paper_status, committee_role, recipient_list)
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from httpx import AsyncClient
from pydantic import ValidationError as PydanticValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.associations import ConferenceCFP
from app.models.cfp import CallForPapers, CFPApplicant, CFPCommitteeMember, CFPPaper
from app.models.conference import Conference
from app.models.messaging import (
    Message,
    MessageParticipant,
    MessageTemplate,
    MessageThread,
    RecipientList,
    RecipientListMember,
)
from app.models.module import Module, TenantModule
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.messaging import (
    AdminBulkSend,
    AdminCreateThread,
    BulkRecipientFilter,
    BulkSendResponse,
    CreateThreadResponse,
    InternalNoteCreate,
    MessageAttachmentInfo,
    MessageResponse,
    MessageTemplateCreate,
    MessageTemplateUpdate,
    ParticipantInfo,
    RecipientListCreate,
    ReplyCreate,
    SenderInfo,
    ThreadDetailResponse,
    ThreadListItem,
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
    future = datetime.now(UTC) + timedelta(minutes=5)
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

    async def test_legacy_constructor_auto_populates_domain_fields(
        self, db_session: AsyncSession, tenant: Tenant, conference: Conference
    ) -> None:
        """Existing constructors that only pass conference_id must keep working.

        Migration 213 made domain + domain_entity_id NOT NULL on
        message_threads. The before_insert listener mirrors conference_id
        into domain_entity_id and defaults domain to 'conference'. Without
        this, every existing MessageThread(...) callsite would 500 on insert.
        """
        thread = MessageThread(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            subject="Legacy constructor",
        )
        db_session.add(thread)
        await db_session.commit()
        await db_session.refresh(thread)

        assert thread.domain == "conference"
        assert thread.domain_entity_id == conference.id

    async def test_explicit_domain_entity_id_is_not_overwritten(
        self, db_session: AsyncSession, tenant: Tenant, conference: Conference
    ) -> None:
        """When PR 3 wires up training threads, the caller will set
        domain='training' + domain_entity_id=<registration_id> explicitly. The
        listener must leave those values alone — only fill in defaults when
        the new fields are unset.
        """
        registration_id = uuid.uuid4()
        thread = MessageThread(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            # conference_id stays NOT NULL until a follow-up migration; for now
            # training-domain threads still need a conference_id placeholder.
            # We're only verifying that the listener honors explicit overrides.
            conference_id=conference.id,
            domain="training",
            domain_entity_id=registration_id,
            subject="Training broadcast",
        )
        db_session.add(thread)
        await db_session.commit()
        await db_session.refresh(thread)

        assert thread.domain == "training"
        assert thread.domain_entity_id == registration_id

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
        now = datetime.now(UTC)
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
        now = datetime.now(UTC)
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
        now = datetime.now(UTC)
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
        now = datetime.now(UTC)
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
        now = datetime.now(UTC)
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
        response = await client.post(url, json=payload, headers=auth_headers(messaging_admin_token))

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
        response = await client.post(url, json=payload, headers=auth_headers(messaging_admin_token))

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
        response = await client.post(url, json=payload, headers=auth_headers(messaging_admin_token))

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
        response = await client.post(url, json=payload, headers=auth_headers(messaging_admin_token))

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
        response = await client.post(url, json=payload, headers=auth_headers(messaging_admin_token))

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
        response = await client.post(url, json=payload, headers=auth_headers(messaging_admin_token))

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
        reply_url = _messaging_url(conference.id, f"threads/{thread_with_message.id}/reply")
        await client.post(
            reply_url,
            json={"body_html": "<p>Reply message</p>"},
            headers=auth_headers(messaging_admin_token),
        )

        # Verify
        detail_url = _messaging_url(conference.id, f"threads/{thread_with_message.id}")
        response = await client.get(detail_url, headers=auth_headers(messaging_admin_token))
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
        response = await client.post(url, json=payload, headers=auth_headers(messaging_admin_token))

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
        response = await client.post(url, json=payload, headers=auth_headers(messaging_admin_token))

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
        response = await client.post(url, headers=auth_headers(messaging_admin_token))

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
        response = await client.post(url, headers=auth_headers(messaging_admin_token))

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
        response = await client.get(list_url, headers=auth_headers(messaging_admin_token))
        assert response.status_code == 200
        items = response.json()["items"]
        unread_thread = next(i for i in items if i["id"] == str(thread.id))
        assert unread_thread["unread"] is True

        # Mark as read
        read_url = _messaging_url(conference.id, f"threads/{thread.id}/read")
        response = await client.post(read_url, headers=auth_headers(messaging_admin_token))
        assert response.status_code == 200

        # Verify it is now marked as read
        response = await client.get(list_url, headers=auth_headers(messaging_admin_token))
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
        response = await client.post(url, json=payload, headers=auth_headers(messaging_admin_token))

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
        response = await client.post(url, json=payload, headers=auth_headers(messaging_admin_token))

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
        response = await client.post(url, json=payload, headers=auth_headers(messaging_admin_token))
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
        response = await client.post(url, json=payload, headers=auth_headers(messaging_admin_token))
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
        response = await client.get(list_url, headers=auth_headers(messaging_admin_token))

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
        detail_resp = await client.get(detail_url, headers=auth_headers(messaging_admin_token))
        assert detail_resp.status_code == 200
        assert len(detail_resp.json()["messages"]) == 2

        # 4. Mark as read
        read_url = _messaging_url(conference.id, f"threads/{thread_id}/read")
        read_resp = await client.post(read_url, headers=auth_headers(messaging_admin_token))
        assert read_resp.status_code == 200

        # 5. Verify unread count is 0
        unread_url = _messaging_url(conference.id, "unread-count")
        unread_resp = await client.get(unread_url, headers=auth_headers(messaging_admin_token))
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
        list_resp = await client.get(list_url, headers=auth_headers(messaging_admin_token))
        assert list_resp.status_code == 200
        thread_ids = [item["id"] for item in list_resp.json()["items"]]
        assert thread_id in thread_ids


# ═══════════════════════════════════════════════════════════════════════
# 4. PHASE 2: ADDITIONAL FIXTURES
# ═══════════════════════════════════════════════════════════════════════


@pytest_asyncio.fixture()
async def cfp_with_paper(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    applicant: CFPApplicant,
) -> CFPPaper:
    """Create a CallForPapers linked to the conference, plus a paper from the applicant."""
    cfp = CallForPapers(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        title="TestConf CFP 2026",
        status="open",
    )
    db_session.add(cfp)
    await db_session.flush()

    # Link CFP to conference
    db_session.add(
        ConferenceCFP(
            id=uuid.uuid4(),
            conference_id=conference.id,
            cfp_id=cfp.id,
        )
    )

    paper = CFPPaper(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        cfp_id=cfp.id,
        main_speaker_id=applicant.id,
        title="Building Async APIs with Python",
        status="submitted",
    )
    db_session.add(paper)
    await db_session.commit()
    return paper


@pytest_asyncio.fixture()
async def second_paper(
    db_session: AsyncSession,
    tenant: Tenant,
    second_applicant: CFPApplicant,
    cfp_with_paper: CFPPaper,
) -> CFPPaper:
    """Create a second paper from the second applicant in the same CFP."""
    paper = CFPPaper(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        cfp_id=cfp_with_paper.cfp_id,
        main_speaker_id=second_applicant.id,
        title="Scaling Microservices",
        status="accepted",
    )
    db_session.add(paper)
    await db_session.commit()
    return paper


@pytest_asyncio.fixture()
async def committee_member(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    applicant: CFPApplicant,
) -> CFPCommitteeMember:
    """Create a committee member for the conference."""
    cm = CFPCommitteeMember(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        applicant_id=applicant.id,
        role="reviewer",
    )
    db_session.add(cm)
    await db_session.commit()
    return cm


@pytest_asyncio.fixture()
async def recipient_list_with_members(
    db_session: AsyncSession,
    tenant: Tenant,
    applicant: CFPApplicant,
    second_applicant: CFPApplicant,
) -> RecipientList:
    """Create a recipient list with two members."""
    rl = RecipientList(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="VIP Speakers",
        description="Important speakers list",
    )
    db_session.add(rl)
    await db_session.flush()

    db_session.add(
        RecipientListMember(
            id=uuid.uuid4(),
            list_id=rl.id,
            applicant_id=applicant.id,
        )
    )
    db_session.add(
        RecipientListMember(
            id=uuid.uuid4(),
            list_id=rl.id,
            applicant_id=second_applicant.id,
        )
    )
    await db_session.commit()
    return rl


# ═══════════════════════════════════════════════════════════════════════
# 5. MESSAGE TEMPLATES CRUD
# ═══════════════════════════════════════════════════════════════════════


class TestListTemplates:
    """GET /conferences/{id}/messaging/templates"""

    async def test_list_templates_empty(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
    ) -> None:
        """Returns empty list when no templates exist."""
        url = _messaging_url(conference.id, "templates")
        response = await client.get(url, headers=auth_headers(messaging_admin_token))

        assert response.status_code == 200
        data = response.json()
        assert data["items"] == []
        assert data["total"] == 0

    async def test_list_templates_with_data(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_with_cfp: Tenant,
        tenant: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
    ) -> None:
        """Returns templates when they exist."""
        # Seed a template
        db_session.add(
            MessageTemplate(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                name="Welcome",
                subject="Welcome [First Name]!",
                body_html="<p>Hello [First Name]</p>",
            )
        )
        await db_session.commit()

        url = _messaging_url(conference.id, "templates")
        response = await client.get(url, headers=auth_headers(messaging_admin_token))

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert data["items"][0]["name"] == "Welcome"

    async def test_list_templates_requires_auth(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        conference: Conference,
    ) -> None:
        url = _messaging_url(conference.id, "templates")
        response = await client.get(url)
        assert response.status_code == 401


class TestCreateTemplate:
    """POST /conferences/{id}/messaging/templates"""

    async def test_create_template_success(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
    ) -> None:
        url = _messaging_url(conference.id, "templates")
        payload = {
            "name": "Acceptance Notice",
            "subject": "Your paper has been accepted!",
            "body_html": "<p>Congrats [First Name]!</p>",
        }
        response = await client.post(url, json=payload, headers=auth_headers(messaging_admin_token))

        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Acceptance Notice"
        assert data["subject"] == "Your paper has been accepted!"
        assert data["body_html"] == "<p>Congrats [First Name]!</p>"
        assert "id" in data
        assert "created_at" in data

    async def test_create_template_duplicate_name_rejected(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
    ) -> None:
        url = _messaging_url(conference.id, "templates")
        payload = {
            "name": "Dup Template",
            "subject": "Subject",
            "body_html": "<p>Body</p>",
        }
        # Create first
        resp1 = await client.post(url, json=payload, headers=auth_headers(messaging_admin_token))
        assert resp1.status_code == 201

        # Duplicate
        resp2 = await client.post(url, json=payload, headers=auth_headers(messaging_admin_token))
        assert resp2.status_code == 400

    async def test_create_template_empty_name_rejected(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
    ) -> None:
        url = _messaging_url(conference.id, "templates")
        payload = {"name": "", "subject": "Subj", "body_html": "<p>Body</p>"}
        response = await client.post(url, json=payload, headers=auth_headers(messaging_admin_token))
        assert response.status_code == 422


class TestUpdateTemplate:
    """PUT /conferences/{id}/messaging/templates/{template_id}"""

    async def test_update_template_success(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
    ) -> None:
        # Create first
        create_url = _messaging_url(conference.id, "templates")
        create_resp = await client.post(
            create_url,
            json={"name": "Draft", "subject": "Old Subj", "body_html": "<p>Old</p>"},
            headers=auth_headers(messaging_admin_token),
        )
        template_id = create_resp.json()["id"]

        # Update
        update_url = _messaging_url(conference.id, f"templates/{template_id}")
        response = await client.put(
            update_url,
            json={"name": "Final", "subject": "New Subj"},
            headers=auth_headers(messaging_admin_token),
        )

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Final"
        assert data["subject"] == "New Subj"
        assert data["body_html"] == "<p>Old</p>"  # unchanged

    async def test_update_template_not_found(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
    ) -> None:
        fake_id = uuid.uuid4()
        url = _messaging_url(conference.id, f"templates/{fake_id}")
        response = await client.put(
            url,
            json={"name": "Nope"},
            headers=auth_headers(messaging_admin_token),
        )
        assert response.status_code == 404

    async def test_update_template_duplicate_name_rejected(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
    ) -> None:
        create_url = _messaging_url(conference.id, "templates")
        # Template A
        await client.post(
            create_url,
            json={"name": "Alpha", "subject": "S", "body_html": "<p>B</p>"},
            headers=auth_headers(messaging_admin_token),
        )
        # Template B
        resp_b = await client.post(
            create_url,
            json={"name": "Beta", "subject": "S", "body_html": "<p>B</p>"},
            headers=auth_headers(messaging_admin_token),
        )
        template_b_id = resp_b.json()["id"]

        # Try renaming B to Alpha
        update_url = _messaging_url(conference.id, f"templates/{template_b_id}")
        response = await client.put(
            update_url,
            json={"name": "Alpha"},
            headers=auth_headers(messaging_admin_token),
        )
        assert response.status_code == 400


class TestDeleteTemplate:
    """DELETE /conferences/{id}/messaging/templates/{template_id}"""

    async def test_delete_template_success(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
    ) -> None:
        # Create
        create_url = _messaging_url(conference.id, "templates")
        resp = await client.post(
            create_url,
            json={"name": "ToDelete", "subject": "S", "body_html": "<p>B</p>"},
            headers=auth_headers(messaging_admin_token),
        )
        template_id = resp.json()["id"]

        # Delete
        delete_url = _messaging_url(conference.id, f"templates/{template_id}")
        response = await client.delete(delete_url, headers=auth_headers(messaging_admin_token))
        assert response.status_code == 204

        # Verify gone
        list_url = _messaging_url(conference.id, "templates")
        list_resp = await client.get(list_url, headers=auth_headers(messaging_admin_token))
        assert list_resp.json()["total"] == 0

    async def test_delete_template_not_found(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
    ) -> None:
        fake_id = uuid.uuid4()
        url = _messaging_url(conference.id, f"templates/{fake_id}")
        response = await client.delete(url, headers=auth_headers(messaging_admin_token))
        assert response.status_code == 404


# ═══════════════════════════════════════════════════════════════════════
# 6. RECIPIENT LISTS CRUD
# ═══════════════════════════════════════════════════════════════════════


class TestListRecipientLists:
    """GET /conferences/{id}/messaging/recipient-lists"""

    async def test_list_recipient_lists_empty(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
    ) -> None:
        url = _messaging_url(conference.id, "recipient-lists")
        response = await client.get(url, headers=auth_headers(messaging_admin_token))

        assert response.status_code == 200
        data = response.json()
        assert data["items"] == []
        assert data["total"] == 0

    async def test_list_recipient_lists_unauthenticated(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        conference: Conference,
    ) -> None:
        url = _messaging_url(conference.id, "recipient-lists")
        response = await client.get(url)
        assert response.status_code == 401

    async def test_list_recipient_lists_with_data(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
        second_applicant: CFPApplicant,
        recipient_list_with_members: RecipientList,
    ) -> None:
        url = _messaging_url(conference.id, "recipient-lists")
        response = await client.get(url, headers=auth_headers(messaging_admin_token))

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert data["items"][0]["name"] == "VIP Speakers"
        assert data["items"][0]["member_count"] == 2


class TestCreateRecipientList:
    """POST /conferences/{id}/messaging/recipient-lists"""

    async def test_create_recipient_list_success(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
    ) -> None:
        url = _messaging_url(conference.id, "recipient-lists")
        payload = {
            "name": "Keynote Speakers",
            "description": "Selected keynote presenters",
            "applicant_ids": [str(applicant.id)],
        }
        response = await client.post(url, json=payload, headers=auth_headers(messaging_admin_token))

        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Keynote Speakers"
        assert len(data["members"]) == 1
        assert data["members"][0]["id"] == str(applicant.id)

    async def test_create_recipient_list_duplicate_name_rejected(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
    ) -> None:
        url = _messaging_url(conference.id, "recipient-lists")
        payload = {
            "name": "Dup List",
            "applicant_ids": [str(applicant.id)],
        }
        resp1 = await client.post(url, json=payload, headers=auth_headers(messaging_admin_token))
        assert resp1.status_code == 201

        resp2 = await client.post(url, json=payload, headers=auth_headers(messaging_admin_token))
        assert resp2.status_code == 400

    async def test_create_recipient_list_invalid_applicants(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
    ) -> None:
        url = _messaging_url(conference.id, "recipient-lists")
        payload = {
            "name": "Ghost List",
            "applicant_ids": [str(uuid.uuid4())],
        }
        response = await client.post(url, json=payload, headers=auth_headers(messaging_admin_token))
        assert response.status_code == 404

    async def test_create_recipient_list_applicant_from_other_tenant_rejected(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_with_cfp: Tenant,
        messaging_admin_token: str,
        conference: Conference,
    ) -> None:
        """Applicant IDs from a different tenant are treated as non-existent (404)."""
        from app.models.tenant import Tenant as TenantModel

        other_tenant = TenantModel(
            id=uuid.uuid4(),
            name="Other Org",
            slug=f"other-{uuid.uuid4().hex[:8]}",
            is_active=True,
        )
        db_session.add(other_tenant)
        other_applicant = CFPApplicant(
            id=uuid.uuid4(),
            tenant_id=other_tenant.id,
            first_name="Eve",
            last_name="External",
            email=f"eve-{uuid.uuid4().hex[:8]}@other.com",
            password_hash=hash_password("Password123!"),
        )
        db_session.add(other_applicant)
        await db_session.commit()

        url = _messaging_url(conference.id, "recipient-lists")
        payload = {"name": "Cross-Tenant Attempt", "applicant_ids": [str(other_applicant.id)]}
        response = await client.post(url, json=payload, headers=auth_headers(messaging_admin_token))
        assert response.status_code == 404


class TestGetRecipientListDetail:
    """GET /conferences/{id}/messaging/recipient-lists/{list_id}"""

    async def test_get_recipient_list_detail(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
        second_applicant: CFPApplicant,
        recipient_list_with_members: RecipientList,
    ) -> None:
        url = _messaging_url(conference.id, f"recipient-lists/{recipient_list_with_members.id}")
        response = await client.get(url, headers=auth_headers(messaging_admin_token))

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "VIP Speakers"
        assert len(data["members"]) == 2

    async def test_get_recipient_list_not_found(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
    ) -> None:
        fake_id = uuid.uuid4()
        url = _messaging_url(conference.id, f"recipient-lists/{fake_id}")
        response = await client.get(url, headers=auth_headers(messaging_admin_token))
        assert response.status_code == 404


class TestUpdateRecipientList:
    """PUT /conferences/{id}/messaging/recipient-lists/{list_id}"""

    async def test_update_recipient_list_name(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
        second_applicant: CFPApplicant,
        recipient_list_with_members: RecipientList,
    ) -> None:
        url = _messaging_url(conference.id, f"recipient-lists/{recipient_list_with_members.id}")
        response = await client.put(
            url,
            json={"name": "Updated VIPs"},
            headers=auth_headers(messaging_admin_token),
        )

        assert response.status_code == 200
        assert response.json()["name"] == "Updated VIPs"

    async def test_update_recipient_list_members(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
        second_applicant: CFPApplicant,
        recipient_list_with_members: RecipientList,
    ) -> None:
        """Update members to only include one applicant."""
        url = _messaging_url(conference.id, f"recipient-lists/{recipient_list_with_members.id}")
        response = await client.put(
            url,
            json={"applicant_ids": [str(applicant.id)]},
            headers=auth_headers(messaging_admin_token),
        )

        assert response.status_code == 200
        assert len(response.json()["members"]) == 1

    async def test_update_recipient_list_duplicate_name_rejected(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
        recipient_list_with_members: RecipientList,
    ) -> None:
        """Renaming a list to the name of another existing list returns 400."""
        other = RecipientList(
            id=uuid.uuid4(),
            tenant_id=tenant_with_cfp.id,
            name="Taken Name",
            description="",
        )
        db_session.add(other)
        await db_session.commit()

        url = _messaging_url(conference.id, f"recipient-lists/{recipient_list_with_members.id}")
        response = await client.put(
            url,
            json={"name": "Taken Name"},
            headers=auth_headers(messaging_admin_token),
        )
        assert response.status_code == 400


class TestDeleteRecipientList:
    """DELETE /conferences/{id}/messaging/recipient-lists/{list_id}"""

    async def test_delete_recipient_list_success(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
        second_applicant: CFPApplicant,
        recipient_list_with_members: RecipientList,
    ) -> None:
        url = _messaging_url(conference.id, f"recipient-lists/{recipient_list_with_members.id}")
        response = await client.delete(url, headers=auth_headers(messaging_admin_token))
        assert response.status_code == 204

        # Verify deleted
        get_resp = await client.get(url, headers=auth_headers(messaging_admin_token))
        assert get_resp.status_code == 404

    async def test_delete_recipient_list_not_found(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        messaging_admin_token: str,
        conference: Conference,
    ) -> None:
        url = _messaging_url(conference.id, f"recipient-lists/{uuid.uuid4()}")
        response = await client.delete(url, headers=auth_headers(messaging_admin_token))
        assert response.status_code == 404

    async def test_delete_recipient_list_from_other_tenant_returns_404(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_with_cfp: Tenant,
        messaging_admin_token: str,
        conference: Conference,
    ) -> None:
        """A list belonging to another tenant cannot be deleted — returns 404."""
        from app.models.tenant import Tenant as TenantModel

        other_tenant = TenantModel(
            id=uuid.uuid4(),
            name="Rival Corp",
            slug=f"rival-{uuid.uuid4().hex[:8]}",
            is_active=True,
        )
        db_session.add(other_tenant)
        await db_session.flush()  # satisfy FK before inserting the list
        other_list = RecipientList(
            id=uuid.uuid4(),
            tenant_id=other_tenant.id,
            name="Private List",
            description="",
        )
        db_session.add(other_list)
        await db_session.commit()

        url = _messaging_url(conference.id, f"recipient-lists/{other_list.id}")
        response = await client.delete(url, headers=auth_headers(messaging_admin_token))
        assert response.status_code == 404


# ═══════════════════════════════════════════════════════════════════════
# 7. THREAD FLAGS, ARCHIVE, NOTES, EXPORT
# ═══════════════════════════════════════════════════════════════════════


class TestToggleThreadFlag:
    """POST /conferences/{id}/messaging/threads/{thread_id}/flag"""

    async def test_flag_toggle_on(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
        thread_with_message: MessageThread,
    ) -> None:
        url = _messaging_url(conference.id, f"threads/{thread_with_message.id}/flag")
        response = await client.post(url, headers=auth_headers(messaging_admin_token))

        assert response.status_code == 200
        assert response.json()["flagged"] is True

    async def test_flag_toggle_off(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
        thread_with_message: MessageThread,
    ) -> None:
        url = _messaging_url(conference.id, f"threads/{thread_with_message.id}/flag")
        # Flag on
        await client.post(url, headers=auth_headers(messaging_admin_token))
        # Flag off
        response = await client.post(url, headers=auth_headers(messaging_admin_token))

        assert response.status_code == 200
        assert response.json()["flagged"] is False

    async def test_flag_appears_in_thread_list(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
        thread_with_message: MessageThread,
    ) -> None:
        """Flagged threads have is_flagged=True in list response."""
        flag_url = _messaging_url(conference.id, f"threads/{thread_with_message.id}/flag")
        await client.post(flag_url, headers=auth_headers(messaging_admin_token))

        list_url = _messaging_url(conference.id, "threads")
        response = await client.get(list_url, headers=auth_headers(messaging_admin_token))

        assert response.status_code == 200
        item = response.json()["items"][0]
        assert item["is_flagged"] is True

    async def test_filter_by_flagged(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
        thread_with_message: MessageThread,
    ) -> None:
        """Filter threads by flagged=true only returns flagged threads."""
        flag_url = _messaging_url(conference.id, f"threads/{thread_with_message.id}/flag")
        await client.post(flag_url, headers=auth_headers(messaging_admin_token))

        list_url = _messaging_url(conference.id, "threads")

        # Flagged filter
        resp = await client.get(
            list_url,
            params={"flagged": "true"},
            headers=auth_headers(messaging_admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["total"] == 1

    async def test_flag_nonexistent_thread(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
    ) -> None:
        fake_id = uuid.uuid4()
        url = _messaging_url(conference.id, f"threads/{fake_id}/flag")
        response = await client.post(url, headers=auth_headers(messaging_admin_token))
        assert response.status_code == 404


class TestArchiveThread:
    """POST /conferences/{id}/messaging/threads/{thread_id}/archive + unarchive"""

    async def test_archive_thread(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
        thread_with_message: MessageThread,
    ) -> None:
        url = _messaging_url(conference.id, f"threads/{thread_with_message.id}/archive")
        response = await client.post(url, headers=auth_headers(messaging_admin_token))

        assert response.status_code == 200
        assert response.json()["ok"] is True

    async def test_archived_thread_hidden_from_default_list(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
        thread_with_message: MessageThread,
    ) -> None:
        """Archived threads are hidden from the default (non-archived) list."""
        archive_url = _messaging_url(conference.id, f"threads/{thread_with_message.id}/archive")
        await client.post(archive_url, headers=auth_headers(messaging_admin_token))

        list_url = _messaging_url(conference.id, "threads")
        # Default list (archived=false)
        response = await client.get(list_url, headers=auth_headers(messaging_admin_token))
        assert response.status_code == 200
        assert response.json()["total"] == 0

        # Archived list
        response = await client.get(
            list_url,
            params={"archived": "true"},
            headers=auth_headers(messaging_admin_token),
        )
        assert response.status_code == 200
        assert response.json()["total"] == 1

    async def test_unarchive_thread(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
        thread_with_message: MessageThread,
    ) -> None:
        # Archive first
        archive_url = _messaging_url(conference.id, f"threads/{thread_with_message.id}/archive")
        await client.post(archive_url, headers=auth_headers(messaging_admin_token))

        # Unarchive
        unarchive_url = _messaging_url(conference.id, f"threads/{thread_with_message.id}/unarchive")
        response = await client.post(unarchive_url, headers=auth_headers(messaging_admin_token))
        assert response.status_code == 200
        assert response.json()["ok"] is True

        # Verify back in default list
        list_url = _messaging_url(conference.id, "threads")
        resp = await client.get(list_url, headers=auth_headers(messaging_admin_token))
        assert resp.json()["total"] == 1

    async def test_archive_nonexistent_thread(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
    ) -> None:
        fake_id = uuid.uuid4()
        url = _messaging_url(conference.id, f"threads/{fake_id}/archive")
        response = await client.post(url, headers=auth_headers(messaging_admin_token))
        assert response.status_code == 404


class TestInternalNotes:
    """POST /conferences/{id}/messaging/threads/{thread_id}/note"""

    async def test_create_internal_note(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
        thread_with_message: MessageThread,
    ) -> None:
        url = _messaging_url(conference.id, f"threads/{thread_with_message.id}/note")
        payload = {"body_html": "<p>Internal: needs follow-up.</p>"}
        response = await client.post(url, json=payload, headers=auth_headers(messaging_admin_token))

        assert response.status_code == 201
        data = response.json()
        assert data["is_internal_note"] is True
        assert data["body_html"] == "<p>Internal: needs follow-up.</p>"
        assert data["sender"]["type"] == "user"

    async def test_internal_note_visible_in_thread_detail(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
        thread_with_message: MessageThread,
    ) -> None:
        note_url = _messaging_url(conference.id, f"threads/{thread_with_message.id}/note")
        await client.post(
            note_url,
            json={"body_html": "<p>Note for team</p>"},
            headers=auth_headers(messaging_admin_token),
        )

        detail_url = _messaging_url(conference.id, f"threads/{thread_with_message.id}")
        response = await client.get(detail_url, headers=auth_headers(messaging_admin_token))

        assert response.status_code == 200
        messages = response.json()["messages"]
        assert len(messages) == 2  # original + note
        note_msg = [m for m in messages if m["is_internal_note"]]
        assert len(note_msg) == 1

    async def test_create_note_nonexistent_thread(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
    ) -> None:
        fake_id = uuid.uuid4()
        url = _messaging_url(conference.id, f"threads/{fake_id}/note")
        response = await client.post(
            url,
            json={"body_html": "<p>Note</p>"},
            headers=auth_headers(messaging_admin_token),
        )
        assert response.status_code == 404

    async def test_create_note_empty_body_rejected(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
        thread_with_message: MessageThread,
    ) -> None:
        url = _messaging_url(conference.id, f"threads/{thread_with_message.id}/note")
        response = await client.post(
            url,
            json={"body_html": ""},
            headers=auth_headers(messaging_admin_token),
        )
        assert response.status_code == 422


class TestExportThread:
    """GET /conferences/{id}/messaging/threads/{thread_id}/export"""

    async def test_export_text_format(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
        thread_with_message: MessageThread,
    ) -> None:
        url = _messaging_url(conference.id, f"threads/{thread_with_message.id}/export")
        response = await client.get(
            url,
            params={"format": "text"},
            headers=auth_headers(messaging_admin_token),
        )

        assert response.status_code == 200
        assert response.headers["content-type"] == "text/plain; charset=utf-8"
        assert "Content-Disposition" in response.headers
        content = response.text
        assert "Subject: Test Thread Subject" in content
        assert "Hello, this is the first message." in content

    async def test_export_html_format(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
        thread_with_message: MessageThread,
    ) -> None:
        url = _messaging_url(conference.id, f"threads/{thread_with_message.id}/export")
        response = await client.get(
            url,
            params={"format": "html"},
            headers=auth_headers(messaging_admin_token),
        )

        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]
        content = response.text
        assert "<h1>Test Thread Subject</h1>" in content
        assert "Hello, this is the first message." in content

    async def test_export_with_internal_note(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
        thread_with_message: MessageThread,
    ) -> None:
        """Internal notes are labeled in export."""
        note_url = _messaging_url(conference.id, f"threads/{thread_with_message.id}/note")
        await client.post(
            note_url,
            json={"body_html": "<p>Secret note</p>"},
            headers=auth_headers(messaging_admin_token),
        )

        export_url = _messaging_url(conference.id, f"threads/{thread_with_message.id}/export")
        response = await client.get(
            export_url,
            params={"format": "text"},
            headers=auth_headers(messaging_admin_token),
        )

        assert response.status_code == 200
        assert "[INTERNAL NOTE]" in response.text

    async def test_export_nonexistent_thread(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
    ) -> None:
        fake_id = uuid.uuid4()
        url = _messaging_url(conference.id, f"threads/{fake_id}/export")
        response = await client.get(url, headers=auth_headers(messaging_admin_token))
        assert response.status_code == 404


# ═══════════════════════════════════════════════════════════════════════
# 8. BULK SEND WITH ADVANCED FILTERS
# ═══════════════════════════════════════════════════════════════════════


class TestBulkSendAllApplicants:
    """Bulk send using all_applicants filter (requires papers linked via ConferenceCFP)."""

    async def test_bulk_send_all_applicants(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
        second_applicant: CFPApplicant,
        cfp_with_paper: CFPPaper,
        second_paper: CFPPaper,
    ) -> None:
        """Bulk send to all_applicants finds applicants who submitted papers."""
        url = _messaging_url(conference.id, "bulk-send")
        payload = {
            "subject": "To all speakers",
            "body_html": "<p>Hello everyone</p>",
            "recipients": {"all_applicants": True},
        }
        response = await client.post(url, json=payload, headers=auth_headers(messaging_admin_token))

        assert response.status_code == 201
        data = response.json()
        assert data["threads_created"] == 2

    async def test_bulk_send_all_applicants_no_papers(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
    ) -> None:
        """all_applicants with no papers linked returns 404."""
        url = _messaging_url(conference.id, "bulk-send")
        payload = {
            "subject": "Hello",
            "body_html": "<p>Body</p>",
            "recipients": {"all_applicants": True},
        }
        response = await client.post(url, json=payload, headers=auth_headers(messaging_admin_token))
        assert response.status_code == 404


class TestBulkSendByPaperStatus:
    """Bulk send filtering by paper_status."""

    async def test_bulk_send_by_paper_status_submitted(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
        second_applicant: CFPApplicant,
        cfp_with_paper: CFPPaper,
        second_paper: CFPPaper,
    ) -> None:
        """Filter by submitted status finds only the first applicant."""
        url = _messaging_url(conference.id, "bulk-send")
        payload = {
            "subject": "Submission received",
            "body_html": "<p>Thanks for submitting</p>",
            "recipients": {"paper_status": "submitted"},
        }
        response = await client.post(url, json=payload, headers=auth_headers(messaging_admin_token))

        assert response.status_code == 201
        assert response.json()["threads_created"] == 1

    async def test_bulk_send_by_paper_status_accepted(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
        second_applicant: CFPApplicant,
        cfp_with_paper: CFPPaper,
        second_paper: CFPPaper,
    ) -> None:
        """Filter by accepted status finds only the second applicant."""
        url = _messaging_url(conference.id, "bulk-send")
        payload = {
            "subject": "Congrats!",
            "body_html": "<p>Your paper was accepted</p>",
            "recipients": {"paper_status": "accepted"},
        }
        response = await client.post(url, json=payload, headers=auth_headers(messaging_admin_token))

        assert response.status_code == 201
        assert response.json()["threads_created"] == 1

    async def test_bulk_send_by_paper_status_no_match(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
        cfp_with_paper: CFPPaper,
    ) -> None:
        """Filter by a status that no papers have returns 404."""
        url = _messaging_url(conference.id, "bulk-send")
        payload = {
            "subject": "Rejected",
            "body_html": "<p>Sorry</p>",
            "recipients": {"paper_status": "rejected"},
        }
        response = await client.post(url, json=payload, headers=auth_headers(messaging_admin_token))
        assert response.status_code == 404


class TestBulkSendByCommitteeRole:
    """Bulk send filtering by committee_role."""

    async def test_bulk_send_by_committee_role(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
        committee_member: CFPCommitteeMember,
    ) -> None:
        url = _messaging_url(conference.id, "bulk-send")
        payload = {
            "subject": "Reviewer update",
            "body_html": "<p>New papers assigned</p>",
            "recipients": {"committee_role": "reviewer"},
        }
        response = await client.post(url, json=payload, headers=auth_headers(messaging_admin_token))

        assert response.status_code == 201
        assert response.json()["threads_created"] == 1

    async def test_bulk_send_by_committee_role_no_match(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
    ) -> None:
        url = _messaging_url(conference.id, "bulk-send")
        payload = {
            "subject": "Chair notice",
            "body_html": "<p>Hello chairs</p>",
            "recipients": {"committee_role": "chair"},
        }
        response = await client.post(url, json=payload, headers=auth_headers(messaging_admin_token))
        assert response.status_code == 404


class TestBulkSendByRecipientList:
    """Bulk send filtering by recipient_list_id."""

    async def test_bulk_send_by_recipient_list(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
        second_applicant: CFPApplicant,
        recipient_list_with_members: RecipientList,
    ) -> None:
        url = _messaging_url(conference.id, "bulk-send")
        payload = {
            "subject": "VIP announcement",
            "body_html": "<p>Exclusive update for VIPs</p>",
            "recipients": {
                "recipient_list_id": str(recipient_list_with_members.id),
            },
        }
        response = await client.post(url, json=payload, headers=auth_headers(messaging_admin_token))

        assert response.status_code == 201
        assert response.json()["threads_created"] == 2

    async def test_bulk_send_by_empty_recipient_list(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_with_cfp: Tenant,
        tenant: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
    ) -> None:
        """Bulk send with a list that has no members returns 404."""
        empty_list = RecipientList(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            name="Empty List",
        )
        db_session.add(empty_list)
        await db_session.commit()

        url = _messaging_url(conference.id, "bulk-send")
        payload = {
            "subject": "Nobody",
            "body_html": "<p>Ghost</p>",
            "recipients": {"recipient_list_id": str(empty_list.id)},
        }
        response = await client.post(url, json=payload, headers=auth_headers(messaging_admin_token))
        assert response.status_code == 404


# ═══════════════════════════════════════════════════════════════════════
# 9. TEMPLATE VARIABLE SUBSTITUTION
# ═══════════════════════════════════════════════════════════════════════


class TestTemplateVariableSubstitution:
    """Test that [First Name], [Last Name], etc. are substituted in thread creation."""

    async def test_variables_substituted_in_create_thread(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
    ) -> None:
        """Template variables in subject and body are replaced with applicant data."""
        url = _messaging_url(conference.id, "threads")
        payload = {
            "recipient_applicant_ids": [str(applicant.id)],
            "subject": "Hello [First Name] [Last Name]!",
            "body_html": "<p>Dear [First Name], your email is [Email].</p>",
        }
        response = await client.post(url, json=payload, headers=auth_headers(messaging_admin_token))

        assert response.status_code == 201
        thread = response.json()["first_thread"]
        assert thread["subject"] == f"Hello {applicant.first_name} {applicant.last_name}!"
        msg_body = thread["messages"][0]["body_html"]
        assert applicant.first_name in msg_body
        assert applicant.email in msg_body

    async def test_conference_name_variable(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
    ) -> None:
        url = _messaging_url(conference.id, "threads")
        payload = {
            "recipient_applicant_ids": [str(applicant.id)],
            "subject": "Welcome to [Conference Name]",
            "body_html": "<p>See you at [Conference Name]!</p>",
        }
        response = await client.post(url, json=payload, headers=auth_headers(messaging_admin_token))

        assert response.status_code == 201
        thread = response.json()["first_thread"]
        assert thread["subject"] == f"Welcome to {conference.name}"

    async def test_paper_title_variable(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user: User,
        messaging_admin_token: str,
        conference: Conference,
        applicant: CFPApplicant,
        cfp_with_paper: CFPPaper,
    ) -> None:
        """[Paper Title] is replaced with the applicant's latest paper title."""
        url = _messaging_url(conference.id, "threads")
        payload = {
            "recipient_applicant_ids": [str(applicant.id)],
            "subject": "About your paper: [Paper Title]",
            "body_html": "<p>Your paper [Paper Title] is great.</p>",
        }
        response = await client.post(url, json=payload, headers=auth_headers(messaging_admin_token))

        assert response.status_code == 201
        thread = response.json()["first_thread"]
        assert thread["subject"] == f"About your paper: {cfp_with_paper.title}"


# ═══════════════════════════════════════════════════════════════════════
# 10. ADDITIONAL SCHEMA TESTS
# ═══════════════════════════════════════════════════════════════════════


class TestInternalNoteCreateSchema:
    """Tests for InternalNoteCreate schema."""

    def test_valid_note(self) -> None:
        data = InternalNoteCreate(body_html="<p>Note</p>")
        assert data.body_html == "<p>Note</p>"

    def test_empty_body_rejected(self) -> None:
        with pytest.raises(PydanticValidationError):
            InternalNoteCreate(body_html="")


class TestMessageTemplateCreateSchema:
    """Tests for MessageTemplateCreate schema."""

    def test_valid_create(self) -> None:
        data = MessageTemplateCreate(
            name="Welcome",
            subject="Hello [First Name]",
            body_html="<p>Welcome!</p>",
        )
        assert data.name == "Welcome"

    def test_empty_name_rejected(self) -> None:
        with pytest.raises(PydanticValidationError):
            MessageTemplateCreate(name="", subject="S", body_html="<p>B</p>")

    def test_long_name_rejected(self) -> None:
        with pytest.raises(PydanticValidationError):
            MessageTemplateCreate(name="x" * 201, subject="S", body_html="<p>B</p>")

    def test_empty_subject_rejected(self) -> None:
        with pytest.raises(PydanticValidationError):
            MessageTemplateCreate(name="N", subject="", body_html="<p>B</p>")

    def test_empty_body_rejected(self) -> None:
        with pytest.raises(PydanticValidationError):
            MessageTemplateCreate(name="N", subject="S", body_html="")


class TestMessageTemplateUpdateSchema:
    """Tests for MessageTemplateUpdate schema."""

    def test_partial_update(self) -> None:
        data = MessageTemplateUpdate(name="New Name")
        assert data.name == "New Name"
        assert data.subject is None
        assert data.body_html is None

    def test_full_update(self) -> None:
        data = MessageTemplateUpdate(name="N", subject="S", body_html="<p>B</p>")
        assert data.name == "N"
        assert data.subject == "S"


class TestRecipientListCreateSchema:
    """Tests for RecipientListCreate schema."""

    def test_valid_create(self) -> None:
        data = RecipientListCreate(
            name="Test List",
            description="A test",
            applicant_ids=[uuid.uuid4()],
        )
        assert data.name == "Test List"
        assert len(data.applicant_ids) == 1

    def test_empty_name_rejected(self) -> None:
        with pytest.raises(PydanticValidationError):
            RecipientListCreate(name="", applicant_ids=[uuid.uuid4()])

    def test_empty_applicants_rejected(self) -> None:
        with pytest.raises(PydanticValidationError):
            RecipientListCreate(name="List", applicant_ids=[])


class TestBulkRecipientFilterRecipientList:
    """Tests for BulkRecipientFilter with recipient_list_id."""

    def test_recipient_list_id_filter(self) -> None:
        lid = uuid.uuid4()
        f = BulkRecipientFilter(recipient_list_id=lid)
        assert f.recipient_list_id == lid
        assert f.all_applicants is False
