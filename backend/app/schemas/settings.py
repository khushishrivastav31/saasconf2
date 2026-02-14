"""Schemas for conference settings: volunteer roles, location types, currencies, sponsor packages, booking options, discount codes, and committee roles."""

from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

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
    conference_id: UUID
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
    conference_id: UUID
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


# --- Currency Schemas ---


class CurrencyCreate(BaseModel):
    """Schema for creating a conference currency."""

    code: str = Field(..., min_length=1, max_length=3, pattern=r"^[A-Z]{1,3}$")
    name: str = Field(..., min_length=1, max_length=50)
    symbol: str = Field(..., min_length=1, max_length=5)
    is_active: bool = True


class CurrencyUpdate(BaseModel):
    """Schema for updating a conference currency."""

    code: str | None = Field(None, min_length=1, max_length=3, pattern=r"^[A-Z]{1,3}$")
    name: str | None = Field(None, min_length=1, max_length=50)
    symbol: str | None = Field(None, min_length=1, max_length=5)
    is_active: bool | None = None


class CurrencyResponse(BaseModel):
    """Currency response schema."""

    id: UUID
    tenant_id: UUID
    conference_id: UUID
    code: str
    name: str
    symbol: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CurrencyListResponse(BaseModel):
    """List of currencies."""

    items: list[CurrencyResponse]
    total: int


# --- Sponsor Package Schemas ---


class SponsorPackageCreate(BaseModel):
    """Schema for creating a sponsor package."""

    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    price: Decimal = Field(..., ge=0)
    currency: str | None = Field(None, max_length=3)
    is_active: bool = True


class SponsorPackageUpdate(BaseModel):
    """Schema for updating a sponsor package."""

    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = None
    price: Decimal | None = Field(None, ge=0)
    currency: str | None = Field(None, max_length=3)
    is_active: bool | None = None


class SponsorPackageResponse(BaseModel):
    """Sponsor package response schema."""

    id: UUID
    tenant_id: UUID
    conference_id: UUID
    name: str
    description: str | None
    price: Decimal
    currency: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SponsorPackageListResponse(BaseModel):
    """List of sponsor packages."""

    items: list[SponsorPackageResponse]
    total: int


# --- Booking Period Schemas ---


class BookingPeriodCreate(BaseModel):
    """Schema for creating a booking period."""

    name: str = Field(..., min_length=1, max_length=100)
    start_date: date
    end_date: date
    sort_order: int = 0
    prices: dict[str, Decimal] | None = None
    currency: str | None = Field(None, max_length=3)
    is_active: bool = True

    @model_validator(mode="after")
    def validate_dates(self) -> "BookingPeriodCreate":
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        return self


class BookingPeriodUpdate(BaseModel):
    """Schema for updating a booking period."""

    name: str | None = Field(None, min_length=1, max_length=100)
    start_date: date | None = None
    end_date: date | None = None
    sort_order: int | None = None
    prices: dict[str, Decimal] | None = None
    currency: str | None = Field(None, max_length=3)
    is_active: bool | None = None


class BookingPeriodResponse(BaseModel):
    """Booking period response schema."""

    id: UUID
    tenant_id: UUID
    conference_id: UUID
    name: str
    start_date: date
    end_date: date
    sort_order: int
    prices: dict[str, Decimal] | None
    currency: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BookingPeriodListResponse(BaseModel):
    """List of booking periods."""

    items: list[BookingPeriodResponse]
    total: int


# --- Booking Option Schemas ---


class BookingOptionCreate(BaseModel):
    """Schema for creating a booking option."""

    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    sort_order: int = 0
    is_active: bool = True


class BookingOptionUpdate(BaseModel):
    """Schema for updating a booking option."""

    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    sort_order: int | None = None
    is_active: bool | None = None


class BookingOptionResponse(BaseModel):
    """Booking option response schema."""

    id: UUID
    tenant_id: UUID
    conference_id: UUID
    name: str
    description: str | None
    sort_order: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BookingOptionListResponse(BaseModel):
    """List of booking options."""

    items: list[BookingOptionResponse]
    total: int


# --- Booking Package Schemas ---


class BookingPackageCreate(BaseModel):
    """Schema for creating a booking package."""

    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    sort_order: int = 0
    is_active: bool = True
    option_ids: list[UUID] = Field(
        ..., min_length=1, description="Booking option IDs included in this package"
    )


class BookingPackageUpdate(BaseModel):
    """Schema for updating a booking package."""

    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    sort_order: int | None = None
    is_active: bool | None = None
    option_ids: list[UUID] | None = None


class BookingPackageResponse(BaseModel):
    """Booking package response schema."""

    id: UUID
    tenant_id: UUID
    conference_id: UUID
    name: str
    description: str | None
    sort_order: int
    is_active: bool
    option_ids: list[UUID]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BookingPackageListResponse(BaseModel):
    """List of booking packages."""

    items: list[BookingPackageResponse]
    total: int


# --- Booking Matrix (combined view) ---


class BookingMatrixResponse(BaseModel):
    """Combined view of periods, options, and packages for the booking matrix UI."""

    periods: list[BookingPeriodResponse]
    options: list[BookingOptionResponse]
    packages: list[BookingPackageResponse]


# --- Discount Code Schemas ---


class DiscountCodeCreate(BaseModel):
    """Schema for creating a discount code."""

    name: str = Field(..., min_length=1, max_length=100)
    code: str = Field(..., min_length=1, max_length=50)
    discount_type: Literal["fixed", "percentage"] = Field(...)
    discount_value: Decimal = Field(..., gt=0)
    currency: str | None = Field(None, max_length=3)
    start_date: date | None = None
    end_date: date | None = None
    max_uses: int = Field(0, ge=0)
    is_active: bool = True
    applicable_option_ids: list[UUID] | None = Field(
        None, description="List of booking option IDs this discount applies to. Empty means applies to all."
    )

    @model_validator(mode="after")
    def validate_discount(self) -> "DiscountCodeCreate":
        if self.end_date is not None and self.start_date is not None:
            if self.end_date < self.start_date:
                raise ValueError("end_date must be on or after start_date")
        if self.discount_type == "percentage" and self.discount_value > 100:
            raise ValueError("percentage discount_value cannot exceed 100")
        return self


class DiscountCodeUpdate(BaseModel):
    """Schema for updating a discount code."""

    name: str | None = Field(None, min_length=1, max_length=100)
    code: str | None = Field(None, min_length=1, max_length=50)
    discount_type: Literal["fixed", "percentage"] | None = None
    discount_value: Decimal | None = Field(None, gt=0)
    currency: str | None = Field(None, max_length=3)
    start_date: date | None = None
    end_date: date | None = None
    max_uses: int | None = Field(None, ge=0)
    is_active: bool | None = None
    applicable_option_ids: list[UUID] | None = Field(
        None, description="List of booking option IDs this discount applies to. Empty list means applies to all."
    )


class DiscountCodeResponse(BaseModel):
    """Discount code response schema."""

    id: UUID
    tenant_id: UUID
    conference_id: UUID
    name: str
    code: str
    discount_type: str
    discount_value: Decimal
    currency: str | None
    start_date: date | None
    end_date: date | None
    max_uses: int
    usage_count: int
    is_active: bool
    applicable_option_ids: list[UUID] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DiscountCodeListResponse(BaseModel):
    """List of discount codes."""

    items: list[DiscountCodeResponse]
    total: int


# --- Session Type Schemas ---


class SessionTypeCreate(BaseModel):
    """Schema for creating a session type."""

    name: str = Field(..., min_length=1, max_length=100)
    slug: str = Field(..., min_length=1, max_length=50, pattern=r"^[a-z0-9_-]+$")
    duration_minutes: int = Field(..., gt=0)
    cfp_eligible: bool = True
    is_active: bool = True


class SessionTypeUpdate(BaseModel):
    """Schema for updating a session type."""

    name: str | None = Field(None, min_length=1, max_length=100)
    slug: str | None = Field(None, min_length=1, max_length=50, pattern=r"^[a-z0-9_-]+$")
    duration_minutes: int | None = Field(None, gt=0)
    cfp_eligible: bool | None = None
    is_active: bool | None = None


class SessionTypeResponse(BaseModel):
    """Session type response schema."""

    id: UUID
    tenant_id: UUID
    conference_id: UUID
    name: str
    slug: str
    duration_minutes: int
    cfp_eligible: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SessionTypeListResponse(BaseModel):
    """List of session types."""

    items: list[SessionTypeResponse]
    total: int


# --- CFP Committee Role Schemas ---


class CFPCommitteeRoleCreate(BaseModel):
    """Schema for creating a CFP committee role."""

    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    is_active: bool = True


class CFPCommitteeRoleUpdate(BaseModel):
    """Schema for updating a CFP committee role."""

    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = None
    is_active: bool | None = None


class CFPCommitteeRoleResponse(BaseModel):
    """CFP committee role response schema."""

    id: UUID
    tenant_id: UUID
    conference_id: UUID
    name: str
    description: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CFPCommitteeRoleListResponse(BaseModel):
    """List of CFP committee roles."""

    items: list[CFPCommitteeRoleResponse]
    total: int


# --- Pronoun Option Schemas (conference-scoped) ---


class PronounOptionCreate(BaseModel):
    """Schema for creating a pronoun option."""

    name: str = Field(..., min_length=1, max_length=100)
    is_active: bool = True


class PronounOptionUpdate(BaseModel):
    """Schema for updating a pronoun option."""

    name: str | None = Field(None, min_length=1, max_length=100)
    is_active: bool | None = None


class PronounOptionResponse(BaseModel):
    """Pronoun option response schema."""

    id: UUID
    tenant_id: UUID
    conference_id: UUID
    name: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PronounOptionListResponse(BaseModel):
    """List of pronoun options."""

    items: list[PronounOptionResponse]
    total: int
