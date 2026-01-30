from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

# --- Score Scale Option ---

class ReviewScaleOptionCreate(BaseModel):
    label: str = Field(..., min_length=1, max_length=100)
    numeric_value: float | None = None
    is_unsure: bool = False
    display_order: int = 0


class ReviewScaleOptionResponse(BaseModel):
    id: UUID
    scale_id: UUID | None = None
    label: str
    numeric_value: float | None
    is_unsure: bool
    display_order: int
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True


# --- Score Scale ---

class ReviewScoreScaleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    scale_type: Literal["numeric_range", "custom", "binary"]
    is_active: bool = True
    options: list[ReviewScaleOptionCreate] = []


class ReviewScoreScaleUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    scale_type: Literal["numeric_range", "custom", "binary"] | None = None
    is_active: bool | None = None
    options: list[ReviewScaleOptionCreate] | None = None


class ReviewScoreScaleResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    conference_id: UUID
    name: str
    scale_type: str
    is_active: bool
    options: list[ReviewScaleOptionResponse]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ReviewScoreScaleListResponse(BaseModel):
    items: list[ReviewScoreScaleResponse]
    total: int


# --- Review Question ---

class ReviewQuestionCreate(BaseModel):
    text: str = Field(..., min_length=1)
    help_text: str | None = None
    question_type: Literal["scored", "non_scored"] = "scored"
    score_scale_id: UUID | None = None
    weight: float = 1.0
    comment_requirement: Literal["optional", "required", "required_if_low_score"] = "optional"
    low_score_threshold: float | None = None
    show_to_reviewers: bool = True
    count_in_score: bool = True
    display_order: int = 0
    is_active: bool = True


class ReviewQuestionUpdate(BaseModel):
    text: str | None = Field(None, min_length=1)
    help_text: str | None = None
    question_type: Literal["scored", "non_scored"] | None = None
    score_scale_id: UUID | None = None
    weight: float | None = None
    comment_requirement: Literal["optional", "required", "required_if_low_score"] | None = None
    low_score_threshold: float | None = None
    show_to_reviewers: bool | None = None
    count_in_score: bool | None = None
    display_order: int | None = None
    is_active: bool | None = None


class ReviewQuestionResponse(BaseModel):
    id: UUID
    criterion_id: UUID
    tenant_id: UUID | None = None
    conference_id: UUID | None = None
    text: str
    help_text: str | None
    question_type: str
    score_scale_id: UUID | None
    score_scale: ReviewScoreScaleResponse | None = None
    weight: float
    comment_requirement: str
    low_score_threshold: float | None
    show_to_reviewers: bool
    count_in_score: bool
    display_order: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ReviewQuestionListResponse(BaseModel):
    items: list[ReviewQuestionResponse]
    total: int


# --- Review Criterion ---

class ReviewCriterionCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    display_order: int = 0
    is_active: bool = True


class ReviewCriterionUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    display_order: int | None = None
    is_active: bool | None = None


class ReviewCriterionResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    conference_id: UUID
    title: str
    description: str | None
    display_order: int
    is_active: bool
    questions: list[ReviewQuestionResponse] = []
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ReviewCriterionListResponse(BaseModel):
    items: list[ReviewCriterionResponse]
    total: int


# --- Review Answer (for submission/response) ---

class ReviewAnswerSubmit(BaseModel):
    question_id: UUID
    selected_option_id: UUID | None = None
    comment: str | None = None


class ReviewAnswerResponse(BaseModel):
    id: UUID
    question_id: UUID
    selected_option_id: UUID | None
    numeric_score: float | None
    is_unsure: bool
    comment: str | None
    snapshot_weight: float | None
    snapshot_question_text: str | None
    snapshot_option_label: str | None

    class Config:
        from_attributes = True


# --- Paper Review ---

class PaperReviewSubmit(BaseModel):
    answers: list[ReviewAnswerSubmit]
    speaker_feedback: str | None = None
    internal_comment: str | None = None


class PaperReviewResponse(BaseModel):
    id: UUID
    assignment_id: UUID
    paper_id: UUID
    committee_member_id: UUID
    status: str
    total_score: float | None
    speaker_feedback: str | None
    internal_comment: str | None = None
    answers: list[ReviewAnswerResponse]
    submitted_at: datetime | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AdminPaperReviewResponse(PaperReviewResponse):
    reviewer_first_name: str | None = None
    reviewer_last_name: str | None = None


class PaperReviewListResponse(BaseModel):
    items: list[AdminPaperReviewResponse]
    total: int


# --- Review Form Settings ---

class ReviewFormSettingsResponse(BaseModel):
    id: UUID
    conference_id: UUID
    enable_speaker_feedback: bool
    enable_internal_comment: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ReviewFormSettingsUpdate(BaseModel):
    enable_speaker_feedback: bool | None = None
    enable_internal_comment: bool | None = None
