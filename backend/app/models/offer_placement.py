"""Offer-placement join table for linking offers to placements (especially open trainings)."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class OfferPlacement(Base):
    """Join table linking customer offers to program year training placements.

    For inhouse/hybrid placements, the offer_id FK on ProgramYearTraining is also set
    (exclusive assignment). For open placements, only this join table is used (shared).
    """

    __tablename__ = "offer_placements"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    offer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("customer_offers.id", ondelete="CASCADE"), nullable=False
    )
    placement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("program_year_trainings.id", ondelete="CASCADE"), nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    offer = relationship("CustomerOffer", back_populates="offer_placements")
    placement = relationship("ProgramYearTraining")

    __table_args__ = (
        UniqueConstraint("offer_id", "placement_id", name="uq_offer_placement"),
        Index("idx_offer_placements_tenant", "tenant_id"),
        Index("idx_offer_placements_offer", "offer_id"),
        Index("idx_offer_placements_placement", "placement_id"),
    )

    def __repr__(self) -> str:
        return f"<OfferPlacement offer={self.offer_id} placement={self.placement_id}>"
