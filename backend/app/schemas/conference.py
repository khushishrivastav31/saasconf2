"""Conference schemas."""

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.core.validators import validate_phone


class SocialLinks(BaseModel):
    """Schema for social media links."""

    linkedin: str | None = None
    bluesky: str | None = None
    mastodon: str | None = None
    reddit: str | None = None
    tiktok: str | None = None
    instagram: str | None = None
    facebook: str | None = None
    twitter: str | None = None
    youtube: str | None = None


class TeamMember(BaseModel):
    """Schema for a conference team member (informational only, no login access)."""

    first_name: str = Field(..., min_length=1, max_length=255)
    last_name: str = Field(default="", max_length=255)
    email: str | None = Field(None, max_length=255)
    phone: str | None = Field(None, max_length=50)
    role: str | None = Field(None, max_length=100)  # e.g., "Conference Chair", "Program Committee"
    is_manager: bool = False  # Informational flag for conference manager role

    @field_validator("phone")
    @classmethod
    def check_phone(cls, v: str | None) -> str | None:
        return validate_phone(v)


class ConferenceBase(BaseModel):
    """Base conference schema with common fields."""

    name: str = Field(..., min_length=2, max_length=255)
    abbreviation: str | None = Field(None, max_length=50)
    description: str | None = None
    website: str | None = Field(None, max_length=500)


class ConferenceCreate(ConferenceBase):
    """Schema for creating a conference."""

    # Logo
    logo_url: str | None = Field(None, max_length=500)

    # Contact emails
    support_email: str | None = Field(None, max_length=255)
    contact_email: str | None = Field(None, max_length=255)

    # Dates
    start_date: date | None = None
    end_date: date | None = None

    # Location
    venue_name: str | None = Field(None, max_length=255)
    venue_address: str | None = Field(None, max_length=500)
    city: str | None = Field(None, max_length=100)
    country: str | None = Field(None, max_length=100)
    timezone: str | None = Field(None, max_length=50)
    venue_type: str = "onsite"  # onsite, virtual, hybrid
    virtual_platform_url: str | None = Field(None, max_length=500)

    # Social links
    social_links: SocialLinks | None = None

    # Team members
    team_members: list[TeamMember] = Field(default_factory=list)

    # Settings
    settings: dict = Field(default_factory=dict)

    # Currency (ISO 4217 code)
    currency: str | None = Field(None, min_length=3, max_length=3)
    # Optional second currency for invoices
    invoice_currency: str | None = Field(None, min_length=3, max_length=3)

    @field_validator("end_date")
    @classmethod
    def validate_end_date(cls, v: date | None, info) -> date | None:
        """Validate that end_date is not before start_date."""
        if v is None:
            return v
        start_date = info.data.get("start_date")
        if start_date and v < start_date:
            raise ValueError("End date cannot be before start date")
        return v


class ConferenceUpdate(BaseModel):
    """Schema for updating a conference."""

    name: str | None = Field(None, min_length=2, max_length=255)
    abbreviation: str | None = Field(None, max_length=50)
    description: str | None = None
    website: str | None = Field(None, max_length=500)
    logo_url: str | None = Field(None, max_length=500)

    # Contact emails
    support_email: str | None = Field(None, max_length=255)
    contact_email: str | None = Field(None, max_length=255)

    # Dates
    start_date: date | None = None
    end_date: date | None = None

    # Location
    venue_name: str | None = Field(None, max_length=255)
    venue_address: str | None = Field(None, max_length=500)
    city: str | None = Field(None, max_length=100)
    country: str | None = Field(None, max_length=100)
    timezone: str | None = Field(None, max_length=50)
    venue_type: str | None = None  # onsite, virtual, hybrid
    virtual_platform_url: str | None = Field(None, max_length=500)

    # Social links
    social_links: SocialLinks | None = None

    # Team members
    team_members: list[TeamMember] | None = None

    # Settings
    settings: dict | None = None

    # Currency (ISO 4217 code)
    currency: str | None = Field(None, min_length=3, max_length=3)
    # Optional second currency for invoices
    invoice_currency: str | None = Field(None, min_length=3, max_length=3)

    # Status
    is_active: bool | None = None
    is_published: bool | None = None


class ConferenceResponse(BaseModel):
    """Conference response schema."""

    id: UUID
    tenant_id: UUID
    tenant_slug: str | None = None
    name: str
    abbreviation: str | None
    description: str | None
    website: str | None
    logo_url: str | None

    # Contact emails
    support_email: str | None = None
    contact_email: str | None = None

    # Dates
    start_date: date | None
    end_date: date | None

    # Location
    venue_name: str | None
    venue_address: str | None
    city: str | None
    country: str | None
    timezone: str | None
    venue_type: str
    virtual_platform_url: str | None

    # Social links
    social_links: dict

    # Team members
    team_members: list[TeamMember]

    # Settings
    settings: dict

    # Currency (ISO 4217 code)
    currency: str | None = None
    # Optional second currency for invoices
    invoice_currency: str | None = None

    # Status
    is_active: bool
    is_published: bool

    # Timestamps
    created_at: datetime
    updated_at: datetime

    # Computed fields
    managers_count: int = 0
    team_count: int = 0
    status: str = "draft"  # "draft", "upcoming", "ongoing", "past"

    class Config:
        from_attributes = True


class ConferenceListResponse(BaseModel):
    """Paginated conference list response."""

    items: list[ConferenceResponse]
    total: int
    page: int
    page_size: int
    pages: int


class ConferenceStats(BaseModel):
    """Conference statistics."""

    total: int
    active: int
    published: int
    upcoming: int
    ongoing: int
    past: int


class ConferenceAssociationRequest(BaseModel):
    """Schema for linking an entity to a conference."""

    id: UUID
