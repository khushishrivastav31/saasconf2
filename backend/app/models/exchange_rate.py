"""Tenant-scoped exchange rate history.

Each edit creates a new row; the "current" rate for a currency pair is the
most recent ``effective_at``. Invoices freeze the current rate at issue time
by copying it into ``Invoice.exchange_rate_used`` — downstream PDFs and
reports then render the rate-at-issue, not whatever the settings say today.
"""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ExchangeRate(Base):
    """History-preserving tenant exchange rate.

    "Current" rate = ``ORDER BY effective_at DESC LIMIT 1`` for a
    ``(tenant_id, from_ccy, to_ccy)`` triple. Never update in place —
    insert a new row so the rate used by prior invoices stays reconstructible.
    """

    __tablename__ = "exchange_rates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    from_ccy: Mapped[str] = mapped_column(String(3), nullable=False)
    to_ccy: Mapped[str] = mapped_column(String(3), nullable=False)
    rate: Mapped[Decimal] = mapped_column(Numeric(12, 6), nullable=False)
    effective_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index(
            "idx_exchange_rates_lookup",
            "tenant_id",
            "from_ccy",
            "to_ccy",
            "effective_at",
        ),
    )

    def __repr__(self) -> str:
        return f"<ExchangeRate {self.from_ccy}->{self.to_ccy} @ {self.rate} ({self.effective_at})>"
