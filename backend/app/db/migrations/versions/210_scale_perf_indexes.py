"""Add indexes for two hot scans surfaced by the April 2026 scale audit.

At a few-thousand-row scale two queries turned up in query-plan checks as
doing a full-table scan / bitmap-AND across three single-column indexes:

1. Stripe payment-intent sync (``GET`` / cron): filters
   ``Invoice.status IN ('sent', 'overdue')`` with no tenant or conference
   predicate. The ``invoices`` table had no ``status`` index, so this
   cost a seq scan on every sync tick. Add ``idx_invoices_status``.

2. Placement deactivation check in
   ``/trainings/program-years/{id}/placements/{id}``: filters
   ``(placement_id, tenant_id, status != 'cancelled')``. The table had
   three separate single-column indexes (``placement``, ``tenant``,
   ``status``) that PG could bitmap-AND, but a compound leading with
   ``tenant_id`` + ``placement_id`` makes this an index-only scan and
   also accelerates the same shape on ``registrations.py`` list. Add
   ``idx_training_reg_tenant_placement_status``.

Both indexes are additive and reversible. No data backfill, no lock held
on writes beyond the usual ``CREATE INDEX`` share-update-exclusive. On
a <10k-row table the build is sub-second; in staging/production this
migration should run in the normal deploy window.

Revision ID: 210
Revises: 209
"""

from alembic import op

revision = "210"
down_revision = "209"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("idx_invoices_status", "invoices", ["status"])
    op.create_index(
        "idx_training_reg_tenant_placement_status",
        "training_registrations",
        ["tenant_id", "placement_id", "status"],
    )


def downgrade() -> None:
    op.drop_index("idx_training_reg_tenant_placement_status", table_name="training_registrations")
    op.drop_index("idx_invoices_status", table_name="invoices")
