"""Tenant (Company) model."""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.conference import Conference
    from app.models.module import TenantModule
    from app.models.training import Training
    from app.models.user import User


class Tenant(Base):
    """
    Tenant model representing a company using the platform.

    Each tenant has isolated data through PostgreSQL Row-Level Security.
    """

    __tablename__ = "tenants"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    settings: Mapped[dict] = mapped_column(JSONB, default=dict)

    # Address fields
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    postal_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    country: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Business fields
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    vat_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    website: Mapped[str | None] = mapped_column(String(500), nullable=True)
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    email_domain: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Per-tenant Resend email settings (overrides global env vars when set)
    resend_api_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    resend_from_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    resend_from_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Contact persons as JSONB array
    # Structure: [{"name": "John Doe", "email": "john@example.com", "phone": "+1234567890", "role": "Manager"}, ...]
    contact_persons: Mapped[list] = mapped_column(JSONB, default=list)

    # Comments/notes
    comments: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Tenant super user (assigned by SaaS super admin)
    # This user has elevated privileges within the tenant (e.g., can delete conferences)
    super_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    users: Mapped[list["User"]] = relationship(
        "User",
        back_populates="tenant",
        cascade="all, delete-orphan",
        foreign_keys="User.tenant_id",
    )
    super_user: Mapped["User | None"] = relationship(
        "User",
        foreign_keys=[super_user_id],
        post_update=True,  # Handle circular dependency
    )
    tenant_modules: Mapped[list["TenantModule"]] = relationship(
        "TenantModule", back_populates="tenant", cascade="all, delete-orphan"
    )
    conferences: Mapped[list["Conference"]] = relationship(
        "Conference", back_populates="tenant", cascade="all, delete-orphan"
    )
    trainings: Mapped[list["Training"]] = relationship(
        "Training", back_populates="tenant", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Tenant {self.name} ({self.slug})>"
