"""Program design schemas."""

from datetime import date as date_type
from datetime import datetime, time as time_type
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# ============================================================================
# Program Day Schemas
# ============================================================================


class ProgramDayCreate(BaseModel):
    """Schema for creating a program day."""

    date: date_type
    name: str | None = Field(None, max_length=100)
    sort_order: int = 0


class ProgramDayUpdate(BaseModel):
    """Schema for updating a program day."""

    date: date_type | None = None
    name: str | None = Field(None, max_length=100)
    sort_order: int | None = None


class ProgramDayResponse(BaseModel):
    """Program day response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    conference_id: UUID
    date: date_type
    name: str | None = None
    sort_order: int
    created_at: datetime
    updated_at: datetime


class ProgramDayListResponse(BaseModel):
    """List of program days."""

    items: list[ProgramDayResponse]
    total: int


# ============================================================================
# Program Time Slot Schemas
# ============================================================================


class ProgramTimeSlotCreate(BaseModel):
    """Schema for creating a time slot."""

    start_time: time_type
    end_time: time_type
    sort_order: int = 0
    is_session_free: bool = False  # Marks as break/lunch - no regular sessions allowed


class ProgramTimeSlotBatchCreate(BaseModel):
    """Schema for batch creating time slots."""

    start_time: time_type = Field(..., description="Start time for the first slot")
    end_time: time_type = Field(..., description="End time for the last slot")
    interval_minutes: int = Field(30, ge=5, le=180, description="Duration of each slot in minutes")


class ProgramTimeSlotUpdate(BaseModel):
    """Schema for updating a time slot."""

    start_time: time_type | None = None
    end_time: time_type | None = None
    sort_order: int | None = None
    is_session_free: bool | None = None


class ProgramTimeSlotResponse(BaseModel):
    """Time slot response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    program_day_id: UUID
    start_time: time_type
    end_time: time_type
    sort_order: int
    is_session_free: bool = False
    created_at: datetime
    updated_at: datetime


class ProgramTimeSlotListResponse(BaseModel):
    """List of time slots."""

    items: list[ProgramTimeSlotResponse]
    total: int


# ============================================================================
# Program Track Schemas
# ============================================================================


class ProgramTrackCreate(BaseModel):
    """Schema for creating a track."""

    program_day_id: UUID
    name: str = Field(..., min_length=1, max_length=100)
    color: str | None = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    location_id: UUID | None = None
    sort_order: int = 0
    is_active: bool = True


class ProgramTrackUpdate(BaseModel):
    """Schema for updating a track."""

    name: str | None = Field(None, min_length=1, max_length=100)
    color: str | None = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    location_id: UUID | None = None
    sort_order: int | None = None
    is_active: bool | None = None


class ProgramTrackReorder(BaseModel):
    """Schema for reordering tracks."""

    track_ids: list[UUID] = Field(..., min_length=1)


class ProgramTrackResponse(BaseModel):
    """Track response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    conference_id: UUID
    program_day_id: UUID | None = None
    name: str
    color: str | None = None
    location_id: UUID | None = None
    location_name: str | None = None
    sort_order: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


class ProgramTrackListResponse(BaseModel):
    """List of tracks."""

    items: list[ProgramTrackResponse]
    total: int


# ============================================================================
# Program Session Schemas
# ============================================================================


class ProgramSessionCreate(BaseModel):
    """Schema for creating a session."""

    start_slot_id: UUID
    start_track_id: UUID | None = None  # None = general event spanning all tracks
    slot_span: int = Field(1, ge=1, le=20)
    track_span: int = Field(1, ge=0, le=20)  # 0 = all tracks
    title: str = Field(..., min_length=1, max_length=500)
    description: str | None = None
    session_type_id: UUID | None = None
    is_general_event: bool = False
    allow_in_session_free: bool = False  # Override to allow in session-free slots
    color: str | None = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    paper_id: UUID | None = None
    notes: str | None = None
    settings: dict | None = None


class ProgramSessionUpdate(BaseModel):
    """Schema for updating a session."""

    start_slot_id: UUID | None = None
    start_track_id: UUID | None = None
    slot_span: int | None = Field(None, ge=1, le=20)
    track_span: int | None = Field(None, ge=0, le=20)
    title: str | None = Field(None, min_length=1, max_length=500)
    description: str | None = None
    session_type_id: UUID | None = None
    is_general_event: bool | None = None
    allow_in_session_free: bool | None = None
    color: str | None = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    paper_id: UUID | None = None
    notes: str | None = None
    settings: dict | None = None


class ProgramSessionMove(BaseModel):
    """Schema for moving a session to a different slot/track."""

    start_slot_id: UUID
    start_track_id: UUID | None = None


class ProgramSessionResponse(BaseModel):
    """Session response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    conference_id: UUID
    start_slot_id: UUID
    start_track_id: UUID | None = None
    slot_span: int
    track_span: int
    title: str
    description: str | None = None
    session_type_id: UUID | None = None
    session_type_name: str | None = None
    is_general_event: bool
    allow_in_session_free: bool = False
    separately_bookable: bool = False
    color: str | None = None
    paper_id: UUID | None = None
    paper_title: str | None = None
    speaker_name: str | None = None
    notes: str | None = None
    settings: dict = {}
    created_at: datetime
    updated_at: datetime


class ProgramSessionListResponse(BaseModel):
    """List of sessions."""

    items: list[ProgramSessionResponse]
    total: int


# ============================================================================
# Program Grid Schemas (Combined View)
# ============================================================================


class ProgramGridResponse(BaseModel):
    """Complete program grid for a day."""

    day: ProgramDayResponse
    slots: list[ProgramTimeSlotResponse]
    tracks: list[ProgramTrackResponse]
    sessions: list[ProgramSessionResponse]


class ProgramFullGridResponse(BaseModel):
    """Complete program grid for all days."""

    days: list[ProgramGridResponse]
    total_days: int


# ============================================================================
# Auto-generate Schemas
# ============================================================================


class ProgramDaysGenerateRequest(BaseModel):
    """Request to auto-generate days from conference dates."""

    include_pre_conference: bool = Field(False, description="Include day before start_date")
    include_post_conference: bool = Field(False, description="Include day after end_date")


class ProgramDaysGenerateResponse(BaseModel):
    """Response from auto-generating days."""

    created: list[ProgramDayResponse]
    skipped: int = Field(0, description="Days that already existed")


# ============================================================================
# Program Publication Schemas
# ============================================================================


class PaperPreviewItem(BaseModel):
    """Paper info for publish preview."""

    id: UUID
    title: str
    speaker_name: str


class ProgramPublishPreview(BaseModel):
    """Dry-run preview of what publishing will do."""

    papers_to_accept: int
    papers_to_reject: int
    speakers_to_notify: int
    already_published: bool
    accepted_papers: list[PaperPreviewItem]
    rejected_papers: list[PaperPreviewItem]


class ProgramPublishResponse(BaseModel):
    """Result of publishing or updating the program."""

    papers_accepted: int
    papers_rejected: int
    notifications_sent: int
    published_at: datetime


# ============================================================================
# Enriched Sessions Schemas
# ============================================================================


class CustomFieldMeta(BaseModel):
    """Metadata for a custom paper form field."""

    field_key: str
    label: str
    field_type: str


class EnrichedSessionResponse(BaseModel):
    """Session with full paper, speaker, and context data pre-resolved."""

    # Session fields
    id: UUID
    title: str
    description: str | None = None
    session_type_id: UUID | None = None
    session_type_name: str | None = None
    is_general_event: bool
    color: str | None = None
    notes: str | None = None
    # Paper data
    paper_id: UUID | None = None
    paper_title: str | None = None
    paper_abstract_short: str | None = None
    paper_level: str | None = None
    paper_learning_objectives: str | None = None
    paper_importance: str | None = None
    paper_status: str | None = None
    paper_custom_field_answers: dict[str, Any] | None = None
    # Speaker data
    speaker_name: str | None = None
    speaker_email: str | None = None
    speaker_company: str | None = None
    # Co-speakers
    cospeakers: str | None = None
    # Resolved context
    day_id: UUID | None = None
    day_name: str | None = None
    day_date: date_type | None = None
    start_time: time_type | None = None
    end_time: time_type | None = None
    track_name: str | None = None


class EnrichedSessionsResponse(BaseModel):
    """Enriched session list with custom field metadata."""

    items: list[EnrichedSessionResponse]
    total: int
    custom_fields: list[CustomFieldMeta]
