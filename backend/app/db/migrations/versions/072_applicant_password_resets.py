"""Add applicant password reset tokens table.

Revision ID: 072_applicant_password_resets
Revises: 071_messaging_system
Create Date: 2026-02-14
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers
revision: str = "072_applicant_password_resets"
down_revision: str | None = "071_messaging_system"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "applicant_password_resets",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "applicant_id", UUID(as_uuid=True), sa.ForeignKey("cfp_applicants.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("idx_applicant_password_reset_hash", "applicant_password_resets", ["token_hash"])
    op.create_index("idx_applicant_password_reset_applicant", "applicant_password_resets", ["applicant_id"])


def downgrade() -> None:
    op.drop_index("idx_applicant_password_reset_applicant", table_name="applicant_password_resets")
    op.drop_index("idx_applicant_password_reset_hash", table_name="applicant_password_resets")
    op.drop_table("applicant_password_resets")
