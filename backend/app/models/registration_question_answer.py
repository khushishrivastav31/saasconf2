"""Registration question answer model for storing applicant responses to conference questions."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class RegistrationQuestionAnswer(Base):
    """Stores an applicant's answer to a registration question.

    Questions are defined in conference.settings["registration_questions"].
    Each answer links to a question by its UUID string key.
    """

    __tablename__ = "registration_question_answers"
    __table_args__ = (
        UniqueConstraint("conference_id", "applicant_id", "question_id", name="uq_reg_question_answer"),
        Index("ix_reg_question_answers_tenant", "tenant_id"),
        Index("ix_reg_question_answers_conf_applicant", "conference_id", "applicant_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    conference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False
    )
    applicant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cfp_applicants.id", ondelete="CASCADE"), nullable=False
    )
    question_id: Mapped[str] = mapped_column(String(36), nullable=False)
    answer_value: Mapped[str] = mapped_column(Text, nullable=False)
    answered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    tenant = relationship("Tenant")
    conference = relationship("Conference")
    applicant = relationship("CFPApplicant")
