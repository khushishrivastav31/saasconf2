"""User schemas."""

import re
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models.user import UserRole


class UserBase(BaseModel):
    """Base user schema."""

    email: EmailStr
    first_name: str | None = Field(None, max_length=255)
    last_name: str | None = Field(None, max_length=255)
    pronouns: str | None = Field(None, max_length=100)
    role: str = Field(default=UserRole.USER.value)


class UserCreate(UserBase):
    """Schema for creating a user."""

    password: str = Field(..., min_length=8, max_length=128)
    tenant_id: UUID | None = None  # None for super admin

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one digit")
        return v


class UserUpdate(BaseModel):
    """Schema for updating a user."""

    email: EmailStr | None = None
    first_name: str | None = Field(None, max_length=255)
    last_name: str | None = Field(None, max_length=255)
    pronouns: str | None = Field(None, max_length=100)
    role: str | None = None
    is_active: bool | None = None
    has_all_conference_access: bool | None = None
    password: str | None = Field(None, min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str | None) -> str | None:
        if v is None:
            return v
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one digit")
        return v


class UserInDB(UserBase):
    """User schema with database fields."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID | None
    is_active: bool
    has_all_conference_access: bool = True
    last_login: datetime | None
    created_at: datetime
    updated_at: datetime


class UserListResponse(BaseModel):
    """Paginated user list response."""

    items: list[UserInDB]
    total: int
    page: int
    page_size: int
    pages: int


class TenantUserCreate(BaseModel):
    """Schema for tenant admin to create a user within their tenant."""

    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    first_name: str | None = Field(None, max_length=255)
    last_name: str | None = Field(None, max_length=255)
    pronouns: str | None = Field(None, max_length=100)
    role: str = Field(default=UserRole.USER.value)

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one digit")
        return v

    @property
    def is_valid_role(self) -> bool:
        """Check if role is valid for tenant user creation."""
        return self.role in [UserRole.TENANT_ADMIN.value, UserRole.USER.value]


class TenantUserResponse(BaseModel):
    """User response for tenant context."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    first_name: str | None
    last_name: str | None
    pronouns: str | None
    role: str
    is_active: bool
    has_all_conference_access: bool = True
    last_login: datetime | None
    created_at: datetime
    updated_at: datetime
