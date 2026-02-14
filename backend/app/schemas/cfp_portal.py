"""Schemas for the CFP applicant portal."""

import re
from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator

# --- Auth Schemas ---

class ApplicantRegisterRequest(BaseModel):
    """Registration request."""

    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    first_name: str = Field(..., min_length=1, max_length=255)
    last_name: str = Field(default="", max_length=255)

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one digit")
        return v


class ApplicantLoginRequest(BaseModel):
    """Login request."""

    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)


class ApplicantTokenResponse(BaseModel):
    """Token response for applicant auth."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class ApplicantRefreshRequest(BaseModel):
    """Refresh token request."""

    refresh_token: str


class VerifyEmailRequest(BaseModel):
    """Email verification request."""

    token: str


class ForgotPasswordRequest(BaseModel):
    """Forgot password request — send a reset link."""

    email: EmailStr


class ResetPasswordRequest(BaseModel):
    """Reset password with token."""

    token: str
    new_password: str = Field(..., min_length=6)


# --- Profile Schemas ---

class ApplicantProfileResponse(BaseModel):
    """Applicant profile response."""

    id: UUID
    email: str
    first_name: str
    last_name: str
    pronouns: str | None = None
    phone: str | None = None
    title: str | None = None
    company: str | None = None
    bio: str | None = None
    social_links: dict = {}
    needs_accessibility: bool = False
    accessibility_details: str | None = None
    agrees_to_recording: bool = False
    message_notifications_enabled: bool = True
    picture_url: str | None = None
    video_url: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class ApplicantProfileUpdate(BaseModel):
    """Applicant profile update."""

    first_name: str | None = Field(None, min_length=1, max_length=255)
    last_name: str | None = Field(None, max_length=255)
    pronouns: str | None = Field(None, max_length=100)
    phone: str | None = Field(None, max_length=50)
    title: str | None = Field(None, max_length=255)
    company: str | None = Field(None, max_length=255)
    bio: str | None = None
    social_links: dict | None = None
    needs_accessibility: bool | None = None
    accessibility_details: str | None = None
    agrees_to_recording: bool | None = None
    message_notifications_enabled: bool | None = None


# --- Conference / CFP Schemas ---

class PortalCFPResponse(BaseModel):
    """CFP info for the portal."""

    id: UUID
    title: str
    description: str | None = None
    status: str
    open_date: datetime | None = None
    close_date: datetime | None = None
    required_speaker_fields: list[str] = []
    required_paper_fields: list[str] = []
    guidelines_for_submissions: str | None = None
    tips_for_submission: str | None = None
    code_of_conduct: str | None = None
    incentives_conditions: str | None = None
    faqs: str | None = None

    class Config:
        from_attributes = True


class PortalSessionTypeResponse(BaseModel):
    """Session type info for the portal."""

    id: UUID
    name: str
    duration_minutes: int

    class Config:
        from_attributes = True


class PortalConferenceSummary(BaseModel):
    """Conference summary for listing."""

    id: UUID
    name: str
    abbreviation: str | None = None
    description: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    city: str | None = None
    country: str | None = None
    venue_type: str = "onsite"
    logo_url: str | None = None
    cfps: list[PortalCFPResponse] = []


class PortalTenantResponse(BaseModel):
    """Basic tenant info for the portal login page."""

    id: UUID
    name: str
    slug: str
    logo_url: str | None = None


class PortalLandingResponse(BaseModel):
    """Landing page data for a specific conference."""

    conference: PortalConferenceSummary
    tenant_name: str


class PortalConferenceDetailResponse(BaseModel):
    """Conference detail with session types for paper submission."""

    id: UUID
    name: str
    abbreviation: str | None = None
    cfps: list[PortalCFPResponse] = []
    session_types: list[PortalSessionTypeResponse] = []


# --- Paper Schemas ---

class PortalCospeakerResponse(BaseModel):
    """Co-speaker info in portal paper response."""

    applicant_id: UUID
    first_name: str
    last_name: str
    email: str
    invitation_status: str
    invited_at: datetime | None = None
    responded_at: datetime | None = None


class PortalPaperResponse(BaseModel):
    """Paper response for the portal."""

    id: UUID
    cfp_id: UUID
    cfp_title: str | None = None
    conference_id: UUID | None = None
    conference_name: str | None = None
    session_type_id: UUID | None = None
    session_type_name: str | None = None
    title: str
    abstract_short: str | None = None
    abstract_long: str | None = None
    level: str | None = None
    learning_objectives: str | None = None
    importance: str | None = None
    custom_field_answers: dict | None = None
    status: str
    video_url: str | None = None
    is_main_speaker: bool = True
    main_speaker_first_name: str | None = None
    main_speaker_last_name: str | None = None
    cospeakers: list[PortalCospeakerResponse] = []
    submitted_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class PortalPaperListResponse(BaseModel):
    """List of papers."""

    items: list[PortalPaperResponse]
    total: int


class PortalPaperCreateRequest(BaseModel):
    """Create a new paper."""

    cfp_id: UUID
    session_type_id: UUID | None = None
    title: str = Field(..., min_length=1, max_length=500)
    abstract_short: str | None = None
    abstract_long: str | None = None
    level: str | None = None
    learning_objectives: str | None = None
    importance: str | None = None
    custom_field_answers: dict | None = None
    cospeaker_emails: list[EmailStr] = Field(default_factory=list, max_length=3)


class PortalPaperUpdateRequest(BaseModel):
    """Update an existing paper (draft only)."""

    session_type_id: UUID | None = None
    title: str | None = Field(None, min_length=1, max_length=500)
    abstract_short: str | None = None
    abstract_long: str | None = None
    level: str | None = None
    learning_objectives: str | None = None
    importance: str | None = None
    custom_field_answers: dict | None = None
    cospeaker_emails: list[EmailStr] | None = Field(None, max_length=3)


# --- Invitation Schemas ---

class PortalInvitationResponse(BaseModel):
    """A pending co-speaker invitation."""

    paper_id: UUID
    paper_title: str
    cfp_title: str | None = None
    conference_name: str | None = None
    main_speaker_first_name: str
    main_speaker_last_name: str
    main_speaker_email: str
    invitation_status: str
    invited_at: datetime | None = None


class PortalInvitationListResponse(BaseModel):
    """List of invitations."""

    items: list[PortalInvitationResponse]
    total: int


# --- Committee Membership Schemas ---

class PortalTopicResponse(BaseModel):
    """Topic info for committee membership."""

    id: UUID
    name: str
    description: str | None = None


class PortalCommitteeMembershipResponse(BaseModel):
    """A committee membership as seen by the applicant."""

    id: UUID
    conference_id: UUID
    conference_name: str
    role: str
    topics: list[PortalTopicResponse] = []
    created_at: datetime


class PortalCommitteeMembershipListResponse(BaseModel):
    """List of committee memberships."""

    items: list[PortalCommitteeMembershipResponse]
    total: int


class PortalCommitteeMembershipUpdate(BaseModel):
    """Update committee membership (self-service)."""

    topic_ids: list[UUID] | None = None


# --- Assigned Paper Schemas (for committee member portal) ---


class PortalAssignedPaperResponse(BaseModel):
    """A paper assigned to the current committee member for review."""

    id: UUID
    assignment_id: UUID
    is_anonymous: bool
    assigned_at: datetime
    conference_id: UUID | None = None
    conference_name: str | None = None
    cfp_id: UUID
    cfp_title: str | None = None
    title: str
    abstract_short: str | None = None
    abstract_long: str | None = None
    level: str | None = None
    learning_objectives: str | None = None
    importance: str | None = None
    status: str
    session_type_name: str | None = None
    topics: list[PortalTopicResponse] = []
    video_url: str | None = None
    main_speaker_first_name: str | None = None
    main_speaker_last_name: str | None = None
    cospeakers: list[PortalCospeakerResponse] = []
    review_status: str | None = None  # null | "draft" | "submitted"


class PortalAssignedPaperListResponse(BaseModel):
    """List of assigned papers."""

    items: list[PortalAssignedPaperResponse]
    total: int


# --- Review Config Schemas (for reviewer form) ---


class PortalReviewScaleOptionResponse(BaseModel):
    """Scale option for review form."""

    id: UUID
    label: str
    numeric_value: float | None = None
    is_unsure: bool = False
    display_order: int = 0


class PortalReviewScaleResponse(BaseModel):
    """Score scale for review form."""

    id: UUID
    name: str
    scale_type: str
    options: list[PortalReviewScaleOptionResponse] = []


class PortalReviewQuestionResponse(BaseModel):
    """Review question for reviewer form."""

    id: UUID
    text: str
    help_text: str | None = None
    question_type: str
    weight: float = 1.0
    comment_requirement: str = "optional"
    low_score_threshold: float | None = None
    count_in_score: bool = True
    display_order: int = 0
    scale: PortalReviewScaleResponse | None = None


class PortalReviewCriterionResponse(BaseModel):
    """Review criterion for reviewer form."""

    id: UUID
    title: str
    description: str | None = None
    display_order: int = 0
    questions: list[PortalReviewQuestionResponse] = []


class PortalReviewAnswerResponse(BaseModel):
    """Existing answer in a review."""

    question_id: UUID
    selected_option_id: UUID | None = None
    comment: str | None = None


class PortalExistingReviewResponse(BaseModel):
    """Existing review for pre-filling the form."""

    id: UUID
    status: str
    total_score: float | None = None
    speaker_feedback: str | None = None
    internal_comment: str | None = None
    answers: list[PortalReviewAnswerResponse] = []
    submitted_at: datetime | None = None


class PortalReviewFormSettingsResponse(BaseModel):
    """Review form settings flags for the reviewer form."""

    enable_speaker_feedback: bool = True
    enable_internal_comment: bool = True


class PortalReviewConfigResponse(BaseModel):
    """Full review configuration for a reviewer to render the form."""

    criteria: list[PortalReviewCriterionResponse] = []
    existing_review: PortalExistingReviewResponse | None = None
    form_settings: PortalReviewFormSettingsResponse = PortalReviewFormSettingsResponse()


# --- Speaker Feedback Schemas ---


class PortalSpeakerFeedbackResponse(BaseModel):
    """Anonymous feedback from one reviewer shown to speaker."""

    speaker_feedback: str
    total_score: float | None = None


class PortalSpeakerFeedbackListResponse(BaseModel):
    """List of anonymous reviewer feedback."""

    items: list[PortalSpeakerFeedbackResponse]
    total: int
