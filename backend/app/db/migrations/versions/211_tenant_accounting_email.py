"""Add ``accounting_email`` to ``tenants``.

Lets the operator configure a finance/backoffice address that is CC'd on
every outgoing invoice and credit-note email alongside the scope-specific
contact email (conference ``contact_email`` for conference invoices, the
Training Company email for training invoices).

Nullable at the DB layer so existing tenants aren't broken. Enforcement
(invoice send requires it to be set) lives in the send endpoints, not the
column constraint — keeping the schema tolerant and the error message
close to the admin action that triggered it.

Revision ID: 211
Revises: 210
"""

import sqlalchemy as sa
from alembic import op

revision = "211"
down_revision = "210"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("accounting_email", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("tenants", "accounting_email")
