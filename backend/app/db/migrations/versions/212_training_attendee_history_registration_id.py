"""Add ``registration_id`` to ``training_attendee_history``.

Needed so the Cancel Registration flow can still trace a parked attendee
back to their public-portal ``TrainingRegistration`` (and therefore the
``TrainingInvoice``) after park deletes the ``TrainingRegistrationAttendee``
bridge row. Without this column the link survives only in ``source_id``,
which points at the already-deleted bridge and is dangling.

Nullable FK (``ON DELETE SET NULL``) because:
  - Historical rows predating this migration have no registration_id.
  - Offer-origin park events legitimately have no registration.
  - Dropping a registration shouldn't cascade-destroy history; SET NULL
    preserves the audit trail while releasing the reference.

Back-populates existing parked-from-registration rows where we can still
recover the registration (placement_id + attendee email hash unique match).
Rows that can't be resolved stay NULL — Cancel will reject those with a
clear "no resolvable registration" message rather than silently breaking.

Revision ID: 212
Revises: 211
"""

import sqlalchemy as sa
from alembic import op

revision = "212"
down_revision = "211"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "training_attendee_history",
        sa.Column("registration_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_training_attendee_history_registration",
        "training_attendee_history",
        "training_registrations",
        ["registration_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "idx_training_att_history_registration",
        "training_attendee_history",
        ["registration_id"],
    )

    # Best-effort backfill: resolve parked-from-registration history rows.
    # For each history row with event_type='parked' and source_type='registration',
    # find the single registration that (a) is on the same placement, (b) belongs
    # to the same tenant, and (c) contact_email_hash matches the attendee. If exactly
    # one matches, set registration_id. Otherwise leave NULL — Cancel will refuse.
    op.execute(
        """
        UPDATE training_attendee_history h
        SET registration_id = matched.reg_id
        FROM (
            SELECT
                h_inner.id AS history_id,
                r.id AS reg_id
            FROM training_attendee_history h_inner
            JOIN training_attendees a
                ON a.id = h_inner.attendee_id
            JOIN training_registrations r
                ON r.placement_id = h_inner.placement_id
                AND r.tenant_id = h_inner.tenant_id
                AND r.contact_email_hash = a.email_hash
            WHERE h_inner.event_type = 'parked'
                AND h_inner.source_type = 'registration'
                AND h_inner.registration_id IS NULL
                AND h_inner.placement_id IS NOT NULL
        ) AS matched
        WHERE h.id = matched.history_id
        """
    )


def downgrade() -> None:
    op.drop_index("idx_training_att_history_registration", table_name="training_attendee_history")
    op.drop_constraint(
        "fk_training_attendee_history_registration",
        "training_attendee_history",
        type_="foreignkey",
    )
    op.drop_column("training_attendee_history", "registration_id")
