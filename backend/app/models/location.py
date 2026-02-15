"""Location model."""

import uuid
from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.conference import Conference
    from app.models.service_provider import ServiceProvider
    from app.models.tenant import Tenant


class LocationType(str, Enum):
    """Location type enum."""

    VENUE = "venue"  # Main conference venue
    ROOM = "room"  # Conference room/hall
    BOOTH = "booth"  # Exhibition booth
    AREA = "area"  # General area (lobby, cafeteria)
    OUTDOOR = "outdoor"  # Outdoor space
    VIRTUAL = "virtual"  # Virtual/online location


class Location(Base):
    """
    Location model for managing conference venues and rooms.

    Supports hierarchical locations (venue -> rooms).
    """

    __tablename__ = "locations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )

    # Parent location (for hierarchical structure)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id", ondelete="SET NULL"), nullable=True
    )

    # Basic Information
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[str | None] = mapped_column(String(50), nullable=True)  # Short code like "ROOM-A1"
    location_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default=LocationType.ROOM.value
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Capacity
    capacity: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Address (for venues)
    address_line1: Mapped[str | None] = mapped_column(String(255), nullable=True)
    address_line2: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    state: Mapped[str | None] = mapped_column(String(100), nullable=True)
    postal_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    country: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Coordinates (for maps)
    latitude: Mapped[float | None] = mapped_column(nullable=True)
    longitude: Mapped[float | None] = mapped_column(nullable=True)

    # Floor/Building info
    building: Mapped[str | None] = mapped_column(String(100), nullable=True)
    floor: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Amenities and features
    amenities: Mapped[list] = mapped_column(JSONB, default=list)  # ["wifi", "projector", "whiteboard"]
    accessibility_features: Mapped[list] = mapped_column(JSONB, default=list)  # ["wheelchair", "hearing_loop"]

    # Contact info
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    website: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # VAT
    vat_number: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Virtual location details
    virtual_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    virtual_platform: Mapped[str | None] = mapped_column(String(50), nullable=True)  # "zoom", "teams", etc.

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Additional settings
    settings: Mapped[dict] = mapped_column(JSONB, default=dict)

    # Contact persons
    # Structure: [{"name": "John", "email": "john@ex.com", "phone": "+123", "comment": "Building manager"}, ...]
    contact_persons: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant")
    parent: Mapped["Location | None"] = relationship(
        "Location", remote_side=[id], back_populates="children"
    )
    children: Mapped[list["Location"]] = relationship(
        "Location", back_populates="parent", cascade="all, delete-orphan"
    )
    conferences: Mapped[list["Conference"]] = relationship(
        "Conference", secondary="conference_locations", viewonly=True,
    )
    service_providers: Mapped[list["ServiceProvider"]] = relationship(
        "ServiceProvider", back_populates="location", cascade="all, delete-orphan"
    )

    # Indexes
    __table_args__ = (
        Index("idx_locations_tenant", "tenant_id"),
        Index("idx_locations_parent", "parent_id"),
        Index("idx_locations_type", "tenant_id", "location_type"),
        Index("idx_locations_code", "tenant_id", "code"),
    )

    @property
    def full_address(self) -> str | None:
        """Get formatted full address (country-specific formatting)."""
        from app.core.address import format_address
        return format_address(
            address_line1=self.address_line1,
            address_line2=self.address_line2,
            city=self.city,
            state=self.state,
            postal_code=self.postal_code,
            country=self.country,
        )

    def __repr__(self) -> str:
        return f"<Location {self.name} ({self.location_type})>"
