"""Drop color/sort_order from settings tables, add attachments table.

Revision ID: 009_simplify_add_attachments
Revises: 008_configurable_roles_types
Create Date: 2026-01-26

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision = "009_simplify_add_attachments"
down_revision = "008_configurable_roles_types"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- Drop color and sort_order from volunteer_roles ---
    op.drop_column("volunteer_roles", "color")
    op.drop_column("volunteer_roles", "sort_order")

    # --- Drop color and sort_order from tenant_location_types ---
    op.drop_column("tenant_location_types", "color")
    op.drop_column("tenant_location_types", "sort_order")

    # --- Create attachments table ---
    op.create_table(
        "attachments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("uuid_generate_v4()")),
        sa.Column("tenant_id", UUID(as_uuid=True),
                  sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("entity_type", sa.String(50), nullable=False),
        sa.Column("entity_id", UUID(as_uuid=True), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("content_type", sa.String(100), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("file_data", sa.LargeBinary(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("uploaded_by", UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.text("NOW()")),
    )
    op.create_index("idx_attachments_tenant", "attachments", ["tenant_id"])
    op.create_index("idx_attachments_entity", "attachments",
                    ["tenant_id", "entity_type", "entity_id"])
    op.create_index("idx_attachments_uploaded_by", "attachments", ["uploaded_by"])

    # Enable RLS
    op.execute("ALTER TABLE attachments ENABLE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY attachments_tenant_isolation ON attachments
        FOR ALL
        USING (
            tenant_id::text = current_setting('app.current_tenant_id', true)
            OR current_setting('app.is_super_admin', true)::boolean = true
        )
    """)


def downgrade() -> None:
    # Drop attachments
    op.execute("DROP POLICY IF EXISTS attachments_tenant_isolation ON attachments")
    op.execute("ALTER TABLE attachments DISABLE ROW LEVEL SECURITY")
    op.drop_index("idx_attachments_uploaded_by", table_name="attachments")
    op.drop_index("idx_attachments_entity", table_name="attachments")
    op.drop_index("idx_attachments_tenant", table_name="attachments")
    op.drop_table("attachments")

    # Re-add columns
    op.add_column("tenant_location_types",
                  sa.Column("sort_order", sa.Integer(), server_default="0"))
    op.add_column("tenant_location_types",
                  sa.Column("color", sa.String(20), nullable=True))
    op.add_column("volunteer_roles",
                  sa.Column("sort_order", sa.Integer(), server_default="0"))
    op.add_column("volunteer_roles",
                  sa.Column("color", sa.String(20), nullable=True))
