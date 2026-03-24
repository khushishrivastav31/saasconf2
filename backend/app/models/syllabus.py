"""Syllabus model for training management module."""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.certification_body import CertificationBody
    from app.models.tenant import Tenant
    from app.models.training import TrainingLanguage


class Syllabus(Base):
    """
    Syllabus entry for a training programme.

    Represents a specific curriculum/course offered, linked to a certification body
    and a language.
    """

    __tablename__ = "syllabi"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )

    # Core fields
    slug: Mapped[str] = mapped_column(String(100), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    price: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)

    # Relationships
    certification_body_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("certification_bodies.id", ondelete="SET NULL"),
        nullable=True,
    )
    language_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("training_languages.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # ORM relationships
    tenant: Mapped["Tenant"] = relationship("Tenant")
    certification_body: Mapped["CertificationBody | None"] = relationship("CertificationBody", lazy="joined")
    language: Mapped["TrainingLanguage | None"] = relationship("TrainingLanguage", lazy="joined")

    # Indexes
    __table_args__ = (
        Index("idx_syllabi_tenant", "tenant_id"),
        Index("idx_syllabi_slug_tenant", "slug", "tenant_id", unique=True),
    )

    def __repr__(self) -> str:
        return f"<Syllabus {self.slug}: {self.name}>"
