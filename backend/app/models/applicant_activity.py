"""Applicant activity log model."""

import uuid
from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship, validates

from app.core.security.pii_crypto import hash_email
from app.db.base import Base

if TYPE_CHECKING:
    from app.models.cfp import CFPApplicant
    from app.models.tenant import Tenant


class ApplicantActivityType(StrEnum):
    """Applicant activity event types."""

    REGISTERED = "registered"
    CONFIRMATION_SENT = "confirmation_sent"
    EMAIL_VERIFIED = "email_verified"
    PASSWORD_RESET_REQUESTED = "password_reset_requested"
    PASSWORD_RESET_COMPLETED = "password_reset_completed"
    ACCOUNT_DELETED = "account_deleted"


class ApplicantActivityLog(Base):
    """
    Activity log for tracking applicant lifecycle events.

    This is a tenant-level log for tracking when applicants:
    - Register for the portal
    - Receive confirmation emails
    - Verify their email addresses
    - Delete their accounts
    """

    __tablename__ = "applicant_activity_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    applicant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("cfp_applicants.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Store email separately so we keep record even if applicant is deleted
    applicant_email: Mapped[str] = mapped_column(String(255), nullable=False)
    applicant_email_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    applicant_first_name: Mapped[str] = mapped_column(String(255), nullable=False)
    applicant_last_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    activity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant")
    applicant: Mapped["CFPApplicant | None"] = relationship("CFPApplicant")

    # Indexes
    __table_args__ = (
        Index("idx_applicant_activity_tenant", "tenant_id"),
        Index("idx_applicant_activity_applicant", "applicant_id"),
        Index("idx_applicant_activity_created", "tenant_id", "created_at"),
        Index("idx_applicant_activity_email", "tenant_id", "applicant_email"),
        Index("idx_applicant_activity_type", "tenant_id", "activity_type"),
        Index("idx_applicant_activity_logs_applicant_email_hash", "applicant_email_hash"),
    )

    @validates("applicant_email")
    def _sync_applicant_email_hash(self, _key: str, value: str) -> str:
        self.applicant_email_hash = hash_email(value) if value else None
        return value

    def __repr__(self) -> str:
        return f"<ApplicantActivityLog {self.activity_type} for {self.applicant_email}>"
