"""Add messaging enhancements: templates, recipient lists, archival.

New tables:
- message_templates: Reusable message templates scoped to tenant
- recipient_lists: Named lists of applicants for bulk messaging
- recipient_list_members: Applicant members of recipient lists

Altered tables:
- message_threads: add archived_at column
- messages: add archived_at column

Revision ID: 074_messaging_enhancements
Revises: 073_backfill_default_settings
Create Date: 2026-02-13
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "074_messaging_enhancements"
down_revision: str | None = "073_backfill_default_settings"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create messaging enhancement tables and columns."""

    # message_templates
    op.create_table(
        "message_templates",
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
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("subject", sa.String(500), nullable=False),
        sa.Column("body_html", sa.Text(), nullable=False),
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
        sa.UniqueConstraint("tenant_id", "name", name="uq_message_templates_tenant_name"),
    )
    op.create_index("idx_message_templates_tenant", "message_templates", ["tenant_id"])

    # recipient_lists
    op.create_table(
        "recipient_lists",
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
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
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
        sa.UniqueConstraint("tenant_id", "name", name="uq_recipient_lists_tenant_name"),
    )
    op.create_index("idx_recipient_lists_tenant", "recipient_lists", ["tenant_id"])

    # recipient_list_members
    op.create_table(
        "recipient_list_members",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "list_id",
            UUID(as_uuid=True),
            sa.ForeignKey("recipient_lists.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("applicant_id", UUID(as_uuid=True), nullable=False),
        sa.UniqueConstraint(
            "list_id", "applicant_id", name="uq_recipient_list_members_list_applicant"
        ),
    )
    op.create_index(
        "idx_recipient_list_members_list", "recipient_list_members", ["list_id"]
    )

    # RLS policies for new tables
    for table in ["message_templates", "recipient_lists"]:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"""
            CREATE POLICY {table}_tenant_isolation ON {table}
            FOR ALL
            USING (
                tenant_id::text = current_setting('app.current_tenant_id', true)
                OR current_setting('app.is_super_admin', true)::boolean = true
            )
        """)

    # recipient_list_members inherits isolation through list_id FK
    op.execute("ALTER TABLE recipient_list_members ENABLE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY recipient_list_members_tenant_isolation ON recipient_list_members
        FOR ALL
        USING (
            list_id IN (
                SELECT id FROM recipient_lists
                WHERE tenant_id::text = current_setting('app.current_tenant_id', true)
            )
            OR current_setting('app.is_super_admin', true)::boolean = true
        )
    """)

    # Add archived_at to message_threads and messages
    op.add_column(
        "message_threads",
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "messages",
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    """Drop messaging enhancement tables and columns."""
    op.drop_column("messages", "archived_at")
    op.drop_column("message_threads", "archived_at")

    for table in ["recipient_list_members", "recipient_lists", "message_templates"]:
        op.execute(
            f"DROP POLICY IF EXISTS {table}_tenant_isolation ON {table}"
        )
        op.drop_table(table)
