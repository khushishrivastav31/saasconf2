"""Add composite indexes for common query patterns.

Revision ID: 081_performance_indexes
Revises: 080_news_articles
"""

from collections.abc import Sequence

from alembic import op

revision: str = "081_performance_indexes"
down_revision: str | None = "080_news_articles"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

INDEXES = [
    ("ix_cfp_papers_tenant_status", "cfp_papers", ["tenant_id", "status"]),
    ("ix_paper_reviews_tenant_status", "paper_reviews", ["tenant_id", "status"]),
    ("ix_message_threads_tenant_conf_archived", "message_threads", ["tenant_id", "conference_id", "archived_at"]),
    (
        "ix_message_participants_thread_lookup",
        "message_participants",
        ["thread_id", "participant_type", "participant_id"],
    ),
    ("ix_conferences_tenant_active", "conferences", ["tenant_id", "is_active"]),
    ("ix_conferences_tenant_published", "conferences", ["tenant_id", "is_published"]),
    ("ix_sponsors_conference_active", "sponsors", ["conference_id", "is_active"]),
    ("ix_locations_tenant_active", "locations", ["tenant_id", "is_active"]),
    ("ix_volunteers_tenant_status", "volunteers", ["tenant_id", "status"]),
]


def upgrade() -> None:
    for name, table, columns in INDEXES:
        op.create_index(name, table, columns)


def downgrade() -> None:
    for name, table, _columns in reversed(INDEXES):
        op.drop_index(name, table_name=table)
