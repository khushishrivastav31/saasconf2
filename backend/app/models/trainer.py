"""Trainer model for training management module."""

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, Column, Date, DateTime, ForeignKey, Index, String, Table, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.tenant import Tenant
    from app.models.training import Training, TrainingLanguage

# Association table: trainer <-> trainings (M2M)
trainer_trainings = Table(
    "trainer_trainings",
    Base.metadata,
    Column(
        "trainer_id",
        UUID(as_uuid=True),
        ForeignKey("trainers.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "training_id",
        UUID(as_uuid=True),
        ForeignKey("trainings.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)

# Association table: trainer <-> languages (M2M)
trainer_languages = Table(
    "trainer_languages",
    Base.metadata,
    Column(
        "trainer_id",
        UUID(as_uuid=True),
        ForeignKey("trainers.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "language_id",
        UUID(as_uuid=True),
        ForeignKey("training_languages.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class Trainer(Base):
    """Trainer — a person who delivers trainings."""

    __tablename__ = "trainers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )

    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    vita: Mapped[str | None] = mapped_column(Text, nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    is_internal: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant")
    trainings: Mapped[list["Training"]] = relationship("Training", secondary=trainer_trainings, lazy="selectin")
    languages: Mapped[list["TrainingLanguage"]] = relationship(
        "TrainingLanguage", secondary=trainer_languages, lazy="selectin"
    )
    unavailability: Mapped[list["TrainerUnavailability"]] = relationship(
        "TrainerUnavailability", back_populates="trainer", cascade="all, delete-orphan", lazy="selectin"
    )

    __table_args__ = (
        Index("idx_trainers_tenant", "tenant_id"),
        Index("idx_trainers_active", "tenant_id", "is_active"),
    )

    def __repr__(self) -> str:
        return f"<Trainer {self.first_name} {self.last_name}>"


class TrainerUnavailability(Base):
    """Date range when a trainer is not available."""

    __tablename__ = "trainer_unavailability"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    trainer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trainers.id", ondelete="CASCADE"), nullable=False
    )

    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    trainer: Mapped["Trainer"] = relationship("Trainer", back_populates="unavailability")

    __table_args__ = (
        CheckConstraint("end_date >= start_date", name="ck_trainer_unavail_dates"),
        Index("idx_trainer_unavail_trainer", "tenant_id", "trainer_id"),
        Index("idx_trainer_unavail_dates", "trainer_id", "start_date", "end_date"),
    )

    def __repr__(self) -> str:
        return f"<TrainerUnavailability {self.start_date} - {self.end_date}>"
