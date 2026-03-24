"""Syllabus schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class SyllabusCreate(BaseModel):
    """Schema for creating a syllabus."""

    slug: str = Field(..., min_length=1, max_length=100)
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    price: float | None = Field(None, ge=0)
    certification_body_id: UUID | None = None
    language_id: UUID | None = None


class SyllabusUpdate(BaseModel):
    """Schema for updating a syllabus."""

    slug: str | None = Field(None, min_length=1, max_length=100)
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    price: float | None = Field(None, ge=0)
    certification_body_id: UUID | None = None
    language_id: UUID | None = None


class SyllabusResponse(BaseModel):
    """Syllabus response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    slug: str
    name: str
    description: str | None = None
    price: float | None = None
    certification_body_id: UUID | None = None
    certification_body_name: str | None = None
    language_id: UUID | None = None
    language_name: str | None = None
    created_at: datetime
    updated_at: datetime


class SyllabusListResponse(BaseModel):
    """List of syllabi."""

    items: list[SyllabusResponse]
    total: int
