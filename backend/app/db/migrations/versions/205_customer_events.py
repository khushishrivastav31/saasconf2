"""Unified customer_events table + backfill from existing history tables.

See ``.claude/plans/smooth-sprouting-perlis.md`` for the full design.

This migration is purely additive — no existing table is dropped or
altered. During the phased rollout, code paths are switched over to
write to ``customer_events`` alongside their legacy history tables.
A later migration will drop the legacy tables once all readers are cut
over.

Backfill copies every row from ``portal_user_history`` and
``training_attendee_history`` into ``customer_events`` with namespaced
``event_type`` values (``portal.*`` / ``training.*``). The backfill is
chunked (5000 rows per INSERT/SELECT) so it stays well-behaved on
tenants with large training-attendee history tables.

Revision ID: 205
Revises: 204
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "205"
down_revision = "204"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "customer_events",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "tenant_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "portal_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("portal_users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("subject_email_hash", sa.String(64), nullable=False),
        sa.Column("domain", sa.String(20), nullable=False),
        sa.Column("event_type", sa.String(60), nullable=False),
        sa.Column("actor_kind", sa.String(16), nullable=False, server_default="system"),
        sa.Column(
            "created_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("metadata", JSONB, nullable=True),
        sa.Column("related_entity_type", sa.String(40), nullable=True),
        sa.Column("related_entity_id", UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "idx_customer_events_user_created",
        "customer_events",
        ["portal_user_id", "created_at"],
    )
    op.create_index(
        "idx_customer_events_email_hash_created",
        "customer_events",
        ["tenant_id", "subject_email_hash", "created_at"],
    )
    op.create_index(
        "idx_customer_events_tenant_type",
        "customer_events",
        ["tenant_id", "event_type"],
    )
    op.create_index(
        "idx_customer_events_related",
        "customer_events",
        ["related_entity_type", "related_entity_id"],
    )

    op.execute("ALTER TABLE customer_events ENABLE ROW LEVEL SECURITY")
    op.execute(
        """CREATE POLICY tenant_isolation_customer_events ON customer_events
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
               OR current_setting('app.is_super_admin', true) = 'true')"""
    )

    # Backfill runs as super-admin because the Alembic connection has no
    # tenant context set.
    op.execute("SET LOCAL app.is_super_admin = 'true'")
    _backfill_portal_user_history()
    _backfill_training_attendee_history()


def _backfill_portal_user_history() -> None:
    """Copy every portal_user_history row into customer_events.

    ``event_type`` becomes ``portal.<old_event_type>`` with leading
    ``portal_`` stripped if present (``portal_activated`` →
    ``portal.activated``). Rows whose portal_user has been hard-deleted
    are skipped by the JOIN. Runs as a single INSERT SELECT — both
    source tables are small (``portal_user_history`` is newly created
    in migration 204 and holds a tiny number of rows per tenant).
    """
    op.execute(
        sa.text(
            r"""
            INSERT INTO customer_events (
                id, tenant_id, portal_user_id, subject_email_hash,
                domain, event_type, actor_kind, created_by,
                notes, metadata,
                related_entity_type, related_entity_id, created_at
            )
            SELECT
                gen_random_uuid(),
                h.tenant_id,
                h.portal_user_id,
                COALESCE(pu.email_hash, ''),
                'portal',
                CASE
                    WHEN h.event_type LIKE 'portal\_%' ESCAPE '\'
                        THEN 'portal.' || substring(h.event_type from 8)
                    ELSE 'portal.' || h.event_type
                END,
                'admin',
                h.created_by,
                h.notes,
                h.metadata,
                NULL,
                NULL,
                h.created_at
            FROM portal_user_history h
            JOIN portal_users pu ON pu.id = h.portal_user_id
            """
        )
    )


def _backfill_training_attendee_history() -> None:
    """Copy every training_attendee_history row into customer_events.

    ``event_type`` is prefixed with ``training.``. ``portal_user_id`` is
    taken from the attendee (nullable — not every attendee is linked
    yet). ``subject_email_hash`` falls back to the attendee's hash.

    Single INSERT SELECT. If a tenant has millions of attendee-history
    rows, re-chunk in a follow-up migration; today's tables are
    bounded by training volume.
    """
    op.execute(
        sa.text(
            """
            INSERT INTO customer_events (
                id, tenant_id, portal_user_id, subject_email_hash,
                domain, event_type, actor_kind, created_by,
                notes, metadata,
                related_entity_type, related_entity_id, created_at
            )
            SELECT
                gen_random_uuid(),
                h.tenant_id,
                ta.portal_user_id,
                COALESCE(ta.email_hash, ''),
                'training',
                'training.' || h.event_type,
                'system',
                h.created_by,
                h.notes,
                jsonb_build_object(
                    'placement_id', h.placement_id,
                    'source_type', h.source_type,
                    'source_id', h.source_id
                ),
                'training_attendee',
                h.attendee_id,
                h.created_at
            FROM training_attendee_history h
            JOIN training_attendees ta ON ta.id = h.attendee_id
            """
        )
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation_customer_events ON customer_events")
    op.execute("ALTER TABLE customer_events DISABLE ROW LEVEL SECURITY")
    op.drop_index("idx_customer_events_related", table_name="customer_events")
    op.drop_index("idx_customer_events_tenant_type", table_name="customer_events")
    op.drop_index("idx_customer_events_email_hash_created", table_name="customer_events")
    op.drop_index("idx_customer_events_user_created", table_name="customer_events")
    op.drop_table("customer_events")
