"""Module models."""

import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.tenant import Tenant
    from app.models.user import User


class Module(Base):
    """
    Module model representing platform features that can be assigned to tenants.

    Examples: 'conference', 'attendees', 'sessions', 'speakers', etc.
    """

    __tablename__ = "modules"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    config_schema: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    tenant_modules: Mapped[list["TenantModule"]] = relationship(
        "TenantModule", back_populates="module", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Module {self.code} ({self.name})>"


class TenantModule(Base):
    """
    Association between tenants and their assigned modules.

    This table controls which modules each tenant has access to,
    including subscription dates, pricing, and resource limits.
    """

    __tablename__ = "tenant_modules"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    module_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("modules.id", ondelete="CASCADE"), nullable=False
    )
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    config: Mapped[dict] = mapped_column(JSONB, default=dict)
    granted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    granted_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    # Subscription dates
    start_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    end_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Pricing
    price: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2), nullable=True, default=Decimal("0")
    )
    currency: Mapped[str | None] = mapped_column(
        String(3), nullable=True, default="USD"
    )

    # Resource limits (null = unlimited)
    max_papers: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_speakers: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_attendees: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_volunteers: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="tenant_modules")
    module: Mapped["Module"] = relationship("Module", back_populates="tenant_modules")
    granted_by_user: Mapped["User | None"] = relationship("User")

    # Constraints
    __table_args__ = (
        Index("idx_tenant_modules_tenant", "tenant_id"),
        Index("idx_tenant_modules_unique", "tenant_id", "module_id", unique=True),
        Index("idx_tenant_modules_dates", "start_date", "end_date"),
    )

    @property
    def is_active_subscription(self) -> bool:
        """Check if the module subscription is currently active based on dates."""
        if not self.is_enabled:
            return False
        now = datetime.now(UTC)
        if self.start_date and now < self.start_date:
            return False
        return not (self.end_date and now > self.end_date)

    def __repr__(self) -> str:
        return f"<TenantModule tenant={self.tenant_id} module={self.module_id}>"
