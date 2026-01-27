"""Location schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class LocationContactPerson(BaseModel):
    """Schema for a location contact person."""

    name: str = Field(..., min_length=1, max_length=255)
    email: str | None = Field(None, max_length=255)
    phone: str | None = Field(None, max_length=50)
    comment: str | None = Field(None, max_length=500)


class LocationBase(BaseModel):
    """Base location schema."""

    name: str = Field(..., min_length=1, max_length=255)
    code: str | None = Field(None, max_length=50)
    location_type: str = Field(default="room", max_length=20)
    description: str | None = None
    capacity: int | None = Field(None, ge=0)

    # Address
    address_line1: str | None = Field(None, max_length=255)
    address_line2: str | None = Field(None, max_length=255)
    city: str | None = Field(None, max_length=100)
    state: str | None = Field(None, max_length=100)
    postal_code: str | None = Field(None, max_length=20)
    country: str | None = Field(None, max_length=100)

    # Coordinates
    latitude: float | None = None
    longitude: float | None = None

    # Building info
    building: str | None = Field(None, max_length=100)
    floor: str | None = Field(None, max_length=20)

    # Features
    amenities: list[str] = Field(default_factory=list)
    accessibility_features: list[str] = Field(default_factory=list)

    # Virtual
    virtual_url: str | None = Field(None, max_length=500)
    virtual_platform: str | None = Field(None, max_length=50)

    # Settings
    settings: dict = Field(default_factory=dict)

    # Contact persons
    contact_persons: list[LocationContactPerson] = Field(default_factory=list)


class LocationCreate(LocationBase):
    """Schema for creating a location."""

    parent_id: UUID | None = None
    conference_id: UUID


class LocationUpdate(BaseModel):
    """Schema for updating a location."""

    name: str | None = Field(None, min_length=1, max_length=255)
    code: str | None = Field(None, max_length=50)
    location_type: str | None = Field(None, max_length=20)
    description: str | None = None
    capacity: int | None = Field(None, ge=0)
    parent_id: UUID | None = None

    # Address
    address_line1: str | None = Field(None, max_length=255)
    address_line2: str | None = Field(None, max_length=255)
    city: str | None = Field(None, max_length=100)
    state: str | None = Field(None, max_length=100)
    postal_code: str | None = Field(None, max_length=20)
    country: str | None = Field(None, max_length=100)

    # Coordinates
    latitude: float | None = None
    longitude: float | None = None

    # Building info
    building: str | None = Field(None, max_length=100)
    floor: str | None = Field(None, max_length=20)

    # Features
    amenities: list[str] | None = None
    accessibility_features: list[str] | None = None

    # Virtual
    virtual_url: str | None = Field(None, max_length=500)
    virtual_platform: str | None = Field(None, max_length=50)

    # Status
    is_active: bool | None = None

    # Settings
    settings: dict | None = None

    # Contact persons
    contact_persons: list[LocationContactPerson] | None = None


class LocationResponse(BaseModel):
    """Location response schema."""

    id: UUID
    tenant_id: UUID
    parent_id: UUID | None
    name: str
    code: str | None
    location_type: str
    description: str | None
    capacity: int | None

    # Address
    address_line1: str | None
    address_line2: str | None
    city: str | None
    state: str | None
    postal_code: str | None
    country: str | None
    full_address: str | None

    # Coordinates
    latitude: float | None
    longitude: float | None

    # Building info
    building: str | None
    floor: str | None

    # Features
    amenities: list
    accessibility_features: list

    # Virtual
    virtual_url: str | None
    virtual_platform: str | None

    # Status
    is_active: bool

    # Settings
    settings: dict

    # Contact persons
    contact_persons: list[LocationContactPerson] = []

    # Timestamps
    created_at: datetime
    updated_at: datetime

    # Nested children count
    children_count: int = 0
    conference_ids: list[UUID] = []

    class Config:
        from_attributes = True


class LocationTreeResponse(LocationResponse):
    """Location response with nested children."""

    children: list["LocationTreeResponse"] = []


class LocationListResponse(BaseModel):
    """Paginated location list response."""

    items: list[LocationResponse]
    total: int
    page: int
    page_size: int
    pages: int


class LocationTypeCount(BaseModel):
    """Count for a single location type."""

    slug: str
    name: str
    count: int


class LocationStats(BaseModel):
    """Location statistics."""

    total: int
    total_capacity: int
    type_counts: list[LocationTypeCount]
