"""Program design schemas."""

from datetime import date as date_type
from datetime import datetime, time as time_type
from uuid import UUID

from pydantic import BaseModel, Field


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

    id: UUID
    tenant_id: UUID
    conference_id: UUID
    date: date_type
    name: str | None = None
    sort_order: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


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

    id: UUID
    tenant_id: UUID
    program_day_id: UUID
    start_time: time_type
    end_time: time_type
    sort_order: int
    is_session_free: bool = False
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


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

    class Config:
        from_attributes = True


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
    color: str | None = None
    paper_id: UUID | None = None
    paper_title: str | None = None
    speaker_name: str | None = None
    notes: str | None = None
    settings: dict = {}
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


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
