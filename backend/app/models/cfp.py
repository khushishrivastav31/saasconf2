"""Call for Papers model: CFPs, submissions, topics, and committee members."""

import uuid
from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.cfp_applicants import CFPApplicant
    from app.models.cfp_papers import CFPPaperAssignment
    from app.models.conference import Conference
    from app.models.tenant import Tenant


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
    notification_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    program_announcement_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Rich text content
    code_of_conduct: Mapped[str | None] = mapped_column(Text, nullable=True)
    incentives_conditions: Mapped[str | None] = mapped_column(Text, nullable=True)
    tips_for_submission: Mapped[str | None] = mapped_column(Text, nullable=True)
    guidelines_for_submissions: Mapped[str | None] = mapped_column(Text, nullable=True)
    faqs: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Configuration
    max_submissions_per_speaker: Mapped[int | None] = mapped_column(Integer, nullable=True)
    required_speaker_fields: Mapped[list] = mapped_column(JSONB, default=list, server_default="[]")
    required_paper_fields: Mapped[list] = mapped_column(JSONB, default=list, server_default="[]")
    allowed_formats: Mapped[list] = mapped_column(JSONB, default=list)  # ["talk", "workshop", "panel"]
    tracks: Mapped[list] = mapped_column(JSONB, default=list)  # Available tracks/categories
    custom_fields: Mapped[dict] = mapped_column(JSONB, default=dict)  # Custom form fields

    # Review settings
    is_anonymous_review: Mapped[bool] = mapped_column(Boolean, default=False)
    reviewers_per_paper: Mapped[int] = mapped_column(Integer, default=3)

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
    speaker_first_name: Mapped[str] = mapped_column(String(255), nullable=False)
    speaker_last_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
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


cfp_committee_member_topics = Table(
    "cfp_committee_member_topics",
    Base.metadata,
    Column("committee_member_id", UUID(as_uuid=True), ForeignKey("cfp_committee_members.id", ondelete="CASCADE"), primary_key=True),
    Column("topic_id", UUID(as_uuid=True), ForeignKey("cfp_topics.id", ondelete="CASCADE"), primary_key=True),
)


class CFPTopic(Base):
    """CFP Topic model. Tenant-level list of topics/tracks."""

    __tablename__ = "cfp_topics"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant")

    # Indexes
    __table_args__ = (
        Index("idx_cfp_topics_tenant", "tenant_id"),
    )

    def __repr__(self) -> str:
        return f"<CFPTopic {self.name}>"


class CFPCommitteeMember(Base):
    """CFP Program Committee Member model. Extension of CFPApplicant with committee-specific data."""

    __tablename__ = "cfp_committee_members"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    conference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False
    )
    applicant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cfp_applicants.id", ondelete="RESTRICT"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(50), nullable=False, default="reviewer")
    expertise_areas: Mapped[list] = mapped_column(JSONB, default=list, server_default="[]")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant")
    conference: Mapped["Conference"] = relationship("Conference")
    applicant: Mapped["CFPApplicant"] = relationship("CFPApplicant", lazy="selectin")
    topics: Mapped[list["CFPTopic"]] = relationship(
        "CFPTopic", secondary=cfp_committee_member_topics, lazy="selectin"
    )
    assignments: Mapped[list["CFPPaperAssignment"]] = relationship(
        "CFPPaperAssignment", back_populates="committee_member", cascade="all, delete-orphan"
    )

    # Indexes and constraints
    __table_args__ = (
        Index("idx_cfp_committee_members_tenant", "tenant_id"),
        Index("idx_cfp_committee_members_applicant", "applicant_id"),
        Index("idx_cfp_committee_members_conference", "conference_id"),
        UniqueConstraint("tenant_id", "conference_id", "applicant_id", name="uq_committee_member_conference_applicant"),
    )

    def __repr__(self) -> str:
        return f"<CFPCommitteeMember {self.id} role={self.role}>"


# Re-exports for backward compatibility
from app.models.cfp_applicants import CFPApplicant  # noqa: E402, F401
from app.models.cfp_papers import (  # noqa: E402, F401
    CFPPaper,
    CFPPaperAssignment,
    CFPPaperComment,
    CFPPaperCospeaker,
    CospeakerInvitationStatus,
    PaperLevel,
    PaperStatus,
    cfp_paper_topics,
)
