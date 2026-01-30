"""Add agrees_to_recording field to cfp_applicants.

Revision ID: 034_applicant_recording_consent
Revises: 033_session_types
Create Date: 2026-01-28

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "034_applicant_recording_consent"
down_revision: Union[str, None] = "033_session_types"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "cfp_applicants",
        sa.Column("agrees_to_recording", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("cfp_applicants", "agrees_to_recording")
