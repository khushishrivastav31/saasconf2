"""One-time script to seed default settings for an existing conference (skips existing)."""

import asyncio
import sys

# Add the backend directory to the path
sys.path.insert(0, "/Users/josediaz/SaaSConf/backend")

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.config import get_settings
from app.models.conference import Conference
from app.models.review import ReviewCriterion, ReviewQuestion, ReviewScaleOption, ReviewScoreScale
from app.models.settings import CFPCommitteeRole, PronounOption, VolunteerRole

# Default data
DEFAULT_PRONOUNS = ["He/Him", "She/Her", "They/Them", "He/They", "She/They", "Prefer not to say"]

DEFAULT_VOLUNTEER_ROLES = [
    {"name": "Registration", "description": "Help attendees check in and receive badges"},
    {"name": "Room Monitor", "description": "Assist speakers and manage session rooms"},
    {"name": "AV Support", "description": "Help with audio/visual equipment setup"},
    {"name": "Wayfinding", "description": "Guide attendees around the venue"},
    {"name": "Speaker Liaison", "description": "Assist speakers with their needs"},
    {"name": "Social Media", "description": "Help with live coverage and social media"},
]

DEFAULT_COMMITTEE_ROLES = [
    {"name": "Chair", "description": "Overall program committee leadership"},
    {"name": "Co-Chair", "description": "Assists the chair with program decisions"},
    {"name": "Reviewer", "description": "Reviews and scores paper submissions"},
    {"name": "Track Lead", "description": "Leads a specific topic track"},
]

DEFAULT_SCORE_SCALES = [
    {
        "name": "1-5 Rating",
        "scale_type": "numeric_range",
        "options": [
            {"label": "1 - Poor", "numeric_value": 1, "display_order": 1},
            {"label": "2 - Below Average", "numeric_value": 2, "display_order": 2},
            {"label": "3 - Average", "numeric_value": 3, "display_order": 3},
            {"label": "4 - Good", "numeric_value": 4, "display_order": 4},
            {"label": "5 - Excellent", "numeric_value": 5, "display_order": 5},
            {"label": "N/A - Cannot evaluate", "numeric_value": None, "is_unsure": True, "display_order": 6},
        ],
    },
    {
        "name": "Yes/No",
        "scale_type": "binary",
        "options": [
            {"label": "Yes", "numeric_value": 1, "display_order": 1},
            {"label": "No", "numeric_value": 0, "display_order": 2},
            {"label": "Unsure", "numeric_value": None, "is_unsure": True, "display_order": 3},
        ],
    },
    {
        "name": "Accept/Reject",
        "scale_type": "binary",
        "options": [
            {"label": "Strong Accept", "numeric_value": 2, "display_order": 1},
            {"label": "Accept", "numeric_value": 1, "display_order": 2},
            {"label": "Borderline", "numeric_value": 0, "display_order": 3},
            {"label": "Reject", "numeric_value": -1, "display_order": 4},
            {"label": "Strong Reject", "numeric_value": -2, "display_order": 5},
        ],
    },
]

DEFAULT_REVIEW_CRITERIA = [
    {
        "title": "Content Quality",
        "description": "Evaluate the quality and depth of the proposed content",
        "display_order": 1,
        "questions": [
            {"text": "Is the topic relevant to the conference theme?", "help_text": "Consider how well the topic aligns with the conference tracks and audience interests.", "scale_name": "1-5 Rating", "display_order": 1},
            {"text": "Is the content original or does it bring a fresh perspective?", "help_text": "Look for unique insights, new approaches, or innovative ideas.", "scale_name": "1-5 Rating", "display_order": 2},
            {"text": "Is the abstract clear and well-structured?", "help_text": "The abstract should clearly communicate what attendees will learn.", "scale_name": "1-5 Rating", "display_order": 3},
        ],
    },
    {
        "title": "Speaker Experience",
        "description": "Assess the speaker's ability to deliver this content",
        "display_order": 2,
        "questions": [
            {"text": "Does the speaker have relevant experience with this topic?", "help_text": "Consider their background, previous talks, and expertise.", "scale_name": "1-5 Rating", "display_order": 1},
            {"text": "Has the speaker demonstrated good presentation skills?", "help_text": "Look at videos, previous conference feedback, or speaking history.", "scale_name": "1-5 Rating", "display_order": 2},
        ],
    },
    {
        "title": "Overall Recommendation",
        "description": "Your final assessment of this submission",
        "display_order": 3,
        "questions": [
            {"text": "Would you recommend accepting this submission?", "help_text": "Consider all factors: content quality, speaker ability, audience value.", "scale_name": "Accept/Reject", "display_order": 1},
        ],
    },
]


async def main():
    settings = get_settings()
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        # Find CyberQ conference
        result = await db.execute(select(Conference).where(Conference.name.ilike("%cyberq%")))
        conference = result.scalar_one_or_none()

        if not conference:
            print("CyberQ conference not found!")
            return

        tenant_id = conference.tenant_id
        conference_id = conference.id
        print(f"Found: {conference.name} (ID: {conference_id})")

        # Pronouns
        existing = await db.execute(select(PronounOption.name).where(PronounOption.conference_id == conference_id))
        existing_names = {r[0] for r in existing.fetchall()}
        added = 0
        for name in DEFAULT_PRONOUNS:
            if name not in existing_names:
                db.add(PronounOption(tenant_id=tenant_id, conference_id=conference_id, name=name))
                added += 1
        print(f"Pronouns: {added} added, {len(existing_names)} already existed")

        # Volunteer Roles
        existing = await db.execute(select(VolunteerRole.name).where(VolunteerRole.conference_id == conference_id))
        existing_names = {r[0] for r in existing.fetchall()}
        added = 0
        for role in DEFAULT_VOLUNTEER_ROLES:
            if role["name"] not in existing_names:
                db.add(VolunteerRole(tenant_id=tenant_id, conference_id=conference_id, name=role["name"], description=role["description"]))
                added += 1
        print(f"Volunteer Roles: {added} added, {len(existing_names)} already existed")

        # Committee Roles
        existing = await db.execute(select(CFPCommitteeRole.name).where(CFPCommitteeRole.conference_id == conference_id))
        existing_names = {r[0] for r in existing.fetchall()}
        added = 0
        for role in DEFAULT_COMMITTEE_ROLES:
            if role["name"] not in existing_names:
                db.add(CFPCommitteeRole(tenant_id=tenant_id, conference_id=conference_id, name=role["name"], description=role["description"]))
                added += 1
        print(f"Committee Roles: {added} added, {len(existing_names)} already existed")

        # Score Scales
        existing = await db.execute(select(ReviewScoreScale.name, ReviewScoreScale.id).where(ReviewScoreScale.conference_id == conference_id))
        existing_scales = {r[0]: r[1] for r in existing.fetchall()}
        scale_by_name = dict(existing_scales)
        added = 0
        for scale_data in DEFAULT_SCORE_SCALES:
            if scale_data["name"] not in existing_scales:
                scale = ReviewScoreScale(tenant_id=tenant_id, conference_id=conference_id, name=scale_data["name"], scale_type=scale_data["scale_type"])
                db.add(scale)
                await db.flush()
                scale_by_name[scale_data["name"]] = scale.id
                for opt in scale_data["options"]:
                    db.add(ReviewScaleOption(scale_id=scale.id, label=opt["label"], numeric_value=opt.get("numeric_value"), is_unsure=opt.get("is_unsure", False), display_order=opt["display_order"]))
                added += 1
        print(f"Score Scales: {added} added, {len(existing_scales)} already existed")

        # Review Criteria
        existing = await db.execute(select(ReviewCriterion.title, ReviewCriterion.id).where(ReviewCriterion.conference_id == conference_id))
        existing_criteria = {r[0]: r[1] for r in existing.fetchall()}
        added = 0
        for crit_data in DEFAULT_REVIEW_CRITERIA:
            if crit_data["title"] not in existing_criteria:
                crit = ReviewCriterion(tenant_id=tenant_id, conference_id=conference_id, title=crit_data["title"], description=crit_data["description"], display_order=crit_data["display_order"])
                db.add(crit)
                await db.flush()
                for q in crit_data["questions"]:
                    scale_id = scale_by_name.get(q.get("scale_name"))
                    db.add(ReviewQuestion(criterion_id=crit.id, tenant_id=tenant_id, conference_id=conference_id, text=q["text"], help_text=q.get("help_text"), score_scale_id=scale_id, display_order=q["display_order"]))
                added += 1
        print(f"Review Criteria: {added} added, {len(existing_criteria)} already existed")

        await db.commit()
        print("Done!")


if __name__ == "__main__":
    asyncio.run(main())
