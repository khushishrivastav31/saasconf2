"""Tenant schemas."""

import re
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.core.validators import validate_email, validate_phone


class ContactPerson(BaseModel):
    """Schema for a contact person (used for create/update with validation)."""

    first_name: str = Field(..., min_length=1, max_length=255)
    last_name: str = Field(default="", max_length=255)
    email: str | None = Field(None, max_length=255)
    phone: str | None = Field(None, max_length=50)
    role: str | None = Field(None, max_length=100)  # e.g., "Manager", "Technical Contact"

    @field_validator("email")
    @classmethod
    def check_email(cls, v: str | None) -> str | None:
        return validate_email(v)

    @field_validator("phone")
    @classmethod
    def check_phone(cls, v: str | None) -> str | None:
        return validate_phone(v)


class ContactPersonResponse(BaseModel):
    """Schema for contact person in responses (no validation on read)."""

    first_name: str
    last_name: str = ""
    email: str | None = None
    phone: str | None = None
    role: str | None = None


class TenantBase(BaseModel):
    """Base tenant schema with common fields."""

    name: str = Field(..., min_length=2, max_length=255)
    slug: str = Field(..., min_length=2, max_length=100)
    settings: dict = Field(default_factory=dict)

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, v: str) -> str:
        """Validate slug format (lowercase, alphanumeric, hyphens only)."""
        if not re.match(r"^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$", v):
            raise ValueError(
                "Slug must be lowercase, start/end with alphanumeric, and contain only letters, numbers, and hyphens"
            )
        return v


class TenantCreate(TenantBase):
    """Schema for creating a tenant."""

    # Address fields
    address: str | None = Field(None, max_length=500)
    postal_code: str | None = Field(None, max_length=20)
    city: str | None = Field(None, max_length=100)
    country: str | None = Field(None, max_length=100)

    # Business fields
    vat_number: str | None = Field(None, max_length=50)
    website: str | None = Field(None, max_length=500)
    email_domain: str | None = Field(None, max_length=255)

    # Contact persons
    contact_persons: list[ContactPerson] = Field(default_factory=list)

    # Comments
    comments: str | None = None

    # Optional: create admin user for tenant
    admin_email: EmailStr | None = None
    admin_password: str | None = Field(None, min_length=8, max_length=128)
    admin_first_name: str | None = None
    admin_last_name: str | None = None


class TenantUpdate(BaseModel):
    """Schema for updating a tenant."""

    name: str | None = Field(None, min_length=2, max_length=255)
    slug: str | None = Field(None, min_length=2, max_length=100)
    is_active: bool | None = None
    settings: dict | None = None

    # Address fields
    address: str | None = Field(None, max_length=500)
    postal_code: str | None = Field(None, max_length=20)
    city: str | None = Field(None, max_length=100)
    country: str | None = Field(None, max_length=100)

    # Business fields
    vat_number: str | None = Field(None, max_length=50)
    website: str | None = Field(None, max_length=500)
    email_domain: str | None = Field(None, max_length=255)

    # Contact persons
    contact_persons: list[ContactPerson] | None = None

    # Comments
    comments: str | None = None

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, v: str | None) -> str | None:
        """Validate slug format if provided."""
        if v is None:
            return v
        if not re.match(r"^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$", v):
            raise ValueError(
                "Slug must be lowercase, start/end with alphanumeric, and contain only letters, numbers, and hyphens"
            )
        return v


class TenantResponse(BaseModel):
    """Tenant response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str
    is_active: bool
    settings: dict

    # Address fields
    address: str | None
    postal_code: str | None
    city: str | None
    country: str | None

    # Business fields
    vat_number: str | None
    website: str | None
    logo_url: str | None = None
    email_domain: str | None = None

    # Contact persons
    contact_persons: list[ContactPersonResponse]

    # Comments
    comments: str | None

    # Super user (designated by SaaS admin)
    super_user_id: UUID | None = None

    created_at: datetime
    updated_at: datetime
    user_count: int = 0
    module_count: int = 0


class TenantListResponse(BaseModel):
    """Paginated tenant list response."""

    items: list[TenantResponse]
    total: int
    page: int
    page_size: int
    pages: int
