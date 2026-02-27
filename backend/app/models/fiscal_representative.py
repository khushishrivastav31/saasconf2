"""Fiscal Representative model."""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.conference import Conference
    from app.models.tenant import Tenant


class FiscalRepresentative(Base):
    """
    Fiscal representative for a conference held in a foreign country.

    When a conference takes place in a country different from the tenant's country,
    a fiscal representative company handles VAT/tax representation. The fiscal rep
    provides a conference-specific VAT number used on invoices.

    One fiscal representative per conference (1:1 relationship).
    Contact persons stored as JSONB (same schema as LocationContactPerson).
    """

    __tablename__ = "fiscal_representatives"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    conference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False
    )

    # Company information
    company_name: Mapped[str] = mapped_column(String(255), nullable=False)

    # Address
    address_line1: Mapped[str | None] = mapped_column(String(255), nullable=True)
    address_line2: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    state: Mapped[str | None] = mapped_column(String(100), nullable=True)
    postal_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    country: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Contact info
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    website: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # VAT numbers
    vat_number: Mapped[str | None] = mapped_column(String(50), nullable=True)  # fiscal rep's own VAT
    conference_vat_number: Mapped[str | None] = mapped_column(String(50), nullable=True)  # VAT for invoices

    # Contact persons (JSONB array)
    contact_persons: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant")
    conference: Mapped["Conference"] = relationship("Conference")

    # Indexes and constraints
    __table_args__ = (
        UniqueConstraint("tenant_id", "conference_id", name="uq_fiscal_reps_tenant_conference"),
        Index("idx_fiscal_reps_tenant", "tenant_id"),
        Index("idx_fiscal_reps_conference", "tenant_id", "conference_id"),
    )

    def __repr__(self) -> str:
        return f"<FiscalRepresentative {self.company_name}>"
