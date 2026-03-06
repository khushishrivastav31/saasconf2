"""Invoice model."""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Numeric, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.conference import Conference
    from app.models.invoice_event import InvoiceEvent
    from app.models.tenant import Tenant


class Invoice(Base):
    """
    Invoice for a conference.

    Each invoice belongs to exactly one conference (conference-scoped).
    Line items stored as JSONB array of {description, quantity, unit_price, total}.
    Contact persons stored as JSONB (same schema as LocationContactPerson).
    File uploads use the polymorphic attachment system with entity_type="invoice".
    """

    __tablename__ = "invoices"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    conference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False
    )

    # Invoice identification (nullable for drafts — number assigned on generate)
    invoice_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    template_type: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default="bank_transfer"
    )  # bank_transfer, credit_card, credit_note
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="draft"
    )  # draft, sent, paid, overdue, cancelled

    # Dates
    issue_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Recipient source (for auto-fill traceability)
    recipient_source_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    recipient_source_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    # Recipient information
    recipient_name: Mapped[str] = mapped_column(String(255), nullable=False)
    recipient_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    recipient_address_line1: Mapped[str | None] = mapped_column(String(255), nullable=True)
    recipient_address_line2: Mapped[str | None] = mapped_column(String(255), nullable=True)
    recipient_city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    recipient_state: Mapped[str | None] = mapped_column(String(100), nullable=True)
    recipient_postal_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    recipient_country: Mapped[str | None] = mapped_column(String(100), nullable=True)
    recipient_vat_number: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Financial
    line_items: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    subtotal: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    tax_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    tax_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    total: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    currency: Mapped[str | None] = mapped_column(String(3), nullable=True)
    vat_auto_calculated: Mapped[bool] = mapped_column(Boolean, default=False)
    attendance_type: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )  # "virtual", "onsite", or null — used for VAT calculation in hybrid conferences

    # Notes (rich text — shown on invoice PDF via [NOTES] placeholder)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Internal comment (admin-only, never shown on PDF)
    internal_comment: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Related invoice (self-FK for credit notes linking to original invoice)
    related_invoice_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True
    )

    # Stripe payment tracking (for credit_card template type)
    stripe_payment_intent_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    stripe_charge_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    stripe_payment_link_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

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
    related_invoice: Mapped["Invoice | None"] = relationship(
        "Invoice", remote_side="Invoice.id", foreign_keys=[related_invoice_id]
    )
    events: Mapped[list["InvoiceEvent"]] = relationship(
        "InvoiceEvent", back_populates="invoice", cascade="all, delete-orphan"
    )

    # Indexes and constraints
    __table_args__ = (
        Index("idx_invoices_tenant", "tenant_id"),
        Index("idx_invoices_conference", "tenant_id", "conference_id"),
        Index("idx_invoices_related", "related_invoice_id"),
        Index("idx_invoices_stripe_intent", "stripe_payment_intent_id"),
        # Partial unique index: enforces uniqueness for assigned numbers, allows multiple NULLs (drafts)
        Index(
            "uq_invoices_tenant_number",
            "tenant_id",
            "invoice_number",
            unique=True,
            postgresql_where=text("invoice_number IS NOT NULL"),
        ),
    )

    def __repr__(self) -> str:
        return f"<Invoice {self.invoice_number or 'DRAFT'}>"
