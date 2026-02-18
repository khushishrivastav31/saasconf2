"""Volunteer model."""

import uuid
from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.conference import Conference
    from app.models.tenant import Tenant


class VolunteerStatus(StrEnum):
    """Volunteer application status."""

    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    ACTIVE = "active"
    INACTIVE = "inactive"


class Volunteer(Base):
    """
    Volunteer model for managing conference volunteers.

    Each volunteer belongs to a tenant and can be assigned to specific roles/tasks.
    """

    __tablename__ = "volunteers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )

    # Personal Information
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Volunteer Details
    status: Mapped[str] = mapped_column(String(20), nullable=False, default=VolunteerStatus.PENDING.value)
    role: Mapped[str | None] = mapped_column(String(100), nullable=True)  # e.g., "Registration Desk", "Speaker Liaison"
    skills: Mapped[list] = mapped_column(JSONB, default=list)  # List of skills
    availability: Mapped[dict] = mapped_column(JSONB, default=dict)  # Availability schedule
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Emergency Contact
    emergency_contact_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    emergency_contact_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # T-shirt size for swag
    tshirt_size: Mapped[str | None] = mapped_column(String(10), nullable=True)

    # Dates
    application_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    approved_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Hours tracking
    total_hours: Mapped[float] = mapped_column(default=0.0)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant")
    conferences: Mapped[list["Conference"]] = relationship(
        "Conference",
        secondary="conference_volunteers",
        viewonly=True,
    )

    # Indexes
    __table_args__ = (
        Index("idx_volunteers_tenant", "tenant_id"),
        Index("idx_volunteers_email", "tenant_id", "email"),
        Index("idx_volunteers_status", "tenant_id", "status"),
    )

    @property
    def full_name(self) -> str:
        """Get volunteer's full name."""
        return f"{self.first_name} {self.last_name}"

    def __repr__(self) -> str:
        return f"<Volunteer {self.full_name} ({self.status})>"
