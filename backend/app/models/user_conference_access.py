"""User conference access model."""

import uuid
from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, func, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.conference import Conference
    from app.models.user import User


class ConferenceAccessLevel(str, Enum):
    """Access levels for conference access."""

    ADMIN = "admin"  # Can edit conference
    READ_ONLY = "read_only"  # Can only view


class UserConferenceAccess(Base):
    """
    User conference access model.

    Tracks which users have access to which conferences and at what level.
    """

    __tablename__ = "user_conference_access"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    conference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conferences.id", ondelete="CASCADE"),
        nullable=False,
    )
    access_level: Mapped[str] = mapped_column(
        SQLEnum(
            ConferenceAccessLevel,
            name="conference_access_level",
            create_constraint=False,
            native_enum=True,
            values_callable=lambda e: [x.value for x in e],
        ),
        nullable=False,
        default=ConferenceAccessLevel.READ_ONLY.value,
    )
    granted_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    granted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    user: Mapped["User"] = relationship(
        "User", foreign_keys=[user_id], back_populates="conference_access"
    )
    conference: Mapped["Conference"] = relationship(
        "Conference", back_populates="user_access"
    )
    granter: Mapped["User | None"] = relationship("User", foreign_keys=[granted_by])

    # Indexes
    __table_args__ = (
        Index("idx_user_conference_access_unique", "user_id", "conference_id", unique=True),
        Index("idx_user_conference_access_user", "user_id"),
        Index("idx_user_conference_access_conference", "conference_id"),
    )

    @property
    def access_level_value(self) -> str:
        """Get the access level as a string value.

        Handles both enum and string cases that can occur with
        native PostgreSQL enums.
        """
        if hasattr(self.access_level, "value"):
            return self.access_level.value
        return str(self.access_level)

    @property
    def is_admin(self) -> bool:
        """Check if this access record grants admin privileges."""
        return self.access_level_value == ConferenceAccessLevel.ADMIN.value

    def __repr__(self) -> str:
        return f"<UserConferenceAccess user={self.user_id} conference={self.conference_id} level={self.access_level}>"
