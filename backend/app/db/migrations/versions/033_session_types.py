"""Add session_types table.

Revision ID: 033_session_types
Revises: 032_access_details
Create Date: 2026-01-28
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision = "033_session_types"
down_revision = "032_access_details"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "session_types",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "conference_id", UUID(as_uuid=True), sa.ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("slug", sa.String(50), nullable=False),
        sa.Column("duration_minutes", sa.Integer, nullable=False),
        sa.Column("cfp_eligible", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_session_types_tenant", "session_types", ["tenant_id"])
    op.create_index("idx_session_types_conference", "session_types", ["conference_id"])
    op.create_index("idx_session_types_slug", "session_types", ["tenant_id", "conference_id", "slug"], unique=True)


def downgrade() -> None:
    op.drop_index("idx_session_types_slug", table_name="session_types")
    op.drop_index("idx_session_types_conference", table_name="session_types")
    op.drop_index("idx_session_types_tenant", table_name="session_types")
    op.drop_table("session_types")
