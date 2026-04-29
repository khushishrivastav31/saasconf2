"""Smoke test for ``app.db.migrations.helpers``.

The helper is *forward-only* — existing migrations 213/215/216/217 are
hand-written. This test pins that calling
``add_domain_discriminator`` with the same arguments as migration 216
produces the same sequence of ``op.*`` calls, so the next time someone
generalizes a conference-scoped table they get a byte-identical result.
"""

from typing import Any
from unittest.mock import MagicMock, patch


def _capture_calls(target: Any) -> list[tuple[str, tuple, dict]]:
    """Drive ``target(op_proxy)`` and return the sequence of ``op.*``
    calls (name, args, kwargs)."""
    calls: list[tuple[str, tuple, dict]] = []
    proxy = MagicMock()

    def make_recorder(name: str) -> Any:
        def recorder(*args: Any, **kwargs: Any) -> None:
            calls.append((name, args, kwargs))

        return recorder

    for name in (
        "add_column",
        "execute",
        "alter_column",
        "create_check_constraint",
        "create_index",
        "drop_index",
        "drop_constraint",
        "drop_column",
    ):
        setattr(proxy, name, make_recorder(name))

    with patch("app.db.migrations.helpers.op", proxy):
        target()
    return calls


def test_add_domain_discriminator_matches_migration_216_shape() -> None:
    from app.db.migrations.helpers import add_domain_discriminator

    calls = _capture_calls(
        lambda: add_domain_discriminator(
            "screen_overlays",
            index_columns=("is_active", "trigger_type"),
        )
    )

    names = [c[0] for c in calls]
    assert names == [
        "add_column",
        "execute",
        "alter_column",
        "create_check_constraint",
        "alter_column",
        "create_check_constraint",
        "create_index",
    ]

    # Backfill targets the right table + value.
    assert calls[1][1] == ("UPDATE screen_overlays SET domain = 'conference' WHERE domain IS NULL",)

    # CHECK pins the allowed values.
    ck_args = calls[3][1]
    assert ck_args[0] == "ck_screen_overlays_domain"
    assert ck_args[1] == "screen_overlays"
    assert "domain IN ('conference', 'training')" in ck_args[2]

    # Pair-CHECK enforces the conference_id ↔ domain pairing.
    pair_args = calls[5][1]
    assert pair_args[0] == "ck_screen_overlays_domain_anchor"
    assert "domain = 'conference' AND conference_id IS NOT NULL" in pair_args[2]
    assert "domain = 'training' AND conference_id IS NULL" in pair_args[2]

    # Compound index name + columns.
    idx_args = calls[6][1]
    assert idx_args[0] == "ix_screen_overlays_tenant_domain_is_active_trigger_type"
    assert idx_args[1] == "screen_overlays"
    assert idx_args[2] == ["tenant_id", "domain", "is_active", "trigger_type"]


def test_add_domain_discriminator_supports_custom_anchor_column() -> None:
    """Tables that anchor on something other than ``conference_id`` still
    get the right pair-CHECK and ``alter_column`` target."""
    from app.db.migrations.helpers import add_domain_discriminator

    calls = _capture_calls(
        lambda: add_domain_discriminator(
            "widget_attachments",
            anchor_column="widget_id",
            index_columns=("is_active",),
        )
    )

    # Second alter_column drops NOT NULL on the custom anchor column.
    assert calls[4][1] == ("widget_attachments", "widget_id")
    assert calls[4][2] == {"nullable": True}

    # Pair-CHECK references the custom anchor column.
    pair_check = calls[5][1][2]
    assert "widget_id IS NOT NULL" in pair_check
    assert "widget_id IS NULL" in pair_check


def test_drop_domain_discriminator_refuses_when_training_rows_exist() -> None:
    """The downgrade emits a guard query that raises if any training-domain
    rows are present — otherwise the NOT NULL re-add silently fails."""
    from app.db.migrations.helpers import drop_domain_discriminator

    calls = _capture_calls(
        lambda: drop_domain_discriminator(
            "screen_overlays",
            index_columns=("is_active", "trigger_type"),
        )
    )

    guard_sql = calls[0][1][0]
    assert "FROM screen_overlays" in guard_sql
    assert "domain = 'training'" in guard_sql
    assert "RAISE EXCEPTION" in guard_sql

    # Order matches a manual reversal: drop index → drop pair-CHECK →
    # re-add NOT NULL → drop domain CHECK → drop column.
    names_after_guard = [c[0] for c in calls[1:]]
    assert names_after_guard == [
        "drop_index",
        "drop_constraint",
        "alter_column",
        "drop_constraint",
        "drop_column",
    ]
