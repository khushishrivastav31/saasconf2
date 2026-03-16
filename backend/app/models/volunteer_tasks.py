"""Volunteer task assignment models."""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, Integer, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.cfp_applicants import CFPApplicant
    from app.models.program import ProgramSession
    from app.models.settings import VolunteerRole


class SessionVolunteerTask(Base):
    """Links a program session to a volunteer task with a required volunteer count."""

    __tablename__ = "session_volunteer_tasks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    conference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("program_sessions.id", ondelete="CASCADE"), nullable=False
    )
    volunteer_task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("volunteer_roles.id", ondelete="CASCADE"), nullable=False
    )
    required_count: Mapped[int] = mapped_column(Integer, server_default="1", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    session: Mapped["ProgramSession"] = relationship("ProgramSession", lazy="selectin")
    volunteer_task: Mapped["VolunteerRole"] = relationship("VolunteerRole", lazy="selectin")
    assignments: Mapped[list["VolunteerAssignment"]] = relationship(
        "VolunteerAssignment", back_populates="session_volunteer_task", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("session_id", "volunteer_task_id", name="uq_session_volunteer_task"),
        Index("idx_svt_conference", "conference_id"),
        Index("idx_svt_session", "session_id"),
        Index("idx_svt_task", "volunteer_task_id"),
    )


class VolunteerAssignment(Base):
    """Assigns a volunteer to a specific session-task combination."""

    __tablename__ = "volunteer_assignments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    conference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False
    )
    session_volunteer_task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("session_volunteer_tasks.id", ondelete="CASCADE"), nullable=False
    )
    applicant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cfp_applicants.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    session_volunteer_task: Mapped["SessionVolunteerTask"] = relationship(
        "SessionVolunteerTask", back_populates="assignments"
    )
    applicant: Mapped["CFPApplicant"] = relationship("CFPApplicant", lazy="selectin")

    __table_args__ = (
        UniqueConstraint("session_volunteer_task_id", "applicant_id", name="uq_volunteer_assignment"),
        Index("idx_va_conference", "conference_id"),
        Index("idx_va_applicant", "applicant_id"),
        Index("idx_va_svt", "session_volunteer_task_id"),
    )
