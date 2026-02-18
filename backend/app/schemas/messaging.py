"""Messaging schemas for in-platform communication."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

# --- Shared ---


class SenderInfo(BaseModel):
    """Resolved participant info."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    type: str  # "user" or "applicant"
    first_name: str
    last_name: str
    email: str


class MessageAttachmentInfo(BaseModel):
    """Lightweight attachment info for messages."""

    id: UUID
    filename: str
    content_type: str
    file_size: int


class MessageResponse(BaseModel):
    """Single message within a thread."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    thread_id: UUID
    sender: SenderInfo
    body_html: str
    is_internal_note: bool = False
    attachments: list[MessageAttachmentInfo] = []
    created_at: datetime


class ParticipantInfo(BaseModel):
    """Participant in a thread with read status."""

    id: UUID
    type: str  # "user" or "applicant"
    first_name: str
    last_name: str
    email: str
    last_read_at: datetime | None = None


# --- Thread list ---


class ThreadListItem(BaseModel):
    """Inbox row."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    subject: str
    last_message_at: datetime
    last_message_preview: str
    last_message_sender: SenderInfo
    other_participants: list[SenderInfo] = []
    unread: bool
    message_count: int
    is_flagged: bool = False
    has_attachments: bool = False
    created_at: datetime
    bulk_id: UUID | None = None
    archived_at: datetime | None = None


class ThreadListResponse(BaseModel):
    """Paginated thread list."""

    items: list[ThreadListItem]
    total: int
    page: int
    page_size: int


# --- Thread detail ---


class ThreadDetailResponse(BaseModel):
    """Full thread with participants and messages."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    subject: str
    bulk_id: UUID | None = None
    archived_at: datetime | None = None
    participants: list[ParticipantInfo]
    messages: list[MessageResponse]
    created_at: datetime
    updated_at: datetime


# --- Admin create / reply ---


class AdminCreateThread(BaseModel):
    """Admin creates new thread(s) to one or more applicants."""

    recipient_applicant_ids: list[UUID] = Field(..., min_length=1)
    subject: str = Field(..., min_length=1, max_length=500)
    body_html: str = Field(..., min_length=1)
    attachment_ids: list[UUID] = []


class CreateThreadResponse(BaseModel):
    """Response from creating thread(s)."""

    threads_created: int
    first_thread: ThreadDetailResponse


class ReplyCreate(BaseModel):
    """Reply to an existing thread."""

    body_html: str = Field(..., min_length=1)
    attachment_ids: list[UUID] = []


# --- Bulk send ---


class BulkRecipientFilter(BaseModel):
    """Filter for selecting bulk recipients."""

    all_applicants: bool = False
    paper_status: str | None = None
    committee_role: str | None = None
    applicant_ids: list[UUID] | None = None
    recipient_list_id: UUID | None = None


class AdminBulkSend(BaseModel):
    """Admin bulk-sends messages to filtered recipients."""

    subject: str = Field(..., min_length=1, max_length=500)
    body_html: str = Field(..., min_length=1)
    recipients: BulkRecipientFilter


class BulkSendResponse(BaseModel):
    """Response from bulk send."""

    bulk_id: UUID
    threads_created: int


class BulkThreadSummary(BaseModel):
    """Summary of a bulk send campaign."""

    bulk_id: UUID
    subject: str
    threads_created: int
    created_at: datetime


# --- Portal ---


class PortalCreateThread(BaseModel):
    """Applicant creates a new thread to conference admins."""

    conference_id: UUID
    subject: str = Field(..., min_length=1, max_length=500)
    body_html: str = Field(..., min_length=1)
    attachment_ids: list[UUID] = []


class UnreadCountResponse(BaseModel):
    """Unread thread count."""

    unread_count: int


class NotificationPreferenceUpdate(BaseModel):
    """Toggle message notification emails."""

    message_notifications_enabled: bool


# --- Message Templates ---


class MessageTemplateCreate(BaseModel):
    """Create a new message template."""

    name: str = Field(..., min_length=1, max_length=200)
    subject: str = Field(..., min_length=1, max_length=500)
    body_html: str = Field(..., min_length=1)


class MessageTemplateUpdate(BaseModel):
    """Update a message template."""

    name: str | None = Field(None, min_length=1, max_length=200)
    subject: str | None = Field(None, min_length=1, max_length=500)
    body_html: str | None = Field(None, min_length=1)


class MessageTemplateResponse(BaseModel):
    """Message template response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    subject: str
    body_html: str
    created_at: datetime
    updated_at: datetime


class MessageTemplateListResponse(BaseModel):
    """Paginated message template list."""

    items: list[MessageTemplateResponse]
    total: int


# --- Recipient Lists ---


class RecipientListCreate(BaseModel):
    """Create a new recipient list."""

    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    applicant_ids: list[UUID] = Field(..., min_length=1)


class RecipientListUpdate(BaseModel):
    """Update a recipient list."""

    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    applicant_ids: list[UUID] | None = None


class RecipientListMemberInfo(BaseModel):
    """Recipient list member info."""

    id: UUID
    first_name: str
    last_name: str
    email: str


class RecipientListResponse(BaseModel):
    """Recipient list summary response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    description: str | None = None
    member_count: int
    created_at: datetime
    updated_at: datetime


class RecipientListDetailResponse(BaseModel):
    """Recipient list with members."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    description: str | None = None
    members: list[RecipientListMemberInfo]
    created_at: datetime
    updated_at: datetime


class RecipientListListResponse(BaseModel):
    """Paginated recipient list response."""

    items: list[RecipientListResponse]
    total: int


# --- Global unread ---


class ConferenceUnreadCount(BaseModel):
    """Unread count for a single conference."""

    conference_id: UUID
    conference_name: str
    unread_count: int


class GlobalUnreadCountResponse(BaseModel):
    """Unread thread count across all conferences."""

    total_unread_count: int
    conferences: list[ConferenceUnreadCount] = []


# --- Internal Notes ---


class InternalNoteCreate(BaseModel):
    """Create an internal note on a thread."""

    body_html: str = Field(..., min_length=1)
