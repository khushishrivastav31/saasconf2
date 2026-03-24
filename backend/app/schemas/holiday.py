"""Holiday configuration and proxy schemas."""

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

# --- Holiday config (tenant-scoped) ---


class HolidayConfigCreate(BaseModel):
    """Schema for creating a holiday configuration."""

    country_code: str = Field(..., min_length=2, max_length=2)
    year: int = Field(..., ge=2020, le=2099)
    regional_code: str | None = Field(None, max_length=10)

    @field_validator("country_code")
    @classmethod
    def uppercase_country(cls, v: str) -> str:
        return v.upper()


class HolidayConfigUpdate(BaseModel):
    """Schema for updating a holiday configuration."""

    national_holidays_enabled: bool | None = None
    regional_holidays_enabled: bool | None = None
    regional_code: str | None = None


class HolidayConfigResponse(BaseModel):
    """Schema for holiday configuration response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    country_code: str
    year: int
    national_holidays_enabled: bool
    regional_holidays_enabled: bool
    regional_code: str | None = None
    created_at: datetime
    updated_at: datetime


# --- Custom blocked days ---


class CustomBlockedDayCreate(BaseModel):
    """Schema for creating a custom blocked day."""

    date: date
    name: str = Field(..., min_length=1, max_length=255)
    is_recurring: bool = False


class CustomBlockedDayUpdate(BaseModel):
    """Schema for updating a custom blocked day."""

    name: str | None = Field(None, min_length=1, max_length=255)
    is_recurring: bool | None = None


class CustomBlockedDayResponse(BaseModel):
    """Schema for custom blocked day response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    date: date
    name: str
    year: int
    is_recurring: bool
    created_at: datetime
    updated_at: datetime


# --- Nager.Date proxy schemas ---


class PublicHolidayItem(BaseModel):
    """Public holiday from Nager.Date API."""

    date: str
    local_name: str
    name: str
    country_code: str
    is_global: bool
    counties: list[str] | None = None
    types: list[str] = Field(default_factory=list)


class AvailableCountry(BaseModel):
    """Available country from Nager.Date API."""

    country_code: str
    name: str


class CountrySubdivision(BaseModel):
    """Country subdivision (e.g. Bundesland)."""

    code: str
    name: str


# --- Aggregated holiday dates ---


class HolidayDateEntry(BaseModel):
    """A single holiday/blocked date for the year calendar grid."""

    date: date
    name: str
    type: Literal["public", "custom"]
    country_code: str | None = None
    is_national: bool | None = None
    counties: list[str] | None = None
