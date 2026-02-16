"""Review criteria and scoring models for configurable paper review system."""

import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class ReviewScoreScale(Base):
    """Conference-scoped reusable score scale definition (e.g. '1-5 Likert', 'Yes/No')."""

    __tablename__ = "review_score_scales"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    conference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    scale_type: Mapped[str] = mapped_column(String(20), nullable=False)  # "numeric_range", "custom", "binary"
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    options: Mapped[list["ReviewScaleOption"]] = relationship(
        "ReviewScaleOption", back_populates="scale", cascade="all, delete-orphan",
        lazy="selectin", order_by="ReviewScaleOption.display_order"
    )

    __table_args__ = (
        Index("idx_review_score_scales_tenant", "tenant_id"),
        Index("idx_review_score_scales_conference", "conference_id"),
        Index("idx_review_score_scales_name", "tenant_id", "conference_id", "name", unique=True),
    )

    def __repr__(self) -> str:
        return f"<ReviewScoreScale {self.name}>"


class ReviewScaleOption(Base):
    """Individual option within a score scale (e.g. '1 - Poor', 'Unsure')."""

    __tablename__ = "review_scale_options"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    scale_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("review_score_scales.id", ondelete="CASCADE"), nullable=False
    )
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    numeric_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_unsure: Mapped[bool] = mapped_column(Boolean, default=False)
    display_order: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    scale: Mapped["ReviewScoreScale"] = relationship("ReviewScoreScale", back_populates="options")

    __table_args__ = (
        Index("idx_review_scale_options_scale", "scale_id"),
    )

    def __repr__(self) -> str:
        return f"<ReviewScaleOption {self.label}>"


class ReviewCriterion(Base):
    """Conference-scoped review criterion (thematic group of questions)."""

    __tablename__ = "review_criteria"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    conference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    display_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    questions: Mapped[list["ReviewQuestion"]] = relationship(
        "ReviewQuestion", back_populates="criterion", cascade="all, delete-orphan",
        lazy="selectin", order_by="ReviewQuestion.display_order"
    )

    __table_args__ = (
        Index("idx_review_criteria_tenant", "tenant_id"),
        Index("idx_review_criteria_conference", "conference_id"),
        Index("idx_review_criteria_title", "tenant_id", "conference_id", "title", unique=True),
    )

    def __repr__(self) -> str:
        return f"<ReviewCriterion {self.title}>"


class ReviewQuestion(Base):
    """Individual review question within a criterion."""

    __tablename__ = "review_questions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    criterion_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("review_criteria.id", ondelete="CASCADE"), nullable=False
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    conference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False
    )

    text: Mapped[str] = mapped_column(Text, nullable=False)
    help_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    question_type: Mapped[str] = mapped_column(String(20), nullable=False, default="scored")  # "scored" or "non_scored"
    score_scale_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("review_score_scales.id", ondelete="SET NULL"), nullable=True
    )
    weight: Mapped[float] = mapped_column(Float, default=1.0)
    comment_requirement: Mapped[str] = mapped_column(String(30), default="optional")  # "optional", "required", "required_if_low_score"
    low_score_threshold: Mapped[float | None] = mapped_column(Float, nullable=True)
    show_to_reviewers: Mapped[bool] = mapped_column(Boolean, default=True)
    count_in_score: Mapped[bool] = mapped_column(Boolean, default=True)
    display_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    criterion: Mapped["ReviewCriterion"] = relationship("ReviewCriterion", back_populates="questions")
    score_scale: Mapped["ReviewScoreScale | None"] = relationship("ReviewScoreScale", lazy="selectin")

    __table_args__ = (
        Index("idx_review_questions_criterion", "criterion_id"),
        Index("idx_review_questions_conference", "conference_id"),
    )

    def __repr__(self) -> str:
        return f"<ReviewQuestion {self.id}>"


class ReviewStatus(str, Enum):
    """Review submission status."""
    DRAFT = "draft"
    SUBMITTED = "submitted"


class PaperReview(Base):
    """A reviewer's complete review of a paper (one per assignment)."""

    __tablename__ = "paper_reviews"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    assignment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cfp_paper_assignments.id", ondelete="CASCADE"), nullable=False
    )
    paper_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cfp_papers.id", ondelete="CASCADE"), nullable=False
    )
    committee_member_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cfp_committee_members.id", ondelete="CASCADE"), nullable=False
    )

    status: Mapped[str] = mapped_column(String(20), nullable=False, default=ReviewStatus.DRAFT.value)
    total_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    speaker_feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    internal_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    must_have: Mapped[bool] = mapped_column(Boolean, default=False)
    config_snapshot: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    assignment: Mapped["CFPPaperAssignment"] = relationship("CFPPaperAssignment")
    paper: Mapped["CFPPaper"] = relationship("CFPPaper")
    committee_member: Mapped["CFPCommitteeMember"] = relationship("CFPCommitteeMember")
    answers: Mapped[list["ReviewAnswer"]] = relationship(
        "ReviewAnswer", back_populates="review", cascade="all, delete-orphan", lazy="selectin"
    )

    __table_args__ = (
        UniqueConstraint("assignment_id", name="uq_paper_review_assignment"),
        Index("idx_paper_reviews_tenant", "tenant_id"),
        Index("idx_paper_reviews_paper", "paper_id"),
        Index("idx_paper_reviews_assignment", "assignment_id"),
        Index("idx_paper_reviews_member", "committee_member_id"),
    )

    def __repr__(self) -> str:
        return f"<PaperReview {self.id} status={self.status}>"


class ReviewAnswer(Base):
    """Individual answer to a review question within a review."""

    __tablename__ = "review_answers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    review_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("paper_reviews.id", ondelete="CASCADE"), nullable=False
    )
    question_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("review_questions.id", ondelete="RESTRICT"), nullable=False
    )
    selected_option_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("review_scale_options.id", ondelete="SET NULL"), nullable=True
    )

    numeric_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_unsure: Mapped[bool] = mapped_column(Boolean, default=False)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Snapshot fields (populated on review submission for historical reproducibility)
    snapshot_weight: Mapped[float | None] = mapped_column(Float, nullable=True)
    snapshot_question_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    snapshot_option_label: Mapped[str | None] = mapped_column(String(100), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    review: Mapped["PaperReview"] = relationship("PaperReview", back_populates="answers")
    question: Mapped["ReviewQuestion"] = relationship("ReviewQuestion")
    selected_option: Mapped["ReviewScaleOption | None"] = relationship("ReviewScaleOption")

    __table_args__ = (
        UniqueConstraint("review_id", "question_id", name="uq_review_answer_question"),
        Index("idx_review_answers_review", "review_id"),
        Index("idx_review_answers_question", "question_id"),
    )

    def __repr__(self) -> str:
        return f"<ReviewAnswer {self.id}>"


class ReviewFormSettings(Base):
    """Conference-scoped settings for the review form (comment field toggles)."""

    __tablename__ = "review_form_settings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    conference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False
    )
    enable_speaker_feedback: Mapped[bool] = mapped_column(Boolean, default=True)
    enable_internal_comment: Mapped[bool] = mapped_column(Boolean, default=True)
    enable_must_have: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        UniqueConstraint("conference_id", name="uq_review_form_settings_conference"),
        Index("idx_review_form_settings_tenant", "tenant_id"),
        Index("idx_review_form_settings_conference", "conference_id"),
    )

    def __repr__(self) -> str:
        return f"<ReviewFormSettings conference={self.conference_id}>"


# Forward reference imports for type hints in relationships
from app.models.cfp import CFPCommitteeMember, CFPPaper, CFPPaperAssignment  # noqa: E402
