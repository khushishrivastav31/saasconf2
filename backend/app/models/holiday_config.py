"""Holiday configuration models for training management."""

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.tenant import Tenant


class TenantHolidayConfig(Base):
    """Per-tenant holiday configuration for a country and year."""

    __tablename__ = "tenant_holiday_configs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )

    country_code: Mapped[str] = mapped_column(String(2), nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    national_holidays_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    regional_holidays_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    regional_code: Mapped[str | None] = mapped_column(String(10), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant")

    __table_args__ = (
        UniqueConstraint("tenant_id", "country_code", "year", name="uq_holiday_config_tenant_country_year"),
        Index("idx_thc_tenant", "tenant_id"),
    )

    def __repr__(self) -> str:
        return f"<TenantHolidayConfig {self.country_code} {self.year}>"


class CustomBlockedDay(Base):
    """Manually blocked day for training scheduling."""

    __tablename__ = "custom_blocked_days"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )

    date: Mapped[date] = mapped_column(Date, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    is_recurring: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant")

    __table_args__ = (
        UniqueConstraint("tenant_id", "date", name="uq_blocked_day_tenant_date"),
        Index("idx_cbd_tenant_year", "tenant_id", "year"),
    )

    def __repr__(self) -> str:
        return f"<CustomBlockedDay {self.date} {self.name}>"
