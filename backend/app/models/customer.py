"""Customer model for B2B training engagements."""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.security.pii_crypto import encrypt_pii, hash_email, hash_phone, hash_vat, read_pii
from app.db.base import Base


class Customer(Base):
    """A customer (company/organization) for inhouse trainings."""

    __tablename__ = "customers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    contact_person: Mapped[str | None] = mapped_column(String(200), nullable=True)
    email_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    email_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    phone_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    phone_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    website: Mapped[str | None] = mapped_column(String(255), nullable=True)
    address_line1: Mapped[str | None] = mapped_column(String(200), nullable=True)
    address_line2: Mapped[str | None] = mapped_column(String(200), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    state: Mapped[str | None] = mapped_column(String(100), nullable=True)
    postal_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    country: Mapped[str | None] = mapped_column(String(2), nullable=True)
    vat_number_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    vat_number_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    contact_persons: Mapped[list] = mapped_column(JSONB, default=list, server_default="[]")
    price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    currency: Mapped[str | None] = mapped_column(String(3), nullable=True)
    comments: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        UniqueConstraint("tenant_id", "name", name="uq_customer_tenant_name"),
        Index("idx_customers_tenant", "tenant_id"),
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

    @property
    def vat_number(self) -> str | None:
        return read_pii(self, "vat_number")

    @vat_number.setter
    def vat_number(self, value: str | None) -> None:
        if value is None:
            self.vat_number_encrypted = None
            self.vat_number_hash = None
        else:
            self.vat_number_encrypted = encrypt_pii(value)
            self.vat_number_hash = hash_vat(value)

    def __repr__(self) -> str:
        return f"<Customer {self.name}>"
