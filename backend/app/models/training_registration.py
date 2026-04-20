"""Training registration models — public portal registrations for trainings."""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship, validates

from app.core.security.pii_crypto import hash_email
from app.db.base import Base

if TYPE_CHECKING:
    from app.models.training_invoice import TrainingInvoice
    from app.models.training_program import ProgramYearTraining


class TrainingRegistration(Base):
    """A public registration for a training placement.

    Created when an individual or company registers attendees
    via the public training portal.
    """

    __tablename__ = "training_registrations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    placement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("program_year_trainings.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Status & language
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="registered")
    language: Mapped[str] = mapped_column(String(5), nullable=False, default="en")

    # Billing
    company_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    street: Mapped[str] = mapped_column(String(255), nullable=False)
    postal_code: Mapped[str] = mapped_column(String(20), nullable=False)
    city: Mapped[str] = mapped_column(String(100), nullable=False)
    country: Mapped[str] = mapped_column(String(2), nullable=False)
    vat_number: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Contact
    contact_first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    contact_last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    contact_email: Mapped[str] = mapped_column(String(255), nullable=False)
    contact_email_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    contact_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Payment
    payment_method: Mapped[str] = mapped_column(String(20), nullable=False, default="bank_transfer")
    payment_intent_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    po_number: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Pricing
    discount_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    discount_amount: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    subtotal: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    vat_amount: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    total: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="EUR")

    # Notes
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    attendees: Mapped[list["TrainingRegistrationAttendee"]] = relationship(
        back_populates="registration", cascade="all, delete-orphan", lazy="selectin"
    )
    invoice: Mapped["TrainingInvoice | None"] = relationship(
        "TrainingInvoice", back_populates="registration", uselist=False, lazy="joined"
    )
    placement: Mapped["ProgramYearTraining | None"] = relationship(
        "ProgramYearTraining", foreign_keys=[placement_id], lazy="select"
    )

    __table_args__ = (
        Index("idx_training_reg_tenant", "tenant_id"),
        Index("idx_training_reg_placement", "placement_id"),
        Index("idx_training_reg_status", "status"),
        Index("idx_training_reg_contact_email", "contact_email"),
        Index("idx_training_registrations_contact_email_hash", "contact_email_hash"),
    )

    @validates("contact_email")
    def _sync_contact_email_hash(self, _key: str, value: str) -> str:
        self.contact_email_hash = hash_email(value) if value else None
        return value

    def __repr__(self) -> str:
        return f"<TrainingRegistration {self.id} status={self.status}>"


class TrainingRegistrationAttendee(Base):
    """An attendee within a training registration."""

    __tablename__ = "training_registration_attendees"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    registration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("training_registrations.id", ondelete="CASCADE"),
        nullable=False,
    )

    attendee_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("training_attendees.id", ondelete="SET NULL"), nullable=True
    )

    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    email_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    language: Mapped[str] = mapped_column(String(5), nullable=False, default="en")
    include_exam: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    exam_language: Mapped[str | None] = mapped_column(String(100), nullable=True)
    exam_mode: Mapped[str | None] = mapped_column(String(20), nullable=True)
    extra_time: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    registration: Mapped["TrainingRegistration"] = relationship(back_populates="attendees")

    __table_args__ = (
        Index("idx_training_reg_att_tenant", "tenant_id"),
        Index("idx_training_reg_att_reg", "registration_id"),
        Index("idx_training_reg_att_attendee", "attendee_id"),
        Index("idx_training_registration_attendees_email_hash", "email_hash"),
    )

    @validates("email")
    def _sync_email_hash(self, _key: str, value: str) -> str:
        self.email_hash = hash_email(value) if value else None
        return value

    def __repr__(self) -> str:
        return f"<TrainingRegistrationAttendee {self.first_name} {self.last_name}>"
