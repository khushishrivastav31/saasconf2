"""User model."""

import uuid
from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import String, Boolean, DateTime, ForeignKey, func, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.tenant import Tenant


class UserRole(str, Enum):
    """User roles in the system."""

    SUPER_ADMIN = "super_admin"  # Platform administrator
    TENANT_ADMIN = "tenant_admin"  # Company administrator
    USER = "user"  # Regular company user


class User(Base):
    """
    User model.

    Super admins have tenant_id = None.
    All other users belong to a tenant.
    """

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[str] = mapped_column(
        String(50), nullable=False, default=UserRole.USER.value
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_login: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    tenant: Mapped["Tenant | None"] = relationship("Tenant", back_populates="users")

    # Indexes
    __table_args__ = (
        Index("idx_users_tenant", "tenant_id"),
        Index("idx_users_email", "email"),
        # Unique constraint: email is unique within a tenant (or globally for super admins)
        Index("idx_users_tenant_email", "tenant_id", "email", unique=True),
    )

    @property
    def is_super_admin(self) -> bool:
        """Check if user is a super admin."""
        return self.role == UserRole.SUPER_ADMIN.value

    @property
    def is_tenant_admin(self) -> bool:
        """Check if user is a tenant admin."""
        return self.role == UserRole.TENANT_ADMIN.value

    def __repr__(self) -> str:
        return f"<User {self.email} ({self.role})>"
