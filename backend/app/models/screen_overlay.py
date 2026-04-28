"""Screen overlay model — supports both conference-scoped and tenant-wide
training-scoped overlays via a ``domain`` discriminator (migration 216)."""

import uuid
from datetime import datetime

from sqlalchemy import (
    UUID,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

OVERLAY_DOMAIN_CONFERENCE = "conference"
OVERLAY_DOMAIN_TRAINING = "training"
OVERLAY_DOMAINS = (OVERLAY_DOMAIN_CONFERENCE, OVERLAY_DOMAIN_TRAINING)


class ScreenOverlay(Base):
    __tablename__ = "screen_overlays"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Conference-scoped overlays carry a conference_id; training-scoped
    # ones leave it NULL (the row is tenant-wide for the trainings module).
    # Migration 216 enforces the pairing via a CHECK constraint.
    conference_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conferences.id", ondelete="CASCADE"),
        nullable=True,
    )
    domain: Mapped[str] = mapped_column(String(20), nullable=False, server_default=OVERLAY_DOMAIN_CONFERENCE)
    trigger_type: Mapped[str] = mapped_column(String(30), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    body_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    animation_style: Mapped[str] = mapped_column(String(30), nullable=False, server_default="confetti")
    duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False, server_default="5")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    schedule_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("ix_screen_overlays_tenant_id", "tenant_id"),
        Index("ix_screen_overlays_tenant_conference", "tenant_id", "conference_id"),
        Index("ix_screen_overlays_active", "conference_id", "is_active", "trigger_type"),
        Index("ix_screen_overlays_tenant_domain_active", "tenant_id", "domain", "is_active", "trigger_type"),
    )
