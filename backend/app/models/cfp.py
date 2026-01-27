"""Call for Papers model."""

import uuid
from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import String, Boolean, DateTime, ForeignKey, func, Text, Index, Integer
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.tenant import Tenant
    from app.models.conference import Conference


class CFPStatus(str, Enum):
    """Call for Papers status enum."""

    DRAFT = "draft"
    OPEN = "open"
    CLOSED = "closed"
    REVIEW = "review"
    COMPLETED = "completed"


class SubmissionStatus(str, Enum):
    """Submission status enum."""

    SUBMITTED = "submitted"
    UNDER_REVIEW = "under_review"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    WAITLISTED = "waitlisted"
    WITHDRAWN = "withdrawn"


class CallForPapers(Base):
    """
    Call for Papers model.

    Represents a CFP campaign for collecting session proposals.
    """

    __tablename__ = "call_for_papers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )

    # Basic Information
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=CFPStatus.DRAFT.value
    )

    # Dates
    open_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    close_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Configuration
    max_submissions_per_speaker: Mapped[int | None] = mapped_column(Integer, nullable=True)
    require_abstract: Mapped[bool] = mapped_column(Boolean, default=True)
    require_bio: Mapped[bool] = mapped_column(Boolean, default=True)
    allowed_formats: Mapped[list] = mapped_column(JSONB, default=list)  # ["talk", "workshop", "panel"]
    tracks: Mapped[list] = mapped_column(JSONB, default=list)  # Available tracks/categories
    custom_fields: Mapped[dict] = mapped_column(JSONB, default=dict)  # Custom form fields

    # Settings
    settings: Mapped[dict] = mapped_column(JSONB, default=dict)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant")
    submissions: Mapped[list["Submission"]] = relationship(
        "Submission", back_populates="cfp", cascade="all, delete-orphan"
    )
    conferences: Mapped[list["Conference"]] = relationship(
        "Conference", secondary="conference_cfps", viewonly=True,
    )

    # Indexes
    __table_args__ = (
        Index("idx_cfp_tenant", "tenant_id"),
        Index("idx_cfp_status", "tenant_id", "status"),
    )

    def __repr__(self) -> str:
        return f"<CallForPapers {self.title}>"


class Submission(Base):
    """
    Submission model.

    Represents a paper/session submission to a CFP.
    """

    __tablename__ = "submissions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    cfp_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("call_for_papers.id", ondelete="CASCADE"), nullable=False
    )

    # Speaker Information (will link to Speaker model later)
    speaker_email: Mapped[str] = mapped_column(String(255), nullable=False)
    speaker_name: Mapped[str] = mapped_column(String(255), nullable=False)
    speaker_bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    speaker_company: Mapped[str | None] = mapped_column(String(255), nullable=True)
    speaker_title: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Submission Content
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    abstract: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    format: Mapped[str | None] = mapped_column(String(50), nullable=True)  # talk, workshop, panel
    track: Mapped[str | None] = mapped_column(String(100), nullable=True)
    level: Mapped[str | None] = mapped_column(String(50), nullable=True)  # beginner, intermediate, advanced
    duration: Mapped[int | None] = mapped_column(Integer, nullable=True)  # in minutes
    language: Mapped[str | None] = mapped_column(String(10), nullable=True)
    tags: Mapped[list] = mapped_column(JSONB, default=list)
    custom_answers: Mapped[dict] = mapped_column(JSONB, default=dict)  # Answers to custom fields

    # Status
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=SubmissionStatus.SUBMITTED.value
    )

    # Review
    review_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    review_score: Mapped[float | None] = mapped_column(nullable=True)

    # Timestamps
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant")
    cfp: Mapped["CallForPapers"] = relationship("CallForPapers", back_populates="submissions")

    # Indexes
    __table_args__ = (
        Index("idx_submission_tenant", "tenant_id"),
        Index("idx_submission_cfp", "cfp_id"),
        Index("idx_submission_status", "tenant_id", "status"),
        Index("idx_submission_speaker", "tenant_id", "speaker_email"),
    )

    def __repr__(self) -> str:
        return f"<Submission {self.title}>"
