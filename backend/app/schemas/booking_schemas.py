"""Booking-related schemas: periods, options, packages, matrix, and discount codes."""

from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

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
    conference_day_id: UUID | None = None
    sort_order: int = 0
    is_active: bool = True


class BookingOptionUpdate(BaseModel):
    """Schema for updating a booking option."""

    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    conference_day_id: UUID | None = None
    sort_order: int | None = None
    is_active: bool | None = None


class BookingOptionResponse(BaseModel):
    """Booking option response schema."""

    id: UUID
    tenant_id: UUID
    conference_id: UUID
    name: str
    description: str | None
    conference_day_id: UUID | None
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
