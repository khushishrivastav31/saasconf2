"""Association models for conference-module many-to-many relationships."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ConferenceLocation(Base):
    """Association between conferences and locations.

    Despite the M:N junction shape, ``location_id`` is UNIQUE (see
    migration 220 / Stage 3a): the user-facing model is
    "each conference owns its locations, no sharing". The shape stays
    M:N to keep the existing API stable; the UNIQUE pin makes the 1:N
    invariant DB-enforced.
    """

    __tablename__ = "conference_locations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False
    )
    location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("conference_id", "location_id", name="uq_conference_location"),
        Index("uq_conference_locations_location", "location_id", unique=True),
    )


class ConferenceCFP(Base):
    """Association between conferences and Call for Papers."""

    __tablename__ = "conference_cfps"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False
    )
    cfp_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("call_for_papers.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (UniqueConstraint("conference_id", "cfp_id", name="uq_conference_cfp"),)
