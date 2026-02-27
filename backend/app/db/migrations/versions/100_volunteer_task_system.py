"""Add volunteer task assignment system.

Creates tables for linking volunteer tasks to program sessions,
assigning volunteers to specific session-tasks, and tracking
volunteer colors per conference.

Revision ID: 100_volunteer_task_system
Revises: 099_theme_preference
Create Date: 2026-02-27
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "100_volunteer_task_system"
down_revision: Union[str, None] = "099_theme_preference"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add color column to conference_volunteers for per-conference volunteer identification
    op.add_column("conference_volunteers", sa.Column("color", sa.String(7), nullable=True))

    # 2. Create session_volunteer_tasks (links sessions to volunteer tasks with required count)
    op.create_table(
        "session_volunteer_tasks",
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
        sa.Column(
            "session_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("program_sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "volunteer_task_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("volunteer_roles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("required_count", sa.Integer, server_default="1", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.UniqueConstraint("session_id", "volunteer_task_id", name="uq_session_volunteer_task"),
    )
    op.create_index("idx_svt_conference", "session_volunteer_tasks", ["conference_id"])
    op.create_index("idx_svt_session", "session_volunteer_tasks", ["session_id"])
    op.create_index("idx_svt_task", "session_volunteer_tasks", ["volunteer_task_id"])

    # RLS for session_volunteer_tasks
    op.execute("ALTER TABLE session_volunteer_tasks ENABLE ROW LEVEL SECURITY")
    op.execute(
        """CREATE POLICY tenant_isolation_session_volunteer_tasks ON session_volunteer_tasks
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
               OR current_setting('app.is_super_admin', true) = 'true')"""
    )

    # 3. Create volunteer_assignments (links volunteers to specific session-tasks)
    op.create_table(
        "volunteer_assignments",
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
        sa.Column(
            "session_volunteer_task_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("session_volunteer_tasks.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "volunteer_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("volunteers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.UniqueConstraint("session_volunteer_task_id", "volunteer_id", name="uq_volunteer_assignment"),
    )
    op.create_index("idx_va_conference", "volunteer_assignments", ["conference_id"])
    op.create_index("idx_va_volunteer", "volunteer_assignments", ["volunteer_id"])
    op.create_index("idx_va_svt", "volunteer_assignments", ["session_volunteer_task_id"])

    # RLS for volunteer_assignments
    op.execute("ALTER TABLE volunteer_assignments ENABLE ROW LEVEL SECURITY")
    op.execute(
        """CREATE POLICY tenant_isolation_volunteer_assignments ON volunteer_assignments
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
               OR current_setting('app.is_super_admin', true) = 'true')"""
    )


def downgrade() -> None:
    op.drop_table("volunteer_assignments")
    op.drop_table("session_volunteer_tasks")
    op.drop_column("conference_volunteers", "color")
