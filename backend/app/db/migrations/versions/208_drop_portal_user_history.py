"""Drop portal_user_history — superseded by customer_events.

Migration 205 replaced this table with the unified ``customer_events`` log
and copied every row into it. The admin endpoints stopped writing to this
table in the same release, and the read endpoint was flipped to
``customer_events`` in phase 5 of the unified customer architecture.
After one release of observation with no readers or writers, this
migration drops the table.

Revision ID: 208
Revises: 207
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "208"
down_revision = "207"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation_portal_user_history ON portal_user_history")
    op.execute("ALTER TABLE portal_user_history DISABLE ROW LEVEL SECURITY")
    op.drop_index("idx_portal_user_history_tenant", table_name="portal_user_history")
    op.drop_index("idx_portal_user_history_user", table_name="portal_user_history")
    op.drop_table("portal_user_history")


def downgrade() -> None:
    op.create_table(
        "portal_user_history",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "tenant_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "portal_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("portal_users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("event_type", sa.String(40), nullable=False),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("metadata", JSONB, nullable=True),
        sa.Column(
            "created_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "idx_portal_user_history_user",
        "portal_user_history",
        ["portal_user_id", "created_at"],
    )
    op.create_index(
        "idx_portal_user_history_tenant",
        "portal_user_history",
        ["tenant_id"],
    )
    op.execute("ALTER TABLE portal_user_history ENABLE ROW LEVEL SECURITY")
    op.execute(
        """CREATE POLICY tenant_isolation_portal_user_history ON portal_user_history
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
               OR current_setting('app.is_super_admin', true) = 'true')"""
    )
