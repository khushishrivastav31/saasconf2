"""Registration schemas."""

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class RegistrationStatus(StrEnum):
    """Registration status values."""

    REGISTERED_PENDING_INVOICE = "registered_pending_invoice"
    INVOICED = "invoiced"
    PAID = "paid"
    CANCELLED = "cancelled"


class RegistrationMode(StrEnum):
    """How the registration was created."""

    INDIVIDUAL = "individual"
    COMPANY_SINGLE = "company_single"
    COMPANY_BULK = "company_bulk"


class RegistrationItemType(StrEnum):
    """Type of add-on item."""

    BOOKING_OPTION = "booking_option"
    TUTORIAL = "tutorial"


# ---------------------------------------------------------------------------
# Billing Profile schemas
# ---------------------------------------------------------------------------


class BillingProfileBase(BaseModel):
    """Billing data collected at registration time."""

    company_name: str | None = Field(None, max_length=255)
    street: str = Field(..., min_length=1, max_length=500)
    postal_code: str = Field(..., min_length=1, max_length=20)
    city: str = Field(..., min_length=1, max_length=255)
    country: str = Field(..., min_length=1, max_length=100)
    contact_first_name: str = Field(..., min_length=1, max_length=255)
    contact_last_name: str = Field(..., min_length=1, max_length=255)
    contact_phone: str = Field(..., min_length=1, max_length=50)
    contact_email: EmailStr
    vat_number: str | None = Field(None, max_length=50)
    procurement_code: str | None = Field(None, max_length=100)
    payment_method: str | None = Field(None, max_length=20)  # bank_transfer, credit_card
    discount_code: str | None = Field(None, max_length=50)


class BillingProfileCreate(BillingProfileBase):
    """Schema for creating a billing profile."""

    vat_validated: bool | None = None
    payment_intent_id: str | None = None  # Stripe PaymentIntent ID for credit card payments


class BillingProfileUpdate(BaseModel):
    """Schema for updating a billing profile."""

    company_name: str | None = Field(None, max_length=255)
    street: str | None = Field(None, min_length=1, max_length=500)
    postal_code: str | None = Field(None, min_length=1, max_length=20)
    city: str | None = Field(None, min_length=1, max_length=255)
    country: str | None = Field(None, min_length=1, max_length=100)
    contact_first_name: str | None = Field(None, min_length=1, max_length=255)
    contact_last_name: str | None = Field(None, min_length=1, max_length=255)
    contact_phone: str | None = Field(None, min_length=1, max_length=50)
    contact_email: EmailStr | None = None
    vat_number: str | None = Field(None, max_length=50)
    vat_validated: bool | None = None
    procurement_code: str | None = Field(None, max_length=100)
    payment_method: str | None = Field(None, max_length=20)
    discount_code: str | None = Field(None, max_length=50)


class BillingProfileResponse(BillingProfileBase):
    """Billing profile response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    conference_id: UUID
    vat_validated: bool | None = None
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Registration Item (add-on) schemas
# ---------------------------------------------------------------------------


class RegistrationItemCreate(BaseModel):
    """Add an item (tutorial or booking option) to a registration."""

    item_type: RegistrationItemType
    booking_option_id: UUID | None = None
    program_session_id: UUID | None = None
    notes: str | None = None


class RegistrationItemUpdate(BaseModel):
    """Update a registration item (typically to select a session)."""

    program_session_id: UUID | None = None
    notes: str | None = None


class RegistrationItemResponse(BaseModel):
    """Response for a single registration add-on item."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    item_type: str
    booking_option_id: UUID | None
    program_session_id: UUID | None
    item_name: str
    pending: bool
    notes: str | None
    created_at: datetime


# ---------------------------------------------------------------------------
# Attendee (person) schemas — used inside registration requests
# ---------------------------------------------------------------------------


class AttendeeData(BaseModel):
    """Person data for a single attendee."""

    first_name: str = Field(..., min_length=1, max_length=255)
    last_name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    pronouns: str | None = Field(None, max_length=50)
    job_title: str | None = Field(None, max_length=255)
    department: str | None = Field(None, max_length=255)
    phone: str | None = Field(None, max_length=50)

    @field_validator("email")
    @classmethod
    def lowercase_email(cls, v: str) -> str:
        return v.lower()


# ---------------------------------------------------------------------------
# Registration request schemas
# ---------------------------------------------------------------------------


class IndividualRegistrationCreate(BaseModel):
    """Register one individual attendee."""

    attendee: AttendeeData
    billing: BillingProfileCreate
    booking_option_id: UUID
    items: list[RegistrationItemCreate] = Field(default_factory=list)
    notes: str | None = None


class CompanySingleRegistrationCreate(BaseModel):
    """Register one employee of a company."""

    attendee: AttendeeData
    billing: BillingProfileCreate
    booking_option_id: UUID
    items: list[RegistrationItemCreate] = Field(default_factory=list)
    notes: str | None = None


class BulkAttendeeData(BaseModel):
    """Person data + booking option/items for each attendee in a bulk registration."""

    first_name: str = Field(..., min_length=1, max_length=255)
    last_name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    pronouns: str | None = Field(None, max_length=50)
    job_title: str | None = Field(None, max_length=255)
    department: str | None = Field(None, max_length=255)
    phone: str | None = Field(None, max_length=50)
    booking_option_id: UUID
    main_session_id: UUID | None = None
    items: list[RegistrationItemCreate] = Field(default_factory=list)
    notes: str | None = None

    @field_validator("email")
    @classmethod
    def lowercase_email(cls, v: str) -> str:
        return v.lower()


class BulkRegistrationCreate(BaseModel):
    """Register multiple employees from the same company with shared billing."""

    billing: BillingProfileCreate
    attendees: list[BulkAttendeeData] = Field(..., min_length=1)

    @field_validator("attendees")
    @classmethod
    def check_unique_emails(cls, v: list[BulkAttendeeData]) -> list[BulkAttendeeData]:
        emails = [a.email.lower() for a in v]
        if len(emails) != len(set(emails)):
            raise ValueError("Duplicate email addresses in attendee list")
        return v


# ---------------------------------------------------------------------------
# Registration update / status
# ---------------------------------------------------------------------------


class RegistrationUpdate(BaseModel):
    """Update a single registration."""

    first_name: str | None = Field(None, min_length=1, max_length=255)
    last_name: str | None = Field(None, min_length=1, max_length=255)
    email: EmailStr | None = None
    pronouns: str | None = Field(None, max_length=50)
    job_title: str | None = Field(None, max_length=255)
    department: str | None = Field(None, max_length=255)
    phone: str | None = Field(None, max_length=50)
    booking_option_id: UUID | None = None
    main_session_id: UUID | None = None
    status: RegistrationStatus | None = None
    notes: str | None = None

    @field_validator("email")
    @classmethod
    def lowercase_email(cls, v: str | None) -> str | None:
        return v.lower() if v else v


# ---------------------------------------------------------------------------
# Registration response schemas
# ---------------------------------------------------------------------------


class RegistrationResponse(BaseModel):
    """Single registration response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    conference_id: UUID
    billing_profile_id: UUID

    # Attendee data
    first_name: str
    last_name: str
    email: str
    pronouns: str | None
    job_title: str | None
    department: str | None
    phone: str | None

    # Booking option
    booking_option_id: UUID
    booking_option_name: str | None = None

    # Main session (for tutorial/session-based booking options)
    main_session_id: UUID | None = None
    main_session_name: str | None = None

    # Add-on items
    items: list[RegistrationItemResponse] = Field(default_factory=list)

    # Metadata
    registration_mode: str
    status: str
    notes: str | None
    created_by: UUID | None
    created_at: datetime
    updated_at: datetime

    # Inline billing summary
    billing_company_name: str | None = None
    billing_contact_email: str | None = None


class RegistrationListResponse(BaseModel):
    """Paginated registration list."""

    items: list[RegistrationResponse]
    total: int
    page: int
    page_size: int
    pages: int


class BulkRegistrationResponse(BaseModel):
    """Response for bulk registration creation."""

    billing_profile_id: UUID
    registrations: list[RegistrationResponse]
    total_created: int


# ---------------------------------------------------------------------------
# Unified registration schemas (replaces individual + company + bulk)
# ---------------------------------------------------------------------------

# Reuse existing bulk schemas — the unified flow has the same shape:
# one billing profile + N attendees, each with their own booking option.
UnifiedAttendeeData = BulkAttendeeData
UnifiedRegistrationCreate = BulkRegistrationCreate
UnifiedRegistrationResponse = BulkRegistrationResponse


# ---------------------------------------------------------------------------
# Replace Attendee schemas
# ---------------------------------------------------------------------------


class ReplaceAttendeeNewAttendeeData(BaseModel):
    """New attendee information for replacement."""

    first_name: str = Field(..., min_length=1, max_length=255)
    last_name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    phone: str | None = Field(None, max_length=50)
    pronouns: str | None = Field(None, max_length=50)
    job_title: str | None = Field(None, max_length=255)
    department: str | None = Field(None, max_length=255)


class AdditionalItemCreate(BaseModel):
    """Additional item to add during replacement (Scenario B)."""

    item_type: str = Field(..., pattern="^(booking_option|tutorial)$")
    booking_option_id: UUID | None = None
    program_session_id: UUID | None = None
    item_name: str | None = None  # Optional override


class ReplaceAttendeeRequest(BaseModel):
    """Request to replace an attendee on an existing registration."""

    # New attendee data
    new_attendee: ReplaceAttendeeNewAttendeeData

    # Additional items (optional - empty list = Scenario A)
    additional_items: list[AdditionalItemCreate] = Field(default_factory=list)

    # Metadata
    replacement_reason: str | None = Field(None, max_length=1000)
    cancellation_message: str | None = Field(None, max_length=2000)


class ReplaceAttendeeResponse(BaseModel):
    """Response after replacing an attendee."""

    model_config = ConfigDict(from_attributes=True)

    old_registration: RegistrationResponse
    new_registration: RegistrationResponse
    replacement_id: UUID

    # Invoice info
    has_additional_items: bool
    additional_items_invoice: dict | None = None  # InvoiceResponse if Scenario B

    # Email status
    emails_sent: dict[str, bool] = Field(
        default_factory=lambda: {"old_attendee": False, "new_attendee": False, "invoice": False}
    )
