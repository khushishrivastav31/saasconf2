"""Paper form variant models for role-based paper submission forms."""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.form_schema import ConferencePaperFormSchema
    from app.models.settings import UserRole
    from app.models.tenant import Tenant


class PaperFormVariant(Base):
    """
    A role-specific variant of the base paper form schema.

    Each variant is linked to a UserRole and a ConferencePaperFormSchema,
    allowing admins to customize the paper submission form per role
    (e.g., Keynote speakers get different fields than Tutorial presenters).
    """

    __tablename__ = "paper_form_variants"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    schema_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conference_paper_form_schemas.id", ondelete="CASCADE"), nullable=False
    )
    user_role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user_roles.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    builtin_fields_config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant")
    schema: Mapped["ConferencePaperFormSchema"] = relationship("ConferencePaperFormSchema")
    user_role: Mapped["UserRole"] = relationship("UserRole")
    fields: Mapped[list["PaperFormVariantField"]] = relationship(
        "PaperFormVariantField",
        back_populates="variant",
        cascade="all, delete-orphan",
        order_by="PaperFormVariantField.display_order",
    )

    __table_args__ = (
        UniqueConstraint("schema_id", "user_role_id", name="uq_paper_form_variant_schema_role"),
        Index("idx_paper_form_variants_tenant", "tenant_id"),
        Index("idx_paper_form_variants_schema", "schema_id"),
        Index("idx_paper_form_variants_role", "user_role_id"),
    )

    def __repr__(self) -> str:
        return f"<PaperFormVariant {self.name} role={self.user_role_id}>"


class PaperFormVariantField(Base):
    """
    Custom field for a paper form variant.

    Same structure as PaperFormField but scoped to a variant instead of the base schema.
    """

    __tablename__ = "paper_form_variant_fields"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    variant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("paper_form_variants.id", ondelete="CASCADE"), nullable=False
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

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    variant: Mapped["PaperFormVariant"] = relationship("PaperFormVariant", back_populates="fields")

    __table_args__ = (
        UniqueConstraint("variant_id", "field_key", name="uq_paper_form_variant_field_key"),
        Index("idx_paper_form_variant_fields_tenant", "tenant_id"),
        Index("idx_paper_form_variant_fields_variant", "variant_id"),
    )

    def __repr__(self) -> str:
        return f"<PaperFormVariantField {self.field_key} ({self.field_type})>"
