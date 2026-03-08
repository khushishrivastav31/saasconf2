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


class PortalRegistrationRequest(BaseModel):
    """Request schema for public registration submission."""

    billing: BillingProfileCreate
    attendees: list[BulkAttendeeData] = Field(..., min_length=1, max_length=50)
    recaptcha_token: str = Field(..., min_length=1)

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
