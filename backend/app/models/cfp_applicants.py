"""CFP Applicant model: tenant-level paper applicant profiles."""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.tenant import Tenant


class CFPApplicant(Base):
    """CFP Applicant model. Tenant-level list of paper applicants."""

    __tablename__ = "cfp_applicants"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    first_name: Mapped[str] = mapped_column(String(255), nullable=False)
    last_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    pronouns: Mapped[str | None] = mapped_column(String(100), nullable=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    company: Mapped[str | None] = mapped_column(String(255), nullable=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    allow_out_of_timeframe: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    social_links: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    needs_accessibility: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    accessibility_details: Mapped[str | None] = mapped_column(Text, nullable=True)
    agrees_to_recording: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    message_notifications_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    theme_preference: Mapped[str | None] = mapped_column(String(5), nullable=True)

    # Address fields
    address_line_1: Mapped[str | None] = mapped_column(String(500), nullable=True)
    address_line_2: Mapped[str | None] = mapped_column(String(500), nullable=True)
    city: Mapped[str | None] = mapped_column(String(255), nullable=True)
    postal_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    country: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Link to unified portal user account
    portal_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("portal_users.id", ondelete="SET NULL"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant")

    # Indexes
    __table_args__ = (Index("idx_cfp_applicants_tenant", "tenant_id"),)

    def __repr__(self) -> str:
        return f"<CFPApplicant {self.first_name} {self.last_name}>"
