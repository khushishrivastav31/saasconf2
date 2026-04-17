"""Tests for dashboard matviews: migration, refresh, and data shape.

These matviews are created via migration 196 — the suite-wide test DB is
built from ``Base.metadata.create_all`` and doesn't run migrations, so
this test builds its own migrated DB (same pattern as test_rls_coverage).
"""

from __future__ import annotations

import os
import subprocess
import sys
from collections.abc import Iterator
from pathlib import Path

import psycopg2  # type: ignore[import-untyped]
import pytest
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT  # type: ignore[import-untyped]

BACKEND_DIR = Path(__file__).resolve().parent.parent
MV_DB_NAME = "saasconf_matview_check"

EXPECTED_MATVIEWS: frozenset[str] = frozenset(
    {
        "mv_conference_revenue",
        "mv_daily_registrations",
        "mv_booking_option_revenue",
    }
)


def _parse_dsn() -> dict[str, str]:
    url = os.environ["DATABASE_URL"].replace("+asyncpg", "").replace("postgresql://", "")
    creds, hostdb = url.split("@", 1)
    user, password = creds.split(":", 1)
    host_port, _current_db = hostdb.split("/", 1)
    host, port = ([*host_port.split(":", 1), "5432"])[:2]
    return {"host": host, "port": port, "user": user, "password": password}


@pytest.fixture(scope="module")
def migrated_dsn() -> Iterator[dict[str, str]]:
    base = _parse_dsn()
    admin = psycopg2.connect(dbname="postgres", **base)
    admin.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    try:
        with admin.cursor() as cur:
            cur.execute(f'DROP DATABASE IF EXISTS "{MV_DB_NAME}"')
            cur.execute(f'CREATE DATABASE "{MV_DB_NAME}"')
        migrated_url = (
            f"postgresql+asyncpg://{base['user']}:{base['password']}@{base['host']}:{base['port']}/{MV_DB_NAME}"
        )
        env = os.environ.copy()
        env["DATABASE_URL"] = migrated_url
        result = subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            cwd=BACKEND_DIR,
            env=env,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise RuntimeError(
                f"alembic upgrade failed (exit {result.returncode})\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
            )
        yield {**base, "dbname": MV_DB_NAME}
    finally:
        with admin.cursor() as cur:
            cur.execute(
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = %s AND pid <> pg_backend_pid()",
                (MV_DB_NAME,),
            )
            cur.execute(f'DROP DATABASE IF EXISTS "{MV_DB_NAME}"')
        admin.close()


def _query(dsn: dict[str, str], sql: str) -> list[tuple]:
    conn = psycopg2.connect(**dsn)
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
            return cur.fetchall()
    finally:
        conn.close()


def test_migration_creates_all_matviews(migrated_dsn: dict[str, str]) -> None:
    rows = _query(migrated_dsn, "SELECT matviewname FROM pg_matviews WHERE schemaname = 'public'")
    found = {r[0] for r in rows}
    missing = EXPECTED_MATVIEWS - found
    assert not missing, f"Expected matviews missing after migration: {sorted(missing)}"


def test_each_matview_has_unique_index(migrated_dsn: dict[str, str]) -> None:
    """REFRESH CONCURRENTLY requires a UNIQUE index on every matview."""
    for mv in EXPECTED_MATVIEWS:
        rows = _query(
            migrated_dsn,
            f"""
            SELECT i.indexname
            FROM pg_indexes i
            WHERE i.schemaname = 'public' AND i.tablename = '{mv}'
              AND i.indexdef LIKE '%UNIQUE%'
            """,
        )
        assert rows, f"{mv} must have a UNIQUE index (for REFRESH CONCURRENTLY)"


def test_matviews_have_tenant_id_column(migrated_dsn: dict[str, str]) -> None:
    """Every dashboard matview must expose tenant_id for app-layer filtering."""
    # information_schema.columns excludes matview columns; query pg_attribute directly.
    for mv in EXPECTED_MATVIEWS:
        rows = _query(
            migrated_dsn,
            f"""
            SELECT 1 FROM pg_attribute a
            JOIN pg_class c ON c.oid = a.attrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname = '{mv}'
              AND a.attname = 'tenant_id' AND a.attnum > 0 AND NOT a.attisdropped
            """,
        )
        assert rows, f"{mv} is missing tenant_id"


def test_refresh_all_works(migrated_dsn: dict[str, str]) -> None:
    """Initial refresh (non-CONCURRENTLY) then a CONCURRENTLY refresh both succeed."""
    conn = psycopg2.connect(**migrated_dsn)
    try:
        with conn.cursor() as cur:
            for mv in EXPECTED_MATVIEWS:
                cur.execute(f"REFRESH MATERIALIZED VIEW {mv}")
            conn.commit()
            # Matviews are populated now; CONCURRENTLY should work too.
            for mv in EXPECTED_MATVIEWS:
                cur.execute(f"REFRESH MATERIALIZED VIEW CONCURRENTLY {mv}")
            conn.commit()
    finally:
        conn.close()


def test_downgrade_drops_matviews(migrated_dsn: dict[str, str]) -> None:
    """`alembic downgrade -1` removes the matviews; upgrade restores them."""
    env = os.environ.copy()
    migrated_url = (
        f"postgresql+asyncpg://{migrated_dsn['user']}:{migrated_dsn['password']}"
        f"@{migrated_dsn['host']}:{migrated_dsn['port']}/{MV_DB_NAME}"
    )
    env["DATABASE_URL"] = migrated_url

    down = subprocess.run(
        [sys.executable, "-m", "alembic", "downgrade", "-1"],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
    )
    assert down.returncode == 0, f"downgrade failed: {down.stderr}"

    rows = _query(migrated_dsn, "SELECT matviewname FROM pg_matviews WHERE schemaname = 'public'")
    found = {r[0] for r in rows}
    lingering = EXPECTED_MATVIEWS & found
    assert not lingering, f"Matviews still present after downgrade: {sorted(lingering)}"

    up = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
    )
    assert up.returncode == 0, f"re-upgrade failed: {up.stderr}"
