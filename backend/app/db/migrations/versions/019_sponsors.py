"""Add sponsors table.

Revision ID: 019_sponsors
Revises: 018_platform_currencies
Create Date: 2026-01-27
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers, used by Alembic.
revision = "019_sponsors"
down_revision = "018_platform_currencies"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sponsors",
        sa.Column("id", UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True),
                  sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("conference_id", UUID(as_uuid=True),
                  sa.ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sponsor_package_id", UUID(as_uuid=True),
                  sa.ForeignKey("sponsor_packages.id", ondelete="SET NULL"), nullable=True),
        sa.Column("company_name", sa.String(255), nullable=False),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("website", sa.String(500), nullable=True),
        sa.Column("address_line1", sa.String(255), nullable=True),
        sa.Column("address_line2", sa.String(255), nullable=True),
        sa.Column("city", sa.String(100), nullable=True),
        sa.Column("state", sa.String(100), nullable=True),
        sa.Column("postal_code", sa.String(20), nullable=True),
        sa.Column("country", sa.String(100), nullable=True),
        sa.Column("vat_number", sa.String(20), nullable=True),
        sa.Column("price", sa.Numeric(12, 2), nullable=True),
        sa.Column("currency", sa.String(3), nullable=True),
        sa.Column("comments", sa.Text(), nullable=True),
        sa.Column("contact_persons", JSONB, nullable=True, server_default="[]"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("NOW()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.text("NOW()"), nullable=False),
    )

    op.create_index("idx_sponsors_tenant", "sponsors", ["tenant_id"])
    op.create_index("idx_sponsors_conference", "sponsors", ["tenant_id", "conference_id"])
    op.create_index("idx_sponsors_package", "sponsors", ["sponsor_package_id"])

    # Enable RLS
    op.execute("ALTER TABLE sponsors ENABLE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY sponsors_tenant_isolation ON sponsors
        FOR ALL
        USING (
            tenant_id::text = current_setting('app.current_tenant_id', true)
            OR current_setting('app.is_super_admin', true)::boolean = true
        )
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS sponsors_tenant_isolation ON sponsors")
    op.execute("ALTER TABLE sponsors DISABLE ROW LEVEL SECURITY")
    op.drop_index("idx_sponsors_package", table_name="sponsors")
    op.drop_index("idx_sponsors_conference", table_name="sponsors")
    op.drop_index("idx_sponsors_tenant", table_name="sponsors")
    op.drop_table("sponsors")
