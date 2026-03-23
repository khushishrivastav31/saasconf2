"""Add email_logs table for tracking email delivery failures.

Revision ID: 148
Revises: 147
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "148"
down_revision: str = "147"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "email_logs",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "conference_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("conferences.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("recipient_email", sa.String(255), nullable=False),
        sa.Column("subject", sa.String(500), nullable=False),
        sa.Column("email_type", sa.String(50), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("acknowledged", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "acknowledged_by",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_email_logs_tenant", "email_logs", ["tenant_id"])
    op.create_index("idx_email_logs_tenant_ack", "email_logs", ["tenant_id", "acknowledged"])
    op.create_index("idx_email_logs_created", "email_logs", ["created_at"])


def downgrade() -> None:
    op.drop_index("idx_email_logs_created", table_name="email_logs")
    op.drop_index("idx_email_logs_tenant_ack", table_name="email_logs")
    op.drop_index("idx_email_logs_tenant", table_name="email_logs")
    op.drop_table("email_logs")
