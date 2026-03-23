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


class TenantRoleResponse(BaseModel):
    """A single scoped role entry for a tenant user."""

    scope: str
    level: str


class TenantRoleAssignment(BaseModel):
    """A single role to assign: scope + level."""

    scope: str = Field(..., description="Role scope: all, conferences, trainings, accounting")
    level: str = Field(..., description="Permission level: super_user, admin, member")

    @field_validator("scope")
    @classmethod
    def validate_scope(cls, v: str) -> str:
        valid = {"all", "conferences", "trainings", "accounting"}
        if v not in valid:
            raise ValueError(f"Invalid scope '{v}'. Must be one of: {', '.join(sorted(valid))}")
        return v

    @field_validator("level")
    @classmethod
    def validate_level(cls, v: str) -> str:
        valid = {"super_user", "admin", "member"}
        if v not in valid:
            raise ValueError(f"Invalid level '{v}'. Must be one of: {', '.join(sorted(valid))}")
        return v


class BulkTenantRoleAssignment(BaseModel):
    """Bulk-set tenant roles for a user. Replaces all existing roles."""

    roles: list[TenantRoleAssignment] = Field(
        default_factory=list, description="List of roles to assign. Empty list removes all roles."
    )


class UserInDB(UserBase):
    """User schema with database fields."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID | None
    is_active: bool
    has_all_conference_access: bool = True
    tenant_roles: list[TenantRoleResponse] = []
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
    """Schema for tenant admin to create a user within their tenant.

    When password is omitted, the user is created with a random unusable
    password and receives an invite email to set their own.
    """

    email: EmailStr
    password: str | None = Field(None, min_length=8, max_length=128)
    first_name: str | None = Field(None, max_length=255)
    last_name: str | None = Field(None, max_length=255)
    pronouns: str | None = Field(None, max_length=100)
    role: str = Field(default=UserRole.USER.value)

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
    tenant_roles: list[TenantRoleResponse] = []
    last_login: datetime | None
    created_at: datetime
    updated_at: datetime
