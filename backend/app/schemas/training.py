"""Training schemas."""

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.html_sanitize import sanitize_html
from app.core.validators import validate_email, validate_phone
from app.schemas.conference import SocialLinks, TeamMember


class TrainingBase(BaseModel):
    """Base training schema with common fields."""

    name: str = Field(..., min_length=2, max_length=255)
    slug: str | None = Field(None, max_length=100)
    abbreviation: str | None = Field(None, max_length=50)
    description: str | None = None
    content: str | None = None
    duration: int | None = Field(None, ge=1, le=365)
    website: str | None = Field(None, max_length=500)
    color: str | None = Field(None, max_length=7, pattern=r"^#[0-9A-Fa-f]{6}$")

    # Pricing
    regular_price: Decimal | None = None
    early_bird_price: Decimal | None = None

    # Catalog references
    language_id: UUID | None = None
    second_language_id: UUID | None = None
    syllabus_id: UUID | None = None
    theme_id: UUID | None = None
    certification_body_id: UUID | None = None

    @field_validator("abbreviation")
    @classmethod
    def check_no_spaces(cls, v: str | None) -> str | None:
        if v and " " in v:
            raise ValueError("Abbreviation must not contain spaces")
        return v

    @field_validator("description", "content")
    @classmethod
    def sanitize_html_fields(cls, v: str | None) -> str | None:
        return sanitize_html(v) if v else v


class TrainingCreate(TrainingBase):
    """Schema for creating a training."""

    logo_url: str | None = Field(None, max_length=500)

    # Contact info
    support_email: str | None = Field(None, max_length=255)
    contact_email: str | None = Field(None, max_length=255)
    phone: str | None = Field(None, max_length=50)

    # Dates
    start_date: date | None = None
    end_date: date | None = None

    # Location
    venue_name: str | None = Field(None, max_length=255)
    venue_address: str | None = Field(None, max_length=500)
    city: str | None = Field(None, max_length=100)
    state: str | None = Field(None, max_length=100)
    postal_code: str | None = Field(None, max_length=20)
    country: str | None = Field(None, max_length=100)
    timezone: str | None = Field(None, max_length=50)
    locale: str | None = Field("en", max_length=10)
    venue_type: str = "onsite"
    venue_url: str | None = Field(None, max_length=500)
    virtual_platform_url: str | None = Field(None, max_length=500)

    # Social links
    social_links: SocialLinks | None = None

    # Team members
    team_members: list[TeamMember] = Field(default_factory=list)

    # Settings
    settings: dict = Field(default_factory=dict)

    # Currency
    currency: str | None = Field(None, min_length=3, max_length=3)
    invoice_currency: str | None = Field(None, min_length=3, max_length=3)

    @field_validator("support_email", "contact_email")
    @classmethod
    def check_emails(cls, v: str | None) -> str | None:
        return validate_email(v)

    @field_validator("phone")
    @classmethod
    def check_phone(cls, v: str | None) -> str | None:
        return validate_phone(v)

    @field_validator("end_date")
    @classmethod
    def validate_end_date(cls, v: date | None, info) -> date | None:
        if v is None:
            return v
        start_date = info.data.get("start_date")
        if start_date and v < start_date:
            raise ValueError("End date cannot be before start date")
        return v


class TrainingUpdate(BaseModel):
    """Schema for updating a training."""

    name: str | None = Field(None, min_length=2, max_length=255)
    slug: str | None = Field(None, max_length=100)
    abbreviation: str | None = Field(None, max_length=50)
    description: str | None = None
    content: str | None = None
    duration: int | None = Field(None, ge=1, le=365)
    website: str | None = Field(None, max_length=500)
    color: str | None = Field(None, max_length=7, pattern=r"^#[0-9A-Fa-f]{6}$")
    logo_url: str | None = Field(None, max_length=500)

    # Pricing
    regular_price: Decimal | None = None
    early_bird_price: Decimal | None = None

    # Catalog references
    language_id: UUID | None = None
    second_language_id: UUID | None = None
    syllabus_id: UUID | None = None
    theme_id: UUID | None = None
    certification_body_id: UUID | None = None

    # Contact info
    support_email: str | None = Field(None, max_length=255)
    contact_email: str | None = Field(None, max_length=255)
    phone: str | None = Field(None, max_length=50)

    # Dates
    start_date: date | None = None
    end_date: date | None = None

    # Location
    venue_name: str | None = Field(None, max_length=255)
    venue_address: str | None = Field(None, max_length=500)
    city: str | None = Field(None, max_length=100)
    state: str | None = Field(None, max_length=100)
    postal_code: str | None = Field(None, max_length=20)
    country: str | None = Field(None, max_length=100)
    timezone: str | None = Field(None, max_length=50)
    locale: str | None = Field(None, max_length=10)
    venue_type: str | None = None
    venue_url: str | None = Field(None, max_length=500)
    virtual_platform_url: str | None = Field(None, max_length=500)

    # Social links
    social_links: SocialLinks | None = None

    # Team members
    team_members: list[TeamMember] | None = None

    # Settings
    settings: dict | None = None

    # Currency
    currency: str | None = Field(None, min_length=3, max_length=3)
    invoice_currency: str | None = Field(None, min_length=3, max_length=3)

    # Status
    is_active: bool | None = None
    is_published: bool | None = None

    @field_validator("abbreviation")
    @classmethod
    def check_no_spaces(cls, v: str | None) -> str | None:
        if v and " " in v:
            raise ValueError("Abbreviation must not contain spaces")
        return v

    @field_validator("description", "content")
    @classmethod
    def sanitize_html_fields(cls, v: str | None) -> str | None:
        return sanitize_html(v) if v else v

    @field_validator("support_email", "contact_email")
    @classmethod
    def check_emails(cls, v: str | None) -> str | None:
        return validate_email(v)

    @field_validator("phone")
    @classmethod
    def check_phone(cls, v: str | None) -> str | None:
        return validate_phone(v)


class TrainingResponse(BaseModel):
    """Training response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    name: str
    slug: str | None = None
    abbreviation: str | None
    description: str | None
    content: str | None = None
    duration: int | None = None
    website: str | None
    color: str | None = None
    logo_url: str | None

    # Pricing
    regular_price: Decimal | None = None
    early_bird_price: Decimal | None = None

    # Catalog references
    language_id: UUID | None = None
    language_name: str | None = None
    second_language_id: UUID | None = None
    second_language_name: str | None = None
    syllabus_id: UUID | None = None
    syllabus_name: str | None = None
    theme_id: UUID | None = None
    theme_name: str | None = None
    certification_body_id: UUID | None = None
    certification_body_name: str | None = None

    # Contact info
    support_email: str | None = None
    contact_email: str | None = None
    phone: str | None = None

    # Dates
    start_date: date | None
    end_date: date | None

    # Location
    venue_name: str | None
    venue_address: str | None
    city: str | None
    state: str | None = None
    postal_code: str | None = None
    country: str | None
    timezone: str | None
    locale: str | None = "en"
    venue_type: str
    venue_url: str | None = None
    virtual_platform_url: str | None

    # Social links
    social_links: dict

    # Team members
    team_members: list[TeamMember]

    # Settings
    settings: dict

    # Currency
    currency: str | None = None
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
    status: str = "draft"


class TrainingListResponse(BaseModel):
    """Paginated training list response."""

    items: list[TrainingResponse]
    total: int
    page: int
    page_size: int
    pages: int


# --- Theme Schemas ---


class TrainingThemeCreate(BaseModel):
    """Schema for creating a training theme."""

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    language_id: UUID | None = None


class TrainingThemeUpdate(BaseModel):
    """Schema for updating a training theme."""

    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    language_id: UUID | None = None


class TrainingThemeResponse(BaseModel):
    """Training theme response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    name: str
    description: str | None
    language_id: UUID | None = None
    language_name: str | None = None
    created_at: datetime
    updated_at: datetime


class TrainingThemeListResponse(BaseModel):
    """Training theme list response."""

    items: list[TrainingThemeResponse]
    total: int


# --- Language Schemas ---


class TrainingLanguageCreate(BaseModel):
    """Schema for creating a training language."""

    name: str = Field(..., min_length=1, max_length=255)


class TrainingLanguageUpdate(BaseModel):
    """Schema for updating a training language."""

    name: str | None = Field(None, min_length=1, max_length=255)


class TrainingLanguageResponse(BaseModel):
    """Training language response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    name: str
    created_at: datetime
    updated_at: datetime


class TrainingLanguageListResponse(BaseModel):
    """Training language list response."""

    items: list[TrainingLanguageResponse]
    total: int
