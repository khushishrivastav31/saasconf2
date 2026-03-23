"""Training model for training management module."""

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.tenant import Tenant


class Training(Base):
    """Training model - represents a single training event."""

    __tablename__ = "trainings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )

    # Basic info
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    abbreviation: Mapped[str | None] = mapped_column(String(50), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    website: Mapped[str | None] = mapped_column(String(500), nullable=True)
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Contact info for templates
    support_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Dates
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Location
    venue_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    venue_address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    state: Mapped[str | None] = mapped_column(String(100), nullable=True)
    postal_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    country: Mapped[str | None] = mapped_column(String(100), nullable=True)
    timezone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    locale: Mapped[str | None] = mapped_column(String(10), nullable=True, default="en")
    venue_type: Mapped[str] = mapped_column(String(20), default="onsite")  # onsite, virtual, hybrid
    venue_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    virtual_platform_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Social media links as JSONB
    social_links: Mapped[dict] = mapped_column(JSONB, default=dict)

    # Team members as JSONB array
    # [{"first_name": "John", "last_name": "Doe", "email": "john@example.com",
    #   "phone": "+123", "role": "Lead Trainer", "is_manager": true}, ...]
    team_members: Mapped[list] = mapped_column(JSONB, default=list)

    # Settings
    settings: Mapped[dict] = mapped_column(JSONB, default=dict)

    # Currency (ISO 4217 code, e.g., EUR, USD)
    currency: Mapped[str | None] = mapped_column(String(3), nullable=True)
    invoice_currency: Mapped[str | None] = mapped_column(String(3), nullable=True)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="trainings")

    def __repr__(self) -> str:
        return f"<Training {self.name} ({self.abbreviation})>"

    @property
    def managers(self) -> list[dict]:
        """Get all team members marked as managers."""
        return [m for m in (self.team_members or []) if m.get("is_manager")]

    @property
    def is_upcoming(self) -> bool:
        """Check if training is upcoming."""
        if not self.start_date:
            return False
        return self.start_date > date.today()

    @property
    def is_ongoing(self) -> bool:
        """Check if training is currently happening."""
        if not self.start_date:
            return False
        today = date.today()
        end = self.end_date or self.start_date
        return self.start_date <= today <= end

    @property
    def is_past(self) -> bool:
        """Check if training has ended."""
        if not self.start_date:
            return False
        end = self.end_date or self.start_date
        return end < date.today()
