"""Reusable building blocks for Alembic migrations.

The trainings/conferences split landed across four near-identical
migrations (213/215/216/217). Each one:

1. Adds a ``domain`` discriminator column (``conference`` | ``training``).
2. Backfills existing rows to ``conference``.
3. Adds a CHECK constraint pinning allowed values.
4. Drops ``NOT NULL`` on the conference-side anchor column.
5. Adds a paired CHECK so conference rows have the anchor and training
   rows don't.
6. Adds a compound index for the per-domain portal lookup.

``add_domain_discriminator`` collapses that boilerplate into one call.
The downgrade counterpart guards against silently losing training-domain
rows. **Forward-only**: existing 213-217 stay as they are (Alembic
history is immutable); the helper is for the next time we generalize
another conference-scoped table.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

DOMAIN_CONFERENCE = "conference"
DOMAIN_TRAINING = "training"


def add_domain_discriminator(
    table_name: str,
    *,
    anchor_column: str = "conference_id",
    index_columns: Sequence[str],
    default_domain: str = DOMAIN_CONFERENCE,
) -> None:
    """Generalize a conference-scoped table to support training-domain rows.

    Args:
        table_name: e.g. ``"screen_overlays"``.
        anchor_column: the column that's non-null for conference rows and
            must be NULL for training rows. Defaults to ``conference_id``.
        index_columns: the suffix of the compound index after the
            standard ``(tenant_id, domain, ...)`` prefix is already
            included automatically. Pass e.g.
            ``("is_active", "trigger_type")`` and the resulting index
            covers ``(tenant_id, domain, is_active, trigger_type)``.
        default_domain: row-level default for the discriminator. Defaults
            to ``conference`` (matches every existing row at migration
            time).

    Constraint and index names follow the convention used by 216/217:
    ``ck_<table>_domain``, ``ck_<table>_domain_anchor``,
    ``ix_<table>_tenant_domain_<suffix>`` where ``<suffix>`` is the
    underscore-joined ``index_columns``.
    """
    op.add_column(table_name, sa.Column("domain", sa.String(20), nullable=True))
    op.execute(f"UPDATE {table_name} SET domain = '{default_domain}' WHERE domain IS NULL")
    op.alter_column(table_name, "domain", nullable=False, server_default=default_domain)
    op.create_check_constraint(
        f"ck_{table_name}_domain",
        table_name,
        f"domain IN ('{DOMAIN_CONFERENCE}', '{DOMAIN_TRAINING}')",
    )
    op.alter_column(table_name, anchor_column, nullable=True)
    op.create_check_constraint(
        f"ck_{table_name}_domain_anchor",
        table_name,
        (
            f"(domain = '{DOMAIN_CONFERENCE}' AND {anchor_column} IS NOT NULL) "
            f"OR (domain = '{DOMAIN_TRAINING}' AND {anchor_column} IS NULL)"
        ),
    )
    suffix = "_".join(index_columns)
    op.create_index(
        f"ix_{table_name}_tenant_domain_{suffix}",
        table_name,
        ["tenant_id", "domain", *index_columns],
    )


def drop_domain_discriminator(
    table_name: str,
    *,
    anchor_column: str = "conference_id",
    index_columns: Sequence[str],
) -> None:
    """Reverse ``add_domain_discriminator``.

    Refuses to drop the ``domain`` column if any training-domain rows
    exist — those would have NULL ``conference_id`` and the NOT NULL
    re-add would fail. The error message tells the operator what to
    delete first.
    """
    op.execute(
        f"""
        DO $$
        DECLARE
            training_count INTEGER;
        BEGIN
            SELECT COUNT(*) INTO training_count
            FROM {table_name}
            WHERE domain = '{DOMAIN_TRAINING}';
            IF training_count > 0 THEN
                RAISE EXCEPTION
                    'Cannot downgrade: % {table_name} are training-domain. Delete them first.',
                    training_count;
            END IF;
        END $$;
        """
    )
    suffix = "_".join(index_columns)
    op.drop_index(f"ix_{table_name}_tenant_domain_{suffix}", table_name=table_name)
    op.drop_constraint(f"ck_{table_name}_domain_anchor", table_name, type_="check")
    op.alter_column(table_name, anchor_column, nullable=False)
    op.drop_constraint(f"ck_{table_name}_domain", table_name, type_="check")
    op.drop_column(table_name, "domain")
