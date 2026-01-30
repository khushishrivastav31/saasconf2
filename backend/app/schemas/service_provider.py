"""Service provider schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.core.validators import validate_phone
from app.schemas.location import LocationContactPerson, LocationContactPersonResponse, validate_vat


class ServiceProviderCreate(BaseModel):
    """Schema for creating a service provider."""

    company_name: str = Field(..., min_length=1, max_length=255)
    service_description: str | None = None
    phone: str | None = Field(None, max_length=50)
    email: str | None = Field(None, max_length=255)
    website: str | None = Field(None, max_length=500)
    address_line1: str | None = Field(None, max_length=255)
    address_line2: str | None = Field(None, max_length=255)
    city: str | None = Field(None, max_length=100)
    state: str | None = Field(None, max_length=100)
    postal_code: str | None = Field(None, max_length=20)
    country: str | None = Field(None, max_length=100)
    vat_number: str | None = Field(None, max_length=20)
    contact_persons: list[LocationContactPerson] = Field(default_factory=list)

    @field_validator("vat_number")
    @classmethod
    def check_vat(cls, v: str | None) -> str | None:
        return validate_vat(v)

    @field_validator("phone")
    @classmethod
    def check_phone(cls, v: str | None) -> str | None:
        return validate_phone(v)


class ServiceProviderUpdate(BaseModel):
    """Schema for updating a service provider."""

    company_name: str | None = Field(None, min_length=1, max_length=255)
    service_description: str | None = None
    phone: str | None = Field(None, max_length=50)
    email: str | None = Field(None, max_length=255)
    website: str | None = Field(None, max_length=500)
    address_line1: str | None = Field(None, max_length=255)
    address_line2: str | None = Field(None, max_length=255)
    city: str | None = Field(None, max_length=100)
    state: str | None = Field(None, max_length=100)
    postal_code: str | None = Field(None, max_length=20)
    country: str | None = Field(None, max_length=100)
    vat_number: str | None = Field(None, max_length=20)
    contact_persons: list[LocationContactPerson] | None = None

    @field_validator("vat_number")
    @classmethod
    def check_vat(cls, v: str | None) -> str | None:
        return validate_vat(v)

    @field_validator("phone")
    @classmethod
    def check_phone(cls, v: str | None) -> str | None:
        return validate_phone(v)


class ServiceProviderResponse(BaseModel):
    """Service provider response schema."""

    id: UUID
    tenant_id: UUID
    location_id: UUID | None = None
    conference_id: UUID | None = None
    company_name: str
    service_description: str | None
    phone: str | None = None
    email: str | None = None
    website: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    country: str | None = None
    vat_number: str | None = None
    contact_persons: list[LocationContactPersonResponse] = []
    created_at: datetime
    updated_at: datetime


class ServiceProviderListResponse(BaseModel):
    """List of service providers."""

    items: list[ServiceProviderResponse]
    total: int
