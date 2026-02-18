"""Add review criteria and scoring tables for structured paper reviews.

Revision ID: 045_review_criteria_scoring
Revises: 044_configurable_required_fields
Create Date: 2026-01-29

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "045_review_criteria_scoring"
down_revision: Union[str, None] = "044_configurable_required_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. review_score_scales ──────────────────────────────────────────
    op.create_table(
        "review_score_scales",
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
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("scale_type", sa.String(20), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_index("idx_review_score_scales_tenant", "review_score_scales", ["tenant_id"])
    op.create_index("idx_review_score_scales_conference", "review_score_scales", ["conference_id"])
    op.create_index(
        "idx_review_score_scales_name", "review_score_scales", ["tenant_id", "conference_id", "name"], unique=True
    )

    # ── 2. review_scale_options ─────────────────────────────────────────
    op.create_table(
        "review_scale_options",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "scale_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("review_score_scales.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("label", sa.String(100), nullable=False),
        sa.Column("numeric_value", sa.Float(), nullable=True),
        sa.Column("is_unsure", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_index("idx_review_scale_options_scale", "review_scale_options", ["scale_id"])

    # ── 3. review_criteria ──────────────────────────────────────────────
    op.create_table(
        "review_criteria",
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
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_index("idx_review_criteria_tenant", "review_criteria", ["tenant_id"])
    op.create_index("idx_review_criteria_conference", "review_criteria", ["conference_id"])
    op.create_index(
        "idx_review_criteria_title", "review_criteria", ["tenant_id", "conference_id", "title"], unique=True
    )

    # ── 4. review_questions ─────────────────────────────────────────────
    op.create_table(
        "review_questions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "criterion_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("review_criteria.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "conference_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("conferences.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("help_text", sa.Text(), nullable=True),
        sa.Column("question_type", sa.String(20), nullable=False, server_default=sa.text("'scored'")),
        sa.Column(
            "score_scale_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("review_score_scales.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("weight", sa.Float(), nullable=False, server_default=sa.text("1.0")),
        sa.Column("comment_requirement", sa.String(30), nullable=False, server_default=sa.text("'optional'")),
        sa.Column("low_score_threshold", sa.Float(), nullable=True),
        sa.Column("show_to_reviewers", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("count_in_score", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_index("idx_review_questions_criterion", "review_questions", ["criterion_id"])
    op.create_index("idx_review_questions_conference", "review_questions", ["conference_id"])

    # ── 5. paper_reviews ────────────────────────────────────────────────
    op.create_table(
        "paper_reviews",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "assignment_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("cfp_paper_assignments.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "paper_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("cfp_papers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "committee_member_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("cfp_committee_members.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'draft'")),
        sa.Column("total_score", sa.Float(), nullable=True),
        sa.Column("speaker_feedback", sa.Text(), nullable=True),
        sa.Column("config_snapshot", postgresql.JSONB(), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_unique_constraint("uq_paper_review_assignment", "paper_reviews", ["assignment_id"])
    op.create_index("idx_paper_reviews_tenant", "paper_reviews", ["tenant_id"])
    op.create_index("idx_paper_reviews_paper", "paper_reviews", ["paper_id"])
    op.create_index("idx_paper_reviews_assignment", "paper_reviews", ["assignment_id"])
    op.create_index("idx_paper_reviews_member", "paper_reviews", ["committee_member_id"])

    # ── 6. review_answers ───────────────────────────────────────────────
    op.create_table(
        "review_answers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "review_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("paper_reviews.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "question_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("review_questions.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "selected_option_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("review_scale_options.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("numeric_score", sa.Float(), nullable=True),
        sa.Column("is_unsure", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("snapshot_weight", sa.Float(), nullable=True),
        sa.Column("snapshot_question_text", sa.Text(), nullable=True),
        sa.Column("snapshot_option_label", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_unique_constraint("uq_review_answer_question", "review_answers", ["review_id", "question_id"])
    op.create_index("idx_review_answers_review", "review_answers", ["review_id"])
    op.create_index("idx_review_answers_question", "review_answers", ["question_id"])

    # ── Enable RLS on all new tables ────────────────────────────────────
    for table in [
        "review_score_scales",
        "review_scale_options",
        "review_criteria",
        "review_questions",
        "paper_reviews",
        "review_answers",
    ]:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")

    # Create tenant-isolation policies for tables that carry tenant_id
    for table in [
        "review_score_scales",
        "review_criteria",
        "review_questions",
        "paper_reviews",
    ]:
        op.execute(
            f"CREATE POLICY tenant_isolation ON {table} "
            f"USING (tenant_id = current_setting('app.current_tenant_id')::uuid)"
        )

    # review_scale_options inherits isolation through its FK to review_score_scales
    op.execute(
        "CREATE POLICY tenant_isolation ON review_scale_options "
        "USING (scale_id IN (SELECT id FROM review_score_scales WHERE tenant_id = current_setting('app.current_tenant_id')::uuid))"
    )

    # review_answers inherits isolation through its FK to paper_reviews
    op.execute(
        "CREATE POLICY tenant_isolation ON review_answers "
        "USING (review_id IN (SELECT id FROM paper_reviews WHERE tenant_id = current_setting('app.current_tenant_id')::uuid))"
    )


def downgrade() -> None:
    # Drop RLS policies
    for table in [
        "review_answers",
        "paper_reviews",
        "review_questions",
        "review_criteria",
        "review_scale_options",
        "review_score_scales",
    ]:
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")

    # Drop tables in reverse order
    op.drop_table("review_answers")
    op.drop_table("paper_reviews")
    op.drop_table("review_questions")
    op.drop_table("review_criteria")
    op.drop_table("review_scale_options")
    op.drop_table("review_score_scales")
