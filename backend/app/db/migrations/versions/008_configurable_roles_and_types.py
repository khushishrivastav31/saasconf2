"""Add configurable volunteer roles and location types tables.

Revision ID: 008_configurable_roles_types
Revises: 007_conf_associations
Create Date: 2026-01-26

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision = "008_configurable_roles_types"
down_revision = "007_conf_associations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- volunteer_roles table ---
    op.create_table(
        "volunteer_roles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("uuid_generate_v4()")),
        sa.Column("tenant_id", UUID(as_uuid=True),
                  sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("color", sa.String(20), nullable=True),
        sa.Column("sort_order", sa.Integer(), server_default="0"),
        sa.Column("is_active", sa.Boolean(), server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.text("NOW()")),
    )
    op.create_index("idx_volunteer_roles_tenant", "volunteer_roles", ["tenant_id"])
    op.create_index("idx_volunteer_roles_name", "volunteer_roles",
                    ["tenant_id", "name"], unique=True)

    # --- tenant_location_types table ---
    op.create_table(
        "tenant_location_types",
        sa.Column("id", UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("uuid_generate_v4()")),
        sa.Column("tenant_id", UUID(as_uuid=True),
                  sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("slug", sa.String(20), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("color", sa.String(20), nullable=True),
        sa.Column("sort_order", sa.Integer(), server_default="0"),
        sa.Column("is_active", sa.Boolean(), server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.text("NOW()")),
    )
    op.create_index("idx_tenant_location_types_tenant",
                    "tenant_location_types", ["tenant_id"])
    op.create_index("idx_tenant_location_types_slug",
                    "tenant_location_types", ["tenant_id", "slug"], unique=True)

    # Enable RLS on new tables
    op.execute("ALTER TABLE volunteer_roles ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE tenant_location_types ENABLE ROW LEVEL SECURITY")

    # RLS policies
    op.execute("""
        CREATE POLICY volunteer_roles_tenant_isolation ON volunteer_roles
        FOR ALL
        USING (
            tenant_id::text = current_setting('app.current_tenant_id', true)
            OR current_setting('app.is_super_admin', true)::boolean = true
        )
    """)
    op.execute("""
        CREATE POLICY tenant_location_types_tenant_isolation ON tenant_location_types
        FOR ALL
        USING (
            tenant_id::text = current_setting('app.current_tenant_id', true)
            OR current_setting('app.is_super_admin', true)::boolean = true
        )
    """)

    # --- Seed default volunteer roles for all existing tenants ---
    op.execute("""
        INSERT INTO volunteer_roles (id, tenant_id, name, description, color, sort_order, is_active)
        SELECT
            uuid_generate_v4(), t.id, role_data.name, role_data.description,
            role_data.color, role_data.sort_order, true
        FROM tenants t
        CROSS JOIN (VALUES
            ('Registration Desk', 'Manages attendee check-in and badge distribution', 'blue', 1),
            ('Speaker Liaison', 'Coordinates with speakers before and during sessions', 'purple', 2),
            ('Room Monitor', 'Ensures sessions run on time and assists with A/V', 'green', 3),
            ('Wayfinding', 'Helps attendees navigate the venue', 'yellow', 4),
            ('Setup/Teardown', 'Assists with venue setup and cleanup', 'orange', 5),
            ('General Volunteer', 'General purpose volunteer role', 'gray', 6)
        ) AS role_data(name, description, color, sort_order)
    """)

    # --- Seed default location types for all existing tenants ---
    op.execute("""
        INSERT INTO tenant_location_types (id, tenant_id, name, slug, description, color, sort_order, is_active)
        SELECT
            uuid_generate_v4(), t.id, type_data.name, type_data.slug,
            type_data.description, type_data.color, type_data.sort_order, true
        FROM tenants t
        CROSS JOIN (VALUES
            ('Venue', 'venue', 'Main conference venue', 'purple', 1),
            ('Room', 'room', 'Conference room or hall', 'blue', 2),
            ('Booth', 'booth', 'Exhibition booth', 'green', 3),
            ('Area', 'area', 'General area (lobby, cafeteria)', 'yellow', 4),
            ('Outdoor', 'outdoor', 'Outdoor space', 'teal', 5),
            ('Virtual', 'virtual', 'Virtual or online location', 'pink', 6)
        ) AS type_data(name, slug, description, color, sort_order)
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_location_types_tenant_isolation ON tenant_location_types")
    op.execute("DROP POLICY IF EXISTS volunteer_roles_tenant_isolation ON volunteer_roles")
    op.execute("ALTER TABLE tenant_location_types DISABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE volunteer_roles DISABLE ROW LEVEL SECURITY")
    op.drop_index("idx_tenant_location_types_slug", table_name="tenant_location_types")
    op.drop_index("idx_tenant_location_types_tenant", table_name="tenant_location_types")
    op.drop_table("tenant_location_types")
    op.drop_index("idx_volunteer_roles_name", table_name="volunteer_roles")
    op.drop_index("idx_volunteer_roles_tenant", table_name="volunteer_roles")
    op.drop_table("volunteer_roles")
