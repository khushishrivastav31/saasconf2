"""Relax ``message_threads.conference_id`` to nullable.

PR 1 (migration 213) added the generic ``(domain, domain_entity_id)`` anchor
alongside ``conference_id``. PR 3 wires up training broadcasts, which create
threads anchored on a ``TrainingRegistration`` instead of a ``Conference`` —
so the row needs ``conference_id = NULL`` and ``domain = 'training'``.

This migration only relaxes the NOT NULL on ``conference_id``. The FK and
its cascade behavior stay in place: any thread that *does* set
``conference_id`` (every existing row + every conference-domain thread
created going forward) still cascade-deletes when the conference is
removed. Training threads sit at NULL and are unaffected by that cascade.

Existing conference-side queries (``MessageThread.conference_id == X``)
keep working unchanged: training threads have NULL there and naturally
fall outside that filter, which is the correct behavior.

Revision ID: 214
Revises: 213
"""

from alembic import op

revision = "214"
down_revision = "213"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("message_threads", "conference_id", nullable=True)


def downgrade() -> None:
    # Refuse to downgrade if any training-domain rows exist — those would
    # have NULL conference_id and the NOT NULL re-add would fail mid-flight.
    # Caller must delete training threads first.
    op.execute(
        """
        DO $$
        DECLARE
            training_count INTEGER;
        BEGIN
            SELECT COUNT(*) INTO training_count
            FROM message_threads
            WHERE conference_id IS NULL;
            IF training_count > 0 THEN
                RAISE EXCEPTION
                    'Cannot downgrade: % message_threads have NULL conference_id (training threads). Delete them first.',
                    training_count;
            END IF;
        END $$;
        """
    )
    op.alter_column("message_threads", "conference_id", nullable=False)
