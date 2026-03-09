"""
Public Portal Registration Schemas

Request/response schemas for public registration endpoint.
"""

from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.registration import (
    BillingProfileCreate,
    BulkAttendeeData,
    RegistrationResponse,
)


class PublicBookingOption(BaseModel):
    """Public view of a booking option with availability."""

    id: UUID
    name: str
    description: str | None
    price: float
    capacity: int | None
    current_registrations: int
    is_sold_out: bool
    conference_day_id: UUID | None

    model_config = {"from_attributes": True}


class PublicBookingPeriod(BaseModel):
    """Public view of a booking period."""

    id: UUID
    name: str
    start_date: str
    end_date: str
    prices: dict[str, float]  # booking_option_id -> price
    sort_order: int

    model_config = {"from_attributes": True}


class PublicConference(BaseModel):
    """Public view of conference for registration portal."""

    id: UUID
    name: str
    abbreviation: str
    description: str | None
    start_date: str | None
    end_date: str | None
    location: str | None  # venue_name or city
    website: str | None
    logo_url: str | None = None  # Conference logo for branding
    booking_options: list[PublicBookingOption]
    booking_periods: list[PublicBookingPeriod]
    currency: str
    country: str | None = None  # ISO country code for VAT calculation
    venue_type: str | None = None  # "in_person", "virtual", or "hybrid" for VAT rules
    registration_start_date: str | None = None  # When registration opens
    registration_end_date: str | None = None  # When registration closes
    success_message: str | None = None  # Custom success message for confirmation page

    model_config = {"from_attributes": True}


class PortalRegistrationRequest(BaseModel):
    """Request schema for public registration submission."""

    billing: BillingProfileCreate
    attendees: list[BulkAttendeeData] = Field(..., min_length=1, max_length=50)
    recaptcha_token: str | None = Field(None, description="reCAPTCHA token (optional if not enabled)")

    # Security fields
    honeypot_field: str | None = Field(None, description="Bot detection - should be empty")
    form_start_timestamp: float | None = Field(None, description="Unix timestamp when form was rendered")


class PortalRegistrationResponse(BaseModel):
    """Response schema for successful registration."""

    billing_profile_id: UUID
    registrations: list[RegistrationResponse]
    payment_required: bool
    payment_client_secret: str | None = None
    stripe_publishable_key: str | None = None
    success_url: str

    # Alumni discount fields (for authenticated registrations)
    is_alumni: bool = False
    alumni_conferences: list[dict] | None = None
