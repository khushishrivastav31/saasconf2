"""Create news_articles table.

Revision ID: 080_news_articles
Revises: 079_add_review_must_have
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "080_news_articles"
down_revision: str | None = "079_add_review_must_have"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "news_articles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "conference_id",
            UUID(as_uuid=True),
            sa.ForeignKey("conferences.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("body_html", sa.Text(), nullable=False),
        sa.Column("is_published", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_news_articles_tenant_id", "news_articles", ["tenant_id"])
    op.create_index("ix_news_articles_conference_id", "news_articles", ["conference_id"])
    op.create_index(
        "ix_news_articles_published",
        "news_articles",
        ["conference_id", "is_published", "published_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_news_articles_published", table_name="news_articles")
    op.drop_index("ix_news_articles_conference_id", table_name="news_articles")
    op.drop_index("ix_news_articles_tenant_id", table_name="news_articles")
    op.drop_table("news_articles")
