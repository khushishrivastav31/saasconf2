"""Volunteer schemas."""

from datetime import datetime
from uuid import UUID
from enum import Enum

from pydantic import BaseModel, EmailStr, Field


class VolunteerStatus(str, Enum):
    """Volunteer status enum."""

    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    ACTIVE = "active"
    INACTIVE = "inactive"


class VolunteerBase(BaseModel):
    """Base volunteer schema."""

    email: EmailStr
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    phone: str | None = Field(None, max_length=50)
    role: str | None = Field(None, max_length=100)
    skills: list[str] = Field(default_factory=list)
    availability: dict = Field(default_factory=dict)
    notes: str | None = None
    emergency_contact_name: str | None = Field(None, max_length=255)
    emergency_contact_phone: str | None = Field(None, max_length=50)
    tshirt_size: str | None = Field(None, max_length=10)


class VolunteerCreate(VolunteerBase):
    """Schema for creating a volunteer."""

    conference_id: UUID


class VolunteerUpdate(BaseModel):
    """Schema for updating a volunteer."""

    email: EmailStr | None = None
    first_name: str | None = Field(None, min_length=1, max_length=100)
    last_name: str | None = Field(None, min_length=1, max_length=100)
    phone: str | None = Field(None, max_length=50)
    status: VolunteerStatus | None = None
    role: str | None = Field(None, max_length=100)
    skills: list[str] | None = None
    availability: dict | None = None
    notes: str | None = None
    emergency_contact_name: str | None = Field(None, max_length=255)
    emergency_contact_phone: str | None = Field(None, max_length=50)
    tshirt_size: str | None = Field(None, max_length=10)
    total_hours: float | None = None


class VolunteerResponse(BaseModel):
    """Volunteer response schema."""

    id: UUID
    tenant_id: UUID
    email: str
    first_name: str
    last_name: str
    full_name: str
    phone: str | None
    status: str
    role: str | None
    skills: list
    availability: dict
    notes: str | None
    emergency_contact_name: str | None
    emergency_contact_phone: str | None
    tshirt_size: str | None
    application_date: datetime
    approved_date: datetime | None
    total_hours: float
    created_at: datetime
    updated_at: datetime
    conference_ids: list[UUID] = []

    class Config:
        from_attributes = True


class VolunteerListResponse(BaseModel):
    """Paginated volunteer list response."""

    items: list[VolunteerResponse]
    total: int
    page: int
    page_size: int
    pages: int


class VolunteerStats(BaseModel):
    """Volunteer statistics."""

    total: int
    pending: int
    approved: int
    active: int
    inactive: int
    rejected: int
    total_hours: float
