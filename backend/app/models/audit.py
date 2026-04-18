"""Audit log model."""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.tenant import Tenant
    from app.models.user import User


class AuditLog(Base):
    """
    Audit log for tracking all sensitive operations.

    Actions follow the format: resource.action (e.g., 'user.login', 'tenant.create')
    """

    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="SET NULL"),
        nullable=True,
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    resource_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    resource_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    subject_email_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    details: Mapped[dict] = mapped_column(JSONB, default=dict)
    ip_address: Mapped[str | None] = mapped_column(INET, nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    tenant: Mapped["Tenant | None"] = relationship("Tenant")
    user: Mapped["User | None"] = relationship("User")

    # Indexes
    __table_args__ = (
        Index("idx_audit_tenant", "tenant_id"),
        Index("idx_audit_created", "created_at"),
        Index("idx_audit_action", "action"),
        Index("idx_audit_subject_email_hash", "subject_email_hash"),
    )

    def __repr__(self) -> str:
        return f"<AuditLog {self.action} by user={self.user_id}>"


# Common audit actions
class AuditAction:
    """Standard audit action constants."""

    # Authentication
    USER_LOGIN = "user.login"
    USER_LOGOUT = "user.logout"
    USER_LOGIN_FAILED = "user.login_failed"
    TOKEN_REFRESH = "token.refresh"

    # Tenant management
    TENANT_CREATE = "tenant.create"
    TENANT_UPDATE = "tenant.update"
    TENANT_DELETE = "tenant.delete"
    TENANT_ACTIVATE = "tenant.activate"
    TENANT_DEACTIVATE = "tenant.deactivate"

    # User management
    USER_CREATE = "user.create"
    USER_UPDATE = "user.update"
    USER_DELETE = "user.delete"
    USER_INVITE_SENT = "user.invite_sent"
    USER_PASSWORD_RESET_REQUESTED = "user.password_reset_requested"
    USER_PASSWORD_RESET_COMPLETED = "user.password_reset_completed"
    USER_PASSWORD_CHANGED = "user.password_changed"

    # MFA
    MFA_ENABLED = "user.mfa_enabled"
    MFA_DISABLED = "user.mfa_disabled"

    # Module management
    MODULE_CREATE = "module.create"
    MODULE_UPDATE = "module.update"
    MODULE_ASSIGN = "module.assign"
    MODULE_REVOKE = "module.revoke"

    # Alumni management
    ALUMNI_CREATE = "alumni.create"
    ALUMNI_UPDATE = "alumni.update"
    ALUMNI_IMPORT = "alumni.import"
    ALUMNI_DELETE = "alumni.delete"

    # Deadline management
    DEADLINE_CREATE = "deadline.create"
    DEADLINE_UPDATE = "deadline.update"
    DEADLINE_DELETE = "deadline.delete"

    # Conference management
    CONFERENCE_CREATE = "conference.create"
    CONFERENCE_UPDATE = "conference.update"
    CONFERENCE_DELETE = "conference.delete"

    # Conference associations
    CONFERENCE_LINK_VOLUNTEER = "conference.link_volunteer"
    CONFERENCE_UNLINK_VOLUNTEER = "conference.unlink_volunteer"
    CONFERENCE_LINK_LOCATION = "conference.link_location"
    CONFERENCE_UNLINK_LOCATION = "conference.unlink_location"
    CONFERENCE_LINK_CFP = "conference.link_cfp"
    CONFERENCE_UNLINK_CFP = "conference.unlink_cfp"

    # Settings
    SETTINGS_UPDATE = "settings.update"

    # PII subject-detail reads (GDPR Art. 15 audit trail)
    APPLICANT_VIEW = "applicant.view"
    REGISTRATION_VIEW = "registration.view"
    INVOICE_VIEW = "invoice.view"
    TRAINING_ATTENDEE_VIEW = "training_attendee.view"

    # Privacy requests (GDPR Art. 15 / Art. 17)
    PRIVACY_REQUEST_CREATE = "privacy_request.create"
    PRIVACY_REQUEST_APPROVE = "privacy_request.approve"
    PRIVACY_REQUEST_REJECT = "privacy_request.reject"
    PRIVACY_REQUEST_EXECUTE = "privacy_request.execute"
    PRIVACY_REQUEST_EXPORT_DOWNLOAD = "privacy_request.export_download"

    # Platform currency management
    PLATFORM_CURRENCY_CREATE = "platform_currency.create"
    PLATFORM_CURRENCY_UPDATE = "platform_currency.update"
    PLATFORM_CURRENCY_DELETE = "platform_currency.delete"
