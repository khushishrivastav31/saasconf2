"""Portal user history — chronological admin-action log.

Written by the tenant-level ``/api/v1/portal-users/*`` admin endpoints for
every action an admin takes against a portal user (toggle access, resend
invite, reset password, impersonate, merge). Lives alongside the global
``audit_logs`` table but is scoped to a single portal user so the user
detail panel can render a timeline without a JSON-filter query.

Event types (authoritative list — add here when adding new actions):
* ``portal_activated``
* ``portal_deactivated``
* ``invite_resent``
* ``password_reset_sent``
* ``impersonated``
* ``merged_from``   — written on the source (deleted) user
* ``merged_into``   — written on the surviving target user

``metadata`` is a free-form JSONB for per-event context (e.g. the source
portal-user id on a merge, the count of moved records, the admin-user
name, etc.). Unlike ``audit_logs`` this table is intentionally
portal-user-scoped so the detail panel can just query
``portal_user_id == user.id`` and sort.
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.portal_user import PortalUser


class PortalUserHistory(Base):
    __tablename__ = "portal_user_history"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    portal_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("portal_users.id", ondelete="CASCADE"),
        nullable=False,
    )
    event_type: Mapped[str] = mapped_column(String(40), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    portal_user: Mapped["PortalUser"] = relationship("PortalUser", back_populates="history")

    def __repr__(self) -> str:
        return f"<PortalUserHistory {self.event_type} portal_user={self.portal_user_id}>"
