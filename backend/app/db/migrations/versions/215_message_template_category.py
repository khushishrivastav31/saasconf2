"""Add ``category`` to ``message_templates`` so the trainings module can keep its own pool.

Without this, the training-side template list (``/trainings/messaging/templates``)
also surfaces every conference admin's template — which is wrong: those are
written for CFP applicants and use conference-only placeholders. The training
admin's Compose dialog ends up offering "Working Group" (a conference template)
with no obvious way to tell it apart.

We add a discriminator, default existing rows to ``conference`` (every
template predating this PR was created via the conference admin endpoint),
and let the new training-side endpoint filter by ``category='training'``.
The conference endpoint stays unscoped for back-compat — every existing
row is conference-category anyway.

Revision ID: 215
Revises: 214
"""

import sqlalchemy as sa
from alembic import op

revision = "215"
down_revision = "214"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "message_templates",
        sa.Column("category", sa.String(20), nullable=True),
    )
    op.execute("UPDATE message_templates SET category = 'conference' WHERE category IS NULL")
    op.alter_column("message_templates", "category", nullable=False)
    op.create_check_constraint(
        "ck_message_templates_category",
        "message_templates",
        "category IN ('conference', 'training')",
    )
    op.create_index(
        "idx_message_templates_tenant_category",
        "message_templates",
        ["tenant_id", "category"],
    )


def downgrade() -> None:
    op.drop_index("idx_message_templates_tenant_category", table_name="message_templates")
    op.drop_constraint("ck_message_templates_category", "message_templates", type_="check")
    op.drop_column("message_templates", "category")
