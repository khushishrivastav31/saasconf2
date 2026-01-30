"""Sponsor model."""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.conference import Conference
    from app.models.settings import SponsorPackage
    from app.models.tenant import Tenant


class Sponsor(Base):
    """
    Sponsor company for a conference.

    Each sponsor belongs to exactly one conference (conference-scoped).
    Optionally linked to a SponsorPackage (tier).
    Price/currency can override the package defaults.
    Contact persons stored as JSONB (same schema as LocationContactPerson).
    File uploads use the polymorphic attachment system with entity_type="sponsor".
    """

    __tablename__ = "sponsors"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    conference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False
    )
    sponsor_package_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sponsor_packages.id", ondelete="SET NULL"), nullable=True
    )

    # Basic Information
    company_name: Mapped[str] = mapped_column(String(255), nullable=False)

    # Contact info
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    website: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Address
    address_line1: Mapped[str | None] = mapped_column(String(255), nullable=True)
    address_line2: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    state: Mapped[str | None] = mapped_column(String(100), nullable=True)
    postal_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    country: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # VAT
    vat_number: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Pricing (overrides from package)
    price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    currency: Mapped[str | None] = mapped_column(String(3), nullable=True)

    # Comments (rich text)
    comments: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Contact persons (JSONB array)
    contact_persons: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant")
    conference: Mapped["Conference"] = relationship("Conference")
    sponsor_package: Mapped["SponsorPackage | None"] = relationship("SponsorPackage")

    # Indexes
    __table_args__ = (
        Index("idx_sponsors_tenant", "tenant_id"),
        Index("idx_sponsors_conference", "tenant_id", "conference_id"),
        Index("idx_sponsors_package", "sponsor_package_id"),
    )

    def __repr__(self) -> str:
        return f"<Sponsor {self.company_name}>"
