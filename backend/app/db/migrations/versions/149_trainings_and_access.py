"""Add trainings table.

Revision ID: 149
Revises: 148
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "149"
down_revision: str = "148"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "trainings",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # Basic info
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("abbreviation", sa.String(50), nullable=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("website", sa.String(500), nullable=True),
        sa.Column("logo_url", sa.String(500), nullable=True),
        # Contact
        sa.Column("support_email", sa.String(255), nullable=True),
        sa.Column("contact_email", sa.String(255), nullable=True),
        sa.Column("phone", sa.String(50), nullable=True),
        # Dates
        sa.Column("start_date", sa.Date, nullable=True),
        sa.Column("end_date", sa.Date, nullable=True),
        # Location
        sa.Column("venue_name", sa.String(255), nullable=True),
        sa.Column("venue_address", sa.String(500), nullable=True),
        sa.Column("city", sa.String(100), nullable=True),
        sa.Column("state", sa.String(100), nullable=True),
        sa.Column("postal_code", sa.String(20), nullable=True),
        sa.Column("country", sa.String(100), nullable=True),
        sa.Column("timezone", sa.String(50), nullable=True),
        sa.Column("locale", sa.String(10), nullable=True, server_default="en"),
        sa.Column("venue_type", sa.String(20), nullable=False, server_default="onsite"),
        sa.Column("venue_url", sa.String(500), nullable=True),
        sa.Column("virtual_platform_url", sa.String(500), nullable=True),
        # JSONB
        sa.Column("social_links", sa.dialects.postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("team_members", sa.dialects.postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("settings", sa.dialects.postgresql.JSONB, nullable=False, server_default="{}"),
        # Currency
        sa.Column("currency", sa.String(3), nullable=True),
        sa.Column("invoice_currency", sa.String(3), nullable=True),
        # Status
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("is_published", sa.Boolean, nullable=False, server_default=sa.text("false")),
        # Timestamps
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_index("idx_trainings_tenant", "trainings", ["tenant_id"])
    op.create_index("idx_trainings_active", "trainings", ["tenant_id", "is_active"])

    # RLS for trainings
    op.execute("ALTER TABLE trainings ENABLE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY trainings_tenant_isolation ON trainings
        USING (
            tenant_id::text = current_setting('app.current_tenant_id', true)
            OR current_setting('app.is_super_admin', true)::boolean = true
        )
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS trainings_tenant_isolation ON trainings")
    op.execute("ALTER TABLE trainings DISABLE ROW LEVEL SECURITY")
    op.drop_table("trainings")
