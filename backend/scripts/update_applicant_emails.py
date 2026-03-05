"""Update all CFP applicant emails to [FirstName][LastName]@trendig.com format."""

import asyncio
import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.config import get_settings
from app.models.cfp import CFPApplicant

TENANT_ID = "7913849b-71a9-48a6-946b-f0d0af8490e7"


def normalize_email_part(name: str) -> str:
    """Remove diacritics, spaces, and non-ASCII from a name part."""
    # Decompose unicode characters and strip combining marks (accents)
    nfkd = unicodedata.normalize("NFKD", name)
    ascii_only = nfkd.encode("ascii", "ignore").decode("ascii")
    # Remove spaces and any non-alphanumeric chars
    return re.sub(r"[^a-zA-Z0-9]", "", ascii_only)


async def main() -> None:
    settings = get_settings()
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session_factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session_factory() as db:
        result = await db.execute(select(CFPApplicant).where(CFPApplicant.tenant_id == TENANT_ID))
        applicants = result.scalars().all()

        # Build emails and handle duplicates
        email_map: dict[str, list[CFPApplicant]] = {}
        for applicant in applicants:
            first = normalize_email_part(applicant.first_name)
            last = normalize_email_part(applicant.last_name)
            base = f"{first}{last}".lower()
            email_map.setdefault(base, []).append(applicant)

        updated = 0
        for base, group in email_map.items():
            for i, applicant in enumerate(group):
                suffix = "" if i == 0 else str(i + 1)
                new_email = f"{base}{suffix}@trendig.com"
                if applicant.email != new_email:
                    print(f"  {applicant.email} -> {new_email}")
                    applicant.email = new_email
                    updated += 1

        await db.commit()
        print(f"\nDone! Updated {updated} of {len(applicants)} applicant emails.")


if __name__ == "__main__":
    asyncio.run(main())
