"""Registration models: BillingProfile, Registration, and RegistrationItem."""

import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class RegistrationStatus(str, Enum):
    """Registration status values."""

    REGISTERED_PENDING_INVOICE = "registered_pending_invoice"
    INVOICED = "invoiced"
    PAID = "paid"
    CANCELLED = "cancelled"


class RegistrationMode(str, Enum):
    """How the registration was created."""

    INDIVIDUAL = "individual"
    COMPANY_SINGLE = "company_single"
    COMPANY_BULK = "company_bulk"


class RegistrationItemType(str, Enum):
    """Type of add-on item."""

    BOOKING_OPTION = "booking_option"
    TUTORIAL = "tutorial"


class BillingProfile(Base):
    """
    Billing and procurement data for registrations.

    A single BillingProfile can be shared across multiple registrations
    (e.g. bulk company registration). Conference-scoped via tenant_id + conference_id.
    """

    __tablename__ = "billing_profiles"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
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

    # Company info (optional for individuals)
    company_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Address (required)
    street: Mapped[str] = mapped_column(String(500), nullable=False)
    postal_code: Mapped[str] = mapped_column(String(20), nullable=False)
    city: Mapped[str] = mapped_column(String(255), nullable=False)
    country: Mapped[str] = mapped_column(String(100), nullable=False)

    # Contact person
    contact_first_name: Mapped[str] = mapped_column(String(255), nullable=False)
    contact_last_name: Mapped[str] = mapped_column(String(255), nullable=False)
    contact_phone: Mapped[str] = mapped_column(String(50), nullable=False)
    contact_email: Mapped[str] = mapped_column(String(255), nullable=False)

    # Tax / procurement
    vat_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    vat_validated: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    procurement_code: Mapped[str | None] = mapped_column(String(100), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    registrations: Mapped[list["Registration"]] = relationship(
        "Registration", back_populates="billing_profile", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("idx_billing_profiles_tenant", "tenant_id"),
        Index("idx_billing_profiles_conference", "conference_id"),
        Index("idx_billing_profiles_tenant_conference", "tenant_id", "conference_id"),
    )

    def __repr__(self) -> str:
        return f"<BillingProfile {self.company_name or f'{self.contact_first_name} {self.contact_last_name}'}>"


class Registration(Base):
    """
    A single attendee registration for a conference.

    Stores person data inline. Links to BillingProfile for billing data and to
    a BookingOption for the selected booking option. Additional items
    (tutorials, extra day passes) are tracked via RegistrationItem.
    """

    __tablename__ = "registrations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
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
    billing_profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("billing_profiles.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Attendee person data
    first_name: Mapped[str] = mapped_column(String(255), nullable=False)
    last_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    pronouns: Mapped[str | None] = mapped_column(String(50), nullable=True)
    job_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    department: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Booking option selection (required)
    booking_option_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("booking_options.id", ondelete="RESTRICT"),
        nullable=False,
    )

    # Registration metadata
    registration_mode: Mapped[str] = mapped_column(
        String(20), nullable=False, default=RegistrationMode.INDIVIDUAL.value
    )
    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default=RegistrationStatus.REGISTERED_PENDING_INVOICE.value,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Who created this registration
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    billing_profile: Mapped["BillingProfile"] = relationship(
        "BillingProfile", back_populates="registrations"
    )
    items: Mapped[list["RegistrationItem"]] = relationship(
        "RegistrationItem", back_populates="registration", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("idx_registrations_tenant", "tenant_id"),
        Index("idx_registrations_conference", "conference_id"),
        Index("idx_registrations_tenant_conference", "tenant_id", "conference_id"),
        Index("idx_registrations_billing_profile", "billing_profile_id"),
        Index("idx_registrations_status", "conference_id", "status"),
        Index(
            "uq_registrations_email_conference",
            "conference_id",
            "email",
            unique=True,
        ),
    )

    def __repr__(self) -> str:
        return f"<Registration {self.first_name} {self.last_name} ({self.email})>"


class RegistrationItem(Base):
    """
    Add-on items for a registration: tutorials, extra day passes, etc.

    Can be added at registration time or later. Each item references either
    a BookingOption (for day passes, workshops, etc.) or a ProgramSession
    (for a specific tutorial).
    """

    __tablename__ = "registration_items"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    registration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("registrations.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Item type discriminator
    item_type: Mapped[str] = mapped_column(String(20), nullable=False)

    # References (one set based on item_type)
    booking_option_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("booking_options.id", ondelete="SET NULL"),
        nullable=True,
    )
    program_session_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("program_sessions.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Denormalized display name (survives if the referenced entity is deleted)
    item_name: Mapped[str] = mapped_column(String(500), nullable=False)

    # For tutorials when program is not yet published
    pending: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    registration: Mapped["Registration"] = relationship(
        "Registration", back_populates="items"
    )

    __table_args__ = (
        Index("idx_registration_items_tenant", "tenant_id"),
        Index("idx_registration_items_registration", "registration_id"),
        Index("idx_registration_items_type", "registration_id", "item_type"),
    )

    def __repr__(self) -> str:
        return f"<RegistrationItem {self.item_type}: {self.item_name}>"
