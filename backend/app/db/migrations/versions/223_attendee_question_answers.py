"""Allow portal_users to answer conference registration questions.

Adds ``portal_user_id`` to ``registration_question_answers`` and makes
``applicant_id`` nullable so either a CFP applicant or a portal-only
attendee can own an answer row.

- CFP applicant rows: ``applicant_id`` set, ``portal_user_id = NULL``
- Portal attendee rows: ``portal_user_id`` set, ``applicant_id = NULL``

The old unique constraint covers only non-null ``applicant_id`` pairs once
the column becomes nullable (PostgreSQL treats NULL ≠ NULL in constraints).
A companion partial unique index enforces uniqueness on the portal-user side.

Revision ID: 223
Revises: 222
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "223"
down_revision = "222"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Make applicant_id nullable (existing rows keep their value)
    op.alter_column(
        "registration_question_answers",
        "applicant_id",
        nullable=True,
    )

    # Add portal_user_id FK column
    op.add_column(
        "registration_question_answers",
        sa.Column("portal_user_id", UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_rqa_portal_user",
        "registration_question_answers",
        "portal_users",
        ["portal_user_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # Index for pending-questions lookup by portal user
    op.create_index(
        "ix_reg_question_answers_portal_user_conf",
        "registration_question_answers",
        ["portal_user_id", "conference_id"],
    )

    # Partial unique index for portal-user answers (mirrors the existing
    # constraint which implicitly only covers non-null applicant_id rows)
    op.execute(
        """
        CREATE UNIQUE INDEX uq_rqa_portal_user_question
        ON registration_question_answers (conference_id, portal_user_id, question_id)
        WHERE portal_user_id IS NOT NULL
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_rqa_portal_user_question")
    op.drop_index("ix_reg_question_answers_portal_user_conf", table_name="registration_question_answers")
    op.drop_constraint("fk_rqa_portal_user", "registration_question_answers", type_="foreignkey")
    op.drop_column("registration_question_answers", "portal_user_id")
    op.alter_column(
        "registration_question_answers",
        "applicant_id",
        nullable=False,
    )
