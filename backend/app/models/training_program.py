"""Training program year models."""

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.customer import Customer
    from app.models.customer_offer import CustomerOffer
    from app.models.location import Location
    from app.models.tenant import Tenant
    from app.models.trainer import Trainer
    from app.models.training import Training
    from app.models.user import User


class TrainingProgramYear(Base):
    """A training program for a specific year."""

    __tablename__ = "training_program_years"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )

    year: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="draft", server_default="draft")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    published_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant")
    placements: Mapped[list["ProgramYearTraining"]] = relationship(
        "ProgramYearTraining", back_populates="program_year", cascade="all, delete-orphan"
    )
    snapshots: Mapped[list["ProgramSnapshot"]] = relationship(
        "ProgramSnapshot",
        back_populates="program_year",
        cascade="all, delete-orphan",
        order_by="ProgramSnapshot.version.desc()",
    )

    __table_args__ = (
        UniqueConstraint("tenant_id", "year", name="uq_program_year_tenant"),
        Index("idx_tpy_tenant", "tenant_id"),
    )

    def __repr__(self) -> str:
        return f"<TrainingProgramYear {self.year} ({self.status})>"


class ProgramYearTraining(Base):
    """A training placed on a specific date in a program year calendar."""

    __tablename__ = "program_year_trainings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    program_year_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("training_program_years.id", ondelete="CASCADE"), nullable=False
    )
    training_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trainings.id", ondelete="CASCADE"), nullable=False
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    placement_type: Mapped[str] = mapped_column(String(20), default="open", server_default="open")
    location_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id", ondelete="SET NULL"), nullable=True
    )
    offer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("customer_offers.id", ondelete="SET NULL"), nullable=True
    )
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("customers.id", ondelete="SET NULL"), nullable=True
    )
    is_guaranteed: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    program_year: Mapped["TrainingProgramYear"] = relationship("TrainingProgramYear", back_populates="placements")
    training: Mapped["Training"] = relationship("Training", lazy="joined")
    location: Mapped["Location | None"] = relationship("Location", lazy="joined")
    offer: Mapped["CustomerOffer | None"] = relationship("CustomerOffer", back_populates="placements", lazy="joined")
    customer: Mapped["Customer | None"] = relationship("Customer", lazy="joined")
    trainer_assignments: Mapped[list["PlacementTrainer"]] = relationship(
        "PlacementTrainer", back_populates="placement", cascade="all, delete-orphan", lazy="selectin"
    )

    __table_args__ = (
        Index("idx_pyt_tenant", "tenant_id"),
        Index("idx_pyt_program_year", "program_year_id"),
        Index("idx_pyt_location", "location_id"),
        Index("idx_pyt_offer", "offer_id"),
        Index("idx_pyt_customer", "customer_id"),
    )

    def __repr__(self) -> str:
        return f"<ProgramYearTraining {self.training_id} @ {self.start_date}>"


class PlacementTrainer(Base):
    """A trainer assigned to a training placement."""

    __tablename__ = "placement_trainers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    placement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("program_year_trainings.id", ondelete="CASCADE"), nullable=False
    )
    trainer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trainers.id", ondelete="CASCADE"), nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    placement: Mapped["ProgramYearTraining"] = relationship("ProgramYearTraining", back_populates="trainer_assignments")
    trainer: Mapped["Trainer"] = relationship("Trainer", lazy="joined")

    __table_args__ = (
        UniqueConstraint("placement_id", "trainer_id", name="uq_placement_trainer"),
        Index("idx_pt_tenant", "tenant_id"),
        Index("idx_pt_placement", "placement_id"),
        Index("idx_pt_trainer", "trainer_id"),
    )

    def __repr__(self) -> str:
        return f"<PlacementTrainer {self.trainer_id} → {self.placement_id}>"


class ProgramSnapshot(Base):
    """A snapshot of the published program state at a specific version."""

    __tablename__ = "program_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    program_year_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("training_program_years.id", ondelete="CASCADE"), nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    snapshot_data: Mapped[list] = mapped_column(JSONB, nullable=False)
    published_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    program_year: Mapped["TrainingProgramYear"] = relationship("TrainingProgramYear", back_populates="snapshots")
    publisher: Mapped["User | None"] = relationship("User")

    __table_args__ = (
        UniqueConstraint("program_year_id", "version", name="uq_snapshot_version"),
        Index("idx_ps_tenant", "tenant_id"),
        Index("idx_ps_program_year", "program_year_id"),
    )

    def __repr__(self) -> str:
        return f"<ProgramSnapshot v{self.version} for {self.program_year_id}>"
