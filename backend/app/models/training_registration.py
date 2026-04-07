"""Training registration models — public portal registrations for trainings."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


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

    # Status
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="registered")

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
    contact_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Payment
    payment_method: Mapped[str] = mapped_column(String(20), nullable=False, default="bank_transfer")
    payment_intent_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

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

    __table_args__ = (
        Index("idx_training_reg_tenant", "tenant_id"),
        Index("idx_training_reg_placement", "placement_id"),
        Index("idx_training_reg_status", "status"),
        Index("idx_training_reg_contact_email", "contact_email"),
    )

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

    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    registration: Mapped["TrainingRegistration"] = relationship(back_populates="attendees")

    __table_args__ = (
        Index("idx_training_reg_att_tenant", "tenant_id"),
        Index("idx_training_reg_att_reg", "registration_id"),
    )

    def __repr__(self) -> str:
        return f"<TrainingRegistrationAttendee {self.first_name} {self.last_name}>"
