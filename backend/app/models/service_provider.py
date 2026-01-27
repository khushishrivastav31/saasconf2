"""Service provider model."""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import String, DateTime, ForeignKey, func, Text, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.tenant import Tenant
    from app.models.location import Location
    from app.models.conference import Conference


class ServiceProvider(Base):
    """
    Service provider for a location or conference.

    Examples: AV company, catering service, security firm.
    Contact persons stored as JSONB (same schema as LocationContactPerson).
    File uploads use the polymorphic attachment system with entity_type="service_provider".

    A service provider belongs to either a location (location_id set) or
    a conference (conference_id set).
    """

    __tablename__ = "service_providers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    location_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id", ondelete="CASCADE"), nullable=True
    )
    conference_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conferences.id", ondelete="CASCADE"), nullable=True
    )

    # Basic Information
    company_name: Mapped[str] = mapped_column(String(255), nullable=False)
    service_description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Contact persons
    # Structure: [{"name": "John", "email": "john@ex.com", "phone": "+123", "comment": "AV tech lead"}, ...]
    contact_persons: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant")
    location: Mapped["Location | None"] = relationship("Location", back_populates="service_providers")
    conference: Mapped["Conference | None"] = relationship("Conference")

    # Indexes
    __table_args__ = (
        Index("idx_service_providers_tenant", "tenant_id"),
        Index("idx_service_providers_location", "tenant_id", "location_id"),
        Index("idx_service_providers_conference", "tenant_id", "conference_id"),
    )

    def __repr__(self) -> str:
        return f"<ServiceProvider {self.company_name}>"
