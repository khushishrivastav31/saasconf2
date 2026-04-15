"""Training attendee history — chronological events for the parking lot feature."""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.training_attendee import TrainingAttendee


class TrainingAttendeeHistory(Base):
    """Chronological event log for a training attendee.

    Event types:
      - registered: assigned to a training via portal registration
      - offer_assigned: assigned to a training via offer
      - parked: removed from training, placed in parking lot
      - reassigned: moved from parking lot to a new training
      - cancelled: registration/offer cancelled
      - offer_removed: removed from an offer
    """

    __tablename__ = "training_attendee_history"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    attendee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("training_attendees.id", ondelete="CASCADE"), nullable=False
    )
    event_type: Mapped[str] = mapped_column(String(30), nullable=False)
    placement_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("program_year_trainings.id", ondelete="SET NULL"), nullable=True
    )
    source_type: Mapped[str | None] = mapped_column(String(30), nullable=True)  # registration | offer
    source_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    attendee: Mapped["TrainingAttendee"] = relationship("TrainingAttendee", back_populates="history")

    __table_args__ = (
        Index("idx_training_att_history_attendee", "attendee_id"),
        Index("idx_training_att_history_placement", "placement_id"),
    )

    def __repr__(self) -> str:
        return f"<TrainingAttendeeHistory {self.event_type} attendee={self.attendee_id}>"
