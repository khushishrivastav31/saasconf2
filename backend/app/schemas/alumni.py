"""Alumni schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class AlumniCreate(BaseModel):
    """Create a single alumni record."""

    email: EmailStr
    first_name: str = Field(min_length=1, max_length=255)
    last_name: str = Field(min_length=1, max_length=255)
    company: str | None = None
    notes: str | None = None


class AlumniUpdate(BaseModel):
    """Update an alumni record (all fields optional)."""

    email: EmailStr | None = None
    first_name: str | None = Field(None, min_length=1, max_length=255)
    last_name: str | None = Field(None, min_length=1, max_length=255)
    company: str | None = None
    notes: str | None = None


class AlumniResponse(BaseModel):
    """Alumni record in API responses."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    conference_id: UUID
    email: str
    first_name: str
    last_name: str
    company: str | None
    source: str
    notes: str | None
    created_at: datetime
    updated_at: datetime


class AlumniListResponse(BaseModel):
    """Paginated alumni list."""

    items: list[AlumniResponse]
    total: int


class AlumniImportResult(BaseModel):
    """Result of a CSV bulk import."""

    imported: int
    skipped: int
    errors: list[str]


class AlumniConferenceInfo(BaseModel):
    """Conference info for alumni check response."""

    conference_id: UUID
    conference_name: str


class AlumniCheckResponse(BaseModel):
    """Response for alumni check endpoint."""

    is_alumni: bool
    conferences: list[AlumniConferenceInfo]
