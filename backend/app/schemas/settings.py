"""Schemas for conference settings: volunteer roles, location types, currencies, sponsor packages, session types, committee roles, and pronoun options."""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

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


# --- Session Type Schemas ---


class SessionTypeCreate(BaseModel):
    """Schema for creating a session type."""

    name: str = Field(..., min_length=1, max_length=100)
    slug: str = Field(..., min_length=1, max_length=50, pattern=r"^[a-z0-9_-]+$")
    duration_minutes: int = Field(..., gt=0)
    cfp_eligible: bool = True
    separately_bookable: bool = False
    is_active: bool = True


class SessionTypeUpdate(BaseModel):
    """Schema for updating a session type."""

    name: str | None = Field(None, min_length=1, max_length=100)
    slug: str | None = Field(None, min_length=1, max_length=50, pattern=r"^[a-z0-9_-]+$")
    duration_minutes: int | None = Field(None, gt=0)
    cfp_eligible: bool | None = None
    separately_bookable: bool | None = None
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
    separately_bookable: bool
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


# Re-exports for backward compatibility
from app.schemas.booking_schemas import (  # noqa: E402, F401
    BookingMatrixResponse,
    BookingOptionCreate,
    BookingOptionListResponse,
    BookingOptionResponse,
    BookingOptionUpdate,
    BookingPackageCreate,
    BookingPackageListResponse,
    BookingPackageResponse,
    BookingPackageUpdate,
    BookingPeriodCreate,
    BookingPeriodListResponse,
    BookingPeriodResponse,
    BookingPeriodUpdate,
    DiscountCodeCreate,
    DiscountCodeListResponse,
    DiscountCodeResponse,
    DiscountCodeUpdate,
)
