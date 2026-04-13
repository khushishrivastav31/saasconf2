"""Training Invoice model.

Separate from the conference Invoice model — training invoices are scoped to
tenant (not conference) and linked to TrainingRegistration.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Numeric, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.tenant import Tenant
    from app.models.training_registration import TrainingRegistration


class TrainingInvoice(Base):
    """
    Invoice for a training registration.

    Each invoice belongs to exactly one training registration (tenant-scoped).
    Line items stored as JSONB array of {description, quantity, unit_price, total}.
    Settings (templates, numbering, company data) read from tenant.settings.training_finance.
    """

    __tablename__ = "training_invoices"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    training_registration_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("training_registrations.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Invoice identification
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

    # Recipient information (copied from registration billing at creation time)
    recipient_name: Mapped[str] = mapped_column(String(255), nullable=False)
    recipient_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    recipient_address_line1: Mapped[str | None] = mapped_column(String(255), nullable=True)
    recipient_city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    recipient_postal_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    recipient_country: Mapped[str | None] = mapped_column(String(100), nullable=True)
    recipient_vat_number: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Payment
    payment_method: Mapped[str | None] = mapped_column(String(20), nullable=True)
    stripe_payment_intent_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    stripe_payment_link_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    stripe_payment_link_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # PO number
    po_number: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Financial
    line_items: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    subtotal: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    tax_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    tax_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    total: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    currency: Mapped[str | None] = mapped_column(String(3), nullable=True)

    # Related invoice (for credit notes — points back to the original invoice)
    related_invoice_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("training_invoices.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Notes (attendee list, VAT notes — shown on PDF via [NOTES] placeholder)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Language (from portal language selection — used for email template)
    language: Mapped[str] = mapped_column(String(5), nullable=False, default="en")

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant")
    registration: Mapped["TrainingRegistration"] = relationship("TrainingRegistration", back_populates="invoice")
    related_invoice: Mapped["TrainingInvoice | None"] = relationship(
        "TrainingInvoice",
        foreign_keys=[related_invoice_id],
        remote_side="TrainingInvoice.id",
    )

    # Indexes
    __table_args__ = (
        Index("idx_training_invoices_tenant", "tenant_id"),
        Index("idx_training_invoices_registration", "training_registration_id"),
        Index("idx_training_invoices_status", "status"),
        Index("idx_training_invoices_stripe", "stripe_payment_intent_id"),
        Index("idx_training_invoices_stripe_link", "stripe_payment_link_id"),
        Index("idx_training_invoices_related", "related_invoice_id"),
        Index(
            "uq_training_invoices_tenant_number",
            "tenant_id",
            "invoice_number",
            unique=True,
            postgresql_where=text("invoice_number IS NOT NULL"),
        ),
    )

    # Compatibility properties for ZUGFeRD XML generator (expects conference Invoice attributes)
    @property
    def recipient_address_line2(self) -> str | None:
        return None

    @property
    def recipient_state(self) -> str | None:
        return None

    @property
    def procurement_code(self) -> str | None:
        return self.po_number

    @property
    def discount_amount(self) -> None:
        return None

    @property
    def discount_code(self) -> str | None:
        return None

    @property
    def recipient_source_type(self) -> str:
        return "training_registration"

    @property
    def recipient_source_id(self) -> uuid.UUID | None:
        return self.training_registration_id

    @property
    def vat_auto_calculated(self) -> bool:
        return True

    @property
    def attendance_type(self) -> str | None:
        return None

    @property
    def conference_id(self) -> None:
        return None

    @property
    def conference(self) -> None:
        return None

    def __repr__(self) -> str:
        return f"<TrainingInvoice {self.invoice_number or 'DRAFT'}>"
