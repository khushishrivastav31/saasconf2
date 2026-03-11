"""Payment reminder model for tracking invoice payment reminders."""

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.conference import Conference
    from app.models.invoice import Invoice
    from app.models.tenant import Tenant


class PaymentReminder(Base):
    """
    Tracks payment reminders sent for overdue invoices.

    Each invoice can have up to 2 reminders (1st friendly, 2nd firm).
    Created by the daily cron job or manually resent by admin.
    """

    __tablename__ = "payment_reminders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    conference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conferences.id", ondelete="CASCADE"),
        nullable=False,
    )
    invoice_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("invoices.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Reminder details
    reminder_number: Mapped[int] = mapped_column(Integer, nullable=False)  # 1 or 2
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")  # pending, sent, failed
    scheduled_date: Mapped[date] = mapped_column(Date, nullable=False)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Denormalized invoice info for efficient list queries
    recipient_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    recipient_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    invoice_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    invoice_amount: Mapped[str | None] = mapped_column(String(50), nullable=True)  # Formatted amount
    currency: Mapped[str | None] = mapped_column(String(3), nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    invoice: Mapped["Invoice"] = relationship("Invoice")
    conference: Mapped["Conference"] = relationship("Conference")
    tenant: Mapped["Tenant"] = relationship("Tenant")

    __table_args__ = (
        UniqueConstraint("invoice_id", "reminder_number", name="uq_payment_reminder_invoice_number"),
        Index("idx_payment_reminders_tenant", "tenant_id"),
        Index("idx_payment_reminders_conference", "tenant_id", "conference_id", "status"),
        Index("idx_payment_reminders_status_scheduled", "status", "scheduled_date"),
        Index("idx_payment_reminders_invoice", "invoice_id"),
    )

    def __repr__(self) -> str:
        return f"<PaymentReminder #{self.reminder_number} for {self.invoice_number or 'unknown'}>"
