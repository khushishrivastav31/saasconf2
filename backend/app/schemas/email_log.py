"""Email log schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class EmailLogResponse(BaseModel):
    """Single email failure log entry."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    conference_id: UUID | None
    recipient_email: str
    subject: str
    email_type: str
    status: str
    error_message: str | None
    acknowledged: bool
    created_at: datetime


class EmailLogListResponse(BaseModel):
    """Paginated email failure log list."""

    items: list[EmailLogResponse]
    total: int
    total_unacknowledged: int
    page: int
    page_size: int
