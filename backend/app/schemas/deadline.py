"""Schemas for conference deadlines."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class DeadlineCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    description: str | None = None
    due_date: datetime


class DeadlineUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=500)
    description: str | None = None
    due_date: datetime | None = None
    is_active: bool | None = None


class DeadlineResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    conference_id: UUID
    title: str
    description: str | None
    due_date: datetime
    is_active: bool
    reminder_7d_sent: bool
    reminder_1d_sent: bool
    reminder_due_sent: bool
    created_by: UUID | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DeadlineListResponse(BaseModel):
    items: list[DeadlineResponse]
    total: int
