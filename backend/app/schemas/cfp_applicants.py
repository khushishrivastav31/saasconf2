"""CFP applicant-related schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.validators import validate_phone


class ApplicantSocialLinks(BaseModel):
    """Schema for applicant social media links."""

    linkedin: str | None = None
    bluesky: str | None = None
    mastodon: str | None = None
    twitter: str | None = None
    instagram: str | None = None
    facebook: str | None = None
    youtube: str | None = None
    tiktok: str | None = None
    github: str | None = None
    website: str | None = None


class ApplicantCreate(BaseModel):
    """Schema for creating an applicant."""

    first_name: str = Field(..., min_length=1, max_length=255)
    last_name: str = Field(default="", max_length=255)
    pronouns: str | None = Field(None, max_length=100)
    email: EmailStr
    phone: str | None = Field(None, max_length=50)
    title: str | None = Field(None, max_length=255)
    company: str | None = Field(None, max_length=255)
    bio: str | None = None
    password: str = Field(..., min_length=6)
    allow_out_of_timeframe: bool = False
    social_links: ApplicantSocialLinks | None = None
    needs_accessibility: bool = False
    accessibility_details: str | None = None
    agrees_to_recording: bool = False

    @field_validator("phone")
    @classmethod
    def check_phone(cls, v: str | None) -> str | None:
        return validate_phone(v)


class ApplicantUpdate(BaseModel):
    """Schema for updating an applicant."""

    first_name: str | None = Field(None, min_length=1, max_length=255)
    last_name: str | None = Field(None, max_length=255)
    pronouns: str | None = Field(None, max_length=100)
    email: EmailStr | None = None
    phone: str | None = Field(None, max_length=50)
    title: str | None = Field(None, max_length=255)
    company: str | None = Field(None, max_length=255)
    bio: str | None = None
    password: str | None = Field(None, min_length=6)
    allow_out_of_timeframe: bool | None = None
    social_links: ApplicantSocialLinks | None = None
    needs_accessibility: bool | None = None
    accessibility_details: str | None = None
    agrees_to_recording: bool | None = None

    @field_validator("phone")
    @classmethod
    def check_phone(cls, v: str | None) -> str | None:
        return validate_phone(v)


class ApplicantResponse(BaseModel):
    """Applicant response schema."""

    id: UUID
    tenant_id: UUID
    first_name: str
    last_name: str
    pronouns: str | None = None
    email: str
    phone: str | None
    title: str | None
    company: str | None
    bio: str | None
    allow_out_of_timeframe: bool
    social_links: dict = {}
    needs_accessibility: bool = False
    accessibility_details: str | None = None
    agrees_to_recording: bool = False
    picture_url: str | None = None
    video_url: str | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ApplicantListResponse(BaseModel):
    """Applicant list response."""

    items: list[ApplicantResponse]
    total: int
