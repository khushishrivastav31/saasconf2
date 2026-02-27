"""Authentication schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class LoginRequest(BaseModel):
    """Login request schema."""

    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)


class TokenResponse(BaseModel):
    """Token response schema."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds until access token expires


class RefreshRequest(BaseModel):
    """Refresh token request schema."""

    refresh_token: str


class UserResponse(BaseModel):
    """User response schema (for /auth/me endpoint)."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: EmailStr
    first_name: str | None
    last_name: str | None
    pronouns: str | None = None
    role: str
    tenant_id: UUID | None
    tenant_name: str | None = None
    modules: list[str] = []  # List of module codes the user has access to
    is_active: bool
    is_tenant_super_user: bool = False
    message_notifications_enabled: bool = True
    theme_preference: str | None = None
    last_login: datetime | None
    created_at: datetime


class UserPreferencesUpdate(BaseModel):
    """Update user preferences (notification settings, theme, etc.)."""

    message_notifications_enabled: bool | None = None
    theme_preference: str | None = None

    @field_validator("theme_preference")
    @classmethod
    def validate_theme(cls, v: str | None) -> str | None:
        if v is not None and v not in ("light", "dark"):
            return None
        return v
