"""Add is_deleted flag to cfp_applicants for soft-anonymization.

Revision ID: 225
Revises: 224
Create Date: 2026-06-10

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "225"
down_revision: Union[str, None] = "224"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "cfp_applicants",
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.create_index("idx_cfp_applicants_is_deleted", "cfp_applicants", ["tenant_id", "is_deleted"])


def downgrade() -> None:
    op.drop_index("idx_cfp_applicants_is_deleted", table_name="cfp_applicants")
    op.drop_column("cfp_applicants", "is_deleted")
