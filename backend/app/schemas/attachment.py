"""Schemas for file attachments."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class AttachmentResponse(BaseModel):
    """Attachment response schema (excludes file_data binary)."""

    id: UUID
    tenant_id: UUID
    entity_type: str
    entity_id: UUID
    filename: str
    content_type: str
    file_size: int
    description: str | None
    uploaded_by: UUID | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AttachmentListResponse(BaseModel):
    """List of attachments."""

    items: list[AttachmentResponse]
    total: int
