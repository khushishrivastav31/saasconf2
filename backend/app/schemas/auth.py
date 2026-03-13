"""Authentication schemas."""

import re
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
    mfa_enabled: bool = False
    message_notifications_enabled: bool = True
    theme_preference: str | None = None
    last_login: datetime | None
    created_at: datetime


class ForgotPasswordRequest(BaseModel):
    """Forgot password request — send a reset link."""

    email: EmailStr


class ResetPasswordRequest(BaseModel):
    """Reset password with token."""

    token: str
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one digit")
        return v


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


# ---------------------------------------------------------------------------
# MFA schemas
# ---------------------------------------------------------------------------


class MFALoginResponse(BaseModel):
    """Returned instead of TokenResponse when MFA is required."""

    mfa_required: bool = True
    mfa_token: str  # short-lived token to present to /auth/mfa/verify


class MFAVerifyRequest(BaseModel):
    """Verify a TOTP code (or recovery code) during login."""

    mfa_token: str
    code: str = Field(..., min_length=6, max_length=12)


class MFASetupResponse(BaseModel):
    """Returned when initiating MFA setup."""

    secret: str
    provisioning_uri: str
    qr_code_svg: str  # inline SVG for QR code


class MFAVerifySetupRequest(BaseModel):
    """Confirm MFA setup with a valid TOTP code."""

    code: str = Field(..., min_length=6, max_length=6)


class MFARecoveryCodesResponse(BaseModel):
    """One-time display of recovery codes after MFA setup."""

    recovery_codes: list[str]


class MFAStatusResponse(BaseModel):
    """Current MFA status for the authenticated user."""

    mfa_enabled: bool
