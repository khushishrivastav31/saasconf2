"""Add service_providers table.

Revision ID: 011_service_providers
Revises: 010_location_contact_persons
Create Date: 2026-01-26
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers, used by Alembic.
revision = "011_service_providers"
down_revision = "010_location_contact_persons"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "service_providers",
        sa.Column("id", UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("uuid_generate_v4()")),
        sa.Column("tenant_id", UUID(as_uuid=True),
                  sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("location_id", UUID(as_uuid=True),
                  sa.ForeignKey("locations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("company_name", sa.String(255), nullable=False),
        sa.Column("service_description", sa.Text(), nullable=True),
        sa.Column("contact_persons", JSONB, nullable=True, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.text("NOW()")),
    )
    op.create_index("idx_service_providers_tenant", "service_providers", ["tenant_id"])
    op.create_index("idx_service_providers_location", "service_providers",
                    ["tenant_id", "location_id"])

    # Enable RLS
    op.execute("ALTER TABLE service_providers ENABLE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY service_providers_tenant_isolation ON service_providers
        FOR ALL
        USING (
            tenant_id::text = current_setting('app.current_tenant_id', true)
            OR current_setting('app.is_super_admin', true)::boolean = true
        )
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS service_providers_tenant_isolation ON service_providers")
    op.execute("ALTER TABLE service_providers DISABLE ROW LEVEL SECURITY")
    op.drop_index("idx_service_providers_location", table_name="service_providers")
    op.drop_index("idx_service_providers_tenant", table_name="service_providers")
    op.drop_table("service_providers")
