"""Add review form settings table and internal_comment column.

Revision ID: 046_review_form_settings
Revises: 045_review_criteria_scoring
Create Date: 2026-01-29

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "046_review_form_settings"
down_revision: Union[str, None] = "045_review_criteria_scoring"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. Add internal_comment column to paper_reviews ──────────────────
    op.add_column(
        "paper_reviews",
        sa.Column("internal_comment", sa.Text(), nullable=True),
    )

    # ── 2. review_form_settings table ────────────────────────────────────
    op.create_table(
        "review_form_settings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "conference_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("conferences.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("enable_speaker_feedback", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("enable_internal_comment", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_unique_constraint("uq_review_form_settings_conference", "review_form_settings", ["conference_id"])
    op.create_index("idx_review_form_settings_tenant", "review_form_settings", ["tenant_id"])
    op.create_index("idx_review_form_settings_conference", "review_form_settings", ["conference_id"])

    # ── Enable RLS ───────────────────────────────────────────────────────
    op.execute("ALTER TABLE review_form_settings ENABLE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_isolation ON review_form_settings "
        "USING (tenant_id = current_setting('app.current_tenant_id')::uuid)"
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON review_form_settings")
    op.drop_table("review_form_settings")
    op.drop_column("paper_reviews", "internal_comment")
