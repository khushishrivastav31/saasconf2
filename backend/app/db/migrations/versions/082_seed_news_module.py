"""Seed the 'news' module into the modules table.

Revision ID: 082_seed_news_module
Revises: 081_performance_indexes
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "082_seed_news_module"
down_revision: str = "081_performance_indexes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()
    # Only insert if the module doesn't already exist (idempotent)
    exists = conn.execute(sa.text("SELECT 1 FROM modules WHERE code = 'news'")).fetchone()
    if not exists:
        conn.execute(
            sa.text(
                "INSERT INTO modules (id, code, name, description, is_active, config_schema) "
                "VALUES (gen_random_uuid(), 'news', 'News & Newsletters', "
                "'Publish news articles and newsletters to conference portal users.', true, '{}'::jsonb)"
            )
        )


def downgrade() -> None:
    op.execute("DELETE FROM modules WHERE code = 'news'")
