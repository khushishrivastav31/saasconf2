"""Add alumni table.

Conference-scoped table for tracking past attendees.
Supports manual entry, CSV bulk import, and auto-add on paid registration.

Revision ID: 104_alumni
Revises: 103_tenant_email_domain
Create Date: 2026-03-02
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "104_alumni"
down_revision: Union[str, None] = "103_tenant_email_domain"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "alumni",
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
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("first_name", sa.String(255), nullable=False),
        sa.Column("last_name", sa.String(255), nullable=False),
        sa.Column("company", sa.String(255), nullable=True),
        sa.Column("source", sa.String(20), nullable=False, server_default="manual"),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
    )

    # Unique constraint: one alumni per email per conference (case-insensitive)
    op.execute("CREATE UNIQUE INDEX uq_alumni_conference_email ON alumni (conference_id, lower(email))")

    # Standard indexes
    op.create_index("idx_alumni_tenant", "alumni", ["tenant_id"])
    op.create_index("idx_alumni_conference", "alumni", ["conference_id"])

    # Tenant email lookup index (for cross-conference alumni check)
    op.execute("CREATE INDEX idx_alumni_tenant_email ON alumni (tenant_id, lower(email))")

    # RLS for tenant isolation
    op.execute("ALTER TABLE alumni ENABLE ROW LEVEL SECURITY")
    op.execute(
        """CREATE POLICY tenant_isolation_alumni ON alumni
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
               OR current_setting('app.is_super_admin', true) = 'true')"""
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation_alumni ON alumni")
    op.execute("ALTER TABLE alumni DISABLE ROW LEVEL SECURITY")
    op.drop_table("alumni")
