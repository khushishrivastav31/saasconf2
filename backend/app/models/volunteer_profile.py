"""Volunteer profile model — stores volunteer-specific fields per conference."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Index, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class VolunteerProfile(Base):
    """
    Conference-scoped volunteer profile.

    Stores extra volunteer fields (t-shirt, emergency contact, etc.) for an
    applicant assigned to the Volunteer role in a given conference.
    """

    __tablename__ = "volunteer_profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    conference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False
    )
    applicant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cfp_applicants.id", ondelete="CASCADE"), nullable=False
    )

    tshirt_size: Mapped[str | None] = mapped_column(String(10), nullable=True)
    emergency_contact_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    emergency_contact_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    skills: Mapped[list] = mapped_column(JSONB, default=list, server_default="[]")
    availability: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    color: Mapped[str | None] = mapped_column(String(7), nullable=True)
    total_hours: Mapped[float] = mapped_column(Float, default=0.0, server_default="0.0")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        UniqueConstraint("tenant_id", "conference_id", "applicant_id", name="uq_volunteer_profile"),
        Index("idx_vp_tenant", "tenant_id"),
        Index("idx_vp_conference", "conference_id"),
        Index("idx_vp_applicant", "applicant_id"),
    )

    def __repr__(self) -> str:
        return f"<VolunteerProfile conference={self.conference_id} applicant={self.applicant_id}>"
