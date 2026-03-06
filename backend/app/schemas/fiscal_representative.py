"""Fiscal Representative schemas."""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.validators import validate_email, validate_phone, validate_website
from app.schemas.location import LocationContactPerson, LocationContactPersonResponse, validate_vat


class FiscalRepresentativeUpsert(BaseModel):
    """Schema for creating or updating a fiscal representative (PUT upsert)."""

    company_name: str = Field(..., min_length=1, max_length=255)
    address_line1: str | None = Field(None, max_length=255)
    address_line2: str | None = Field(None, max_length=255)
    city: str | None = Field(None, max_length=100)
    state: str | None = Field(None, max_length=100)
    postal_code: str | None = Field(None, max_length=20)
    country: str | None = Field(None, max_length=100)
    phone: str | None = Field(None, max_length=50)
    email: str | None = Field(None, max_length=255)
    website: str | None = Field(None, max_length=500)
    vat_number: str | None = Field(None, max_length=50)
    conference_vat_number: str | None = Field(None, max_length=50)
    contact_persons: list[LocationContactPerson] = Field(default_factory=list)
    is_active: bool = True

    @field_validator("vat_number", "conference_vat_number")
    @classmethod
    def check_vat(cls, v: str | None) -> str | None:
        return validate_vat(v)

    @field_validator("email")
    @classmethod
    def check_email(cls, v: str | None) -> str | None:
        return validate_email(v)

    @field_validator("phone")
    @classmethod
    def check_phone(cls, v: str | None) -> str | None:
        return validate_phone(v)

    @field_validator("website")
    @classmethod
    def check_website(cls, v: str | None) -> str | None:
        return validate_website(v)


class FiscalRepresentativeResponse(BaseModel):
    """Fiscal representative response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    conference_id: UUID
    company_name: str
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    country: str | None = None
    phone: str | None = None
    email: str | None = None
    website: str | None = None
    vat_number: str | None = None
    conference_vat_number: str | None = None
    contact_persons: list[LocationContactPersonResponse] | None = []
    is_active: bool
    created_at: datetime
    updated_at: datetime


class TaxInfoResponse(BaseModel):
    """Combined tax information response schema."""

    representation_type: str  # "self" or "fiscal_representative"
    tenant_country: str | None
    conference_country: str | None
    effective_vat_number: str | None
    current_vat_rate: Decimal | None
    fiscal_representative: dict | None
