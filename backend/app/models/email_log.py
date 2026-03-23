"""Email failure log model for admin visibility into undelivered emails."""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.conference import Conference
    from app.models.tenant import Tenant
    from app.models.user import User


class EmailLog(Base):
    """Log of email delivery failures.

    Only failed or not-configured sends are logged (not successes).
    Admins can view and acknowledge these from the My Company page.
    """

    __tablename__ = "email_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    conference_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conferences.id", ondelete="SET NULL"),
        nullable=True,
    )

    # What failed
    recipient_email: Mapped[str] = mapped_column(String(255), nullable=False)
    subject: Mapped[str] = mapped_column(String(500), nullable=False)
    email_type: Mapped[str] = mapped_column(String(50), nullable=False)

    # Why it failed
    status: Mapped[str] = mapped_column(String(20), nullable=False)  # "failed" | "not_configured"
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Admin tracking
    acknowledged: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    acknowledged_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant")
    conference: Mapped["Conference | None"] = relationship("Conference")
    acknowledged_by_user: Mapped["User | None"] = relationship("User")

    __table_args__ = (
        Index("idx_email_logs_tenant", "tenant_id"),
        Index("idx_email_logs_tenant_ack", "tenant_id", "acknowledged"),
        Index("idx_email_logs_created", "created_at"),
    )
