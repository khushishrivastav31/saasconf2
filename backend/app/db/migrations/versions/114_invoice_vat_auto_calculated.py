"""Add vat_auto_calculated column to invoices table.

Tracks whether VAT was auto-calculated or manually overridden.

Revision ID: 114
Revises: 113
Create Date: 2026-03-06
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "114"
down_revision: Union[str, None] = "113"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add vat_auto_calculated column to invoices table."""
    op.add_column(
        "invoices",
        sa.Column("vat_auto_calculated", sa.Boolean, nullable=False, server_default="false"),
    )


def downgrade() -> None:
    """Remove vat_auto_calculated column from invoices table."""
    op.drop_column("invoices", "vat_auto_calculated")
