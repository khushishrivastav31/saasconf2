"""Genericize ``message_threads`` anchor: add ``domain`` + ``domain_entity_id``.

Foundation for training-module messaging. Today every thread is anchored to
a conference (``message_threads.conference_id``). Trainings need their own
broadcast anchor (``training_registrations``), so the thread schema grows
a generic ``(domain, domain_entity_id)`` pair.

PR 1 is purely additive:
  - Add columns nullable, backfill from ``conference_id``, then NOT NULL.
  - CHECK constraint pins ``domain`` to the known values.
  - Composite index on ``(tenant_id, domain, domain_entity_id)`` so the
    training-side queries (PR 3) hit an index from day one.
  - ``conference_id`` stays NOT NULL with its FK — every existing query
    keeps working unchanged. A later PR will relax it once training
    threads need to insert NULLs there.

Revision ID: 213
Revises: 212
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "213"
down_revision = "212"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("message_threads", sa.Column("domain", sa.String(20), nullable=True))
    op.add_column("message_threads", sa.Column("domain_entity_id", UUID(as_uuid=True), nullable=True))

    op.execute(
        """
        UPDATE message_threads
        SET domain = 'conference',
            domain_entity_id = conference_id
        WHERE domain IS NULL
        """
    )

    op.alter_column("message_threads", "domain", nullable=False)
    op.alter_column("message_threads", "domain_entity_id", nullable=False)

    op.create_check_constraint(
        "ck_message_threads_domain",
        "message_threads",
        "domain IN ('conference', 'training')",
    )
    op.create_index(
        "idx_message_threads_domain_entity",
        "message_threads",
        ["tenant_id", "domain", "domain_entity_id"],
    )


def downgrade() -> None:
    op.drop_index("idx_message_threads_domain_entity", table_name="message_threads")
    op.drop_constraint("ck_message_threads_domain", "message_threads", type_="check")
    op.drop_column("message_threads", "domain_entity_id")
    op.drop_column("message_threads", "domain")
