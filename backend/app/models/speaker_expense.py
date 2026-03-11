"""Speaker expense models for conference cost management."""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.cfp_applicants import CFPApplicant
    from app.models.conference import Conference
    from app.models.program import ProgramSession
    from app.models.settings import SessionType
    from app.models.tenant import Tenant
    from app.models.user import User


class ExpenseCategory(Base):
    """Expense category for speaker expenses (travel, accommodation, meals, etc.)."""

    __tablename__ = "expense_categories"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    conference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    conference: Mapped["Conference"] = relationship("Conference")
    tenant: Mapped["Tenant"] = relationship("Tenant")

    __table_args__ = (
        UniqueConstraint("conference_id", "name", name="uq_expense_category_conference_name"),
        Index("idx_expense_categories_tenant_conf", "tenant_id", "conference_id"),
    )

    def __repr__(self) -> str:
        return f"<ExpenseCategory {self.name}>"


class ExpenseTier(Base):
    """Named expense budget tier (e.g. 'Speaker 700 EUR', 'Keynote 1500 EUR')."""

    __tablename__ = "expense_tiers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    conference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    max_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="EUR")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    conference: Mapped["Conference"] = relationship("Conference")
    tenant: Mapped["Tenant"] = relationship("Tenant")

    __table_args__ = (
        UniqueConstraint("conference_id", "name", name="uq_expense_tier_conference_name"),
        Index("idx_expense_tiers_tenant_conf", "tenant_id", "conference_id"),
    )

    def __repr__(self) -> str:
        return f"<ExpenseTier {self.name} {self.max_amount} {self.currency}>"


class SpeakerExpenseAllowanceDefault(Base):
    """Default expense allowance per session type per conference."""

    __tablename__ = "speaker_expense_allowance_defaults"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    conference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False
    )
    session_type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("session_types.id", ondelete="CASCADE"), nullable=False
    )
    max_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="EUR")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    conference: Mapped["Conference"] = relationship("Conference")
    tenant: Mapped["Tenant"] = relationship("Tenant")
    session_type: Mapped["SessionType"] = relationship("SessionType")

    __table_args__ = (
        UniqueConstraint("conference_id", "session_type_id", name="uq_allowance_default_conf_session_type"),
        Index("idx_allowance_defaults_tenant_conf", "tenant_id", "conference_id"),
    )

    def __repr__(self) -> str:
        return f"<SpeakerExpenseAllowanceDefault {self.max_amount} {self.currency}>"


class SpeakerExpenseAllowance(Base):
    """Per-speaker expense allowance for a conference (auto from session type or manual override)."""

    __tablename__ = "speaker_expense_allowances"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    conference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False
    )
    cfp_applicant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cfp_applicants.id", ondelete="CASCADE"), nullable=False
    )
    expense_tier_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("expense_tiers.id", ondelete="SET NULL"), nullable=True
    )
    max_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="EUR")
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="auto")  # auto, manual, tier
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    conference: Mapped["Conference"] = relationship("Conference")
    tenant: Mapped["Tenant"] = relationship("Tenant")
    applicant: Mapped["CFPApplicant"] = relationship("CFPApplicant")
    expense_tier: Mapped["ExpenseTier | None"] = relationship("ExpenseTier")

    __table_args__ = (
        UniqueConstraint("conference_id", "cfp_applicant_id", name="uq_allowance_conf_applicant"),
        Index("idx_allowances_tenant_conf", "tenant_id", "conference_id"),
        Index("idx_allowances_applicant", "cfp_applicant_id"),
    )

    def __repr__(self) -> str:
        return f"<SpeakerExpenseAllowance {self.max_amount} {self.currency} ({self.source})>"


class SpeakerExpense(Base):
    """Individual expense claim submitted by a speaker."""

    __tablename__ = "speaker_expenses"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    conference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False
    )
    cfp_applicant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cfp_applicants.id", ondelete="CASCADE"), nullable=False
    )
    speaker_name: Mapped[str] = mapped_column(String(255), nullable=False)

    # Expense details
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("expense_categories.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    expense_date: Mapped[date] = mapped_column(Date, nullable=False)

    # Multi-currency
    original_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    original_currency: Mapped[str] = mapped_column(String(3), nullable=False)
    converted_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    conference_currency: Mapped[str | None] = mapped_column(String(3), nullable=True)
    exchange_rate: Mapped[Decimal | None] = mapped_column(Numeric(12, 6), nullable=True)

    # Assignment
    session_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("program_sessions.id", ondelete="SET NULL"), nullable=True
    )

    # Approval workflow: draft → submitted → approved/rejected → paid
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    approved_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    payment_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Metadata
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    conference: Mapped["Conference"] = relationship("Conference")
    tenant: Mapped["Tenant"] = relationship("Tenant")
    applicant: Mapped["CFPApplicant"] = relationship("CFPApplicant")
    category: Mapped["ExpenseCategory | None"] = relationship("ExpenseCategory")
    session: Mapped["ProgramSession | None"] = relationship("ProgramSession")
    approver: Mapped["User | None"] = relationship("User")

    __table_args__ = (
        Index("idx_speaker_expenses_tenant", "tenant_id"),
        Index("idx_speaker_expenses_conf_status", "tenant_id", "conference_id", "status"),
        Index("idx_speaker_expenses_applicant", "cfp_applicant_id"),
        Index("idx_speaker_expenses_category", "category_id"),
        Index("idx_speaker_expenses_session", "session_id"),
    )

    def __repr__(self) -> str:
        return f"<SpeakerExpense {self.title} ({self.status})>"
