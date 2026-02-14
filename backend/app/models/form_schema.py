"""Paper form schema models for custom paper submission forms."""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.conference import Conference
    from app.models.tenant import Tenant


class ConferencePaperFormSchema(Base):
    """
    Paper form schema for a conference.

    Stores the form configuration including:
    - builtin_fields_config: visibility/required settings for existing paper fields
    - version: incremented when schema changes after papers exist

    Each conference has one schema (unique constraint on conference_id).
    """

    __tablename__ = "conference_paper_form_schemas"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    conference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conferences.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    builtin_fields_config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant")
    conference: Mapped["Conference"] = relationship("Conference")
    fields: Mapped[list["PaperFormField"]] = relationship(
        "PaperFormField",
        back_populates="schema",
        cascade="all, delete-orphan",
        order_by="PaperFormField.display_order",
    )

    __table_args__ = (
        Index("idx_paper_form_schemas_tenant", "tenant_id"),
        Index("idx_paper_form_schemas_conference", "conference_id"),
    )

    def __repr__(self) -> str:
        return f"<ConferencePaperFormSchema conference_id={self.conference_id} version={self.version}>"


class PaperFormField(Base):
    """
    Custom field definition for a paper form schema.

    Field types:
    - text: Single line text input
    - textarea: Multi-line text input
    - richtext: Rich text editor (with formatting)
    - checkbox: Single checkbox (boolean)
    - checkbox_group: Multiple checkboxes
    - dropdown: Select dropdown
    - file_upload: File upload field

    Supports:
    - validation_rules: min_length, max_length, allowed_file_types, etc.
    - options: For dropdown/checkbox_group - list of {value, label}
    """

    __tablename__ = "paper_form_fields"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    schema_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conference_paper_form_schemas.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Field identification
    field_key: Mapped[str] = mapped_column(String(100), nullable=False)
    field_type: Mapped[str] = mapped_column(String(50), nullable=False)

    # Display configuration
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    placeholder: Mapped[str | None] = mapped_column(String(500), nullable=True)
    help_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_visible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Validation
    is_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    validation_rules: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Options (for dropdown, checkbox_group)
    options: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    schema: Mapped["ConferencePaperFormSchema"] = relationship(
        "ConferencePaperFormSchema", back_populates="fields"
    )

    __table_args__ = (
        Index("idx_paper_form_fields_tenant", "tenant_id"),
        Index("idx_paper_form_fields_schema", "schema_id"),
        Index("uq_paper_form_field_key", "schema_id", "field_key", unique=True),
    )

    def __repr__(self) -> str:
        return f"<PaperFormField {self.field_key} ({self.field_type})>"
