"""Location schemas."""

import re
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.validators import validate_phone

# EU VAT format: 2-letter country code followed by 2–12 alphanumeric characters
_VAT_PATTERN = re.compile(r"^[A-Z]{2}[A-Z0-9]{2,12}$")


def validate_vat(value: str | None) -> str | None:
    """Validate a VAT number format (EU style).

    Returns the cleaned (uppercased, stripped) value or raises ValueError.
    """
    if value is None or value == "":
        return value
    cleaned = value.strip().upper().replace(" ", "").replace("-", "").replace(".", "")
    if not _VAT_PATTERN.match(cleaned):
        raise ValueError(
            "Invalid VAT number format. Expected 2-letter country code "
            "followed by 2–12 alphanumeric characters (e.g. DE123456789)."
        )
    return cleaned


class LocationContactPerson(BaseModel):
    """Schema for a location contact person (used for create/update with validation)."""

    first_name: str = Field(..., min_length=1, max_length=255)
    last_name: str = Field(default="", max_length=255)
    email: str | None = Field(None, max_length=255)
    phone: str | None = Field(None, max_length=50)
    comment: str | None = Field(None, max_length=500)

    @field_validator("phone")
    @classmethod
    def check_phone(cls, v: str | None) -> str | None:
        return validate_phone(v)


class LocationContactPersonResponse(BaseModel):
    """Schema for location contact person in responses (no validation on read)."""

    first_name: str
    last_name: str = ""
    email: str | None = None
    phone: str | None = None
    comment: str | None = None


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

    # Contact info
    phone: str | None = Field(None, max_length=50)
    website: str | None = Field(None, max_length=500)

    # VAT
    vat_number: str | None = Field(None, max_length=20)

    # Features
    amenities: list[str] = Field(default_factory=list)
    accessibility_features: list[str] = Field(default_factory=list)

    # Virtual
    virtual_url: str | None = Field(None, max_length=500)
    virtual_platform: str | None = Field(None, max_length=50)

    # Settings
    settings: dict = Field(default_factory=dict)

    @field_validator("vat_number")
    @classmethod
    def check_vat(cls, v: str | None) -> str | None:
        return validate_vat(v)

    @field_validator("phone")
    @classmethod
    def check_phone(cls, v: str | None) -> str | None:
        return validate_phone(v)

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

    # Contact info
    phone: str | None = Field(None, max_length=50)
    website: str | None = Field(None, max_length=500)

    # VAT
    vat_number: str | None = Field(None, max_length=20)

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

    @field_validator("vat_number")
    @classmethod
    def check_vat(cls, v: str | None) -> str | None:
        return validate_vat(v)

    @field_validator("phone")
    @classmethod
    def check_phone(cls, v: str | None) -> str | None:
        return validate_phone(v)


class LocationResponse(BaseModel):
    """Location response schema."""

    model_config = ConfigDict(from_attributes=True)

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

    # Contact info
    phone: str | None = None
    website: str | None = None

    # VAT
    vat_number: str | None = None

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
    contact_persons: list[LocationContactPersonResponse] = []

    # Timestamps
    created_at: datetime
    updated_at: datetime

    # Nested children count
    children_count: int = 0
    conference_ids: list[UUID] = []


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
