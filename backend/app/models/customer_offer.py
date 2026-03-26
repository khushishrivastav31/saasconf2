"""Customer offer model for training proposals."""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.customer import Customer
    from app.models.offer_document import OfferDocument
    from app.models.training_program import ProgramYearTraining


class CustomerOffer(Base):
    """An offer/proposal sent to a customer for training placements."""

    __tablename__ = "customer_offers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False
    )

    offer_number: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="draft", server_default="draft")
    attendees: Mapped[int | None] = mapped_column(Integer, nullable=True)
    training_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    certification_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    currency: Mapped[str] = mapped_column(String(3), default="EUR", server_default="EUR")
    comments: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    customer: Mapped["Customer"] = relationship("Customer", lazy="joined")
    placements: Mapped[list["ProgramYearTraining"]] = relationship(
        "ProgramYearTraining", back_populates="offer", lazy="selectin"
    )
    documents: Mapped[list["OfferDocument"]] = relationship(
        "OfferDocument",
        back_populates="offer",
        cascade="all, delete-orphan",
        order_by="OfferDocument.created_at.desc()",
    )

    __table_args__ = (
        UniqueConstraint("tenant_id", "offer_number", name="uq_offer_tenant_number"),
        Index("idx_customer_offers_tenant", "tenant_id"),
        Index("idx_customer_offers_customer", "customer_id"),
        Index("idx_customer_offers_status", "status"),
    )

    def __repr__(self) -> str:
        return f"<CustomerOffer {self.offer_number} ({self.status})>"
