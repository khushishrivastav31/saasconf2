"""Volunteer profile schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.validators import validate_phone


class VolunteerProfileUpdate(BaseModel):
    """Schema for updating a volunteer profile."""

    tshirt_size: str | None = Field(None, max_length=10)
    emergency_contact_name: str | None = Field(None, max_length=255)
    emergency_contact_phone: str | None = Field(None, max_length=50)
    skills: list[str] | None = None
    availability: dict | None = None
    notes: str | None = None
    color: str | None = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    total_hours: float | None = None

    @field_validator("emergency_contact_phone")
    @classmethod
    def check_phone(cls, v: str | None) -> str | None:
        return validate_phone(v)


class VolunteerProfileResponse(BaseModel):
    """Volunteer profile response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    conference_id: UUID
    applicant_id: UUID
    first_name: str = ""
    last_name: str = ""
    email: str = ""
    tshirt_size: str | None = None
    emergency_contact_name: str | None = None
    emergency_contact_phone: str | None = None
    skills: list = Field(default_factory=list)
    availability: dict = Field(default_factory=dict)
    notes: str | None = None
    color: str | None = None
    total_hours: float = 0.0
    created_at: datetime | None = None
    updated_at: datetime | None = None


class VolunteerProfileListResponse(BaseModel):
    """List of volunteer profiles."""

    items: list[VolunteerProfileResponse]
    total: int
