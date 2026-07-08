"""CFP paper models: papers, comments, assignments, cospeakers, and related enums."""

import uuid
from datetime import datetime
from enum import StrEnum
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
    from app.models.cfp import CallForPapers, CFPCommitteeMember, CFPTopic
    from app.models.cfp_applicants import CFPApplicant
    from app.models.paper_form_variant import PaperFormVariant
    from app.models.tenant import Tenant


class PaperStatus(StrEnum):
    """Paper submission status enum."""

    DRAFT = "draft"
    SUBMITTED = "submitted"
    IN_EVALUATION = "in_evaluation"
    EVALUATED = "evaluated"
    FINAL_CONSIDERATION = "final_consideration"
    REJECTED = "rejected"
    ACCEPTED = "accepted"


class PaperLevel(StrEnum):
    """Paper difficulty level enum."""

    BEGINNER = "beginner"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"
    ALL_LEVELS = "all_levels"


class CospeakerInvitationStatus(StrEnum):
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
        String(20), nullable=False, default=CospeakerInvitationStatus.PENDING.value, server_default="pending"
    )
    invited_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    paper: Mapped["CFPPaper"] = relationship("CFPPaper", back_populates="cospeaker_associations")
    applicant: Mapped["CFPApplicant"] = relationship("CFPApplicant")

    def __repr__(self) -> str:
        return (
            f"<CFPPaperCospeaker paper={self.paper_id} applicant={self.applicant_id} status={self.invitation_status}>"
        )


class CFPPaper(Base):
    """CFP Paper model. Represents a session proposal submission."""

    __tablename__ = "cfp_papers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
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
    form_variant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("paper_form_variants.id", ondelete="SET NULL"), nullable=True
    )

    # Content
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    abstract_short: Mapped[str | None] = mapped_column(Text, nullable=True)
    abstract_long: Mapped[str | None] = mapped_column(Text, nullable=True)
    level: Mapped[str | None] = mapped_column(String(50), nullable=True)
    learning_objectives: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Custom field answers (from form builder)
    custom_field_answers: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Separately bookable (inherited from session type)
    separately_bookable: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

    # Status
    status: Mapped[str] = mapped_column(String(30), nullable=False, default=PaperStatus.DRAFT.value)

    # Timestamps
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notification_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant")
    cfp: Mapped["CallForPapers"] = relationship("CallForPapers")
    main_speaker: Mapped["CFPApplicant"] = relationship("CFPApplicant", foreign_keys=[main_speaker_id])
    form_variant: Mapped["PaperFormVariant | None"] = relationship("PaperFormVariant")
    cospeaker_associations: Mapped[list["CFPPaperCospeaker"]] = relationship(
        "CFPPaperCospeaker", back_populates="paper", cascade="all, delete-orphan", lazy="selectin"
    )
    topics: Mapped[list["CFPTopic"]] = relationship("CFPTopic", secondary=cfp_paper_topics, lazy="selectin")
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
        Index("idx_cfp_papers_form_variant", "form_variant_id"),
    )

    def __repr__(self) -> str:
        return f"<CFPPaper {self.title}>"


class CFPPaperComment(Base):
    """CFP Paper Comment model. Read-only comments from program committee."""

    __tablename__ = "cfp_paper_comments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
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
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    paper: Mapped["CFPPaper"] = relationship("CFPPaper", back_populates="comments")
    committee_member: Mapped["CFPCommitteeMember"] = relationship("CFPCommitteeMember")

    # Indexes
    __table_args__ = (Index("idx_cfp_paper_comments_paper", "paper_id"),)

    def __repr__(self) -> str:
        return f"<CFPPaperComment {self.id}>"


class CFPPaperAssignment(Base):
    """Assignment of a paper to a program committee member for review."""

    __tablename__ = "cfp_paper_assignments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
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
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant")
    paper: Mapped["CFPPaper"] = relationship("CFPPaper", back_populates="assignments")
    committee_member: Mapped["CFPCommitteeMember"] = relationship("CFPCommitteeMember", back_populates="assignments")

    # Indexes and constraints
    __table_args__ = (
        UniqueConstraint("paper_id", "committee_member_id", name="uq_paper_assignment_paper_member"),
        Index("idx_paper_assignments_tenant", "tenant_id"),
        Index("idx_paper_assignments_paper", "paper_id"),
        Index("idx_paper_assignments_member", "committee_member_id"),
    )

    def __repr__(self) -> str:
        return f"<CFPPaperAssignment paper={self.paper_id} member={self.committee_member_id}>"
