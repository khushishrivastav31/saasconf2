"""VAT rate schemas for country-specific VAT rates."""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class VatRateByCountryResponse(BaseModel):
    """Response schema for VAT rate by country."""

    id: UUID
    country_code: str
    country_name: str
    standard_rate: Decimal
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class VatRateByCountryCreate(BaseModel):
    """Create schema for VAT rate by country."""

    country_code: str = Field(min_length=2, max_length=2, description="ISO country code (e.g. 'DE', 'FR')")
    country_name: str = Field(min_length=1, max_length=100, description="Country name")
    standard_rate: Decimal = Field(ge=0, le=100, description="Standard VAT/tax rate (0-100%)")


class VatRateByCountryUpdate(BaseModel):
    """Update schema for VAT rate by country."""

    country_name: str | None = Field(None, min_length=1, max_length=100, description="Country name")
    standard_rate: Decimal | None = Field(None, ge=0, le=100, description="Standard VAT/tax rate (0-100%)")


class VatPreviewRequest(BaseModel):
    """Request schema for VAT preview calculation."""

    recipient_country: str = Field(description="ISO country code (e.g. 'DE', 'FR')")
    recipient_vat_number: str | None = None
    subtotal: Decimal = Field(gt=0, description="Invoice subtotal before VAT")
    attendance_type_override: str | None = Field(
        None, description="Override attendance type for testing (in_person, virtual, hybrid_onsite, hybrid_online)"
    )
    issue_date: str | None = Field(None, description="Invoice issue date (ISO format, defaults to today)")


class VatPreviewResponse(BaseModel):
    """Response schema for VAT preview calculation."""

    tax_rate: Decimal
    tax_amount: Decimal
    total: Decimal
    rule_applied: dict
    notes_text: str | None = None
