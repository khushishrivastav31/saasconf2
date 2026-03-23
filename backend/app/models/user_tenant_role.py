"""User tenant role models for module-scoped access control."""

import uuid
from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.user import User


class TenantRoleScope(StrEnum):
    """Scopes for tenant-level roles."""

    ALL = "all"  # Full access to everything (Super User)
    CONFERENCES = "conferences"  # Conferences module
    TRAININGS = "trainings"  # Trainings module
    ACCOUNTING = "accounting"  # Cross-module invoicing


class TenantRoleLevel(StrEnum):
    """Permission levels within a scope."""

    SUPER_USER = "super_user"  # Full access + elevated privileges (Stripe, deletion)
    ADMIN = "admin"  # Full admin access within scope
    MEMBER = "member"  # Read-only access within scope


class UserTenantRole(Base):
    """
    Module-scoped role assignment for tenant users.

    Each row grants a user a specific permission level within a scope.
    A user can have multiple rows (e.g., admin for conferences + admin for accounting).
    Unique constraint on (user_id, scope) ensures one level per scope.
    """

    __tablename__ = "user_tenant_roles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    scope: Mapped[str] = mapped_column(String(50), nullable=False)
    level: Mapped[str] = mapped_column(String(50), nullable=False)
    granted_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    granted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="tenant_roles", foreign_keys=[user_id])
    granted_by_user: Mapped["User | None"] = relationship("User", foreign_keys=[granted_by])

    __table_args__ = (
        Index("idx_user_tenant_roles_user", "user_id"),
        Index("idx_user_tenant_roles_unique", "user_id", "scope", unique=True),
    )

    def __repr__(self) -> str:
        return f"<UserTenantRole user={self.user_id} scope={self.scope} level={self.level}>"
