"""User password reset token model."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.utils import utcnow
from app.db.base import Base


class UserPasswordReset(Base):
    """Password reset tokens for admin users.

    Mirrors ApplicantPasswordReset but references the users table.
    Tokens are one-time-use with a 1-hour expiration.
    """

    __tablename__ = "user_password_resets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user = relationship("User")

    __table_args__ = (
        Index("idx_user_password_reset_hash", "token_hash"),
        Index("idx_user_password_reset_user", "user_id"),
    )

    @property
    def is_valid(self) -> bool:
        """Check if reset token is still valid."""
        if self.used_at is not None:
            return False
        return utcnow() < self.expires_at

    def __repr__(self) -> str:
        return f"<UserPasswordReset user={self.user_id}>"
