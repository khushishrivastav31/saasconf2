"""Alumni model — tracks past conference attendees."""

import uuid
from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship, validates

from app.core.security.pii_crypto import hash_email
from app.db.base import Base

if TYPE_CHECKING:
    from app.models.conference import Conference
    from app.models.tenant import Tenant


class AlumniSource(StrEnum):
    """How the alumni record was created."""

    MANUAL = "manual"
    IMPORT = "import"
    REGISTRATION = "registration"


class Alumni(Base):
    """
    Past attendee for a conference.

    Conference-scoped: each record means "this person attended this conference."
    Cross-conference alumni check queries by (tenant_id, email).
    """

    __tablename__ = "alumni"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    conference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False
    )

    email: Mapped[str] = mapped_column(String(320), nullable=False)
    email_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    first_name: Mapped[str] = mapped_column(String(255), nullable=False)
    last_name: Mapped[str] = mapped_column(String(255), nullable=False)
    company: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source: Mapped[str] = mapped_column(String(20), nullable=False, default=AlumniSource.MANUAL.value)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant")
    conference: Mapped["Conference"] = relationship("Conference")

    __table_args__ = (
        Index("idx_alumni_tenant", "tenant_id"),
        Index("idx_alumni_conference", "tenant_id", "conference_id"),
        Index("idx_alumni_email_hash", "email_hash"),
    )

    @validates("email")
    def _sync_email_hash(self, _key: str, value: str) -> str:
        self.email_hash = hash_email(value) if value else None
        return value

    def __repr__(self) -> str:
        return f"<Alumni {self.email} @ conference={self.conference_id}>"
