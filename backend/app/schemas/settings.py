"""Schemas for tenant settings: volunteer roles and location types."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


# --- Volunteer Role Schemas ---


class VolunteerRoleCreate(BaseModel):
    """Schema for creating a volunteer role."""

    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    is_active: bool = True


class VolunteerRoleUpdate(BaseModel):
    """Schema for updating a volunteer role."""

    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = None
    is_active: bool | None = None


class VolunteerRoleResponse(BaseModel):
    """Volunteer role response schema."""

    id: UUID
    tenant_id: UUID
    name: str
    description: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class VolunteerRoleListResponse(BaseModel):
    """List of volunteer roles."""

    items: list[VolunteerRoleResponse]
    total: int


# --- Location Type Schemas ---


class LocationTypeCreate(BaseModel):
    """Schema for creating a tenant location type."""

    name: str = Field(..., min_length=1, max_length=50)
    slug: str = Field(..., min_length=1, max_length=20, pattern=r"^[a-z][a-z0-9_]*$")
    description: str | None = None
    is_active: bool = True


class LocationTypeUpdate(BaseModel):
    """Schema for updating a tenant location type."""

    name: str | None = Field(None, min_length=1, max_length=50)
    slug: str | None = Field(None, min_length=1, max_length=20, pattern=r"^[a-z][a-z0-9_]*$")
    description: str | None = None
    is_active: bool | None = None


class LocationTypeResponse(BaseModel):
    """Location type response schema."""

    id: UUID
    tenant_id: UUID
    name: str
    slug: str
    description: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    usage_count: int = 0

    class Config:
        from_attributes = True


class LocationTypeListResponse(BaseModel):
    """List of location types."""

    items: list[LocationTypeResponse]
    total: int
