"""Add volunteers and locations tables

Revision ID: 002_volunteers_locations
Revises: 001_initial
Create Date: 2024-01-02

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "002_volunteers_locations"
down_revision: Union[str, None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create volunteers table
    op.create_table(
        "volunteers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("first_name", sa.String(100), nullable=False),
        sa.Column("last_name", sa.String(100), nullable=False),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, default="pending"),
        sa.Column("role", sa.String(100), nullable=True),
        sa.Column("skills", postgresql.JSONB(), default=[]),
        sa.Column("availability", postgresql.JSONB(), default={}),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("emergency_contact_name", sa.String(255), nullable=True),
        sa.Column("emergency_contact_phone", sa.String(50), nullable=True),
        sa.Column("tshirt_size", sa.String(10), nullable=True),
        sa.Column("application_date", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("approved_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("total_hours", sa.Float(), default=0.0),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )
    op.create_index("idx_volunteers_tenant", "volunteers", ["tenant_id"])
    op.create_index("idx_volunteers_email", "volunteers", ["tenant_id", "email"])
    op.create_index("idx_volunteers_status", "volunteers", ["tenant_id", "status"])

    # Create locations table
    op.create_table(
        "locations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("parent_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("locations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("code", sa.String(50), nullable=True),
        sa.Column("location_type", sa.String(20), nullable=False, default="room"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("capacity", sa.Integer(), nullable=True),
        sa.Column("address_line1", sa.String(255), nullable=True),
        sa.Column("address_line2", sa.String(255), nullable=True),
        sa.Column("city", sa.String(100), nullable=True),
        sa.Column("state", sa.String(100), nullable=True),
        sa.Column("postal_code", sa.String(20), nullable=True),
        sa.Column("country", sa.String(100), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("building", sa.String(100), nullable=True),
        sa.Column("floor", sa.String(20), nullable=True),
        sa.Column("amenities", postgresql.JSONB(), default=[]),
        sa.Column("accessibility_features", postgresql.JSONB(), default=[]),
        sa.Column("virtual_url", sa.String(500), nullable=True),
        sa.Column("virtual_platform", sa.String(50), nullable=True),
        sa.Column("is_active", sa.Boolean(), default=True),
        sa.Column("settings", postgresql.JSONB(), default={}),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )
    op.create_index("idx_locations_tenant", "locations", ["tenant_id"])
    op.create_index("idx_locations_parent", "locations", ["parent_id"])
    op.create_index("idx_locations_type", "locations", ["tenant_id", "location_type"])
    op.create_index("idx_locations_code", "locations", ["tenant_id", "code"])

    # Enable RLS on new tables
    op.execute("ALTER TABLE volunteers ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE locations ENABLE ROW LEVEL SECURITY")

    # RLS policies for volunteers
    op.execute("""
        CREATE POLICY volunteers_tenant_isolation ON volunteers
        FOR ALL
        USING (
            tenant_id::text = current_setting('app.current_tenant_id', true)
            OR current_setting('app.is_super_admin', true)::boolean = true
        )
    """)

    # RLS policies for locations
    op.execute("""
        CREATE POLICY locations_tenant_isolation ON locations
        FOR ALL
        USING (
            tenant_id::text = current_setting('app.current_tenant_id', true)
            OR current_setting('app.is_super_admin', true)::boolean = true
        )
    """)


def downgrade() -> None:
    # Drop RLS policies
    op.execute("DROP POLICY IF EXISTS volunteers_tenant_isolation ON volunteers")
    op.execute("DROP POLICY IF EXISTS locations_tenant_isolation ON locations")

    # Disable RLS
    op.execute("ALTER TABLE volunteers DISABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE locations DISABLE ROW LEVEL SECURITY")

    # Drop tables
    op.drop_table("locations")
    op.drop_table("volunteers")
