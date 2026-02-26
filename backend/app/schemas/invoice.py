"""Invoice schemas."""

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.validators import validate_email
from app.schemas.location import LocationContactPerson, validate_vat

VALID_STATUSES = {"draft", "sent", "paid", "overdue", "cancelled"}


class InvoiceLineItem(BaseModel):
    """Single line item on an invoice."""

    description: str = Field(..., min_length=1, max_length=500)
    quantity: Decimal = Field(..., ge=0)
    unit_price: Decimal = Field(..., ge=0)
    total: Decimal = Field(..., ge=0)


class InvoiceCreate(BaseModel):
    """Schema for creating an invoice."""

    invoice_number: str = Field(..., min_length=1, max_length=50)
    status: str = Field(default="draft", max_length=20)
    issue_date: date | None = None
    due_date: date | None = None
    recipient_name: str = Field(..., min_length=1, max_length=255)
    recipient_email: str | None = Field(None, max_length=255)
    recipient_address_line1: str | None = Field(None, max_length=255)
    recipient_address_line2: str | None = Field(None, max_length=255)
    recipient_city: str | None = Field(None, max_length=100)
    recipient_state: str | None = Field(None, max_length=100)
    recipient_postal_code: str | None = Field(None, max_length=20)
    recipient_country: str | None = Field(None, max_length=100)
    recipient_vat_number: str | None = Field(None, max_length=20)
    line_items: list[InvoiceLineItem] = Field(default_factory=list)
    subtotal: Decimal | None = Field(None, ge=0)
    tax_rate: Decimal | None = Field(None, ge=0)
    tax_amount: Decimal | None = Field(None, ge=0)
    total: Decimal | None = Field(None, ge=0)
    currency: str | None = Field(None, max_length=3)
    notes: str | None = None
    contact_persons: list[LocationContactPerson] = Field(default_factory=list)
    is_active: bool = True

    @field_validator("status")
    @classmethod
    def check_status(cls, v: str) -> str:
        if v not in VALID_STATUSES:
            raise ValueError(f"Status must be one of: {', '.join(sorted(VALID_STATUSES))}")
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
    status: str | None = Field(None, max_length=20)
    issue_date: date | None = None
    due_date: date | None = None
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
    subtotal: Decimal | None = Field(None, ge=0)
    tax_rate: Decimal | None = Field(None, ge=0)
    tax_amount: Decimal | None = Field(None, ge=0)
    total: Decimal | None = Field(None, ge=0)
    currency: str | None = Field(None, max_length=3)
    notes: str | None = None
    contact_persons: list[LocationContactPerson] | None = None
    is_active: bool | None = None

    @field_validator("status")
    @classmethod
    def check_status(cls, v: str | None) -> str | None:
        if v is not None and v not in VALID_STATUSES:
            raise ValueError(f"Status must be one of: {', '.join(sorted(VALID_STATUSES))}")
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
    invoice_number: str
    status: str
    issue_date: date | None = None
    due_date: date | None = None
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
    subtotal: Decimal | None = None
    tax_rate: Decimal | None = None
    tax_amount: Decimal | None = None
    total: Decimal | None = None
    currency: str | None = None
    notes: str | None = None
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
