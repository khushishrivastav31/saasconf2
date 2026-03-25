"""Schemas for customer management."""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ContactPerson(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    email: str | None = Field(None, max_length=255)
    phone: str | None = Field(None, max_length=50)
    role: str | None = Field(None, max_length=100)


class CustomerCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    contact_person: str | None = Field(None, max_length=200)
    email: str | None = Field(None, max_length=255)
    phone: str | None = Field(None, max_length=50)
    address_line1: str | None = Field(None, max_length=200)
    address_line2: str | None = Field(None, max_length=200)
    city: str | None = Field(None, max_length=100)
    postal_code: str | None = Field(None, max_length=20)
    country: str | None = Field(None, max_length=2)
    vat_number: str | None = Field(None, max_length=50)
    contact_persons: list[ContactPerson] = Field(default_factory=list)
    price: Decimal | None = Field(None, ge=0)
    currency: str | None = Field(None, max_length=3)
    notes: str | None = None
    is_active: bool = True


class CustomerUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    contact_person: str | None = None
    email: str | None = None
    phone: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    postal_code: str | None = None
    country: str | None = None
    vat_number: str | None = None
    contact_persons: list[ContactPerson] | None = None
    price: Decimal | None = None
    currency: str | None = None
    notes: str | None = None
    is_active: bool | None = None


class CustomerResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    name: str
    contact_person: str | None = None
    email: str | None = None
    phone: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    postal_code: str | None = None
    country: str | None = None
    vat_number: str | None = None
    contact_persons: list[ContactPerson] = Field(default_factory=list)
    price: Decimal | None = None
    currency: str | None = None
    notes: str | None = None
    is_active: bool
    has_inhouse_trainings: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
