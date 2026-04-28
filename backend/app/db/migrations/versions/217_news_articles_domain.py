"""Generalize ``news_articles`` to support tenant-wide trainings news.

Same shape as migration 216 (``screen_overlays_domain``): the existing
``news_articles`` row is conference-scoped (``conference_id`` non-null).
Trainings need the same feature, scoped tenant-wide so admins can post
News articles that surface to portal users on the trainings module
without choosing a conference.

* Add ``domain`` discriminator (``conference`` | ``training``).
  Existing rows backfill to ``conference``; CHECK constraint pins the
  allowed values.
* Drop ``NOT NULL`` on ``conference_id``. Pair-CHECK enforces:
  conference rows must carry a ``conference_id``, training rows must
  not — catches bogus mixes via direct SQL.
* New compound index ``(tenant_id, domain, is_published, published_at)``
  so the portal lookup hits an index rather than scanning every news
  row in the tenant.

Revision ID: 217
Revises: 216
"""

import sqlalchemy as sa
from alembic import op

revision = "217"
down_revision = "216"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "news_articles",
        sa.Column("domain", sa.String(20), nullable=True),
    )
    op.execute("UPDATE news_articles SET domain = 'conference' WHERE domain IS NULL")
    op.alter_column("news_articles", "domain", nullable=False, server_default="conference")
    op.create_check_constraint(
        "ck_news_articles_domain",
        "news_articles",
        "domain IN ('conference', 'training')",
    )
    op.alter_column("news_articles", "conference_id", nullable=True)
    op.create_check_constraint(
        "ck_news_articles_domain_anchor",
        "news_articles",
        "(domain = 'conference' AND conference_id IS NOT NULL) OR (domain = 'training' AND conference_id IS NULL)",
    )
    op.create_index(
        "ix_news_articles_tenant_domain_published",
        "news_articles",
        ["tenant_id", "domain", "is_published", "published_at"],
    )


def downgrade() -> None:
    op.execute(
        """
        DO $$
        DECLARE
            training_count INTEGER;
        BEGIN
            SELECT COUNT(*) INTO training_count
            FROM news_articles
            WHERE domain = 'training';
            IF training_count > 0 THEN
                RAISE EXCEPTION
                    'Cannot downgrade: % news_articles are training-domain. Delete them first.',
                    training_count;
            END IF;
        END $$;
        """
    )
    op.drop_index("ix_news_articles_tenant_domain_published", table_name="news_articles")
    op.drop_constraint("ck_news_articles_domain_anchor", "news_articles", type_="check")
    op.alter_column("news_articles", "conference_id", nullable=False)
    op.drop_constraint("ck_news_articles_domain", "news_articles", type_="check")
    op.drop_column("news_articles", "domain")
