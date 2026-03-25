"""Schemas for offer template management."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class OfferTemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    language: str = Field(..., min_length=1, max_length=100)
    comment: str | None = None
    is_active: bool = True


class OfferTemplateUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    language: str | None = Field(None, min_length=1, max_length=100)
    comment: str | None = None
    is_active: bool | None = None


class OfferTemplateResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    name: str
    language: str
    comment: str | None = None
    is_active: bool
    has_file: bool = False
    filename: str | None = None
    file_size: int | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
