"""User model."""

import uuid
from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.tenant import Tenant
    from app.models.user_conference_access import UserConferenceAccess
    from app.models.user_tenant_role import UserTenantRole


class UserRole(StrEnum):
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

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    first_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    pronouns: Mapped[str | None] = mapped_column(String(100), nullable=True)
    role: Mapped[str] = mapped_column(String(50), nullable=False, default=UserRole.USER.value)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    has_all_conference_access: Mapped[bool] = mapped_column(Boolean, default=True)
    last_login: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    message_notifications_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    theme_preference: Mapped[str | None] = mapped_column(String(5), nullable=True)

    # Relationships
    tenant: Mapped["Tenant | None"] = relationship(
        "Tenant",
        back_populates="users",
        foreign_keys=[tenant_id],
    )
    conference_access: Mapped[list["UserConferenceAccess"]] = relationship(
        "UserConferenceAccess",
        foreign_keys="UserConferenceAccess.user_id",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    tenant_roles: Mapped[list["UserTenantRole"]] = relationship(
        "UserTenantRole",
        foreign_keys="UserTenantRole.user_id",
        back_populates="user",
        cascade="all, delete-orphan",
    )

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

    @property
    def is_tenant_super_user(self) -> bool:
        """Check if user is the designated super user for their tenant."""
        if not self.tenant:
            return False
        return self.tenant.super_user_id == self.id

    def __repr__(self) -> str:
        return f"<User {self.email} ({self.role})>"
