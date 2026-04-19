"""Export all data SaaSConf holds about a data subject (GDPR Art. 15).

Ops-only CLI. Delegates to :func:`app.core.gdpr.export.build_export` so the
script, the admin ``/generate-export`` endpoint, and the portal self-serve
export path all share one implementation.

Usage::

    venv/bin/python -m scripts.export_subject_data \\
        --tenant <tenant_uuid> \\
        --email subject@example.com \\
        --email alt@example.com \\
        --out /tmp/subject-export.zip

The CLI always runs in ``mode="admin"`` (full column dump). Portal mode is
only reachable via the authenticated HTTP path.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings
from app.core.gdpr.export import build_export


async def main() -> None:
    parser = argparse.ArgumentParser(description="Export GDPR Art. 15 subject data for a tenant.")
    parser.add_argument("--tenant", required=True, help="Tenant UUID.")
    parser.add_argument(
        "--email",
        action="append",
        required=True,
        help="Subject email (may be repeated).",
    )
    parser.add_argument("--out", required=True, help="Output ZIP path.")
    args = parser.parse_args()

    tenant_id = uuid.UUID(args.tenant)
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    settings = get_settings()
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as db:
        blob, _manifest = await build_export(db, tenant_id, args.email)

    out_path.write_bytes(blob)
    print(f"Wrote {len(blob):,} bytes to {out_path}")


if __name__ == "__main__":
    asyncio.run(main())
