"""Call for Papers model."""

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


class CFPApplicant(Base):
    """CFP Applicant model. Tenant-level list of paper applicants."""

    __tablename__ = "cfp_applicants"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
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
    email_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

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
        Index("idx_cfp_applicants_tenant", "tenant_id"),
    )

    def __repr__(self) -> str:
        return f"<CFPApplicant {self.first_name} {self.last_name}>"


class PaperStatus(str, Enum):
    """Paper submission status enum."""

    DRAFT = "draft"
    SUBMITTED = "submitted"
    IN_EVALUATION = "in_evaluation"
    EVALUATED = "evaluated"
    FINAL_CONSIDERATION = "final_consideration"
    REJECTED = "rejected"
    ACCEPTED = "accepted"


class PaperLevel(str, Enum):
    """Paper difficulty level enum."""

    BEGINNER = "beginner"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"
    ALL_LEVELS = "all_levels"


class CospeakerInvitationStatus(str, Enum):
    """Co-speaker invitation status enum."""

    PENDING = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"


# Association table for paper topics
cfp_paper_topics = Table(
    "cfp_paper_topics",
    Base.metadata,
    Column("paper_id", UUID(as_uuid=True), ForeignKey("cfp_papers.id", ondelete="CASCADE"), primary_key=True),
    Column("topic_id", UUID(as_uuid=True), ForeignKey("cfp_topics.id", ondelete="CASCADE"), primary_key=True),
)


class CFPPaperCospeaker(Base):
    """Association model for paper co-speakers with invitation tracking."""

    __tablename__ = "cfp_paper_cospeakers"

    paper_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cfp_papers.id", ondelete="CASCADE"), primary_key=True
    )
    applicant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cfp_applicants.id", ondelete="CASCADE"), primary_key=True
    )
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    invitation_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=CospeakerInvitationStatus.PENDING.value,
        server_default="pending"
    )
    invited_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    responded_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    paper: Mapped["CFPPaper"] = relationship("CFPPaper", back_populates="cospeaker_associations")
    applicant: Mapped["CFPApplicant"] = relationship("CFPApplicant")

    def __repr__(self) -> str:
        return f"<CFPPaperCospeaker paper={self.paper_id} applicant={self.applicant_id} status={self.invitation_status}>"


class CFPPaper(Base):
    """CFP Paper model. Represents a session proposal submission."""

    __tablename__ = "cfp_papers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    cfp_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("call_for_papers.id", ondelete="CASCADE"), nullable=False
    )
    main_speaker_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cfp_applicants.id", ondelete="RESTRICT"), nullable=False
    )
    session_type_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("session_types.id", ondelete="SET NULL"), nullable=True
    )

    # Content
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    abstract_short: Mapped[str | None] = mapped_column(Text, nullable=True)
    abstract_long: Mapped[str | None] = mapped_column(Text, nullable=True)
    level: Mapped[str | None] = mapped_column(String(20), nullable=True)
    learning_objectives: Mapped[str | None] = mapped_column(Text, nullable=True)
    importance: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Status
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default=PaperStatus.DRAFT.value
    )

    # Timestamps
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant")
    cfp: Mapped["CallForPapers"] = relationship("CallForPapers")
    main_speaker: Mapped["CFPApplicant"] = relationship("CFPApplicant", foreign_keys=[main_speaker_id])
    cospeaker_associations: Mapped[list["CFPPaperCospeaker"]] = relationship(
        "CFPPaperCospeaker", back_populates="paper", cascade="all, delete-orphan", lazy="selectin"
    )
    topics: Mapped[list["CFPTopic"]] = relationship(
        "CFPTopic", secondary=cfp_paper_topics, lazy="selectin"
    )
    comments: Mapped[list["CFPPaperComment"]] = relationship(
        "CFPPaperComment", back_populates="paper", cascade="all, delete-orphan", lazy="selectin"
    )
    assignments: Mapped[list["CFPPaperAssignment"]] = relationship(
        "CFPPaperAssignment", back_populates="paper", cascade="all, delete-orphan"
    )

    # Indexes
    __table_args__ = (
        Index("idx_cfp_papers_tenant", "tenant_id"),
        Index("idx_cfp_papers_cfp", "cfp_id"),
        Index("idx_cfp_papers_main_speaker", "main_speaker_id"),
        Index("idx_cfp_papers_status", "tenant_id", "cfp_id", "status"),
    )

    def __repr__(self) -> str:
        return f"<CFPPaper {self.title}>"


class CFPPaperComment(Base):
    """CFP Paper Comment model. Read-only comments from program committee."""

    __tablename__ = "cfp_paper_comments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    paper_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cfp_papers.id", ondelete="CASCADE"), nullable=False
    )
    committee_member_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cfp_committee_members.id", ondelete="SET NULL"), nullable=True
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    paper: Mapped["CFPPaper"] = relationship("CFPPaper", back_populates="comments")
    committee_member: Mapped["CFPCommitteeMember"] = relationship("CFPCommitteeMember")

    # Indexes
    __table_args__ = (
        Index("idx_cfp_paper_comments_paper", "paper_id"),
    )

    def __repr__(self) -> str:
        return f"<CFPPaperComment {self.id}>"


class CFPPaperAssignment(Base):
    """Assignment of a paper to a program committee member for review."""

    __tablename__ = "cfp_paper_assignments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    paper_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cfp_papers.id", ondelete="CASCADE"), nullable=False
    )
    committee_member_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cfp_committee_members.id", ondelete="CASCADE"), nullable=False
    )
    is_anonymous: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant")
    paper: Mapped["CFPPaper"] = relationship("CFPPaper", back_populates="assignments")
    committee_member: Mapped["CFPCommitteeMember"] = relationship(
        "CFPCommitteeMember", back_populates="assignments"
    )

    # Indexes and constraints
    __table_args__ = (
        UniqueConstraint("paper_id", "committee_member_id", name="uq_paper_assignment_paper_member"),
        Index("idx_paper_assignments_tenant", "tenant_id"),
        Index("idx_paper_assignments_paper", "paper_id"),
        Index("idx_paper_assignments_member", "committee_member_id"),
    )

    def __repr__(self) -> str:
        return f"<CFPPaperAssignment paper={self.paper_id} member={self.committee_member_id}>"
