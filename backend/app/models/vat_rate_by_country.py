"""VAT rates by country model for tenant-specific country VAT rates."""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class VatRateByCountry(Base):
    """
    Tenant-specific country VAT rates for automatic invoice VAT calculation.

    Each tenant manages their own list of country VAT rates (VAT, GST, Sales Tax, etc.).
    Used when VAT rules indicate charging at customer country rate (e.g. OSS for
    virtual services to B2C EU customers).

    For backwards compatibility, rows with tenant_id=NULL are global rates (legacy).
    """

    __tablename__ = "vat_rates_by_country"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True
    )
    country_code: Mapped[str] = mapped_column(String(2), nullable=False)
    country_name: Mapped[str] = mapped_column(String(100), nullable=False)
    standard_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("idx_vat_rates_country_code", "country_code"),
        Index("ix_vat_rates_by_country_tenant_id", "tenant_id"),
        UniqueConstraint("tenant_id", "country_code", name="uq_vat_rates_tenant_country"),
    )

    def __repr__(self) -> str:
        return f"<VatRateByCountry {self.country_code}: {self.standard_rate}%>"
