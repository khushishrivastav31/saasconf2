"""Module schemas."""

import re
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class ModuleBase(BaseModel):
    """Base module schema."""

    code: str = Field(..., min_length=2, max_length=50)
    name: str = Field(..., min_length=2, max_length=255)
    description: str | None = None
    config_schema: dict = Field(default_factory=dict)

    @field_validator("code")
    @classmethod
    def validate_code(cls, v: str) -> str:
        """Validate module code format (lowercase, alphanumeric, underscores)."""
        if not re.match(r"^[a-z][a-z0-9_]*$", v):
            raise ValueError(
                "Module code must be lowercase, start with a letter, "
                "and contain only letters, numbers, and underscores"
            )
        return v


class ModuleCreate(ModuleBase):
    """Schema for creating a module."""

    pass


class ModuleUpdate(BaseModel):
    """Schema for updating a module."""

    name: str | None = Field(None, min_length=2, max_length=255)
    description: str | None = None
    is_active: bool | None = None
    config_schema: dict | None = None


class ModuleResponse(BaseModel):
    """Module response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str
    name: str
    description: str | None
    is_active: bool
    config_schema: dict = Field(default_factory=dict)
    created_at: datetime
    tenant_count: int = 0  # Number of tenants using this module


class TenantModuleAssign(BaseModel):
    """Schema for assigning a module to a tenant."""

    module_id: UUID
    config: dict = Field(default_factory=dict)

    # Subscription dates
    start_date: datetime | None = None
    end_date: datetime | None = None

    # Pricing
    price: Decimal | None = Field(None, ge=0)
    currency: str = Field(default="USD", min_length=3, max_length=3)

    # Resource limits (null = unlimited)
    max_papers: int | None = Field(None, ge=0)
    max_speakers: int | None = Field(None, ge=0)
    max_attendees: int | None = Field(None, ge=0)
    max_volunteers: int | None = Field(None, ge=0)

    @model_validator(mode="after")
    def validate_dates(self) -> "TenantModuleAssign":
        """Ensure end_date is after start_date if both provided."""
        if self.start_date and self.end_date and self.end_date <= self.start_date:
            raise ValueError("end_date must be after start_date")
        return self


class TenantModuleUpdate(BaseModel):
    """Schema for updating a tenant module assignment."""

    is_enabled: bool | None = None
    config: dict | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    price: Decimal | None = Field(None, ge=0)
    currency: str | None = Field(None, min_length=3, max_length=3)
    max_papers: int | None = Field(None, ge=0)
    max_speakers: int | None = Field(None, ge=0)
    max_attendees: int | None = Field(None, ge=0)
    max_volunteers: int | None = Field(None, ge=0)


class TenantModuleResponse(BaseModel):
    """Tenant module assignment response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    module_id: UUID
    module_code: str
    module_name: str
    is_enabled: bool
    config: dict
    granted_at: datetime
    granted_by: UUID | None

    # Subscription dates
    start_date: datetime | None
    end_date: datetime | None

    # Pricing
    price: Decimal | None
    currency: str | None

    # Resource limits
    max_papers: int | None
    max_speakers: int | None
    max_attendees: int | None
    max_volunteers: int | None

    # Computed field
    is_active_subscription: bool


class ModuleListResponse(BaseModel):
    """Paginated module list response."""

    items: list[ModuleResponse]
    total: int
    page: int
    page_size: int
    pages: int
