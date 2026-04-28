"""Generalize ``screen_overlays`` to support tenant-wide trainings overlays.

The existing ``screen_overlays`` row is conference-scoped: ``conference_id``
is non-null, and the portal looks up active overlays for one conference.
Trainings need the same feature but at a different scope — overlays apply
tenant-wide for portal users on the trainings module, with no per-training
fan-out today (matches the user-visible UI: a single Screen Overlays tab
under Trainings → Settings, no per-placement variant).

This migration:

* Adds a ``domain`` discriminator (``conference`` | ``training``).
  Existing rows backfill to ``conference``; the new check constraint
  pins the allowed values.
* Drops the ``NOT NULL`` on ``conference_id`` so training-domain rows
  can leave it ``NULL``. A second check constraint enforces the
  pairing — conference rows must carry a ``conference_id``, training
  rows must not — so we don't end up with bogus mixes via direct SQL.
* Adds an index on ``(tenant_id, domain, is_active, trigger_type)`` so
  the trainings portal lookup hits an index rather than scanning every
  overlay in the tenant.

Revision ID: 216
Revises: 215
"""

import sqlalchemy as sa
from alembic import op

revision = "216"
down_revision = "215"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "screen_overlays",
        sa.Column("domain", sa.String(20), nullable=True),
    )
    op.execute("UPDATE screen_overlays SET domain = 'conference' WHERE domain IS NULL")
    op.alter_column("screen_overlays", "domain", nullable=False, server_default="conference")
    op.create_check_constraint(
        "ck_screen_overlays_domain",
        "screen_overlays",
        "domain IN ('conference', 'training')",
    )
    op.alter_column("screen_overlays", "conference_id", nullable=True)
    op.create_check_constraint(
        "ck_screen_overlays_domain_anchor",
        "screen_overlays",
        "(domain = 'conference' AND conference_id IS NOT NULL) OR (domain = 'training' AND conference_id IS NULL)",
    )
    op.create_index(
        "ix_screen_overlays_tenant_domain_active",
        "screen_overlays",
        ["tenant_id", "domain", "is_active", "trigger_type"],
    )


def downgrade() -> None:
    # Refuse to downgrade if any training-domain rows exist — they would
    # have NULL conference_id and the NOT NULL re-add would fail.
    op.execute(
        """
        DO $$
        DECLARE
            training_count INTEGER;
        BEGIN
            SELECT COUNT(*) INTO training_count
            FROM screen_overlays
            WHERE domain = 'training';
            IF training_count > 0 THEN
                RAISE EXCEPTION
                    'Cannot downgrade: % screen_overlays are training-domain. Delete them first.',
                    training_count;
            END IF;
        END $$;
        """
    )
    op.drop_index("ix_screen_overlays_tenant_domain_active", table_name="screen_overlays")
    op.drop_constraint("ck_screen_overlays_domain_anchor", "screen_overlays", type_="check")
    op.alter_column("screen_overlays", "conference_id", nullable=False)
    op.drop_constraint("ck_screen_overlays_domain", "screen_overlays", type_="check")
    op.drop_column("screen_overlays", "domain")
