"""
Seed CFP paper-review test data for a single conference.

Creates enough realistic data to manually test / demo the evaluated-papers
workflows (sort, detail views, must-have flag): papers spread across several
session types, a handful of reviewers (committee members), paper→reviewer
assignments with partial overlap, and submitted reviews with scored answers.

The script is idempotent — re-running it against the same conference is a no-op
rather than a duplicate-data generator (every row is looked up by a natural key
before insert). All writes are scoped to the target conference's tenant via RLS
context, so it can never touch another tenant's data.

The actual seeding logic lives in ``app.services.cfp_review_seed`` and is shared
with the dev/staging admin endpoint; this file is the interactive CLI wrapper.

Usage:
    cd backend
    source venv/bin/activate

    # Interactive: pick the conference from a numbered list, then confirm:
    python scripts/seed_cfp_review_data.py

    # List conferences to find the target id:
    python scripts/seed_cfp_review_data.py --list

    # Non-interactive: seed a specific conference (skip prompts with --yes):
    python scripts/seed_cfp_review_data.py --conference-id <UUID> --yes

    # Tune volumes (defaults shown):
    python scripts/seed_cfp_review_data.py --conference-id <UUID> \
        --papers 22 --reviewers 3 --must-have 5

This is a dev/local-only tool. Do not run it against production data.
"""

import argparse
import asyncio
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings
from app.db.session import set_rls_context
from app.models.conference import Conference
from app.services.cfp_review_seed import SeedError, seed_cfp_review_data


async def _list_conferences(db: AsyncSession) -> None:
    result = await db.execute(select(Conference).order_by(Conference.name))
    conferences = result.scalars().all()
    if not conferences:
        print("No conferences found in the database.")
        return
    print(f"{'CONFERENCE ID':38}  {'TENANT ID':38}  NAME")
    for c in conferences:
        print(f"{c.id!s:38}  {c.tenant_id!s:38}  {c.name}")


async def _select_conference_interactively(db: AsyncSession) -> Conference | None:
    """Show a numbered conference list and prompt the user to choose one."""
    result = await db.execute(select(Conference).order_by(Conference.name))
    conferences = list(result.scalars().all())
    if not conferences:
        print("No conferences found in the database.")
        return None
    print("\nSelect a conference to seed:\n")
    for idx, c in enumerate(conferences, start=1):
        print(f"  [{idx}] {c.name}  (id={c.id}, tenant={c.tenant_id})")
    raw = (await asyncio.to_thread(input, f"\nEnter a number [1-{len(conferences)}] (blank to cancel): ")).strip()
    if not raw:
        print("Cancelled.")
        return None
    if not raw.isdigit() or not (1 <= int(raw) <= len(conferences)):
        print(f"Invalid selection: {raw!r}")
        return None
    return conferences[int(raw) - 1]


async def _confirm(prompt: str) -> bool:
    """Ask a yes/no question on the terminal; default is no."""
    answer = (await asyncio.to_thread(input, f"{prompt} [y/N]: ")).strip().lower()
    return answer in ("y", "yes")


async def main(
    conference_id: uuid.UUID | None,
    list_only: bool,
    papers: int,
    reviewers: int,
    must_have: int,
    assume_yes: bool,
) -> None:
    settings = get_settings()
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session_factory() as db:
        # Super-admin context to locate the conference across tenants.
        await set_rls_context(db, is_super_admin=True)

        if list_only:
            await _list_conferences(db)
            await engine.dispose()
            return

        # Resolve the target conference: explicit --conference-id, otherwise
        # prompt the user to pick one from a numbered list.
        if conference_id is None:
            conference = await _select_conference_interactively(db)
            if conference is None:
                await engine.dispose()
                return
        else:
            conference = (
                await db.execute(select(Conference).where(Conference.id == conference_id))
            ).scalar_one_or_none()
            if conference is None:
                print(f"No conference found with id {conference_id}. Use --list to see available conferences.")
                await engine.dispose()
                return

        tenant_id = conference.tenant_id
        print(f"\nConference: {conference.name} (id={conference.id}, tenant={tenant_id})")

        # Confirm before writing (skippable with --yes for scripted runs).
        if not assume_yes and not await _confirm(
            f"Seed {papers} papers, {reviewers} reviewers, and reviews "
            f"({must_have} must-have) into '{conference.name}'?"
        ):
            print("Aborted — nothing was written.")
            await engine.dispose()
            return

        # Scope every subsequent write strictly to the target tenant. Any attempt
        # to write outside this tenant would now be rejected by RLS.
        await set_rls_context(db, tenant_id=str(tenant_id), is_super_admin=False)

        try:
            result = await seed_cfp_review_data(db, conference, papers=papers, reviewers=reviewers, must_have=must_have)
        except SeedError as exc:
            print(f"  ERROR: {exc} Aborting.")
            await db.rollback()
            await engine.dispose()
            return

        await db.commit()
        print("\nVerification:")
        print(f"  Evaluated papers (final_consideration): {result.evaluated_papers}")
        print(f"  Committee members (reviewers):          {result.reviewers}")
        print(f"  Papers with a must-have review:         {result.must_have_papers}")
        print(f"\nDone. Default password for all seeded speakers/reviewers: {result.default_password}")

    await engine.dispose()


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--conference-id", type=uuid.UUID, help="Target conference UUID.")
    parser.add_argument("--list", action="store_true", help="List conferences (id, tenant, name) and exit.")
    parser.add_argument("--papers", type=int, default=22, help="Number of evaluated papers to seed (default: 22).")
    parser.add_argument("--reviewers", type=int, default=3, help="Number of reviewers to seed (default: 3).")
    parser.add_argument("--must-have", type=int, default=5, help="Number of papers flagged must-have (default: 5).")
    parser.add_argument("--yes", "-y", action="store_true", help="Skip the confirmation prompt (for scripted runs).")
    args = parser.parse_args()
    if args.must_have > args.papers:
        parser.error("--must-have cannot exceed --papers.")
    return args


if __name__ == "__main__":
    ns = _parse_args()
    asyncio.run(
        main(
            conference_id=ns.conference_id,
            list_only=ns.list,
            papers=ns.papers,
            reviewers=ns.reviewers,
            must_have=ns.must_have,
            assume_yes=ns.yes,
        )
    )
