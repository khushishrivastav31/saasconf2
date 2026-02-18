"""Seed the 'registration' module into the modules table.

Revision ID: 083_seed_registration_module
Revises: 082_seed_news_module
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "083_seed_registration_module"
down_revision: str = "082_seed_news_module"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()
    exists = conn.execute(sa.text("SELECT 1 FROM modules WHERE code = 'registration'")).fetchone()
    if not exists:
        conn.execute(
            sa.text(
                "INSERT INTO modules (id, code, name, description, is_active, config_schema) "
                "VALUES (gen_random_uuid(), 'registration', 'Registration', "
                "'Manage conference registration, tickets, and attendee check-in.', true, '{}'::jsonb)"
            )
        )


def downgrade() -> None:
    op.execute("DELETE FROM modules WHERE code = 'registration'")
