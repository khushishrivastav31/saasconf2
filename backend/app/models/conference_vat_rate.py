"""Conference VAT Rate model."""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, ForeignKey, Index, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.conference import Conference
    from app.models.tenant import Tenant


class ConferenceVatRate(Base):
    """
    VAT rate period for a conference.

    Stores VAT rates for the country where the conference takes place.
    VAT rates can change over time, so each record has a date period (start_date, end_date).
    Multiple non-overlapping periods are allowed per conference.
    """

    __tablename__ = "conference_vat_rates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    conference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False
    )

    # VAT rate as percentage (e.g., 21.00 for 21%)
    rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)

    # Date period (inclusive)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)

    # Optional label
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant")
    conference: Mapped["Conference"] = relationship("Conference")

    # Indexes
    __table_args__ = (
        Index("idx_vat_rates_tenant", "tenant_id"),
        Index("idx_vat_rates_conference", "tenant_id", "conference_id"),
    )

    def __repr__(self) -> str:
        return f"<ConferenceVatRate {self.rate}% ({self.start_date} - {self.end_date})>"
