"""Backfill encrypted PII on ``training_attendees`` and ``cfp_applicants``.

Follow-up to migration 207. Fills in the newly-added ``*_encrypted``
companion columns (and the new ``cfp_applicants.phone_hash``) from the
existing plaintext. Same shape as the original ``backfill_pii_encryption``
script (audit step 37 phase d) — raw SQL, batched, per-batch commits,
idempotent filter on ``<col>_encrypted IS NULL``.

Idempotent: filters on ``<col>_encrypted IS NULL AND <col> IS NOT NULL``,
so re-running after a partial success only touches the rows that still
need it. ``email_hash`` is already kept in sync by ``@validates("email")``
on both models, so it gets a conditional refresh only when NULL to avoid
overwriting application-written values.

Usage
-----

::

    cd backend
    venv/bin/python -m scripts.backfill_attendees_applicants_pii --dry-run
    venv/bin/python -m scripts.backfill_attendees_applicants_pii
    venv/bin/python -m scripts.backfill_attendees_applicants_pii --batch-size 1000 --sleep 0.05
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
from app.core.security.pii_crypto import encrypt_pii, hash_email, hash_phone

PiiKind = Literal["email", "phone"]

# (table, column, hash kind) — matches migration 207's PII_COLUMNS.
BACKFILL_SPEC: list[tuple[str, str, PiiKind]] = [
    ("training_attendees", "email", "email"),
    ("cfp_applicants", "email", "email"),
    ("cfp_applicants", "phone", "phone"),
]


def _hash_for_kind(kind: PiiKind, value: str) -> str:
    if kind == "email":
        return hash_email(value)
    return hash_phone(value)


async def _plaintext_column_exists(session: AsyncSession, table: str, col: str) -> bool:
    """Return False once migration 208 drops the plaintext column.

    Lets the script auto-run on every deploy without tripping after the
    plaintext columns are gone — it becomes a graceful no-op instead.
    """
    sql = text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_schema = 'public' AND table_name = :t AND column_name = :c"
    )
    result = await session.execute(sql, {"t": table, "c": col})
    return result.scalar_one_or_none() is not None


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
    # COALESCE on ``<col>_hash`` so we don't overwrite application-written
    # hashes; only fill the NULL rows (phase pre-dual-write only relevant to
    # the brand-new ``phone_hash`` column — email_hash was already kept in
    # sync by @validates).
    sql = text(
        f'UPDATE "{table}" SET "{col}_encrypted" = :enc, "{col}_hash" = COALESCE("{col}_hash", :hash) WHERE id = :id'
    )
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
    if not await _plaintext_column_exists(session, table, col):
        print(f"  {table}.{col}: plaintext column absent — skipping (post-migration-208).", flush=True)
        return 0

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

    print(
        f"Backfilling {len(BACKFILL_SPEC)} PII column(s) "
        f"(dry_run={args.dry_run}, batch_size={args.batch_size}, sleep={args.sleep}s)"
    )
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    session_factory = async_sessionmaker(engine, expire_on_commit=False, autoflush=False)

    started = time.monotonic()
    total_rows = 0
    try:
        async with session_factory() as session:
            # RLS bypass: rows across every tenant must be reachable.
            await session.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
            for table, col, kind in BACKFILL_SPEC:
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
    print(f"Done. Wrote {total_rows} row(s) across {len(BACKFILL_SPEC)} column(s) in {elapsed:.1f}s")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill encrypted PII on training_attendees + cfp_applicants.")
    parser.add_argument("--dry-run", action="store_true", help="Print counts only; write nothing.")
    parser.add_argument("--batch-size", type=int, default=500, help="Rows per batch (default 500).")
    parser.add_argument(
        "--sleep",
        type=float,
        default=0.0,
        help="Seconds to sleep between batches (default 0).",
    )
    args = parser.parse_args()
    return asyncio.run(_run(args))


if __name__ == "__main__":
    sys.exit(main())
