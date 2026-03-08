"""add main session selection to registrations

Revision ID: 120
Revises: 119
Create Date: 2026-03-07 12:00:00.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "120"
down_revision = "119"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add main_session_id to track tutorial/session selection for main booking option."""
    op.add_column("registrations", sa.Column("main_session_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_registrations_main_session",
        "registrations",
        "program_sessions",
        ["main_session_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("idx_registrations_main_session", "registrations", ["main_session_id"])


def downgrade() -> None:
    """Remove main_session_id field."""
    op.drop_index("idx_registrations_main_session", "registrations")
    op.drop_constraint("fk_registrations_main_session", "registrations", type_="foreignkey")
    op.drop_column("registrations", "main_session_id")
