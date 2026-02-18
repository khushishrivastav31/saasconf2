"""Add sponsor packages table.

Revision ID: 016_sponsor_packages
Revises: 015_settings_per_conference
Create Date: 2026-01-27
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision = "016_sponsor_packages"
down_revision = "015_settings_per_conference"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sponsor_packages",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "conference_id", UUID(as_uuid=True), sa.ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("price", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_index("idx_sponsor_packages_tenant", "sponsor_packages", ["tenant_id"])
    op.create_index("idx_sponsor_packages_conference", "sponsor_packages", ["conference_id"])
    op.create_index(
        "idx_sponsor_packages_name", "sponsor_packages", ["tenant_id", "conference_id", "name"], unique=True
    )


def downgrade() -> None:
    op.drop_index("idx_sponsor_packages_name", table_name="sponsor_packages")
    op.drop_index("idx_sponsor_packages_conference", table_name="sponsor_packages")
    op.drop_index("idx_sponsor_packages_tenant", table_name="sponsor_packages")
    op.drop_table("sponsor_packages")
