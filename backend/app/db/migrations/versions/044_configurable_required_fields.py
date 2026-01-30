"""Replace require_* booleans with flexible JSONB arrays for configurable required fields.

Revision ID: 044
Revises: 043
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "044_configurable_required_fields"
down_revision = "043_cfp_review_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add new JSONB columns
    op.add_column(
        "call_for_papers",
        sa.Column("required_speaker_fields", JSONB, nullable=False, server_default="[]"),
    )
    op.add_column(
        "call_for_papers",
        sa.Column("required_paper_fields", JSONB, nullable=False, server_default="[]"),
    )

    # 2. Data migration: convert old booleans into the new arrays
    op.execute("""
        UPDATE call_for_papers
        SET
            required_speaker_fields = (
                SELECT jsonb_agg(f)
                FROM (
                    SELECT unnest(ARRAY[
                        CASE WHEN require_bio    THEN 'bio'     END,
                        CASE WHEN require_picture THEN 'picture' END,
                        CASE WHEN require_video   THEN 'video'   END
                    ]) AS f
                ) sub
                WHERE f IS NOT NULL
            ),
            required_paper_fields = (
                SELECT jsonb_agg(f)
                FROM (
                    SELECT unnest(ARRAY[
                        CASE WHEN require_abstract THEN 'abstract_short' END
                    ]) AS f
                ) sub
                WHERE f IS NOT NULL
            )
    """)

    # Handle NULLs from jsonb_agg when no booleans were true
    op.execute("""
        UPDATE call_for_papers
        SET required_speaker_fields = '[]'::jsonb
        WHERE required_speaker_fields IS NULL
    """)
    op.execute("""
        UPDATE call_for_papers
        SET required_paper_fields = '[]'::jsonb
        WHERE required_paper_fields IS NULL
    """)

    # 3. Drop old boolean columns
    op.drop_column("call_for_papers", "require_abstract")
    op.drop_column("call_for_papers", "require_bio")
    op.drop_column("call_for_papers", "require_picture")
    op.drop_column("call_for_papers", "require_video")


def downgrade() -> None:
    # 1. Re-add boolean columns
    op.add_column(
        "call_for_papers",
        sa.Column("require_abstract", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.add_column(
        "call_for_papers",
        sa.Column("require_bio", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.add_column(
        "call_for_papers",
        sa.Column("require_picture", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "call_for_papers",
        sa.Column("require_video", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    # 2. Reverse data migration
    op.execute("""
        UPDATE call_for_papers
        SET
            require_abstract = required_paper_fields ? 'abstract_short',
            require_bio      = required_speaker_fields ? 'bio',
            require_picture  = required_speaker_fields ? 'picture',
            require_video    = required_speaker_fields ? 'video'
    """)

    # 3. Drop new columns
    op.drop_column("call_for_papers", "required_speaker_fields")
    op.drop_column("call_for_papers", "required_paper_fields")
