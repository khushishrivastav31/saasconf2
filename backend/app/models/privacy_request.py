"""Privacy request model — tracks GDPR Art. 15 (export) + Art. 17 (erasure) requests.

Single source of truth for data-subject requests. Subject emails are held
encrypted (Fernet, via ``pii_crypto.encrypt_pii``) as a JSON array so the
privacy-tooling table itself doesn't leak identifiers for a subject who
later asks to be erased. The ``subject_email_hashes`` column stores the
matching hashes (plain JSONB) so lookups/indexing stay cheap.
"""

import json
import uuid
from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.security.pii_crypto import decrypt_pii, encrypt_pii, hash_email
from app.db.base import Base

if TYPE_CHECKING:
    from app.models.portal_user import PortalUser
    from app.models.tenant import Tenant
    from app.models.user import User


class PrivacyRequestType(StrEnum):
    """Kind of privacy request."""

    EXPORT = "export"
    ERASURE = "erasure"


class PrivacyRequestStatus(StrEnum):
    """Request lifecycle."""

    PENDING_REVIEW = "pending_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXECUTING = "executing"
    COMPLETED = "completed"
    FAILED = "failed"


class PrivacyRequest(Base):
    """A GDPR Art. 15 / 17 request scoped to a single tenant."""

    __tablename__ = "privacy_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    request_type: Mapped[str] = mapped_column(String(20), nullable=False)
    subject_emails_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    subject_email_hashes: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)

    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default=PrivacyRequestStatus.PENDING_REVIEW.value,
        server_default=PrivacyRequestStatus.PENDING_REVIEW.value,
    )

    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    portal_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("portal_users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    completion_artifact_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    execution_manifest: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant")
    creator: Mapped["User | None"] = relationship("User", foreign_keys=[created_by])
    reviewer: Mapped["User | None"] = relationship("User", foreign_keys=[reviewed_by])
    portal_user: Mapped["PortalUser | None"] = relationship("PortalUser")

    __table_args__ = (
        Index("idx_privacy_requests_tenant", "tenant_id"),
        Index("idx_privacy_requests_status", "tenant_id", "status"),
        Index("idx_privacy_requests_created", "created_at"),
    )

    # ------------------------------------------------------------------
    # Subject-emails helpers: keep plaintext out of Mapped columns.
    # ------------------------------------------------------------------

    @property
    def subject_emails(self) -> list[str]:
        """Decrypt + deserialize the stored subject emails."""
        if not self.subject_emails_encrypted:
            return []
        raw = decrypt_pii(self.subject_emails_encrypted)
        if raw is None:
            return []
        try:
            value = json.loads(raw)
        except json.JSONDecodeError:
            return []
        return [str(v) for v in value] if isinstance(value, list) else []

    @subject_emails.setter
    def subject_emails(self, value: list[str]) -> None:
        normalized = [e.strip().lower() for e in value if e and e.strip()]
        self.subject_emails_encrypted = encrypt_pii(json.dumps(normalized)) or ""
        self.subject_email_hashes = [hash_email(e) for e in normalized]

    def __repr__(self) -> str:
        return f"<PrivacyRequest {self.request_type} status={self.status} tenant={self.tenant_id}>"
