"""Applicant token models for portal authentication."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.utils import utcnow
from app.db.base import Base


class ApplicantRefreshToken(Base):
    """Refresh token storage for applicant portal authentication."""

    __tablename__ = "applicant_refresh_tokens"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    applicant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cfp_applicants.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    applicant = relationship("CFPApplicant")

    # Indexes
    __table_args__ = (
        Index("idx_applicant_refresh_token_hash", "token_hash"),
        Index("idx_applicant_refresh_token_applicant", "applicant_id"),
    )

    @property
    def is_valid(self) -> bool:
        """Check if token is still valid (not expired and not revoked)."""
        if self.revoked_at is not None:
            return False
        return utcnow() < self.expires_at

    def __repr__(self) -> str:
        return f"<ApplicantRefreshToken applicant={self.applicant_id} valid={self.is_valid}>"


class ApplicantEmailVerification(Base):
    """Email verification tokens for applicant registration."""

    __tablename__ = "applicant_email_verifications"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    applicant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cfp_applicants.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    applicant = relationship("CFPApplicant")

    # Indexes
    __table_args__ = (
        Index("idx_applicant_email_verification_hash", "token_hash"),
        Index("idx_applicant_email_verification_applicant", "applicant_id"),
    )

    @property
    def is_valid(self) -> bool:
        """Check if verification token is still valid."""
        if self.used_at is not None:
            return False
        return utcnow() < self.expires_at

    def __repr__(self) -> str:
        return f"<ApplicantEmailVerification applicant={self.applicant_id}>"


class ApplicantPasswordReset(Base):
    """Password reset tokens for applicant portal."""

    __tablename__ = "applicant_password_resets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    applicant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cfp_applicants.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    applicant = relationship("CFPApplicant")

    __table_args__ = (
        Index("idx_applicant_password_reset_hash", "token_hash"),
        Index("idx_applicant_password_reset_applicant", "applicant_id"),
    )

    @property
    def is_valid(self) -> bool:
        """Check if reset token is still valid."""
        if self.used_at is not None:
            return False
        return utcnow() < self.expires_at

    def __repr__(self) -> str:
        return f"<ApplicantPasswordReset applicant={self.applicant_id}>"
