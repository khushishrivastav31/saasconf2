"""Create certification_bodies table.

Revision ID: 153
Revises: 152
Create Date: 2026-03-23
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "153"
down_revision = "152"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "certification_bodies",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "tenant_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("company_name", sa.String(255), nullable=False),
        sa.Column("service_description", sa.Text, nullable=True),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("website", sa.String(500), nullable=True),
        sa.Column("address_line1", sa.String(255), nullable=True),
        sa.Column("address_line2", sa.String(255), nullable=True),
        sa.Column("city", sa.String(100), nullable=True),
        sa.Column("state", sa.String(100), nullable=True),
        sa.Column("postal_code", sa.String(20), nullable=True),
        sa.Column("country", sa.String(100), nullable=True),
        sa.Column("vat_number", sa.String(20), nullable=True),
        sa.Column("contact_persons", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_certification_bodies_tenant", "certification_bodies", ["tenant_id"])

    # RLS policy
    op.execute("ALTER TABLE certification_bodies ENABLE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY certification_bodies_tenant_isolation ON certification_bodies
        USING (
            current_setting('app.is_super_admin', true) = 'true'
            OR tenant_id = current_setting('app.current_tenant_id', true)::uuid
        )
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS certification_bodies_tenant_isolation ON certification_bodies")
    op.execute("ALTER TABLE certification_bodies DISABLE ROW LEVEL SECURITY")
    op.drop_index("idx_certification_bodies_tenant")
    op.drop_table("certification_bodies")
