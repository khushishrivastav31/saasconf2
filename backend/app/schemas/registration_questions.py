"""Schemas for registration questions settings and portal answers."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

# --- Question Definition Schemas (stored in conference.settings) ---


class RegistrationQuestionOption(BaseModel):
    """A single option for radio-type questions."""

    label: str = Field(..., min_length=1, max_length=500)


class RegistrationQuestion(BaseModel):
    """A single registration question definition."""

    id: str = Field(..., description="UUID string identifying the question")
    text: str = Field(..., min_length=1, max_length=1000)
    type: Literal["checkbox", "text", "radio"]
    required: bool = False
    options: list[str] = Field(default_factory=list, description="Options for radio-type questions")
    sort_order: int = 0
    is_active: bool = True


class RegistrationQuestionsSettings(BaseModel):
    """Full registration questions settings for a conference."""

    enabled: bool = False
    questions: list[RegistrationQuestion] = Field(default_factory=list)


class RegistrationQuestionsUpdate(BaseModel):
    """Update schema for registration questions settings."""

    enabled: bool | None = None
    questions: list[RegistrationQuestion] | None = None


# --- Portal Answer Schemas ---


class QuestionAnswerSubmit(BaseModel):
    """A single answer submission from the portal."""

    question_id: str
    answer_value: str = Field(..., max_length=5000)


class SubmitAnswersRequest(BaseModel):
    """Request to submit answers for a conference's registration questions."""

    answers: list[QuestionAnswerSubmit] = Field(..., min_length=1)


class PendingQuestion(BaseModel):
    """A question that still needs to be answered."""

    id: str
    text: str
    type: Literal["checkbox", "text", "radio"]
    required: bool
    options: list[str] = []


class ConferencePendingQuestions(BaseModel):
    """Pending questions for a single conference."""

    conference_id: UUID
    conference_name: str
    questions: list[PendingQuestion]
    has_mandatory_pending: bool


class PendingSummaryResponse(BaseModel):
    """Summary of all conferences with pending mandatory questions."""

    conferences: list[ConferencePendingQuestions] = []
    has_any_mandatory_pending: bool = False


# --- Admin Answer View Schemas ---


class QuestionAnswerResponse(BaseModel):
    """A single answer for admin viewing."""

    id: UUID
    question_id: str
    question_text: str | None = None
    answer_value: str
    answered_at: datetime


class ApplicantAnswersResponse(BaseModel):
    """All answers from a single applicant for a conference."""

    applicant_id: UUID
    applicant_name: str
    applicant_email: str
    answers: list[QuestionAnswerResponse]
    completed_at: datetime | None = None


class AnswersListResponse(BaseModel):
    """Paginated list of applicant answers."""

    items: list[ApplicantAnswersResponse]
    total: int
