"""Add catalog fields to trainings table.

Revision ID: 155
Revises: 154
Create Date: 2026-03-24
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "155"
down_revision = "154"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Basic catalog fields
    op.add_column("trainings", sa.Column("slug", sa.String(100), nullable=True))
    op.add_column("trainings", sa.Column("duration", sa.String(100), nullable=True))
    op.add_column("trainings", sa.Column("content", sa.Text(), nullable=True))
    op.add_column("trainings", sa.Column("regular_price", sa.Numeric(10, 2), nullable=True))
    op.add_column("trainings", sa.Column("early_bird_price", sa.Numeric(10, 2), nullable=True))

    # Foreign key references
    op.add_column(
        "trainings",
        sa.Column(
            "language_id",
            UUID(as_uuid=True),
            sa.ForeignKey("training_languages.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "trainings",
        sa.Column(
            "second_language_id",
            UUID(as_uuid=True),
            sa.ForeignKey("training_languages.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "trainings",
        sa.Column("syllabus_id", UUID(as_uuid=True), sa.ForeignKey("syllabi.id", ondelete="SET NULL"), nullable=True),
    )
    op.add_column(
        "trainings",
        sa.Column(
            "theme_id", UUID(as_uuid=True), sa.ForeignKey("training_themes.id", ondelete="SET NULL"), nullable=True
        ),
    )
    op.add_column(
        "trainings",
        sa.Column(
            "certification_body_id",
            UUID(as_uuid=True),
            sa.ForeignKey("certification_bodies.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )

    # Indexes on FK columns
    op.create_index("ix_trainings_language_id", "trainings", ["language_id"])
    op.create_index("ix_trainings_second_language_id", "trainings", ["second_language_id"])
    op.create_index("ix_trainings_syllabus_id", "trainings", ["syllabus_id"])
    op.create_index("ix_trainings_theme_id", "trainings", ["theme_id"])
    op.create_index("ix_trainings_certification_body_id", "trainings", ["certification_body_id"])

    # Unique partial index on (slug, tenant_id) where slug is not null
    op.execute("CREATE UNIQUE INDEX uq_trainings_slug_tenant ON trainings (slug, tenant_id) WHERE slug IS NOT NULL")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_trainings_slug_tenant")
    op.drop_index("ix_trainings_certification_body_id", table_name="trainings")
    op.drop_index("ix_trainings_theme_id", table_name="trainings")
    op.drop_index("ix_trainings_syllabus_id", table_name="trainings")
    op.drop_index("ix_trainings_second_language_id", table_name="trainings")
    op.drop_index("ix_trainings_language_id", table_name="trainings")
    op.drop_column("trainings", "certification_body_id")
    op.drop_column("trainings", "theme_id")
    op.drop_column("trainings", "syllabus_id")
    op.drop_column("trainings", "second_language_id")
    op.drop_column("trainings", "language_id")
    op.drop_column("trainings", "early_bird_price")
    op.drop_column("trainings", "regular_price")
    op.drop_column("trainings", "content")
    op.drop_column("trainings", "duration")
    op.drop_column("trainings", "slug")
