"""Add pronouns to cfp_applicants table.

Revision ID: 049_applicant_pronouns
Revises: 048_pronouns
Create Date: 2026-01-30

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "049_applicant_pronouns"
down_revision: Union[str, None] = "048_pronouns"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("cfp_applicants", sa.Column("pronouns", sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column("cfp_applicants", "pronouns")
