"""Offer document models with versioning — multiple documents per customer offer."""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, LargeBinary, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.customer_offer import CustomerOffer
    from app.models.user import User


class OfferDocument(Base):
    """
    A document attached to a customer offer.

    Many-to-one with CustomerOffer — each offer can have multiple documents.
    Holds the current version; historical versions stored in OfferDocumentVersion.
    """

    __tablename__ = "offer_documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    offer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("customer_offers.id", ondelete="CASCADE"), nullable=False
    )

    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    file_data: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    file_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    html_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_editable: Mapped[bool] = mapped_column(Boolean, default=True)

    version: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    last_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sent_to: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    offer: Mapped["CustomerOffer"] = relationship("CustomerOffer", back_populates="documents")
    versions: Mapped[list["OfferDocumentVersion"]] = relationship(
        "OfferDocumentVersion",
        back_populates="document",
        order_by="OfferDocumentVersion.version.desc()",
        cascade="all, delete-orphan",
    )
    creator: Mapped["User | None"] = relationship("User", foreign_keys=[created_by])

    __table_args__ = (
        Index("idx_offer_documents_tenant", "tenant_id"),
        Index("idx_offer_documents_offer", "offer_id"),
    )

    def __repr__(self) -> str:
        return f"<OfferDocument {self.filename} v{self.version}>"


class OfferDocumentVersion(Base):
    """Historical snapshot of an offer document version."""

    __tablename__ = "offer_document_versions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("offer_documents.id", ondelete="CASCADE"), nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)

    html_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_data: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    file_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    filename: Mapped[str] = mapped_column(String(500), nullable=False)

    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    document: Mapped["OfferDocument"] = relationship("OfferDocument", back_populates="versions")

    __table_args__ = (Index("idx_offer_doc_versions_document", "document_id", "version"),)

    def __repr__(self) -> str:
        return f"<OfferDocumentVersion {self.document_id} v{self.version}>"
