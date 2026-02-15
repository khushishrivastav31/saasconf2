"""Refresh token model."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.utils import utcnow
from app.db.base import Base


class RefreshToken(Base):
    """
    Refresh token storage for token revocation support.

    Tokens are stored as hashes for security.
    """

    __tablename__ = "refresh_tokens"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    user = relationship("User")

    # Indexes
    __table_args__ = (
        Index("idx_refresh_token_hash", "token_hash"),
        Index("idx_refresh_token_user", "user_id"),
    )

    @property
    def is_valid(self) -> bool:
        """Check if token is still valid (not expired and not revoked)."""
        if self.revoked_at is not None:
            return False
        return utcnow() < self.expires_at

    def __repr__(self) -> str:
        return f"<RefreshToken user={self.user_id} valid={self.is_valid}>"
