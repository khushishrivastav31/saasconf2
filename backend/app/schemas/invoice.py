"""Invoice schemas."""

from datetime import date, datetime
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
    total: float = Field(..., ge=0)


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
    notes: str | None = None
    internal_comment: str | None = None
    contact_persons: list[LocationContactPerson] = []
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
