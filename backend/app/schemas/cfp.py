"""Call for Papers schemas."""

from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from app.core.html_sanitize import sanitize_html
from app.core.validators import validate_phone

# Valid values for the configurable required-field arrays
VALID_SPEAKER_FIELDS = {"bio", "picture", "video", "phone", "title", "company"}
VALID_PAPER_FIELDS = {
    "abstract_short", "abstract_long", "level",
    "learning_objectives", "importance", "session_type", "topics", "video",
}


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
    notification_date: datetime | None = None
    program_announcement_date: datetime | None = None
    max_submissions_per_speaker: int | None = None
    required_speaker_fields: list[str] = Field(default_factory=list)
    required_paper_fields: list[str] = Field(default_factory=list)
    allowed_formats: list[str] = Field(default_factory=list)
    tracks: list[str] = Field(default_factory=list)
    custom_fields: dict = Field(default_factory=dict)
    is_anonymous_review: bool = False
    reviewers_per_paper: int = Field(ge=1, le=10, default=3)

    @field_validator("required_speaker_fields")
    @classmethod
    def validate_speaker_fields(cls, v: list[str]) -> list[str]:
        invalid = set(v) - VALID_SPEAKER_FIELDS
        if invalid:
            raise ValueError(f"Invalid speaker fields: {', '.join(sorted(invalid))}")
        return v

    @field_validator("required_paper_fields")
    @classmethod
    def validate_paper_fields(cls, v: list[str]) -> list[str]:
        invalid = set(v) - VALID_PAPER_FIELDS
        if invalid:
            raise ValueError(f"Invalid paper fields: {', '.join(sorted(invalid))}")
        return v

    code_of_conduct: str | None = None
    incentives_conditions: str | None = None
    tips_for_submission: str | None = None
    guidelines_for_submissions: str | None = None
    faqs: str | None = None

    @field_validator(
        "code_of_conduct", "incentives_conditions", "tips_for_submission",
        "guidelines_for_submissions", "faqs",
    )
    @classmethod
    def sanitize_rich_text(cls, v: str | None) -> str | None:
        return sanitize_html(v) if v else v


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
    notification_date: datetime | None = None
    program_announcement_date: datetime | None = None
    max_submissions_per_speaker: int | None = None
    required_speaker_fields: list[str] | None = None
    required_paper_fields: list[str] | None = None
    allowed_formats: list[str] | None = None
    tracks: list[str] | None = None
    custom_fields: dict | None = None
    is_anonymous_review: bool | None = None
    reviewers_per_paper: int | None = Field(None, ge=1, le=10)

    @field_validator("required_speaker_fields")
    @classmethod
    def validate_speaker_fields(cls, v: list[str] | None) -> list[str] | None:
        if v is not None:
            invalid = set(v) - VALID_SPEAKER_FIELDS
            if invalid:
                raise ValueError(f"Invalid speaker fields: {', '.join(sorted(invalid))}")
        return v

    @field_validator("required_paper_fields")
    @classmethod
    def validate_paper_fields(cls, v: list[str] | None) -> list[str] | None:
        if v is not None:
            invalid = set(v) - VALID_PAPER_FIELDS
            if invalid:
                raise ValueError(f"Invalid paper fields: {', '.join(sorted(invalid))}")
        return v

    settings: dict | None = None
    code_of_conduct: str | None = None
    incentives_conditions: str | None = None
    tips_for_submission: str | None = None
    guidelines_for_submissions: str | None = None
    faqs: str | None = None

    @field_validator(
        "code_of_conduct", "incentives_conditions", "tips_for_submission",
        "guidelines_for_submissions", "faqs",
    )
    @classmethod
    def sanitize_rich_text(cls, v: str | None) -> str | None:
        return sanitize_html(v) if v else v


class CFPResponse(BaseModel):
    """CFP response schema."""

    id: UUID
    tenant_id: UUID
    title: str
    description: str | None
    status: str
    open_date: datetime | None
    close_date: datetime | None
    notification_date: datetime | None = None
    program_announcement_date: datetime | None = None
    max_submissions_per_speaker: int | None
    required_speaker_fields: list[str]
    required_paper_fields: list[str]
    allowed_formats: list
    tracks: list
    custom_fields: dict
    is_anonymous_review: bool
    reviewers_per_paper: int
    settings: dict
    code_of_conduct: str | None = None
    incentives_conditions: str | None = None
    tips_for_submission: str | None = None
    guidelines_for_submissions: str | None = None
    faqs: str | None = None
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
    speaker_first_name: str = Field(..., min_length=1, max_length=255)
    speaker_last_name: str = Field(default="", max_length=255)
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

    speaker_first_name: str | None = Field(None, min_length=1, max_length=255)
    speaker_last_name: str | None = Field(None, max_length=255)
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
    speaker_first_name: str
    speaker_last_name: str
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


# Topic Schemas

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

    id: UUID
    tenant_id: UUID
    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TopicListResponse(BaseModel):
    """Topic list response."""

    items: list[TopicResponse]
    total: int


# Committee Member Schemas


class CommitteeMemberCreate(BaseModel):
    """Schema for creating a committee member.

    Either provide applicant_id to link an existing user,
    or provide name/email/password to create a new user first.
    """

    # Conference scope (required)
    conference_id: UUID

    # Mode 1: link existing user
    applicant_id: UUID | None = None

    # Mode 2: create new user (required when applicant_id is None)
    first_name: str | None = Field(None, min_length=1, max_length=255)
    last_name: str | None = Field(None, max_length=255)
    email: EmailStr | None = None
    phone: str | None = Field(None, max_length=50)
    password: str | None = Field(None, min_length=6)

    # Always available
    role: str = "Reviewer"
    expertise_areas: list[str] = Field(default_factory=list)
    topic_ids: list[UUID] = Field(default_factory=list)

    @field_validator("phone")
    @classmethod
    def check_phone(cls, v: str | None) -> str | None:
        return validate_phone(v)

    @model_validator(mode="after")
    def check_applicant_or_new_user(self) -> "CommitteeMemberCreate":
        if self.applicant_id is None:
            if not self.first_name or not self.email or not self.password:
                raise ValueError(
                    "When applicant_id is not provided, first_name, email, and password are required"
                )
        return self


class CommitteeMemberUpdate(BaseModel):
    """Schema for updating a committee member (committee-specific fields only)."""

    role: str | None = None
    expertise_areas: list[str] | None = None
    topic_ids: list[UUID] | None = None


class CommitteeMemberResponse(BaseModel):
    """Committee member response schema."""

    id: UUID
    tenant_id: UUID
    conference_id: UUID
    applicant_id: UUID
    role: str
    expertise_areas: list[str] = Field(default_factory=list)
    # Flattened from applicant
    first_name: str
    last_name: str
    email: str
    phone: str | None = None
    title: str | None = None
    company: str | None = None
    picture_url: str | None = None
    # Committee-specific
    topics: list[TopicResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CommitteeMemberListResponse(BaseModel):
    """Committee member list response."""

    items: list[CommitteeMemberResponse]
    total: int


# Applicant Schemas

class ApplicantSocialLinks(BaseModel):
    """Schema for applicant social media links."""

    linkedin: str | None = None
    bluesky: str | None = None
    mastodon: str | None = None
    twitter: str | None = None
    instagram: str | None = None
    facebook: str | None = None
    youtube: str | None = None
    tiktok: str | None = None
    github: str | None = None
    website: str | None = None


class ApplicantCreate(BaseModel):
    """Schema for creating an applicant."""

    first_name: str = Field(..., min_length=1, max_length=255)
    last_name: str = Field(default="", max_length=255)
    pronouns: str | None = Field(None, max_length=100)
    email: EmailStr
    phone: str | None = Field(None, max_length=50)
    title: str | None = Field(None, max_length=255)
    company: str | None = Field(None, max_length=255)
    bio: str | None = None
    password: str = Field(..., min_length=6)
    allow_out_of_timeframe: bool = False
    social_links: ApplicantSocialLinks | None = None
    needs_accessibility: bool = False
    accessibility_details: str | None = None
    agrees_to_recording: bool = False

    @field_validator("phone")
    @classmethod
    def check_phone(cls, v: str | None) -> str | None:
        return validate_phone(v)


class ApplicantUpdate(BaseModel):
    """Schema for updating an applicant."""

    first_name: str | None = Field(None, min_length=1, max_length=255)
    last_name: str | None = Field(None, max_length=255)
    pronouns: str | None = Field(None, max_length=100)
    email: EmailStr | None = None
    phone: str | None = Field(None, max_length=50)
    title: str | None = Field(None, max_length=255)
    company: str | None = Field(None, max_length=255)
    bio: str | None = None
    password: str | None = Field(None, min_length=6)
    allow_out_of_timeframe: bool | None = None
    social_links: ApplicantSocialLinks | None = None
    needs_accessibility: bool | None = None
    accessibility_details: str | None = None
    agrees_to_recording: bool | None = None

    @field_validator("phone")
    @classmethod
    def check_phone(cls, v: str | None) -> str | None:
        return validate_phone(v)


class ApplicantResponse(BaseModel):
    """Applicant response schema."""

    id: UUID
    tenant_id: UUID
    first_name: str
    last_name: str
    pronouns: str | None = None
    email: str
    phone: str | None
    title: str | None
    company: str | None
    bio: str | None
    allow_out_of_timeframe: bool
    social_links: dict = {}
    needs_accessibility: bool = False
    accessibility_details: str | None = None
    agrees_to_recording: bool = False
    picture_url: str | None = None
    video_url: str | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ApplicantListResponse(BaseModel):
    """Applicant list response."""

    items: list[ApplicantResponse]
    total: int


# Paper Schemas

class PaperStatus(str, Enum):
    """Paper submission status enum."""

    DRAFT = "draft"
    SUBMITTED = "submitted"
    IN_EVALUATION = "in_evaluation"
    EVALUATED = "evaluated"
    FINAL_CONSIDERATION = "final_consideration"
    REJECTED = "rejected"
    ACCEPTED = "accepted"


class PaperLevel(str, Enum):
    """Paper difficulty level enum."""

    BEGINNER = "beginner"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"
    ALL_LEVELS = "all_levels"


class CospeakerInvitationStatus(str, Enum):
    """Co-speaker invitation status enum."""

    PENDING = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"


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


class PaperCommentResponse(BaseModel):
    """Paper comment response schema."""

    id: UUID
    committee_member_id: UUID | None
    committee_member_first_name: str | None = None
    committee_member_last_name: str | None = None
    committee_member_role: str | None = None
    content: str
    created_at: datetime

    class Config:
        from_attributes = True


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

    class Config:
        from_attributes = True


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


# Paper Assignment Schemas


class PaperAssignmentCreate(BaseModel):
    """Schema for manually assigning a paper to a committee member."""

    paper_id: UUID
    committee_member_id: UUID
    is_anonymous: bool = False


class PaperAssignmentResponse(BaseModel):
    """Paper assignment response schema."""

    id: UUID
    paper_id: UUID
    paper_title: str
    committee_member_id: UUID
    committee_member_first_name: str
    committee_member_last_name: str
    is_anonymous: bool
    assigned_at: datetime

    class Config:
        from_attributes = True


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
