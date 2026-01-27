"""Tenant-configurable settings: volunteer roles and location types."""

import uuid
from datetime import datetime

from sqlalchemy import String, Boolean, DateTime, ForeignKey, func, Text, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class VolunteerRole(Base):
    """
    Tenant-scoped volunteer role definitions.

    These roles are shared across all conferences within a tenant.
    The volunteer.role column stores the role name as a plain string.
    """

    __tablename__ = "volunteer_roles"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("idx_volunteer_roles_tenant", "tenant_id"),
        Index("idx_volunteer_roles_name", "tenant_id", "name", unique=True),
    )

    def __repr__(self) -> str:
        return f"<VolunteerRole {self.name}>"


class TenantLocationType(Base):
    """
    Tenant-scoped location type definitions.

    Replaces the hardcoded LocationType enum. The locations.location_type
    column stores the type's slug value as a plain string.
    """

    __tablename__ = "tenant_location_types"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    slug: Mapped[str] = mapped_column(String(20), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("idx_tenant_location_types_tenant", "tenant_id"),
        Index("idx_tenant_location_types_slug", "tenant_id", "slug", unique=True),
    )

    def __repr__(self) -> str:
        return f"<TenantLocationType {self.name} ({self.slug})>"
