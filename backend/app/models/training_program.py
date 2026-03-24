"""Training program year models."""

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.location import Location
    from app.models.tenant import Tenant
    from app.models.training import Training


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

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant")
    placements: Mapped[list["ProgramYearTraining"]] = relationship(
        "ProgramYearTraining", back_populates="program_year", cascade="all, delete-orphan"
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
    location_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id", ondelete="SET NULL"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    program_year: Mapped["TrainingProgramYear"] = relationship("TrainingProgramYear", back_populates="placements")
    training: Mapped["Training"] = relationship("Training", lazy="joined")
    location: Mapped["Location | None"] = relationship("Location", lazy="joined")

    __table_args__ = (
        Index("idx_pyt_tenant", "tenant_id"),
        Index("idx_pyt_program_year", "program_year_id"),
        Index("idx_pyt_location", "location_id"),
    )

    def __repr__(self) -> str:
        return f"<ProgramYearTraining {self.training_id} @ {self.start_date}>"
