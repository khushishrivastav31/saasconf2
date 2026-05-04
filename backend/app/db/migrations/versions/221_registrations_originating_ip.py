"""Add ``originating_ip`` to public registration tables.

Captured at registration creation time by the public-portal endpoints
(``request.client.host``). Used by the bulk-cancel filter to scope a
cleanup to a known bot burst's source IP. Existing rows stay NULL —
the filter simply won't match them.

VARCHAR(45) accommodates IPv6 (``ffff:ffff:ffff:ffff:ffff:ffff:255.255.255.255``).
Indexed because the bulk-cancel preview filter is the only consumer and
runs ``WHERE originating_ip = ?`` against potentially-large registration
tables; without an index the cleanup query would full-scan.

Revision ID: 221
Revises: 220
"""

import sqlalchemy as sa
from alembic import op

revision = "221"
down_revision = "220"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "registrations",
        sa.Column("originating_ip", sa.String(length=45), nullable=True),
    )
    op.create_index(
        "idx_registrations_originating_ip",
        "registrations",
        ["originating_ip"],
    )

    op.add_column(
        "training_registrations",
        sa.Column("originating_ip", sa.String(length=45), nullable=True),
    )
    op.create_index(
        "idx_training_registrations_originating_ip",
        "training_registrations",
        ["originating_ip"],
    )


def downgrade() -> None:
    op.drop_index(
        "idx_training_registrations_originating_ip",
        table_name="training_registrations",
    )
    op.drop_column("training_registrations", "originating_ip")

    op.drop_index(
        "idx_registrations_originating_ip",
        table_name="registrations",
    )
    op.drop_column("registrations", "originating_ip")
