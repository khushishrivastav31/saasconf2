"""Add program_event_types table for configurable event templates.

Revision ID: 067_program_event_types
Revises: 066_program_design
Create Date: 2026-02-12
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "067_program_event_types"
down_revision = "066_program_design"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "program_event_types",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("conference_id", UUID(as_uuid=True), sa.ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("code", sa.String(50), nullable=False),  # e.g., "break", "lunch", "custom_event"
        sa.Column("color", sa.String(7), nullable=False, server_default="#6B7280"),
        sa.Column("icon", sa.Text, nullable=True),  # SVG path
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )

    op.create_index("idx_program_event_types_conference", "program_event_types", ["tenant_id", "conference_id"])
    op.create_index("uq_program_event_types_code", "program_event_types", ["conference_id", "code"], unique=True)


def downgrade() -> None:
    op.drop_index("uq_program_event_types_code", table_name="program_event_types")
    op.drop_index("idx_program_event_types_conference", table_name="program_event_types")
    op.drop_table("program_event_types")
