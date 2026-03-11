"""Budget planning models for conference cost management."""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.conference import Conference
    from app.models.tenant import Tenant
    from app.models.user import User


class BudgetCategory(Base):
    """Budget category for grouping line items (venue, catering, AV, etc.)."""

    __tablename__ = "budget_categories"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    conference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    color: Mapped[str | None] = mapped_column(String(7), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    conference: Mapped["Conference"] = relationship("Conference")
    tenant: Mapped["Tenant"] = relationship("Tenant")
    line_items: Mapped[list["BudgetLineItem"]] = relationship("BudgetLineItem", back_populates="category")

    __table_args__ = (
        UniqueConstraint("conference_id", "name", name="uq_budget_category_conference_name"),
        Index("idx_budget_categories_tenant_conf", "tenant_id", "conference_id"),
    )

    def __repr__(self) -> str:
        return f"<BudgetCategory {self.name}>"


class Budget(Base):
    """Conference budget for cost planning and tracking."""

    __tablename__ = "budgets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    conference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")  # draft, active, archived
    total_planned: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    total_actual: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="EUR")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    conference: Mapped["Conference"] = relationship("Conference")
    tenant: Mapped["Tenant"] = relationship("Tenant")
    creator: Mapped["User | None"] = relationship("User")
    line_items: Mapped[list["BudgetLineItem"]] = relationship(
        "BudgetLineItem", back_populates="budget", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("idx_budgets_tenant", "tenant_id"),
        Index("idx_budgets_tenant_conf_status", "tenant_id", "conference_id", "status"),
    )

    def __repr__(self) -> str:
        return f"<Budget {self.name} ({self.status})>"


class BudgetLineItem(Base):
    """Individual line item within a budget."""

    __tablename__ = "budget_line_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    budget_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("budgets.id", ondelete="CASCADE"), nullable=False
    )
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("budget_categories.id", ondelete="SET NULL"), nullable=True
    )
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    planned_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    actual_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    vendor_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    budget: Mapped["Budget"] = relationship("Budget", back_populates="line_items")
    category: Mapped["BudgetCategory | None"] = relationship("BudgetCategory", back_populates="line_items")
    tenant: Mapped["Tenant"] = relationship("Tenant")

    __table_args__ = (
        Index("idx_budget_line_items_tenant", "tenant_id"),
        Index("idx_budget_line_items_budget", "budget_id"),
        Index("idx_budget_line_items_category", "category_id"),
    )

    def __repr__(self) -> str:
        return f"<BudgetLineItem {self.description[:50]}>"
