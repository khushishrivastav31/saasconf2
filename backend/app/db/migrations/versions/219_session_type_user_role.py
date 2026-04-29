"""Map ``session_types`` to a ``user_roles`` row for speaker auto-assignment.

Today the per-role speaker tabs (Tutorials, Bonus Sessions, Active
Sessions, Sponsor Talks, Social Events) only get populated when an
admin manually clicks "Add". The Speaker role is auto-backfilled from
accepted CFP papers, but there's no link from ``session_types`` to
``user_roles`` so per-category lists stay empty even when the data is
clearly there (e.g. a paper accepted with session_type "Full-Day
Tutorial").

This migration adds an optional ``user_role_id`` FK to
``session_types`` so each session type can be linked to the
speaker-category role its accepted speakers belong to. The Speaker
auto-backfill is then extended to also stamp the per-category role
when set. Mapping is per-conference and explicit — no fragile
substring matching.

Forward-only. No data backfill: existing session types start with
``user_role_id = NULL`` (current behaviour preserved); the admin sets
the mapping in the Session Types settings page going forward.

Revision ID: 219
Revises: 218
"""

import sqlalchemy as sa
from alembic import op

revision = "219"
down_revision = "218"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "session_types",
        sa.Column("user_role_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_session_types_user_role",
        "session_types",
        "user_roles",
        ["user_role_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "idx_session_types_user_role",
        "session_types",
        ["user_role_id"],
    )


def downgrade() -> None:
    op.drop_index("idx_session_types_user_role", table_name="session_types")
    op.drop_constraint("fk_session_types_user_role", "session_types", type_="foreignkey")
    op.drop_column("session_types", "user_role_id")
