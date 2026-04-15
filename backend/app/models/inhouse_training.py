"""Inhouse training model for custom B2B training engagements."""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, ForeignKey, Index, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.customer import Customer
    from app.models.trainer import Trainer
    from app.models.training import Training


class InhouseTraining(Base):
    """An inhouse training engagement for a specific customer."""

    __tablename__ = "inhouse_trainings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )

    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False
    )
    training_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trainings.id", ondelete="CASCADE"), nullable=False
    )
    trainer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trainers.id", ondelete="SET NULL"), nullable=True
    )
    offer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("customer_offers.id", ondelete="SET NULL"), nullable=True
    )

    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="draft", server_default="draft")

    training_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    certification_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    comments: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    customer: Mapped["Customer"] = relationship("Customer", lazy="joined")
    training: Mapped["Training"] = relationship("Training", lazy="joined")
    trainer: Mapped["Trainer | None"] = relationship("Trainer", lazy="joined")

    __table_args__ = (
        Index("idx_inhouse_tenant", "tenant_id"),
        Index("idx_inhouse_customer", "customer_id"),
        Index("idx_inhouse_training", "training_id"),
        Index("idx_inhouse_start_date", "tenant_id", "start_date"),
    )

    def __repr__(self) -> str:
        return f"<InhouseTraining {self.training_id} for {self.customer_id}>"
