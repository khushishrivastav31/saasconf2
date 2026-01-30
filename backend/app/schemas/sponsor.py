"""Sponsor schemas."""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.core.validators import validate_phone
from app.schemas.location import LocationContactPerson, validate_vat


class SponsorCreate(BaseModel):
    """Schema for creating a sponsor."""

    company_name: str = Field(..., min_length=1, max_length=255)
    sponsor_package_id: UUID | None = None
    phone: str | None = Field(None, max_length=50)
    website: str | None = Field(None, max_length=500)
    address_line1: str | None = Field(None, max_length=255)
    address_line2: str | None = Field(None, max_length=255)
    city: str | None = Field(None, max_length=100)
    state: str | None = Field(None, max_length=100)
    postal_code: str | None = Field(None, max_length=20)
    country: str | None = Field(None, max_length=100)
    vat_number: str | None = Field(None, max_length=20)
    price: Decimal | None = Field(None, ge=0)
    currency: str | None = Field(None, max_length=3)
    comments: str | None = None
    contact_persons: list[LocationContactPerson] = Field(default_factory=list)
    is_active: bool = True

    @field_validator("vat_number")
    @classmethod
    def check_vat(cls, v: str | None) -> str | None:
        return validate_vat(v)

    @field_validator("phone")
    @classmethod
    def check_phone(cls, v: str | None) -> str | None:
        return validate_phone(v)


class SponsorUpdate(BaseModel):
    """Schema for updating a sponsor."""

    company_name: str | None = Field(None, min_length=1, max_length=255)
    sponsor_package_id: UUID | None = None
    phone: str | None = Field(None, max_length=50)
    website: str | None = Field(None, max_length=500)
    address_line1: str | None = Field(None, max_length=255)
    address_line2: str | None = Field(None, max_length=255)
    city: str | None = Field(None, max_length=100)
    state: str | None = Field(None, max_length=100)
    postal_code: str | None = Field(None, max_length=20)
    country: str | None = Field(None, max_length=100)
    vat_number: str | None = Field(None, max_length=20)
    price: Decimal | None = Field(None, ge=0)
    currency: str | None = Field(None, max_length=3)
    comments: str | None = None
    contact_persons: list[LocationContactPerson] | None = None
    is_active: bool | None = None

    @field_validator("vat_number")
    @classmethod
    def check_vat(cls, v: str | None) -> str | None:
        return validate_vat(v)

    @field_validator("phone")
    @classmethod
    def check_phone(cls, v: str | None) -> str | None:
        return validate_phone(v)


class SponsorResponse(BaseModel):
    """Sponsor response schema."""

    id: UUID
    tenant_id: UUID
    conference_id: UUID
    sponsor_package_id: UUID | None = None
    sponsor_package_name: str | None = None
    company_name: str
    phone: str | None = None
    website: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    country: str | None = None
    vat_number: str | None = None
    price: Decimal | None = None
    currency: str | None = None
    comments: str | None = None
    contact_persons: list[LocationContactPerson] = []
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SponsorListResponse(BaseModel):
    """Paginated list of sponsors."""

    items: list[SponsorResponse]
    total: int
    page: int
    page_size: int
    pages: int
