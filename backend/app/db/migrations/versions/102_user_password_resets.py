"""Add user password reset tokens table.

Mirrors applicant_password_resets but for admin users (users table).

Revision ID: 102_user_pw_resets
Revises: 101_fiscal_rep_vat_rates
Create Date: 2026-02-28
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "102_user_pw_resets"
down_revision: Union[str, None] = "101_fiscal_rep_vat_rates"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_password_resets",
        sa.Column(
            "id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("idx_user_password_reset_hash", "user_password_resets", ["token_hash"])
    op.create_index("idx_user_password_reset_user", "user_password_resets", ["user_id"])


def downgrade() -> None:
    op.drop_table("user_password_resets")
