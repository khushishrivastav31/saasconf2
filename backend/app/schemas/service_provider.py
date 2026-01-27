"""Service provider schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.location import LocationContactPerson


class ServiceProviderCreate(BaseModel):
    """Schema for creating a service provider."""

    company_name: str = Field(..., min_length=1, max_length=255)
    service_description: str | None = None
    contact_persons: list[LocationContactPerson] = Field(default_factory=list)


class ServiceProviderUpdate(BaseModel):
    """Schema for updating a service provider."""

    company_name: str | None = Field(None, min_length=1, max_length=255)
    service_description: str | None = None
    contact_persons: list[LocationContactPerson] | None = None


class ServiceProviderResponse(BaseModel):
    """Service provider response schema."""

    id: UUID
    tenant_id: UUID
    location_id: UUID | None = None
    conference_id: UUID | None = None
    company_name: str
    service_description: str | None
    contact_persons: list[LocationContactPerson] = []
    created_at: datetime
    updated_at: datetime


class ServiceProviderListResponse(BaseModel):
    """List of service providers."""

    items: list[ServiceProviderResponse]
    total: int
