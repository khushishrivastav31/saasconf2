"""Add messaging notes, flags, and has_attachments.

New columns:
- messages: is_internal_note (boolean, default false)
- message_threads: has_attachments (boolean, default false)

New table:
- thread_flags: Per-user thread flagging

Revision ID: 075_messaging_notes_flags
Revises: 074_messaging_enhancements
Create Date: 2026-02-13
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "075_messaging_notes_flags"
down_revision: str | None = "074_messaging_enhancements"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add internal notes, flags, and has_attachments."""

    # Add is_internal_note to messages
    op.add_column(
        "messages",
        sa.Column(
            "is_internal_note",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )

    # Add has_attachments to message_threads
    op.add_column(
        "message_threads",
        sa.Column(
            "has_attachments",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )

    # thread_flags table
    op.create_table(
        "thread_flags",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "thread_id",
            UUID(as_uuid=True),
            sa.ForeignKey("message_threads.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("thread_id", "user_id", name="uq_thread_flags_thread_user"),
    )
    op.create_index("idx_thread_flags_thread", "thread_flags", ["thread_id"])
    op.create_index("idx_thread_flags_user", "thread_flags", ["user_id"])

    # RLS for thread_flags via thread -> conference -> tenant
    op.execute("ALTER TABLE thread_flags ENABLE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY thread_flags_tenant_isolation ON thread_flags
        FOR ALL
        USING (
            thread_id IN (
                SELECT id FROM message_threads
                WHERE tenant_id::text = current_setting('app.current_tenant_id', true)
            )
            OR current_setting('app.is_super_admin', true)::boolean = true
        )
    """)


def downgrade() -> None:
    """Remove internal notes, flags, and has_attachments."""
    op.execute("DROP POLICY IF EXISTS thread_flags_tenant_isolation ON thread_flags")
    op.drop_table("thread_flags")
    op.drop_column("message_threads", "has_attachments")
    op.drop_column("messages", "is_internal_note")
