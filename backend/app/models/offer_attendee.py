"""Offer attendee model — participants registered for a placement within an offer."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, validates

from app.core.security.pii_crypto import hash_email
from app.db.base import Base


class OfferAttendee(Base):
    """A participant registered for a specific placement within an offer."""

    __tablename__ = "offer_attendees"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    offer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("customer_offers.id", ondelete="CASCADE"), nullable=False
    )
    placement_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("program_year_trainings.id", ondelete="SET NULL"), nullable=True
    )

    attendee_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("training_attendees.id", ondelete="SET NULL"), nullable=True
    )

    first_name: Mapped[str] = mapped_column(String(200), nullable=False)
    last_name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    email_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    certification: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    exam_mode: Mapped[str | None] = mapped_column(String(20), nullable=True)
    extra_time: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    exam_language: Mapped[str | None] = mapped_column(String(50), nullable=True)
    comments: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("idx_offer_attendees_tenant", "tenant_id"),
        Index("idx_offer_attendees_offer", "offer_id"),
        Index("idx_offer_attendees_placement", "placement_id"),
        Index("idx_offer_att_attendee", "attendee_id"),
        Index("idx_offer_attendees_email_hash", "email_hash"),
    )

    @validates("email")
    def _sync_email_hash(self, _key: str, value: str | None) -> str | None:
        self.email_hash = hash_email(value) if value else None
        return value

    def __repr__(self) -> str:
        return f"<OfferAttendee {self.first_name} {self.last_name} (offer={self.offer_id})>"
