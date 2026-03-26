"""Schemas for offer document management."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class OfferDocumentResponse(BaseModel):
    """Response for an offer document (excludes binary file_data)."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    offer_id: UUID
    filename: str
    content_type: str | None = None
    file_size: int | None = None
    html_content: str | None = None
    is_editable: bool
    version: int
    version_count: int = 0
    status: str
    last_sent_at: datetime | None = None
    sent_to: list[dict] | None = None
    created_by: UUID | None = None
    created_at: datetime
    updated_at: datetime


class OfferDocumentVersionResponse(BaseModel):
    """Response for a document version snapshot."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    version: int
    filename: str
    content_type: str | None = None
    file_size: int | None = None
    html_content: str | None = None
    created_by: UUID | None = None
    created_at: datetime


class OfferDocumentUpdateContent(BaseModel):
    """Request to save edited HTML content."""

    html_content: str = Field(..., min_length=1)


class OfferDocumentSendRequest(BaseModel):
    """Request to send the document via email."""

    recipient_emails: list[str] = Field(default_factory=list)
    subject: str = Field(..., min_length=1, max_length=500)
    body_html: str = Field(..., min_length=1, description="Email body HTML")
    send_as_pdf: bool = True


class OfferDocumentSendResponse(BaseModel):
    """Response after sending a document."""

    sent_count: int = 0
    failed: list[str] = Field(default_factory=list)
