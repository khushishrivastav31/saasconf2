"""Schemas for email template management."""

from datetime import datetime
from typing import ClassVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class EmailTemplateBase(BaseModel):
    """Base schema for email templates."""

    template_type: str = Field(..., description="Type of email template")
    subject: str = Field(..., max_length=255, description="Email subject line")
    body_html: str = Field(..., description="HTML email body")
    body_text: str | None = Field(None, description="Plain text email body")
    is_active: bool = Field(True, description="Whether template is active")
    screen_overlay_id: UUID | None = Field(None, description="Optional screen overlay to trigger")


class EmailTemplateCreate(EmailTemplateBase):
    """Schema for creating an email template."""

    pass


class EmailTemplateUpdate(BaseModel):
    """Schema for updating an email template."""

    subject: str | None = Field(None, max_length=255)
    body_html: str | None = None
    body_text: str | None = None
    is_active: bool | None = None
    screen_overlay_id: UUID | None = None


class EmailTemplateResponse(EmailTemplateBase):
    """Schema for email template response."""

    id: UUID | None = None  # None for unsaved default templates
    tenant_id: UUID | None = None
    conference_id: UUID | None = None
    created_at: datetime | None = None  # None for unsaved default templates
    updated_at: datetime | None = None  # None for unsaved default templates

    model_config = ConfigDict(from_attributes=True)


class EmailTemplateListResponse(BaseModel):
    """Schema for paginated email template list."""

    items: list[EmailTemplateResponse]
    total: int
    page: int
    page_size: int
    pages: int


# Template type constants
class EmailTemplateType:
    """Email template type constants."""

    # System level (super admin)
    TENANT_USER_WELCOME = "tenant_user_welcome"

    # Conference level (tenant admin)
    APPLICANT_VERIFICATION = "applicant_verification"
    COMMITTEE_VERIFICATION = "committee_verification"
    SUBMISSION_CONFIRMATION = "submission_confirmation"
    CO_SPEAKER_INVITATION = "co_speaker_invitation"
    PASSWORD_RESET = "password_reset"
    NEW_MESSAGE_NOTIFICATION = "new_message_notification"
    PAPER_ACCEPTANCE = "paper_acceptance"
    PAPER_REJECTION = "paper_rejection"
    SPONSOR_CONTRACT_SEND = "sponsor_contract_send"
    REGISTRATION_INVOICE = "registration_invoice"
    ATTENDEE_WELCOME = "attendee_welcome"
    REGISTRATION_CANCELLATION = "registration_cancellation"

    # System templates (no tenant_id)
    SYSTEM_TYPES: ClassVar[list[str]] = [TENANT_USER_WELCOME]

    # Conference templates (require tenant_id + conference_id)
    CONFERENCE_TYPES: ClassVar[list[str]] = [
        APPLICANT_VERIFICATION,
        COMMITTEE_VERIFICATION,
        SUBMISSION_CONFIRMATION,
        CO_SPEAKER_INVITATION,
        PASSWORD_RESET,
        NEW_MESSAGE_NOTIFICATION,
        PAPER_ACCEPTANCE,
        PAPER_REJECTION,
        SPONSOR_CONTRACT_SEND,
        REGISTRATION_INVOICE,
        ATTENDEE_WELCOME,
        REGISTRATION_CANCELLATION,
    ]

    ALL_TYPES: ClassVar[list[str]] = SYSTEM_TYPES + CONFERENCE_TYPES
