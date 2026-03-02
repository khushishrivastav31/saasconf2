"""Add deadlines table.

Conference-scoped table for tracking important deadlines (contracts, events, etc.).
Supports email reminders at 7 days, 1 day, and on the due date.

Revision ID: 105_deadlines
Revises: 104_alumni
Create Date: 2026-03-02
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "105_deadlines"
down_revision: Union[str, None] = "104_alumni"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "deadlines",
        sa.Column(
            "id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "tenant_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "conference_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("conferences.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("due_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("reminder_7d_sent", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("reminder_1d_sent", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("reminder_due_sent", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column(
            "created_by",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )

    # Standard indexes
    op.create_index("idx_deadlines_conference", "deadlines", ["conference_id"])
    op.create_index("idx_deadlines_due_date", "deadlines", ["due_date"])

    # Partial index for efficient cron queries (only active deadlines)
    op.execute("CREATE INDEX idx_deadlines_active_due ON deadlines (is_active, due_date) WHERE is_active = true")

    # RLS for tenant isolation
    op.execute("ALTER TABLE deadlines ENABLE ROW LEVEL SECURITY")
    op.execute(
        """CREATE POLICY tenant_isolation_deadlines ON deadlines
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
               OR current_setting('app.is_super_admin', true) = 'true')"""
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation_deadlines ON deadlines")
    op.execute("ALTER TABLE deadlines DISABLE ROW LEVEL SECURITY")
    op.drop_table("deadlines")
