"""Booking and discount models: periods, options, packages, and discount codes."""

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class BookingPeriod(Base):
    """
    Conference-scoped booking period definitions (matrix columns).

    Each conference defines pricing periods (e.g. "Blind", "Early Bird", "Regular")
    with date ranges. Each period stores per-package prices as a JSONB map:
    { "<package_id>": price }.
    """

    __tablename__ = "booking_periods"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    conference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conferences.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    prices: Mapped[dict | None] = mapped_column(JSONB, nullable=True, default=dict)
    currency: Mapped[str | None] = mapped_column(String(3), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("idx_booking_periods_tenant", "tenant_id"),
        Index("idx_booking_periods_conference", "conference_id"),
        Index("idx_booking_periods_name", "tenant_id", "conference_id", "name", unique=True),
    )

    def __repr__(self) -> str:
        return f"<BookingPeriod {self.name}>"


class BookingOption(Base):
    """
    Conference-scoped booking option definitions (matrix rows).

    Each option defines what an attendee can buy (e.g. "Tutorial", "2-Day Pass").
    Prices are stored on the BookingPeriod side.
    """

    __tablename__ = "booking_options"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    conference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conferences.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    conference_day_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("program_days.id", ondelete="SET NULL"),
        nullable=True,
    )
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("idx_booking_options_tenant", "tenant_id"),
        Index("idx_booking_options_conference", "conference_id"),
        Index("idx_booking_options_name", "tenant_id", "conference_id", "name", unique=True),
        Index("idx_booking_options_day", "conference_day_id"),
    )

    def __repr__(self) -> str:
        return f"<BookingOption {self.name}>"


class BookingPackage(Base):
    """
    Conference-scoped booking package (bundle of options).

    Packages are compositions of booking options (e.g., "Tutorial Only",
    "Tutorial + Day 1", "Full Conference"). Package prices are calculated
    dynamically by summing component option prices for each period.
    """

    __tablename__ = "booking_packages"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    conference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conferences.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("idx_booking_packages_tenant", "tenant_id"),
        Index("idx_booking_packages_conference", "conference_id"),
        Index("idx_booking_packages_name", "tenant_id", "conference_id", "name", unique=True),
    )

    def __repr__(self) -> str:
        return f"<BookingPackage {self.name}>"


class BookingPackageOption(Base):
    """
    Junction table linking packages to their component options.

    When a package is created, entries are added here for each included option.
    """

    __tablename__ = "booking_package_options"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    booking_package_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("booking_packages.id", ondelete="CASCADE"),
        nullable=False,
    )
    booking_option_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("booking_options.id", ondelete="CASCADE"),
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (
        Index("idx_booking_package_options_tenant", "tenant_id"),
        Index("idx_booking_package_options_package", "booking_package_id"),
        Index("idx_booking_package_options_option", "booking_option_id"),
        Index("uq_booking_package_option", "booking_package_id", "booking_option_id", unique=True),
    )

    def __repr__(self) -> str:
        return f"<BookingPackageOption package={self.booking_package_id} option={self.booking_option_id}>"


class DiscountCode(Base):
    """
    Conference-scoped discount code definitions.

    Each conference can have discount codes that attendees enter during booking.
    Codes can be fixed-amount or percentage-based, with optional date ranges and usage limits.
    """

    __tablename__ = "discount_codes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    conference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conferences.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    discount_type: Mapped[str] = mapped_column(String(10), nullable=False)
    discount_value: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str | None] = mapped_column(String(3), nullable=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    max_uses: Mapped[int] = mapped_column(Integer, default=0)
    usage_count: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("idx_discount_codes_tenant", "tenant_id"),
        Index("idx_discount_codes_conference", "conference_id"),
        Index("idx_discount_codes_code", "tenant_id", "conference_id", "code", unique=True),
    )

    def __repr__(self) -> str:
        return f"<DiscountCode {self.code}>"


class DiscountCodeOption(Base):
    """
    Association table linking discount codes to specific booking options.

    When a discount code has associated options, it only applies to those options.
    If a discount code has no associated options, it applies to all options.
    """

    __tablename__ = "discount_code_options"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    discount_code_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("discount_codes.id", ondelete="CASCADE"),
        nullable=False,
    )
    booking_option_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("booking_options.id", ondelete="CASCADE"),
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (
        Index("idx_discount_code_options_tenant", "tenant_id"),
        Index("idx_discount_code_options_discount", "discount_code_id"),
        Index("idx_discount_code_options_option", "booking_option_id"),
        Index("uq_discount_code_option", "discount_code_id", "booking_option_id", unique=True),
    )

    def __repr__(self) -> str:
        return f"<DiscountCodeOption discount={self.discount_code_id} option={self.booking_option_id}>"
