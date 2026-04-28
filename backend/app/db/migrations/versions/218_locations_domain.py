"""Split ``locations`` into per-domain pools (conference vs training).

Until now, locations were a flat tenant-scoped pool shared between the
conference and trainings UIs. The trainings settings tab let admins
delete a location with no conference scope; ``conference_locations.location_id``
has ``ON DELETE CASCADE``, so a delete from the trainings side could
silently strip a conference of its linked locations. The fix is to split
the pool: each location belongs to one domain.

Backfill rule (option (a) — preserve every existing conference link):
  * Any location currently referenced by ``conference_locations`` →
    ``domain = 'conference'``.
  * Everything else → ``domain = 'training'``.

So the conferences keep their linked rooms; rooms only ever managed from
the trainings UI become training-only. If a tenant needs the same
physical venue in both domains they can recreate it once per domain
(intentional cost of the split — a tri-state "shared" domain would
recreate the bug).

There is no row-level anchor on ``locations`` (the conference link is
via ``conference_locations``), so this migration does not use the
``add_domain_discriminator`` helper from migration helpers — it writes
the column + CHECK + index directly. The shape matches 216/217 minus
the paired anchor CHECK.

Revision ID: 218
Revises: 217
"""

import sqlalchemy as sa
from alembic import op

revision = "218"
down_revision = "217"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "locations",
        sa.Column("domain", sa.String(20), nullable=True),
    )
    # Backfill: anything linked to a conference is conference-domain.
    op.execute(
        """
        UPDATE locations
        SET domain = 'conference'
        WHERE id IN (SELECT DISTINCT location_id FROM conference_locations)
        """
    )
    # Everything else (never linked) is training-domain.
    op.execute("UPDATE locations SET domain = 'training' WHERE domain IS NULL")
    op.alter_column("locations", "domain", nullable=False, server_default="conference")
    op.create_check_constraint(
        "ck_locations_domain",
        "locations",
        "domain IN ('conference', 'training')",
    )
    op.create_index(
        "ix_locations_tenant_domain_type",
        "locations",
        ["tenant_id", "domain", "location_type"],
    )


def downgrade() -> None:
    # Refuse to downgrade if any training-domain rows exist — losing the
    # discriminator would silently re-mix the pools.
    op.execute(
        """
        DO $$
        DECLARE
            training_count INTEGER;
        BEGIN
            SELECT COUNT(*) INTO training_count
            FROM locations
            WHERE domain = 'training';
            IF training_count > 0 THEN
                RAISE EXCEPTION
                    'Cannot downgrade: % locations are training-domain. Reclassify them first.',
                    training_count;
            END IF;
        END $$;
        """
    )
    op.drop_index("ix_locations_tenant_domain_type", table_name="locations")
    op.drop_constraint("ck_locations_domain", "locations", type_="check")
    op.drop_column("locations", "domain")
