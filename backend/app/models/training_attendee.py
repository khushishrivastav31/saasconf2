"""Central training attendee identity — unified across registrations and offers."""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship, validates

from app.core.security.pii_crypto import hash_email
from app.db.base import Base

if TYPE_CHECKING:
    from app.models.training_attendee_history import TrainingAttendeeHistory


class TrainingAttendee(Base):
    """Central attendee identity, deduplicated by (tenant_id, email).

    Status:
      - active: currently assigned to a training (via registration or offer)
      - parked: removed from training, waiting to be reassigned
    """

    __tablename__ = "training_attendees"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    first_name: Mapped[str] = mapped_column(String(200), nullable=False)
    last_name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    email_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    email_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", server_default="active")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Link to unified portal user account
    portal_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("portal_users.id", ondelete="SET NULL"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    history: Mapped[list["TrainingAttendeeHistory"]] = relationship(
        "TrainingAttendeeHistory",
        back_populates="attendee",
        order_by="TrainingAttendeeHistory.created_at.desc()",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        UniqueConstraint("tenant_id", "email", name="uq_training_attendees_tenant_email"),
        Index("idx_training_attendees_tenant", "tenant_id"),
        Index("idx_training_attendees_status", "status"),
        Index("idx_training_attendees_email_hash", "email_hash"),
    )

    @validates("email")
    def _sync_email_hash(self, _key: str, value: str) -> str:
        self.email_hash = hash_email(value) if value else None
        return value

    def __repr__(self) -> str:
        return f"<TrainingAttendee {self.first_name} {self.last_name} ({self.email}) status={self.status}>"
