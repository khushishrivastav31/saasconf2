"""Offer attendee schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class OfferAttendeeCreate(BaseModel):
    """Schema for creating an offer attendee."""

    placement_id: UUID
    first_name: str = Field(..., min_length=1, max_length=200)
    last_name: str = Field(..., min_length=1, max_length=200)
    email: str | None = None
    certification: bool = False
    exam_mode: str | None = Field(None, pattern=r"^(onsite|online)$")
    extra_time: bool = False
    exam_language: str | None = None
    comments: str | None = None


class OfferAttendeeUpdate(BaseModel):
    """Schema for updating an offer attendee."""

    first_name: str | None = Field(None, min_length=1, max_length=200)
    last_name: str | None = Field(None, min_length=1, max_length=200)
    email: str | None = None
    certification: bool | None = None
    exam_mode: str | None = Field(None, pattern=r"^(onsite|online)$")
    extra_time: bool | None = None
    exam_language: str | None = None
    comments: str | None = None


class OfferAttendeeResponse(BaseModel):
    """Schema for offer attendee response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    offer_id: UUID
    placement_id: UUID | None
    first_name: str
    last_name: str
    email: str | None
    certification: bool
    exam_mode: str | None
    extra_time: bool
    exam_language: str | None
    comments: str | None
    created_at: datetime
    updated_at: datetime
