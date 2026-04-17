"""Backfill PII ``*_encrypted`` and ``*_hash`` columns for pre-dual-write rows.

Audit step 37 phase (d). The dual-write listener
(``app.core.security.pii_dual_write``) keeps companions in sync for any row
*written* after it was installed. Rows that existed before still have
``NULL`` in the companions; this script fills them in.

Idempotent: filters on ``<col>_encrypted IS NULL AND <col> IS NOT NULL``,
so re-running after a partial success only touches the rows that still need
it.

Uses raw SQL (not the ORM) because
  * The dual-write listener skip-on-unchanged logic would no-op for every
    row here — we'd be writing through the ORM for zero benefit.
  * Bulk updates avoid per-row overhead on tables that may have hundreds of
    thousands of rows in prod.

Each batch commits independently so a SIGINT leaves partial progress rather
than rolling the whole run back.

Usage
-----

::

    cd backend
    venv/bin/python -m scripts.backfill_pii_encryption --dry-run
    venv/bin/python -m scripts.backfill_pii_encryption
    venv/bin/python -m scripts.backfill_pii_encryption --batch-size 1000 --sleep 0.05
    venv/bin/python -m scripts.backfill_pii_encryption --tables users,customers
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import time
from typing import Literal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings
from app.core.security.pii_crypto import encrypt_pii, hash_email, hash_phone, hash_vat

PiiKind = Literal["email", "phone", "vat"]

# Mirror of migration 197's PII_COLUMNS plus the hash kind per column.
BACKFILL_SPEC: list[tuple[str, str, PiiKind]] = [
    ("users", "email", "email"),
    ("portal_users", "email", "email"),
    ("portal_users", "phone", "phone"),
    ("invoices", "recipient_email", "email"),
    ("invoices", "recipient_vat_number", "vat"),
    ("billing_profiles", "contact_email", "email"),
    ("billing_profiles", "contact_phone", "phone"),
    ("billing_profiles", "vat_number", "vat"),
    ("trainers", "email", "email"),
    ("trainers", "phone", "phone"),
    ("customers", "email", "email"),
    ("customers", "phone", "phone"),
    ("customers", "vat_number", "vat"),
]


def _hash_for_kind(kind: PiiKind, value: str) -> str:
    if kind == "email":
        return hash_email(value)
    if kind == "phone":
        return hash_phone(value)
    return hash_vat(value)


async def _count_eligible(session: AsyncSession, table: str, col: str) -> int:
    sql = text(f'SELECT COUNT(*) FROM "{table}" WHERE "{col}" IS NOT NULL AND "{col}_encrypted" IS NULL')
    return int((await session.execute(sql)).scalar_one())


async def _fetch_batch(session: AsyncSession, table: str, col: str, batch_size: int) -> list[tuple[str, str]]:
    sql = text(f'SELECT id, "{col}" FROM "{table}" WHERE "{col}" IS NOT NULL AND "{col}_encrypted" IS NULL LIMIT :n')
    result = await session.execute(sql, {"n": batch_size})
    return [(str(row[0]), row[1]) for row in result.all()]


async def _write_row(
    session: AsyncSession,
    table: str,
    col: str,
    row_id: str,
    encrypted: str,
    hashed: str,
) -> None:
    sql = text(f'UPDATE "{table}" SET "{col}_encrypted" = :enc, "{col}_hash" = :hash WHERE id = :id')
    await session.execute(sql, {"enc": encrypted, "hash": hashed, "id": row_id})


async def backfill_column(
    session: AsyncSession,
    table: str,
    col: str,
    kind: PiiKind,
    *,
    batch_size: int,
    sleep_secs: float,
    dry_run: bool,
) -> int:
    """Backfill one (table, col) pair. Returns number of rows written."""
    total = await _count_eligible(session, table, col)
    print(f"  {table}.{col}: {total} row(s) to backfill", flush=True)
    if dry_run or total == 0:
        return 0

    done = 0
    batch_num = 0
    while True:
        batch_num += 1
        rows = await _fetch_batch(session, table, col, batch_size)
        if not rows:
            break
        for row_id, plaintext in rows:
            await _write_row(
                session,
                table,
                col,
                row_id,
                encrypt_pii(plaintext),
                _hash_for_kind(kind, plaintext),
            )
        await session.commit()
        done += len(rows)
        print(f"    batch {batch_num}: wrote {len(rows)} ({done}/{total})", flush=True)
        if sleep_secs > 0:
            await asyncio.sleep(sleep_secs)
    return done


async def _run(args: argparse.Namespace) -> int:
    settings = get_settings()
    if not settings.PII_ENCRYPTION_KEY:
        print("ERROR: PII_ENCRYPTION_KEY is not set", file=sys.stderr)
        return 2

    tables_filter: set[str] | None = {t.strip() for t in args.tables.split(",") if t.strip()} if args.tables else None
    spec = [entry for entry in BACKFILL_SPEC if tables_filter is None or entry[0] in tables_filter]
    if not spec:
        print(f"ERROR: no PII columns match --tables={args.tables!r}", file=sys.stderr)
        return 2

    print(
        f"Backfilling {len(spec)} PII column(s) "
        f"(dry_run={args.dry_run}, batch_size={args.batch_size}, sleep={args.sleep}s)"
    )
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    session_factory = async_sessionmaker(engine, expire_on_commit=False, autoflush=False)

    started = time.monotonic()
    total_rows = 0
    try:
        async with session_factory() as session:
            # RLS bypass: PII rows across every tenant need to be reachable.
            await session.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
            for table, col, kind in spec:
                total_rows += await backfill_column(
                    session,
                    table,
                    col,
                    kind,
                    batch_size=args.batch_size,
                    sleep_secs=args.sleep,
                    dry_run=args.dry_run,
                )
    finally:
        await engine.dispose()

    elapsed = time.monotonic() - started
    print(f"Done. Wrote {total_rows} row(s) across {len(spec)} column(s) in {elapsed:.1f}s")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill PII encrypted/hash companion columns.")
    parser.add_argument("--dry-run", action="store_true", help="Print counts only; write nothing.")
    parser.add_argument("--batch-size", type=int, default=500, help="Rows per batch (default 500).")
    parser.add_argument(
        "--sleep",
        type=float,
        default=0.0,
        help="Seconds to sleep between batches (default 0).",
    )
    parser.add_argument("--tables", help="Comma-separated table filter (default: all).")
    args = parser.parse_args()
    return asyncio.run(_run(args))


if __name__ == "__main__":
    sys.exit(main())
