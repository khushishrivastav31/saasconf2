"""Add paper form variants for role-based paper forms.

Revision ID: 140
Revises: 139
Create Date: 2026-03-16

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "140"
down_revision: Union[str, None] = "139"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- paper_form_variants ---
    op.create_table(
        "paper_form_variants",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "schema_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("conference_paper_form_schemas.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_role_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("user_roles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("builtin_fields_config", sa.dialects.postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_paper_form_variants_tenant", "paper_form_variants", ["tenant_id"])
    op.create_index("idx_paper_form_variants_schema", "paper_form_variants", ["schema_id"])
    op.create_index("idx_paper_form_variants_role", "paper_form_variants", ["user_role_id"])
    op.create_unique_constraint(
        "uq_paper_form_variant_schema_role",
        "paper_form_variants",
        ["schema_id", "user_role_id"],
    )

    # --- paper_form_variant_fields ---
    op.create_table(
        "paper_form_variant_fields",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "variant_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("paper_form_variants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("field_key", sa.String(100), nullable=False),
        sa.Column("field_type", sa.String(50), nullable=False),
        sa.Column("label", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("placeholder", sa.String(500), nullable=True),
        sa.Column("help_text", sa.Text, nullable=True),
        sa.Column("display_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("is_visible", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("is_required", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("validation_rules", sa.dialects.postgresql.JSONB, nullable=True),
        sa.Column("options", sa.dialects.postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_paper_form_variant_fields_tenant", "paper_form_variant_fields", ["tenant_id"])
    op.create_index("idx_paper_form_variant_fields_variant", "paper_form_variant_fields", ["variant_id"])
    op.create_unique_constraint(
        "uq_paper_form_variant_field_key",
        "paper_form_variant_fields",
        ["variant_id", "field_key"],
    )

    # --- Add form_variant_id to cfp_papers ---
    op.add_column(
        "cfp_papers",
        sa.Column(
            "form_variant_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("paper_form_variants.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("idx_cfp_papers_form_variant", "cfp_papers", ["form_variant_id"])

    # --- RLS policies ---
    op.execute(
        """
        ALTER TABLE paper_form_variants ENABLE ROW LEVEL SECURITY;
        CREATE POLICY tenant_isolation ON paper_form_variants
            USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
        """
    )
    op.execute(
        """
        ALTER TABLE paper_form_variant_fields ENABLE ROW LEVEL SECURITY;
        CREATE POLICY tenant_isolation ON paper_form_variant_fields
            USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON paper_form_variant_fields;")
    op.execute("ALTER TABLE paper_form_variant_fields DISABLE ROW LEVEL SECURITY;")
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON paper_form_variants;")
    op.execute("ALTER TABLE paper_form_variants DISABLE ROW LEVEL SECURITY;")

    op.drop_index("idx_cfp_papers_form_variant", table_name="cfp_papers")
    op.drop_column("cfp_papers", "form_variant_id")

    op.drop_table("paper_form_variant_fields")
    op.drop_table("paper_form_variants")
