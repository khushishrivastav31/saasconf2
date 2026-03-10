"""Add registration_question_answers table.

Stores applicant responses to per-conference registration questions
defined in conference.settings["registration_questions"].

Revision ID: 127
Revises: 126
"""

import sqlalchemy as sa
from alembic import op

revision = "127"
down_revision = "126"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "registration_question_answers",
        sa.Column("id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.UUID(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("conference_id", sa.UUID(), sa.ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False),
        sa.Column("applicant_id", sa.UUID(), sa.ForeignKey("cfp_applicants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("question_id", sa.String(36), nullable=False),
        sa.Column("answer_value", sa.Text(), nullable=False),
        sa.Column("answered_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("conference_id", "applicant_id", "question_id", name="uq_reg_question_answer"),
    )

    op.create_index("ix_reg_question_answers_tenant", "registration_question_answers", ["tenant_id"])
    op.create_index(
        "ix_reg_question_answers_conf_applicant",
        "registration_question_answers",
        ["conference_id", "applicant_id"],
    )

    # RLS policy
    op.execute("ALTER TABLE registration_question_answers ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY tenant_isolation ON registration_question_answers
        USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON registration_question_answers")
    op.execute("ALTER TABLE registration_question_answers DISABLE ROW LEVEL SECURITY")
    op.drop_index("ix_reg_question_answers_conf_applicant", table_name="registration_question_answers")
    op.drop_index("ix_reg_question_answers_tenant", table_name="registration_question_answers")
    op.drop_table("registration_question_answers")
