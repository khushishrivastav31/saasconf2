"""Schemas for sponsor contract management."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class SponsorContractResponse(BaseModel):
    """Response for a sponsor contract (excludes binary file_data)."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    sponsor_id: UUID
    conference_id: UUID
    source_package_id: UUID | None = None
    filename: str
    content_type: str
    file_size: int
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


class SponsorContractVersionResponse(BaseModel):
    """Response for a contract version snapshot (metadata only)."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    version: int
    filename: str
    content_type: str
    file_size: int
    html_content: str | None = None
    created_by: UUID | None = None
    created_at: datetime


class SponsorContractUpdateContent(BaseModel):
    """Request to save edited HTML content."""

    html_content: str = Field(..., min_length=1)


class SponsorContractUpdateStatus(BaseModel):
    """Request to update contract status."""

    status: str = Field(..., pattern=r"^(draft|sent|signed)$")


class SponsorContractSendPreview(BaseModel):
    """Rendered email template preview (placeholders filled)."""

    subject: str
    body_html: str


class SponsorContractSendRequest(BaseModel):
    """Request to send the contract via email."""

    recipient_emails: list[str] = Field(default_factory=list)
    subject: str = Field(..., min_length=1, max_length=500)
    body_html: str = Field(..., min_length=1, description="Email body HTML (from edited template)")
    include_contact_persons: list[int] = Field(
        default_factory=list,
        description="Indices into sponsor.contact_persons to include as recipients",
    )
    send_as_pdf: bool = Field(default=False, description="Generate PDF from HTML and attach")


class SponsorContractSendResponse(BaseModel):
    """Response after sending a contract."""

    sent_count: int
    failed: list[str] = []
