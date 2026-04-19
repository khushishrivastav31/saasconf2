"""Add portal_user_history — audit trail for portal-user admin actions.

Phase 2.5 unified the portal user model across CFP + trainings. The five
tenant-admin actions (toggle access, resend invite, reset password,
impersonate, merge) previously lived under the trainings router and wrote
their audit trail into ``training_attendee_history``. With the actions
moving to a tenant-level ``/portal-users/*`` admin page, we need an
audit trail that survives even when the acting portal user has no linked
training attendee — hence a dedicated ``portal_user_history`` table.

Event types:
* ``portal_activated``, ``portal_deactivated`` — ``toggle-access``
* ``invite_resent``                             — ``resend-invite``
* ``password_reset_sent``                       — ``reset-password``
* ``impersonated``                              — ``impersonate``
* ``merged_from``, ``merged_into``              — ``merge`` (two rows:
  one on the deleted source (for the audit log cross-reference) and one
  on the surviving target).

Revision ID: 204
Revises: 203
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "204"
down_revision = "203"
branch_labels = None
depends_on = None


def upgrade() -> None:
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


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation_portal_user_history ON portal_user_history")
    op.execute("ALTER TABLE portal_user_history DISABLE ROW LEVEL SECURITY")
    op.drop_index("idx_portal_user_history_tenant", table_name="portal_user_history")
    op.drop_index("idx_portal_user_history_user", table_name="portal_user_history")
    op.drop_table("portal_user_history")
