"""Schemas for email template management."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class EmailTemplateBase(BaseModel):
    """Base schema for email templates."""

    template_type: str = Field(..., description="Type of email template")
    subject: str = Field(..., max_length=255, description="Email subject line")
    body_html: str = Field(..., description="HTML email body")
    body_text: str | None = Field(None, description="Plain text email body")
    is_active: bool = Field(True, description="Whether template is active")


class EmailTemplateCreate(EmailTemplateBase):
    """Schema for creating an email template."""

    pass


class EmailTemplateUpdate(BaseModel):
    """Schema for updating an email template."""

    subject: str | None = Field(None, max_length=255)
    body_html: str | None = None
    body_text: str | None = None
    is_active: bool | None = None


class EmailTemplateResponse(EmailTemplateBase):
    """Schema for email template response."""

    id: UUID | None = None  # None for unsaved default templates
    tenant_id: UUID | None = None
    conference_id: UUID | None = None
    created_at: datetime | None = None  # None for unsaved default templates
    updated_at: datetime | None = None  # None for unsaved default templates

    model_config = {"from_attributes": True}


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

    # System templates (no tenant_id)
    SYSTEM_TYPES = [TENANT_USER_WELCOME]

    # Conference templates (require tenant_id + conference_id)
    CONFERENCE_TYPES = [
        APPLICANT_VERIFICATION,
        COMMITTEE_VERIFICATION,
        SUBMISSION_CONFIRMATION,
        CO_SPEAKER_INVITATION,
        PASSWORD_RESET,
    ]

    ALL_TYPES = SYSTEM_TYPES + CONFERENCE_TYPES
