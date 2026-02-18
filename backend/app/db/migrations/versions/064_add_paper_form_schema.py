"""Add paper form schema tables.

Paper form schemas allow conference admins to design custom paper submission forms.
Includes built-in field configuration and custom field definitions.

Revision ID: 064_add_paper_form_schema
Revises: 063_booking_packages
Create Date: 2026-02-11

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers, used by Alembic.
revision: str = "064_add_paper_form_schema"
down_revision: str | None = "063_booking_packages"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create paper form schema tables and add custom_field_answers to cfp_papers."""
    # Create conference_paper_form_schemas table
    op.create_table(
        "conference_paper_form_schemas",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "conference_id",
            UUID(as_uuid=True),
            sa.ForeignKey("conferences.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("builtin_fields_config", JSONB(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    # Create indexes for conference_paper_form_schemas
    op.create_index("idx_paper_form_schemas_tenant", "conference_paper_form_schemas", ["tenant_id"])
    op.create_index("idx_paper_form_schemas_conference", "conference_paper_form_schemas", ["conference_id"])

    # Create paper_form_fields table
    op.create_table(
        "paper_form_fields",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "schema_id",
            UUID(as_uuid=True),
            sa.ForeignKey("conference_paper_form_schemas.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("field_key", sa.String(100), nullable=False),
        sa.Column("field_type", sa.String(50), nullable=False),
        sa.Column("label", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("placeholder", sa.String(500), nullable=True),
        sa.Column("help_text", sa.Text(), nullable=True),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_visible", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("is_required", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("validation_rules", JSONB(), nullable=True, server_default="{}"),
        sa.Column("options", JSONB(), nullable=True, server_default="[]"),
        sa.Column("conditional_visibility", JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    # Create indexes for paper_form_fields
    op.create_index("idx_paper_form_fields_tenant", "paper_form_fields", ["tenant_id"])
    op.create_index("idx_paper_form_fields_schema", "paper_form_fields", ["schema_id"])
    op.create_index(
        "uq_paper_form_field_key",
        "paper_form_fields",
        ["schema_id", "field_key"],
        unique=True,
    )

    # Add custom_field_answers column to cfp_papers
    op.add_column(
        "cfp_papers",
        sa.Column("custom_field_answers", JSONB(), nullable=True, server_default="{}"),
    )


def downgrade() -> None:
    """Drop paper form schema tables and remove custom_field_answers from cfp_papers."""
    op.drop_column("cfp_papers", "custom_field_answers")
    op.drop_table("paper_form_fields")
    op.drop_table("conference_paper_form_schemas")
