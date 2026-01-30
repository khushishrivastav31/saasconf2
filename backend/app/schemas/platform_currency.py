"""Platform currency schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class PlatformCurrencyCreate(BaseModel):
    """Schema for creating a platform currency."""

    code: str = Field(..., min_length=1, max_length=3, pattern=r"^[A-Z]{1,3}$")
    name: str = Field(..., min_length=1, max_length=50)
    symbol: str = Field(..., min_length=1, max_length=5)
    is_active: bool = True


class PlatformCurrencyUpdate(BaseModel):
    """Schema for updating a platform currency."""

    code: str | None = Field(None, min_length=1, max_length=3, pattern=r"^[A-Z]{1,3}$")
    name: str | None = Field(None, min_length=1, max_length=50)
    symbol: str | None = Field(None, min_length=1, max_length=5)
    is_active: bool | None = None


class PlatformCurrencyResponse(BaseModel):
    """Platform currency response schema."""

    id: UUID
    code: str
    name: str
    symbol: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PlatformCurrencyListResponse(BaseModel):
    """Paginated platform currency list response."""

    items: list[PlatformCurrencyResponse]
    total: int
    page: int
    page_size: int
    pages: int
