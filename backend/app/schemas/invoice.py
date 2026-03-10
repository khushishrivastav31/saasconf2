"""Invoice schemas."""

from datetime import date, datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.validators import validate_email
from app.schemas.location import LocationContactPerson, validate_vat

VALID_STATUSES = {"draft", "sent", "paid", "overdue", "cancelled"}
VALID_TEMPLATE_TYPES = {"bank_transfer", "credit_card", "credit_note"}
VALID_RECIPIENT_SOURCE_TYPES = {"sponsor", "speaker", "committee", "volunteer", "registration"}


class InvoiceLineItem(BaseModel):
    """Single line item on an invoice."""

    description: str = Field(..., min_length=1, max_length=500)
    quantity: float = Field(..., ge=0)
    unit_price: float = Field(..., ge=0)
    discount: float = Field(default=0.0, ge=0)
    total: float = Field(...)  # No ge=0: credit notes have negative totals


class InvoiceCreate(BaseModel):
    """Schema for creating an invoice.

    invoice_number is optional — drafts are created without a number.
    The number is assigned later via the POST /generate endpoint.
    """

    invoice_number: str | None = Field(None, max_length=50)
    template_type: str = Field(default="bank_transfer", max_length=50)
    status: str = Field(default="draft", max_length=20)
    issue_date: date | None = None
    due_date: date | None = None
    recipient_source_type: str | None = Field(None, max_length=30)
    recipient_source_id: UUID | None = None
    recipient_name: str = Field(..., min_length=1, max_length=255)
    recipient_email: str | None = Field(None, max_length=255)
    recipient_address_line1: str = Field(..., min_length=1, max_length=255)
    recipient_address_line2: str | None = Field(None, max_length=255)
    recipient_city: str = Field(..., min_length=1, max_length=100)
    recipient_state: str | None = Field(None, max_length=100)
    recipient_postal_code: str = Field(..., min_length=1, max_length=20)
    recipient_country: str = Field(..., min_length=1, max_length=100)
    recipient_vat_number: str | None = Field(None, max_length=20)
    line_items: list[InvoiceLineItem] = Field(default_factory=list)
    subtotal: float | None = Field(None, ge=0)
    tax_rate: float | None = Field(None, ge=0)
    tax_amount: float | None = Field(None, ge=0)
    total: float | None = Field(None, ge=0)
    currency: str | None = Field(None, max_length=3)
    procurement_code: str | None = Field(None, max_length=100)
    attendance_type: str | None = Field(None, max_length=20)
    notes: str | None = None
    internal_comment: str | None = None
    contact_persons: list[LocationContactPerson] = Field(default_factory=list)
    is_active: bool = True

    @field_validator("template_type")
    @classmethod
    def check_template_type(cls, v: str) -> str:
        if v not in VALID_TEMPLATE_TYPES:
            raise ValueError(f"Template type must be one of: {', '.join(sorted(VALID_TEMPLATE_TYPES))}")
        return v

    @field_validator("status")
    @classmethod
    def check_status(cls, v: str) -> str:
        if v not in VALID_STATUSES:
            raise ValueError(f"Status must be one of: {', '.join(sorted(VALID_STATUSES))}")
        return v

    @field_validator("recipient_source_type")
    @classmethod
    def check_source_type(cls, v: str | None) -> str | None:
        if v is not None and v not in VALID_RECIPIENT_SOURCE_TYPES:
            raise ValueError(f"Recipient source type must be one of: {', '.join(sorted(VALID_RECIPIENT_SOURCE_TYPES))}")
        return v

    @field_validator("recipient_email")
    @classmethod
    def check_email(cls, v: str | None) -> str | None:
        return validate_email(v)

    @field_validator("recipient_vat_number")
    @classmethod
    def check_vat(cls, v: str | None) -> str | None:
        return validate_vat(v)


class InvoiceUpdate(BaseModel):
    """Schema for updating an invoice."""

    invoice_number: str | None = Field(None, min_length=1, max_length=50)
    template_type: str | None = Field(None, max_length=50)
    status: str | None = Field(None, max_length=20)
    issue_date: date | None = None
    due_date: date | None = None
    recipient_source_type: str | None = Field(None, max_length=30)
    recipient_source_id: UUID | None = None
    recipient_name: str | None = Field(None, min_length=1, max_length=255)
    recipient_email: str | None = Field(None, max_length=255)
    recipient_address_line1: str | None = Field(None, max_length=255)
    recipient_address_line2: str | None = Field(None, max_length=255)
    recipient_city: str | None = Field(None, max_length=100)
    recipient_state: str | None = Field(None, max_length=100)
    recipient_postal_code: str | None = Field(None, max_length=20)
    recipient_country: str | None = Field(None, max_length=100)
    recipient_vat_number: str | None = Field(None, max_length=20)
    line_items: list[InvoiceLineItem] | None = None
    subtotal: float | None = Field(None, ge=0)
    tax_rate: float | None = Field(None, ge=0)
    tax_amount: float | None = Field(None, ge=0)
    total: float | None = Field(None, ge=0)
    currency: str | None = Field(None, max_length=3)
    procurement_code: str | None = Field(None, max_length=100)
    attendance_type: str | None = Field(None, max_length=20)
    notes: str | None = None
    internal_comment: str | None = None
    contact_persons: list[LocationContactPerson] | None = None
    is_active: bool | None = None

    @field_validator("template_type")
    @classmethod
    def check_template_type(cls, v: str | None) -> str | None:
        if v is not None and v not in VALID_TEMPLATE_TYPES:
            raise ValueError(f"Template type must be one of: {', '.join(sorted(VALID_TEMPLATE_TYPES))}")
        return v

    @field_validator("status")
    @classmethod
    def check_status(cls, v: str | None) -> str | None:
        if v is not None and v not in VALID_STATUSES:
            raise ValueError(f"Status must be one of: {', '.join(sorted(VALID_STATUSES))}")
        return v

    @field_validator("recipient_source_type")
    @classmethod
    def check_source_type(cls, v: str | None) -> str | None:
        if v is not None and v not in VALID_RECIPIENT_SOURCE_TYPES:
            raise ValueError(f"Recipient source type must be one of: {', '.join(sorted(VALID_RECIPIENT_SOURCE_TYPES))}")
        return v

    @field_validator("recipient_email")
    @classmethod
    def check_email(cls, v: str | None) -> str | None:
        return validate_email(v)

    @field_validator("recipient_vat_number")
    @classmethod
    def check_vat(cls, v: str | None) -> str | None:
        return validate_vat(v)


class InvoiceEventResponse(BaseModel):
    """Invoice event response schema (audit log for payments/refunds)."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    invoice_id: UUID
    event_type: str
    stripe_object_id: str | None = None
    stripe_object_type: str | None = None
    stripe_idempotency_key: str | None = None
    amount: float | None = None
    currency: str | None = None
    status: str
    event_metadata: dict | None = None
    error_message: str | None = None
    user_id: UUID | None = None
    user_email: str | None = None
    created_at: datetime


class VatRequirementLevel(StrEnum):
    """VAT number requirement level."""

    REQUIRED = "required"
    RECOMMENDED = "recommended"
    OPTIONAL = "optional"


class VatRequirement(BaseModel):
    """VAT requirement context."""

    model_config = ConfigDict(from_attributes=True)

    level: VatRequirementLevel
    reason: str
    rule_reference: str | None = None


class VatWarning(BaseModel):
    """VAT validation warning."""

    model_config = ConfigDict(from_attributes=True)

    code: str  # "vat_required_missing", "vat_required_invalid", "vat_recommended_missing"
    level: str  # "error", "warning", "info"
    message: str  # Human-readable message with full context
    requirement: VatRequirement
    can_override: bool  # Admin can acknowledge and proceed


class InvoiceResponse(BaseModel):
    """Invoice response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    conference_id: UUID
    invoice_number: str | None = None
    template_type: str = "bank_transfer"
    status: str
    issue_date: date | None = None
    due_date: date | None = None
    recipient_source_type: str | None = None
    recipient_source_id: UUID | None = None
    recipient_name: str
    recipient_email: str | None = None
    recipient_address_line1: str | None = None
    recipient_address_line2: str | None = None
    recipient_city: str | None = None
    recipient_state: str | None = None
    recipient_postal_code: str | None = None
    recipient_country: str | None = None
    recipient_vat_number: str | None = None
    line_items: list[InvoiceLineItem] = []
    subtotal: float | None = None
    tax_rate: float | None = None
    tax_amount: float | None = None
    total: float | None = None
    currency: str | None = None
    procurement_code: str | None = None
    discount_code: str | None = None
    discount_amount: float | None = None
    vat_auto_calculated: bool = False
    attendance_type: str | None = None
    notes: str | None = None
    internal_comment: str | None = None
    contact_persons: list[LocationContactPerson] = []
    related_invoice_id: UUID | None = None
    related_invoice_number: str | None = None
    # Stripe payment tracking (for credit_card template type)
    stripe_payment_intent_id: str | None = None
    stripe_charge_id: str | None = None
    stripe_payment_link_url: str | None = None
    # Payment/refund events (audit trail)
    events: list[InvoiceEventResponse] = []
    # VAT validation warnings and requirements
    vat_warnings: list[VatWarning] | None = None
    vat_requirement: VatRequirement | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class InvoiceListResponse(BaseModel):
    """Paginated list of invoices."""

    items: list[InvoiceResponse]
    total: int
    page: int
    page_size: int
    pages: int


# --- Recipient search schemas ---


class RecipientSearchResult(BaseModel):
    """A single result from the recipient search endpoint."""

    id: UUID
    source_type: str
    display_name: str
    email: str | None = None
    company: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    country: str | None = None
    vat_number: str | None = None
    phone: str | None = None
    contact_persons: list[LocationContactPerson] = []


class RecipientSearchResponse(BaseModel):
    """Response for recipient search endpoint."""

    results: list[RecipientSearchResult]


class CancelInvoiceRequest(BaseModel):
    """Request body for cancelling an invoice."""

    reason: str = Field(..., min_length=1, max_length=1000)
    cancel_registrations: bool = Field(
        default=False, description="Also cancel associated registrations and remove conference access"
    )
    cancellation_email_message: str | None = Field(
        default=None, max_length=2000, description="Optional message to include in cancellation emails"
    )


class CancelInvoiceResponse(BaseModel):
    """Response from cancelling an invoice."""

    cancelled_invoice: InvoiceResponse
    credit_note: InvoiceResponse
    registrations_cancelled: int = 0
    access_removed_count: int = 0


class ReplaceInvoiceRequest(BaseModel):
    """Request body for replacing an invoice with corrected billing information."""

    reason: str = Field(..., min_length=1, max_length=1000, description="Reason for replacement")

    # Corrected billing fields (all optional)
    recipient_name: str | None = Field(default=None, max_length=255)
    recipient_email: str | None = Field(default=None, max_length=255)
    recipient_address_line1: str | None = Field(default=None, max_length=255)
    recipient_address_line2: str | None = Field(default=None, max_length=255)
    recipient_city: str | None = Field(default=None, max_length=100)
    recipient_state: str | None = Field(default=None, max_length=100)
    recipient_postal_code: str | None = Field(default=None, max_length=20)
    recipient_country: str | None = Field(default=None, max_length=100)
    recipient_vat_number: str | None = Field(default=None, max_length=20)
    procurement_code: str | None = Field(default=None, max_length=100)

    custom_email_message: str | None = Field(
        default=None, max_length=2000, description="Optional message to include in replacement emails"
    )


class ReplaceInvoiceResponse(BaseModel):
    """Response from replacing an invoice."""

    old_invoice: InvoiceResponse  # cancelled
    credit_note: InvoiceResponse
    new_invoice: InvoiceResponse  # replacement
    registrations_transferred: int


class ConvertToCreditCardResponse(BaseModel):
    """Response from converting bank transfer to credit card."""

    invoice: InvoiceResponse
    payment_link_url: str


class MarkPaidRequest(BaseModel):
    """Request body for manually marking bank transfer as paid."""

    payment_date: date = Field(..., description="Date when payment was received")
    comment: str = Field(..., min_length=1, max_length=2000, description="Comment about the payment")


class ReopenInvoiceRequest(BaseModel):
    """Request body for reopening a paid/cancelled invoice."""

    comment: str = Field(..., min_length=1, max_length=2000, description="Reason for reopening the invoice")
