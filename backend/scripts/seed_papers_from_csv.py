"""
Seed papers, speakers, session types, and co-speaker associations from a CSV export.

Usage:
    cd backend
    source venv/bin/activate
    python scripts/seed_papers_from_csv.py

The script finds the first conference in the database, creates a CFP linked to it,
then imports all rows from the CSV.
"""

import asyncio
import csv
import re
import sys
import uuid
from datetime import UTC, datetime
from html import unescape
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.config import get_settings
from app.core.security import hash_password
from app.models.associations import ConferenceCFP
from app.models.cfp import CallForPapers, CFPApplicant, CFPPaper, CFPPaperCospeaker
from app.models.conference import Conference
from app.models.settings import SessionType

# ── Configuration ─────────────────────────────────────────────────────
CSV_PATH = "/Users/josediaz/Downloads/papers_atd_ger_2025_Short.csv"
DEFAULT_PASSWORD = "Test1234"

# Map CSV "Type of presentation" → (name, slug, duration_minutes)
SESSION_TYPE_MAP: dict[str, tuple[str, str, int]] = {
    "25-minute Talk": ("25-minute Talk", "25-min-talk", 25),
    "30-minute Vendor Talk": ("30-minute Vendor Talk", "30-min-vendor-talk", 30),
    "45-minute Keynote": ("45-minute Keynote", "45-min-keynote", 45),
    "105-minute Workshop": ("105-minute Workshop", "105-min-workshop", 105),
    "120-minute Workshop": ("120-minute Workshop", "120-min-workshop", 120),
    "Full-Day Tutorial (6 hours)": ("Full-Day Tutorial", "full-day-tutorial", 360),
    "Bonus Session": ("Bonus Session", "bonus-session", 25),
    "Social Activity": ("Social Activity", "social-activity", 30),
}

# Map CSV "Skill level" → model level value
LEVEL_MAP: dict[str, str] = {
    "All levels": "all_levels",
    "Beginner session": "beginner",
    "Advanced session": "advanced",
    "Expert session": "advanced",  # no 'expert' in our model; map to advanced
}


def strip_html(html: str) -> str:
    """Strip HTML tags and unescape entities."""
    if not html:
        return ""
    text = re.sub(r"<[^>]+>", "", html)
    return unescape(text).strip()


def parse_key_learnings(row: dict) -> str:
    """Combine key learning fields into a single string."""
    parts = []
    for i in range(1, 4):
        val = (row.get(f"Key learning {i}") or "").strip()
        if val and val.lower() != "none":
            parts.append(f"{i}. {val}")
    return "\n".join(parts) if parts else ""


async def get_or_create_applicant(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    first_name: str,
    last_name: str,
    email: str,
    company: str = "",
    title: str = "",
    bio: str = "",
    phone: str = "",
    linkedin: str = "",
    website: str = "",
    cache: dict[str, CFPApplicant] | None = None,
) -> CFPApplicant:
    """Get existing applicant by email or create a new one."""
    email_lower = email.strip().lower()
    if cache and email_lower in cache:
        return cache[email_lower]

    result = await db.execute(
        select(CFPApplicant).where(
            CFPApplicant.tenant_id == tenant_id,
            CFPApplicant.email == email_lower,
        )
    )
    applicant = result.scalar_one_or_none()
    if applicant:
        if cache is not None:
            cache[email_lower] = applicant
        return applicant

    social_links: dict[str, str] = {}
    if linkedin:
        social_links["linkedin"] = linkedin
    if website:
        social_links["website"] = website

    applicant = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        first_name=first_name.strip(),
        last_name=last_name.strip(),
        email=email_lower,
        company=company.strip() or None,
        title=title.strip() or None,
        bio=strip_html(bio) or None,
        phone=phone.strip() or None,
        social_links=social_links if social_links else {},
        password_hash=hash_password(DEFAULT_PASSWORD),
    )
    db.add(applicant)
    await db.flush()
    if cache is not None:
        cache[email_lower] = applicant
    return applicant


async def main() -> None:
    settings = get_settings()
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session_factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    # Read CSV
    with open(CSV_PATH, encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter=";")
        rows = list(reader)

    print(f"Read {len(rows)} rows from CSV")

    async with async_session_factory() as db:
        # Find conference — prefer one with program days; fall back to first
        from app.models.program import ProgramDay

        result = await db.execute(
            select(Conference)
            .outerjoin(ProgramDay, ProgramDay.conference_id == Conference.id)
            .group_by(Conference.id)
            .order_by(func.count(ProgramDay.id).desc())
            .limit(1)
        )
        conference = result.scalar_one_or_none()
        if not conference:
            print("No conference found in database!")
            return

        tenant_id = conference.tenant_id
        conference_id = conference.id
        print(f"Conference: {conference.name} (ID: {conference_id})")

        # ── Create or find CFP ────────────────────────────────────────
        result = await db.execute(
            select(CallForPapers)
            .join(ConferenceCFP, ConferenceCFP.cfp_id == CallForPapers.id)
            .where(ConferenceCFP.conference_id == conference_id)
            .limit(1)
        )
        cfp = result.scalar_one_or_none()

        if cfp:
            print(f"Using existing CFP: {cfp.title} (ID: {cfp.id})")
        else:
            cfp = CallForPapers(
                id=uuid.uuid4(),
                tenant_id=tenant_id,
                title=f"Call for Papers – {conference.name}",
                status="open",
            )
            db.add(cfp)
            await db.flush()
            assoc = ConferenceCFP(
                id=uuid.uuid4(),
                conference_id=conference_id,
                cfp_id=cfp.id,
            )
            db.add(assoc)
            await db.flush()
            print(f"Created CFP: {cfp.title} (ID: {cfp.id})")

        # ── Create session types ──────────────────────────────────────
        result = await db.execute(select(SessionType).where(SessionType.conference_id == conference_id))
        existing_types = {st.slug: st for st in result.scalars().all()}

        session_type_by_csv_name: dict[str, SessionType] = {}
        created_types = 0
        for csv_name, (name, slug, duration) in SESSION_TYPE_MAP.items():
            if slug in existing_types:
                session_type_by_csv_name[csv_name] = existing_types[slug]
            else:
                st = SessionType(
                    id=uuid.uuid4(),
                    tenant_id=tenant_id,
                    conference_id=conference_id,
                    name=name,
                    slug=slug,
                    duration_minutes=duration,
                    cfp_eligible=True,
                    is_active=True,
                )
                db.add(st)
                await db.flush()
                session_type_by_csv_name[csv_name] = st
                existing_types[slug] = st
                created_types += 1

        print(f"Session types: {created_types} created, {len(SESSION_TYPE_MAP) - created_types} already existed")

        # ── Import papers ─────────────────────────────────────────────
        applicant_cache: dict[str, CFPApplicant] = {}
        papers_created = 0
        cospeakers_created = 0
        applicants_created_count = 0

        # Track existing applicant emails before we start
        result = await db.execute(select(CFPApplicant.email).where(CFPApplicant.tenant_id == tenant_id))
        existing_emails = {r[0] for r in result.fetchall()}

        for row in rows:
            title = (row.get("Title") or "").strip()
            if not title:
                continue

            # Main speaker (Speaker 1)
            spk1_email = (row.get("Speaker 1 Email") or "").strip()
            spk1_first = (row.get("Speaker 1 First name") or "").strip()
            spk1_last = (row.get("Speaker 1 Last name") or "").strip()
            if not spk1_email or not spk1_first:
                print(f"  SKIP (no speaker): {title}")
                continue

            main_speaker = await get_or_create_applicant(
                db,
                tenant_id,
                first_name=spk1_first,
                last_name=spk1_last,
                email=spk1_email,
                company=row.get("Speaker 1 Company", ""),
                title=row.get("Speaker 1 Position", ""),
                bio=row.get("Speaker 1 Biography", ""),
                phone=row.get("Speaker 1 Telephone", ""),
                linkedin=row.get("Speaker 1 LinkedIn", ""),
                website=row.get("Speaker 1 Website", ""),
                cache=applicant_cache,
            )
            if spk1_email.strip().lower() not in existing_emails:
                applicants_created_count += 1
                existing_emails.add(spk1_email.strip().lower())

            # Session type
            csv_type = (row.get("Type of presentation") or "").strip()
            session_type = session_type_by_csv_name.get(csv_type)

            # Skill level
            csv_level = (row.get("Skill level") or "").strip()
            level = LEVEL_MAP.get(csv_level)

            # Abstract
            abstract = strip_html(row.get("Abstract", ""))

            # Key learnings → learning_objectives
            learning_objectives = parse_key_learnings(row)

            # Build paper
            paper = CFPPaper(
                id=uuid.uuid4(),
                tenant_id=tenant_id,
                cfp_id=cfp.id,
                main_speaker_id=main_speaker.id,
                session_type_id=session_type.id if session_type else None,
                title=title,
                abstract_short=abstract[:500] if abstract else None,
                abstract_long=abstract if abstract else None,
                level=level,
                learning_objectives=learning_objectives or None,
                status="accepted",
                submitted_at=datetime.now(UTC),
            )
            db.add(paper)
            await db.flush()
            papers_created += 1

            # Co-speakers (Speaker 2 through 5)
            for spk_num in range(2, 6):
                spk_email = (row.get(f"Speaker {spk_num} Email") or "").strip()
                spk_first = (row.get(f"Speaker {spk_num} First name") or "").strip()
                spk_last = (row.get(f"Speaker {spk_num} Last name") or "").strip()
                if not spk_email or not spk_first:
                    continue

                cospeaker = await get_or_create_applicant(
                    db,
                    tenant_id,
                    first_name=spk_first,
                    last_name=spk_last,
                    email=spk_email,
                    company=row.get(f"Speaker {spk_num} Company", ""),
                    title=row.get(f"Speaker {spk_num} Position", ""),
                    bio=row.get(f"Speaker {spk_num} Biography", ""),
                    phone=row.get(f"Speaker {spk_num} Telephone", ""),
                    linkedin=row.get(f"Speaker {spk_num} LinkedIn", ""),
                    website=row.get(f"Speaker {spk_num} Website", ""),
                    cache=applicant_cache,
                )
                if spk_email.strip().lower() not in existing_emails:
                    applicants_created_count += 1
                    existing_emails.add(spk_email.strip().lower())

                # Create co-speaker association
                assoc = CFPPaperCospeaker(
                    paper_id=paper.id,
                    applicant_id=cospeaker.id,
                    sort_order=spk_num - 1,
                    invitation_status="accepted",
                )
                db.add(assoc)
                cospeakers_created += 1

            await db.flush()

        await db.commit()

        print("\nDone!")
        print(f"  Applicants (speakers) created: {applicants_created_count}")
        print(f"  Papers created: {papers_created}")
        print(f"  Co-speaker links created: {cospeakers_created}")
        print("  All papers set to status: accepted")
        print(f"  Default password for all speakers: {DEFAULT_PASSWORD}")


if __name__ == "__main__":
    asyncio.run(main())
