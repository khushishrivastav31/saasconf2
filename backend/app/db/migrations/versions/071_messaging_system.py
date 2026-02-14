"""Add in-platform messaging system.

Tables for conference-scoped messaging between tenant admins and CFP applicants:
- message_threads: Conversation containers with subject
- message_participants: Links users/applicants to threads (polymorphic)
- messages: Individual messages within threads

Also adds message_notifications_enabled column to users and cfp_applicants.

Revision ID: 071_messaging_system
Revises: 070_tracks_per_day
Create Date: 2026-02-13
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "071_messaging_system"
down_revision: str | None = "070_tracks_per_day"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create messaging tables and notification preference columns."""

    # message_threads
    op.create_table(
        "message_threads",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "tenant_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "conference_id",
            UUID(as_uuid=True),
            sa.ForeignKey("conferences.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("subject", sa.String(500), nullable=False),
        sa.Column("bulk_id", UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("idx_message_threads_tenant", "message_threads", ["tenant_id"])
    op.create_index(
        "idx_message_threads_conference",
        "message_threads",
        ["tenant_id", "conference_id"],
    )
    op.create_index(
        "idx_message_threads_bulk",
        "message_threads",
        ["bulk_id"],
        postgresql_where=sa.text("bulk_id IS NOT NULL"),
    )

    # message_participants
    op.create_table(
        "message_participants",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "tenant_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "thread_id",
            UUID(as_uuid=True),
            sa.ForeignKey("message_threads.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("participant_type", sa.String(20), nullable=False),
        sa.Column("participant_id", UUID(as_uuid=True), nullable=False),
        sa.Column("last_read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "thread_id",
            "participant_type",
            "participant_id",
            name="uq_message_participants_thread_entity",
        ),
    )
    op.create_index(
        "idx_message_participants_thread", "message_participants", ["thread_id"]
    )
    op.create_index(
        "idx_message_participants_lookup",
        "message_participants",
        ["participant_type", "participant_id"],
    )

    # messages
    op.create_table(
        "messages",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "tenant_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "thread_id",
            UUID(as_uuid=True),
            sa.ForeignKey("message_threads.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("sender_type", sa.String(20), nullable=False),
        sa.Column("sender_id", UUID(as_uuid=True), nullable=False),
        sa.Column("body_html", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("idx_messages_thread", "messages", ["thread_id"])
    op.create_index(
        "idx_messages_thread_created", "messages", ["thread_id", "created_at"]
    )

    # RLS policies
    for table in ["message_threads", "message_participants", "messages"]:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"""
            CREATE POLICY {table}_tenant_isolation ON {table}
            FOR ALL
            USING (
                tenant_id::text = current_setting('app.current_tenant_id', true)
                OR current_setting('app.is_super_admin', true)::boolean = true
            )
        """)

    # Add notification preference columns
    op.add_column(
        "users",
        sa.Column(
            "message_notifications_enabled",
            sa.Boolean(),
            nullable=False,
            server_default="true",
        ),
    )
    op.add_column(
        "cfp_applicants",
        sa.Column(
            "message_notifications_enabled",
            sa.Boolean(),
            nullable=False,
            server_default="true",
        ),
    )


def downgrade() -> None:
    """Drop messaging tables and notification preference columns."""
    op.drop_column("cfp_applicants", "message_notifications_enabled")
    op.drop_column("users", "message_notifications_enabled")

    for table in ["messages", "message_participants", "message_threads"]:
        op.execute(f"DROP POLICY IF EXISTS {table}_tenant_isolation ON {table}")
        op.drop_table(table)
