"""Customer offer schemas."""

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class OfferPlacementInfo(BaseModel):
    """Lightweight placement info for offer responses."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    training_name: str
    training_slug: str | None = None
    start_date: date
    location_name: str | None = None
    placement_type: str = "open"
    program_year: int


class CustomerOfferCreate(BaseModel):
    """Schema for creating a customer offer."""

    customer_id: UUID
    offer_type: str = Field("inhouse", pattern=r"^(inhouse|open)$")
    placement_ids: list[UUID] = Field(default_factory=list)
    attendees: int | None = None
    training_price: Decimal | None = None
    certification_price: Decimal | None = None
    currency: str = "EUR"
    comments: str | None = None
    notes: str | None = None
    po_number: str | None = None


class CustomerOfferUpdate(BaseModel):
    """Schema for updating a customer offer."""

    status: str | None = Field(None, pattern=r"^(draft|sent|rejected|accepted)$")
    attendees: int | None = None
    training_price: Decimal | None = None
    certification_price: Decimal | None = None
    currency: str | None = None
    comments: str | None = None
    notes: str | None = None
    po_number: str | None = None


class CustomerOfferResponse(BaseModel):
    """Schema for customer offer response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    customer_id: UUID
    customer_name: str
    offer_number: str
    offer_type: str = "inhouse"
    status: str
    attendees: int | None = None
    training_price: Decimal | None = None
    certification_price: Decimal | None = None
    currency: str
    comments: str | None = None
    notes: str | None = None
    po_number: str | None = None
    placements: list[OfferPlacementInfo] = Field(default_factory=list)
    attendee_count: int = 0
    # Count of training invoices linked to this offer. Used by the UI to
    # disable the "Delete Offer" action when > 0, since the backend refuses
    # to delete offers with linked invoices (financial records must not be
    # orphaned). See app/api/v1/trainings/offers.py::delete_offer.
    invoice_count: int = 0
    # Active (non-cancelled, non-credit-note) invoice numbers and the sum of
    # their totals. Powers the Offer Management dashboard's INVOICES column
    # and the per-status "Invoiced" subline on the stat cards.
    invoice_numbers: list[str] = Field(default_factory=list)
    invoice_ids: list[UUID] = Field(default_factory=list)
    invoiced_total: Decimal = Decimal(0)
    created_at: datetime
    updated_at: datetime


class AddPlacementsRequest(BaseModel):
    """Schema for adding placements to an existing offer."""

    placement_ids: list[UUID]
