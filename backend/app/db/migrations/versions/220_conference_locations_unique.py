"""Pin one-conference-per-location at the DB level.

The user-facing model — **each conference owns its locations, no
sharing** — has been the audit-confirmed reality (no location is
linked to more than one conference). This migration makes that
invariant a hard DB constraint instead of an unenforced norm: a
``UNIQUE`` index on ``conference_locations.location_id``. Any future
attempt to link a location to a second conference is rejected at the
DB layer.

This is the smaller "Stage 3a" of the locations split. The fuller
collapse — moving ``conference_id`` onto the ``locations`` row
directly and dropping ``conference_locations`` entirely — would touch
every endpoint, schema, and the link/unlink UI. That's deferred to a
focused PR; pinning the invariant here means anything that depends on
1:N can rely on it now.

Forward-only — pre-migration audit confirmed zero rows would violate
this, so it applies cleanly.

Revision ID: 220
Revises: 219
"""

from alembic import op

revision = "220"
down_revision = "219"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "uq_conference_locations_location",
        "conference_locations",
        ["location_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_conference_locations_location", table_name="conference_locations")
