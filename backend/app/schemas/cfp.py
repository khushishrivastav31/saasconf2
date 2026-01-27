"""Call for Papers schemas."""

from datetime import datetime
from uuid import UUID
from enum import Enum

from pydantic import BaseModel, EmailStr, Field


class CFPStatus(str, Enum):
    """Call for Papers status enum."""

    DRAFT = "draft"
    OPEN = "open"
    CLOSED = "closed"
    REVIEW = "review"
    COMPLETED = "completed"


class SubmissionStatus(str, Enum):
    """Submission status enum."""

    SUBMITTED = "submitted"
    UNDER_REVIEW = "under_review"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    WAITLISTED = "waitlisted"
    WITHDRAWN = "withdrawn"


# Call for Papers Schemas

class CFPBase(BaseModel):
    """Base CFP schema."""

    title: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    open_date: datetime | None = None
    close_date: datetime | None = None
    max_submissions_per_speaker: int | None = None
    require_abstract: bool = True
    require_bio: bool = True
    allowed_formats: list[str] = Field(default_factory=list)
    tracks: list[str] = Field(default_factory=list)
    custom_fields: dict = Field(default_factory=dict)


class CFPCreate(CFPBase):
    """Schema for creating a CFP."""

    conference_id: UUID


class CFPUpdate(BaseModel):
    """Schema for updating a CFP."""

    title: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    status: CFPStatus | None = None
    open_date: datetime | None = None
    close_date: datetime | None = None
    max_submissions_per_speaker: int | None = None
    require_abstract: bool | None = None
    require_bio: bool | None = None
    allowed_formats: list[str] | None = None
    tracks: list[str] | None = None
    custom_fields: dict | None = None
    settings: dict | None = None


class CFPResponse(BaseModel):
    """CFP response schema."""

    id: UUID
    tenant_id: UUID
    title: str
    description: str | None
    status: str
    open_date: datetime | None
    close_date: datetime | None
    max_submissions_per_speaker: int | None
    require_abstract: bool
    require_bio: bool
    allowed_formats: list
    tracks: list
    custom_fields: dict
    settings: dict
    submission_count: int = 0
    created_at: datetime
    updated_at: datetime
    conference_ids: list[UUID] = []

    class Config:
        from_attributes = True


class CFPListResponse(BaseModel):
    """Paginated CFP list response."""

    items: list[CFPResponse]
    total: int
    page: int
    page_size: int
    pages: int


class CFPStats(BaseModel):
    """CFP statistics."""

    total: int
    draft: int
    open: int
    closed: int
    review: int
    completed: int
    total_submissions: int


# Submission Schemas

class SubmissionBase(BaseModel):
    """Base submission schema."""

    speaker_email: EmailStr
    speaker_name: str = Field(..., min_length=1, max_length=255)
    speaker_bio: str | None = None
    speaker_company: str | None = Field(None, max_length=255)
    speaker_title: str | None = Field(None, max_length=255)
    title: str = Field(..., min_length=1, max_length=500)
    abstract: str | None = None
    description: str | None = None
    format: str | None = Field(None, max_length=50)
    track: str | None = Field(None, max_length=100)
    level: str | None = Field(None, max_length=50)
    duration: int | None = None
    language: str | None = Field(None, max_length=10)
    tags: list[str] = Field(default_factory=list)
    custom_answers: dict = Field(default_factory=dict)


class SubmissionCreate(SubmissionBase):
    """Schema for creating a submission."""

    cfp_id: UUID


class SubmissionUpdate(BaseModel):
    """Schema for updating a submission."""

    speaker_name: str | None = Field(None, min_length=1, max_length=255)
    speaker_bio: str | None = None
    speaker_company: str | None = Field(None, max_length=255)
    speaker_title: str | None = Field(None, max_length=255)
    title: str | None = Field(None, min_length=1, max_length=500)
    abstract: str | None = None
    description: str | None = None
    format: str | None = Field(None, max_length=50)
    track: str | None = Field(None, max_length=100)
    level: str | None = Field(None, max_length=50)
    duration: int | None = None
    language: str | None = Field(None, max_length=10)
    tags: list[str] | None = None
    custom_answers: dict | None = None
    status: SubmissionStatus | None = None
    review_notes: str | None = None
    review_score: float | None = None


class SubmissionResponse(BaseModel):
    """Submission response schema."""

    id: UUID
    tenant_id: UUID
    cfp_id: UUID
    speaker_email: str
    speaker_name: str
    speaker_bio: str | None
    speaker_company: str | None
    speaker_title: str | None
    title: str
    abstract: str | None
    description: str | None
    format: str | None
    track: str | None
    level: str | None
    duration: int | None
    language: str | None
    tags: list
    custom_answers: dict
    status: str
    review_notes: str | None
    review_score: float | None
    submitted_at: datetime
    reviewed_at: datetime | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SubmissionListResponse(BaseModel):
    """Paginated submission list response."""

    items: list[SubmissionResponse]
    total: int
    page: int
    page_size: int
    pages: int


class SubmissionStats(BaseModel):
    """Submission statistics for a CFP."""

    total: int
    submitted: int
    under_review: int
    accepted: int
    rejected: int
    waitlisted: int
    withdrawn: int
