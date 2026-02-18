"""CFP paper, topic, cospeaker, and assignment schemas."""

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.cfp_applicants import ApplicantResponse

# --- Topic Schemas ---


class TopicCreate(BaseModel):
    """Schema for creating a topic."""

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None


class TopicUpdate(BaseModel):
    """Schema for updating a topic."""

    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None


class TopicResponse(BaseModel):
    """Topic response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime


class TopicListResponse(BaseModel):
    """Topic list response."""

    items: list[TopicResponse]
    total: int


# --- Paper Enums ---


class PaperStatus(StrEnum):
    """Paper submission status enum."""

    DRAFT = "draft"
    SUBMITTED = "submitted"
    IN_EVALUATION = "in_evaluation"
    EVALUATED = "evaluated"
    FINAL_CONSIDERATION = "final_consideration"
    REJECTED = "rejected"
    ACCEPTED = "accepted"


class PaperLevel(StrEnum):
    """Paper difficulty level enum."""

    BEGINNER = "beginner"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"
    ALL_LEVELS = "all_levels"


class CospeakerInvitationStatus(StrEnum):
    """Co-speaker invitation status enum."""

    PENDING = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"


# --- Cospeaker Schemas ---


class CospeakerResponse(BaseModel):
    """Co-speaker with invitation status."""

    applicant: ApplicantResponse
    invitation_status: str
    invited_at: datetime | None = None
    responded_at: datetime | None = None


class CospeakerInvitationResponse(BaseModel):
    """A pending co-speaker invitation for an applicant."""

    paper_id: UUID
    paper_title: str
    cfp_title: str | None = None
    main_speaker_first_name: str | None = None
    main_speaker_last_name: str | None = None
    invitation_status: str
    invited_at: datetime | None = None


class CospeakerInvitationListResponse(BaseModel):
    """List of co-speaker invitations."""

    items: list[CospeakerInvitationResponse]
    total: int


# --- Paper Comment Schema ---


class PaperCommentResponse(BaseModel):
    """Paper comment response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    committee_member_id: UUID | None
    committee_member_first_name: str | None = None
    committee_member_last_name: str | None = None
    committee_member_role: str | None = None
    content: str
    created_at: datetime


# --- Paper Schemas ---


class PaperCreate(BaseModel):
    """Schema for creating a paper."""

    cfp_id: UUID
    main_speaker_id: UUID
    co_speaker_ids: list[UUID] = Field(default_factory=list)
    session_type_id: UUID | None = None
    topic_ids: list[UUID] = Field(default_factory=list)
    title: str = Field(..., min_length=1, max_length=500)
    abstract_short: str | None = None
    abstract_long: str | None = None
    level: PaperLevel | None = None
    learning_objectives: str | None = None
    importance: str | None = None
    custom_field_answers: dict | None = None

    @field_validator("co_speaker_ids")
    @classmethod
    def check_max_cospeakers(cls, v: list[UUID]) -> list[UUID]:
        if len(v) > 3:
            raise ValueError("Maximum 3 co-speakers allowed")
        return v


class PaperUpdate(BaseModel):
    """Schema for updating a paper."""

    main_speaker_id: UUID | None = None
    co_speaker_ids: list[UUID] | None = None
    session_type_id: UUID | None = None
    topic_ids: list[UUID] | None = None
    title: str | None = Field(None, min_length=1, max_length=500)
    abstract_short: str | None = None
    abstract_long: str | None = None
    level: PaperLevel | None = None
    learning_objectives: str | None = None
    importance: str | None = None
    custom_field_answers: dict | None = None
    status: PaperStatus | None = None

    @field_validator("co_speaker_ids")
    @classmethod
    def check_max_cospeakers(cls, v: list[UUID] | None) -> list[UUID] | None:
        if v is not None and len(v) > 3:
            raise ValueError("Maximum 3 co-speakers allowed")
        return v


class PaperReviewSummary(BaseModel):
    """Lightweight review summary for paper cards."""

    reviewer_first_name: str | None = None
    reviewer_last_name: str | None = None
    total_score: float | None = None
    internal_comment: str | None = None
    must_have: bool = False


class PaperResponse(BaseModel):
    """Paper response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    cfp_id: UUID
    cfp_title: str | None = None
    cfp_status: str | None = None
    conference_name: str | None = None
    main_speaker_id: UUID
    main_speaker: ApplicantResponse | None = None
    cospeakers: list[CospeakerResponse] = Field(default_factory=list)
    session_type_id: UUID | None
    session_type_name: str | None = None
    session_type_duration: int | None = None
    topics: list[TopicResponse] = Field(default_factory=list)
    title: str
    abstract_short: str | None
    abstract_long: str | None
    level: str | None
    learning_objectives: str | None
    importance: str | None
    custom_field_answers: dict | None = None
    status: str
    display_status: str | None = None
    video_url: str | None = None
    comments: list[PaperCommentResponse] = Field(default_factory=list)
    must_have_count: int = 0
    max_review_score: float | None = None
    review_summaries: list[PaperReviewSummary] = Field(default_factory=list)
    submitted_at: datetime | None
    created_at: datetime
    updated_at: datetime


class PaperListResponse(BaseModel):
    """Paper list response."""

    items: list[PaperResponse]
    total: int


class PaperStats(BaseModel):
    """Paper statistics."""

    total: int
    draft: int
    submitted: int
    in_evaluation: int
    evaluated: int
    rejected: int
    accepted: int


# --- Paper Assignment Schemas ---


class PaperAssignmentCreate(BaseModel):
    """Schema for manually assigning a paper to a committee member."""

    paper_id: UUID
    committee_member_id: UUID
    is_anonymous: bool = False


class PaperAssignmentResponse(BaseModel):
    """Paper assignment response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    paper_id: UUID
    paper_title: str
    committee_member_id: UUID
    committee_member_first_name: str
    committee_member_last_name: str
    is_anonymous: bool
    assigned_at: datetime


class PaperAssignmentListResponse(BaseModel):
    """List of paper assignments."""

    items: list[PaperAssignmentResponse]
    total: int


class AutoAssignRequest(BaseModel):
    """Schema for auto-assign configuration."""

    conference_id: UUID
    reviewers_per_paper: int = Field(ge=1, le=10, default=3)
    is_anonymous: bool = False
    only_submitted: bool = True


class AutoAssignResponse(BaseModel):
    """Response from auto-assign operation."""

    assignments_created: int
    papers_processed: int
    papers_skipped: int
    skipped_details: list[str] = Field(default_factory=list)
