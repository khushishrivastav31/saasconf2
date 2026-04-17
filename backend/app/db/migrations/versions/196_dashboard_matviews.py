"""Dashboard materialized views (audit step 30).

Adds three tenant-scoped matviews backing the most expensive analytics
reads: per-conference revenue aggregates, daily registration counts, and
booking-option revenue (line-item level). Each matview keeps ``tenant_id``
as the first column so application code can filter explicitly (PostgreSQL
does not support RLS on matviews — enforcement is application-level, as
it is for every direct SQL today).

Each matview has a UNIQUE index on its natural key so
``REFRESH MATERIALIZED VIEW CONCURRENTLY`` works without locking readers.

These views are created here as infrastructure only; migrating the
existing analytics endpoints to read from them is a follow-up task.

Revision ID: 196
Revises: 195
"""

from alembic import op

revision = "196"
down_revision = "195"
branch_labels = None
depends_on = None


# ─── mv_conference_revenue ──────────────────────────────────────────────
#
# Paid/overdue/sent invoice revenue aggregated per conference, currency,
# and recipient-source-type — the shape consumed by the sponsor/registration
# revenue queries in revenue.py:85-129.

MV_CONFERENCE_REVENUE_SQL = """
CREATE MATERIALIZED VIEW mv_conference_revenue AS
SELECT
    i.tenant_id,
    i.conference_id,
    COALESCE(i.currency, 'EUR') AS currency,
    COALESCE(i.recipient_source_type, '') AS recipient_source_type,
    COALESCE(SUM(i.total) FILTER (WHERE i.status IN ('paid', 'overdue')), 0) AS paid_revenue,
    COALESCE(SUM(i.total) FILTER (WHERE i.status = 'sent'), 0) AS outstanding_revenue,
    COALESCE(SUM(i.total) FILTER (WHERE i.status IN ('paid', 'overdue', 'sent')), 0) AS total_revenue,
    COUNT(*) FILTER (WHERE i.status IN ('paid', 'overdue', 'sent')) AS invoice_count
FROM invoices i
WHERE i.is_active = true
  AND i.template_type != 'credit_note'
  AND i.status IN ('paid', 'overdue', 'sent')
GROUP BY i.tenant_id, i.conference_id, COALESCE(i.currency, 'EUR'), COALESCE(i.recipient_source_type, '')
"""


# ─── mv_daily_registrations ─────────────────────────────────────────────
#
# Daily non-cancelled registration counts per conference — backs
# attendance.py:58-70 (stats/registrations-over-time).

MV_DAILY_REGISTRATIONS_SQL = """
CREATE MATERIALIZED VIEW mv_daily_registrations AS
SELECT
    r.tenant_id,
    r.conference_id,
    r.created_at::date AS reg_date,
    COUNT(*) AS registration_count
FROM registrations r
WHERE r.status != 'cancelled'
GROUP BY r.tenant_id, r.conference_id, r.created_at::date
"""


# ─── mv_booking_option_revenue ──────────────────────────────────────────
#
# Line-item revenue per booking option — backs the expensive
# jsonb_array_elements query in revenue.py:183-215.

MV_BOOKING_OPTION_REVENUE_SQL = """
CREATE MATERIALIZED VIEW mv_booking_option_revenue AS
SELECT
    i.tenant_id,
    i.conference_id,
    COALESCE(i.currency, 'EUR') AS currency,
    bo.id AS booking_option_id,
    COALESCE(SUM((li->>'total')::numeric), 0) AS subtotal_revenue,
    COALESCE(SUM(
        CASE WHEN i.subtotal > 0
        THEN (li->>'total')::numeric * i.tax_amount / i.subtotal
        ELSE 0 END
    ), 0) AS tax_amount,
    COALESCE(SUM(
        CASE WHEN i.subtotal > 0
        THEN (li->>'total')::numeric * i.total / i.subtotal
        ELSE (li->>'total')::numeric END
    ), 0) AS total_revenue
FROM invoices i
CROSS JOIN jsonb_array_elements(
    CASE WHEN jsonb_typeof(i.line_items) = 'array' THEN i.line_items ELSE jsonb_build_array() END
) AS li
JOIN booking_options bo ON (
    bo.tenant_id = i.tenant_id
    AND bo.conference_id = i.conference_id
    AND (
        li->>'description' = bo.name
        OR li->>'description' LIKE bo.name || ' - %'
    )
)
WHERE i.is_active = true
  AND i.template_type != 'credit_note'
  AND i.status IN ('paid', 'overdue', 'sent')
  AND i.recipient_source_type IN ('registration', 'billing_profile')
GROUP BY i.tenant_id, i.conference_id, COALESCE(i.currency, 'EUR'), bo.id
"""


def upgrade() -> None:
    op.execute(MV_CONFERENCE_REVENUE_SQL)
    op.execute(
        "CREATE UNIQUE INDEX uq_mv_conference_revenue "
        "ON mv_conference_revenue (tenant_id, conference_id, currency, recipient_source_type)"
    )

    op.execute(MV_DAILY_REGISTRATIONS_SQL)
    op.execute(
        "CREATE UNIQUE INDEX uq_mv_daily_registrations ON mv_daily_registrations (tenant_id, conference_id, reg_date)"
    )

    op.execute(MV_BOOKING_OPTION_REVENUE_SQL)
    op.execute(
        "CREATE UNIQUE INDEX uq_mv_booking_option_revenue "
        "ON mv_booking_option_revenue (tenant_id, conference_id, currency, booking_option_id)"
    )


def downgrade() -> None:
    op.execute("DROP MATERIALIZED VIEW IF EXISTS mv_booking_option_revenue")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS mv_daily_registrations")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS mv_conference_revenue")
