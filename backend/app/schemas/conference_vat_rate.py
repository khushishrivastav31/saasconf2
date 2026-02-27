"""Conference VAT Rate schemas."""

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ConferenceVatRateCreate(BaseModel):
    """Schema for creating a VAT rate period."""

    rate: Decimal = Field(..., ge=0, le=100)
    start_date: date
    end_date: date
    description: str | None = Field(None, max_length=255)

    @field_validator("end_date")
    @classmethod
    def validate_end_date(cls, v: date, info) -> date:
        """Validate that end_date is not before start_date."""
        start_date = info.data.get("start_date")
        if start_date and v < start_date:
            raise ValueError("End date cannot be before start date")
        return v


class ConferenceVatRateUpdate(BaseModel):
    """Schema for updating a VAT rate period."""

    rate: Decimal | None = Field(None, ge=0, le=100)
    start_date: date | None = None
    end_date: date | None = None
    description: str | None = Field(None, max_length=255)


class ConferenceVatRateResponse(BaseModel):
    """VAT rate response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    conference_id: UUID
    rate: Decimal
    start_date: date
    end_date: date
    description: str | None = None
    created_at: datetime
    updated_at: datetime


class ConferenceVatRateListResponse(BaseModel):
    """List of VAT rates."""

    items: list[ConferenceVatRateResponse]
    total: int


class TaxInfoResponse(BaseModel):
    """Combined tax representation info for a conference."""

    representation_type: str  # "self" or "fiscal_representative"
    tenant_country: str | None = None
    conference_country: str | None = None
    effective_vat_number: str | None = None  # tenant VAT or conference VAT number
    current_vat_rate: Decimal | None = None  # rate applicable for today
    fiscal_representative: dict | None = None  # fiscal rep summary if exists
    vat_rates: list[ConferenceVatRateResponse] = []
