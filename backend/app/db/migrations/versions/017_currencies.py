"""Add conference currencies table and currency column to sponsor packages.

Revision ID: 017_currencies
Revises: 016_sponsor_packages
Create Date: 2026-01-27
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision = "017_currencies"
down_revision = "016_sponsor_packages"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create conference_currencies table
    op.create_table(
        "conference_currencies",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("conference_id", UUID(as_uuid=True), sa.ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False),
        sa.Column("code", sa.String(3), nullable=False),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("symbol", sa.String(5), nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_index("idx_conference_currencies_tenant", "conference_currencies", ["tenant_id"])
    op.create_index("idx_conference_currencies_conference", "conference_currencies", ["conference_id"])
    op.create_index("idx_conference_currencies_code", "conference_currencies", ["tenant_id", "conference_id", "code"], unique=True)

    # Add currency column to sponsor_packages
    op.add_column(
        "sponsor_packages",
        sa.Column("currency", sa.String(3), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("sponsor_packages", "currency")

    op.drop_index("idx_conference_currencies_code", table_name="conference_currencies")
    op.drop_index("idx_conference_currencies_conference", table_name="conference_currencies")
    op.drop_index("idx_conference_currencies_tenant", table_name="conference_currencies")
    op.drop_table("conference_currencies")
