"""User schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.models.user import UserRole


class UserBase(BaseModel):
    """Base user schema."""

    email: EmailStr
    full_name: str | None = Field(None, max_length=255)
    role: str = Field(default=UserRole.USER.value)


class UserCreate(UserBase):
    """Schema for creating a user."""

    password: str = Field(..., min_length=8, max_length=128)
    tenant_id: UUID | None = None  # None for super admin


class UserUpdate(BaseModel):
    """Schema for updating a user."""

    email: EmailStr | None = None
    full_name: str | None = Field(None, max_length=255)
    role: str | None = None
    is_active: bool | None = None
    password: str | None = Field(None, min_length=8, max_length=128)


class UserInDB(UserBase):
    """User schema with database fields."""

    id: UUID
    tenant_id: UUID | None
    is_active: bool
    last_login: datetime | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


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
    full_name: str | None = Field(None, max_length=255)
    role: str = Field(default=UserRole.USER.value)

    @property
    def is_valid_role(self) -> bool:
        """Check if role is valid for tenant user creation."""
        return self.role in [UserRole.TENANT_ADMIN.value, UserRole.USER.value]


class TenantUserResponse(BaseModel):
    """User response for tenant context."""

    id: UUID
    email: str
    full_name: str | None
    role: str
    is_active: bool
    last_login: datetime | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
