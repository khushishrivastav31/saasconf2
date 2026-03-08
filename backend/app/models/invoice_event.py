"""Invoice event model for payment audit logging."""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.invoice import Invoice
    from app.models.tenant import Tenant
    from app.models.user import User


class InvoiceEvent(Base):
    """
    Audit log for invoice payment and refund events.

    Tracks all payment-related activities: payment links, successful payments,
    refunds, cancellations, and status changes. Each event includes Stripe IDs
    for bidirectional identification, user who triggered it, and full metadata.
    """

    __tablename__ = "invoice_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    invoice_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("invoices.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Event details
    event_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # payment_link_created, payment_succeeded, refund_initiated, etc.

    # Stripe tracking (bidirectional identification)
    stripe_object_id: Mapped[str | None] = mapped_column(String(255), nullable=True)  # pi_xxx, re_xxx, ch_xxx
    stripe_object_type: Mapped[str | None] = mapped_column(String(50), nullable=True)  # payment_intent, refund, charge
    stripe_idempotency_key: Mapped[str | None] = mapped_column(String(255), nullable=True)  # For retry safety

    # Financial details
    amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    currency: Mapped[str | None] = mapped_column(String(3), nullable=True)

    # Status and metadata
    status: Mapped[str] = mapped_column(String(50), nullable=False)  # succeeded, failed, pending, cancelled
    event_metadata: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)  # Flexible additional data
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # User who triggered (nullable for webhook events)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    user_email: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    invoice: Mapped["Invoice"] = relationship("Invoice", back_populates="events")
    tenant: Mapped["Tenant"] = relationship("Tenant")
    user: Mapped["User | None"] = relationship("User")

    __table_args__ = (
        Index("idx_invoice_events_invoice", "invoice_id"),
        Index("idx_invoice_events_stripe_object", "stripe_object_id"),
        Index("idx_invoice_events_type", "event_type"),
        Index("idx_invoice_events_created", "created_at"),
    )


# Event type constants
class InvoiceEventType:
    """Constants for invoice event types."""

    PAYMENT_LINK_CREATED = "payment_link_created"
    PAYMENT_INTENT_CREATED = "payment_intent_created"
    PAYMENT_SUCCEEDED = "payment_succeeded"
    PAYMENT_FAILED = "payment_failed"
    REFUND_INITIATED = "refund_initiated"
    REFUND_SUCCEEDED = "refund_succeeded"
    REFUND_FAILED = "refund_failed"
    REFUND_CANCELLED = "refund_cancelled"
    INVOICE_SENT = "invoice_sent"
    INVOICE_CANCELLED = "invoice_cancelled"
    STATUS_CHANGED = "status_changed"
    CONVERTED_TO_CREDIT_CARD = "converted_to_credit_card"
    MANUAL_PAYMENT_RECORDED = "manual_payment_recorded"
    INVOICE_REOPENED = "invoice_reopened"
