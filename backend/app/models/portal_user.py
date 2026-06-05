"""Portal User model — unified login for conference and training portal users.

A portal_user represents a single login identity per tenant. Both cfp_applicants
(conference) and training_attendees link to this table via portal_user_id FK.
One email = one portal account across both conferences and trainings.
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.security.pii_crypto import encrypt_pii, hash_email, hash_phone, read_pii
from app.db.base import Base

if TYPE_CHECKING:
    from app.models.customer_event import CustomerEvent


class PortalUser(Base):
    """Unified portal user — one login for conferences + trainings."""

    __tablename__ = "portal_users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )

    email_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    email_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    first_name: Mapped[str] = mapped_column(String(255), nullable=False)
    last_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    phone_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    phone_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    pronouns: Mapped[str | None] = mapped_column(String(100), nullable=True)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    company: Mapped[str | None] = mapped_column(String(255), nullable=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    social_links: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    address_line_1: Mapped[str | None] = mapped_column(String(500), nullable=True)
    address_line_2: Mapped[str | None] = mapped_column(String(500), nullable=True)
    city: Mapped[str | None] = mapped_column(String(255), nullable=True)
    postal_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    country: Mapped[str | None] = mapped_column(String(100), nullable=True)

    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    theme_preference: Mapped[str | None] = mapped_column(String(5), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # ix_portal_users_tenant_email_hash created in migration 197 — declared here
    # so create_all() (test DB) also creates it and ON CONFLICT DO NOTHING works.
    __table_args__ = (
        Index("idx_portal_users_tenant", "tenant_id"),
        Index("ix_portal_users_tenant_email_hash", "tenant_id", "email_hash", unique=True),
    )

    # customer_events uses SET NULL rather than cascade-delete so that a
    # merged user's history survives via subject_email_hash.
    customer_events: Mapped[list["CustomerEvent"]] = relationship(
        "CustomerEvent",
        back_populates="portal_user",
        order_by="CustomerEvent.created_at.desc()",
    )

    @property
    def email(self) -> str | None:
        return read_pii(self, "email")

    @email.setter
    def email(self, value: str | None) -> None:
        if value is None:
            self.email_encrypted = None
            self.email_hash = None
        else:
            self.email_encrypted = encrypt_pii(value)
            self.email_hash = hash_email(value)

    @property
    def phone(self) -> str | None:
        return read_pii(self, "phone")

    @phone.setter
    def phone(self, value: str | None) -> None:
        if value is None:
            self.phone_encrypted = None
            self.phone_hash = None
        else:
            self.phone_encrypted = encrypt_pii(value)
            self.phone_hash = hash_phone(value)


class PortalRefreshToken(Base):
    """Refresh tokens for portal user sessions."""

    __tablename__ = "portal_refresh_tokens"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    portal_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("portal_users.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    purpose: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (Index("idx_portal_refresh_tokens_user", "portal_user_id"),)
