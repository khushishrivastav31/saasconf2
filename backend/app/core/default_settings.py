"""Default settings seeder for new conferences.

This module provides functions to create standard default settings
when a new conference is created, ensuring consistent baseline data
across all conferences.
"""

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.review import ReviewCriterion, ReviewQuestion, ReviewScaleOption, ReviewScoreScale
from app.models.settings import CFPCommitteeRole, PronounOption, VolunteerRole


# Default Pronoun Options
DEFAULT_PRONOUNS = [
    "He/Him",
    "She/Her",
    "They/Them",
    "He/They",
    "She/They",
    "Prefer not to say",
]

# Default Volunteer Roles
DEFAULT_VOLUNTEER_ROLES = [
    {"name": "Registration", "description": "Help attendees check in and receive badges"},
    {"name": "Room Monitor", "description": "Assist speakers and manage session rooms"},
    {"name": "AV Support", "description": "Help with audio/visual equipment setup"},
    {"name": "Wayfinding", "description": "Guide attendees around the venue"},
    {"name": "Speaker Liaison", "description": "Assist speakers with their needs"},
    {"name": "Social Media", "description": "Help with live coverage and social media"},
]

# Default Committee Roles
DEFAULT_COMMITTEE_ROLES = [
    {"name": "Chair", "description": "Overall program committee leadership"},
    {"name": "Co-Chair", "description": "Assists the chair with program decisions"},
    {"name": "Reviewer", "description": "Reviews and scores paper submissions"},
    {"name": "Track Lead", "description": "Leads a specific topic track"},
]

# Default Score Scales with options
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

# Default Review Criteria with questions
# Note: scale_name references are resolved at runtime to link to the created scales
DEFAULT_REVIEW_CRITERIA = [
    {
        "title": "Content Quality",
        "description": "Evaluate the quality and depth of the proposed content",
        "display_order": 1,
        "questions": [
            {
                "text": "Is the topic relevant to the conference theme?",
                "help_text": "Consider how well the topic aligns with the conference tracks and audience interests.",
                "scale_name": "1-5 Rating",
                "display_order": 1,
            },
            {
                "text": "Is the content original or does it bring a fresh perspective?",
                "help_text": "Look for unique insights, new approaches, or innovative ideas.",
                "scale_name": "1-5 Rating",
                "display_order": 2,
            },
            {
                "text": "Is the abstract clear and well-structured?",
                "help_text": "The abstract should clearly communicate what attendees will learn.",
                "scale_name": "1-5 Rating",
                "display_order": 3,
            },
        ],
    },
    {
        "title": "Speaker Experience",
        "description": "Assess the speaker's ability to deliver this content",
        "display_order": 2,
        "questions": [
            {
                "text": "Does the speaker have relevant experience with this topic?",
                "help_text": "Consider their background, previous talks, and expertise.",
                "scale_name": "1-5 Rating",
                "display_order": 1,
            },
            {
                "text": "Has the speaker demonstrated good presentation skills?",
                "help_text": "Look at videos, previous conference feedback, or speaking history.",
                "scale_name": "1-5 Rating",
                "display_order": 2,
            },
        ],
    },
    {
        "title": "Overall Recommendation",
        "description": "Your final assessment of this submission",
        "display_order": 3,
        "questions": [
            {
                "text": "Would you recommend accepting this submission?",
                "help_text": "Consider all factors: content quality, speaker ability, audience value.",
                "scale_name": "Accept/Reject",
                "display_order": 1,
            },
        ],
    },
]


async def seed_default_settings(
    db: AsyncSession,
    tenant_id: UUID,
    conference_id: UUID,
) -> None:
    """
    Create default settings for a newly created conference.

    This function is called after a conference is created to populate
    standard settings that most conferences need.

    Args:
        db: Database session
        tenant_id: The tenant ID
        conference_id: The newly created conference ID
    """
    # Seed Pronoun Options
    for name in DEFAULT_PRONOUNS:
        option = PronounOption(
            tenant_id=tenant_id,
            conference_id=conference_id,
            name=name,
        )
        db.add(option)

    # Seed Volunteer Roles
    for role_data in DEFAULT_VOLUNTEER_ROLES:
        role = VolunteerRole(
            tenant_id=tenant_id,
            conference_id=conference_id,
            name=role_data["name"],
            description=role_data["description"],
        )
        db.add(role)

    # Seed Committee Roles
    for role_data in DEFAULT_COMMITTEE_ROLES:
        role = CFPCommitteeRole(
            tenant_id=tenant_id,
            conference_id=conference_id,
            name=role_data["name"],
            description=role_data["description"],
        )
        db.add(role)

    # Seed Score Scales with their options and track by name for later reference
    scale_by_name: dict[str, ReviewScoreScale] = {}
    for scale_data in DEFAULT_SCORE_SCALES:
        scale = ReviewScoreScale(
            tenant_id=tenant_id,
            conference_id=conference_id,
            name=scale_data["name"],
            scale_type=scale_data["scale_type"],
        )
        db.add(scale)
        await db.flush()  # Get the scale ID
        scale_by_name[scale_data["name"]] = scale

        for option_data in scale_data["options"]:
            option = ReviewScaleOption(
                scale_id=scale.id,
                label=option_data["label"],
                numeric_value=option_data.get("numeric_value"),
                is_unsure=option_data.get("is_unsure", False),
                display_order=option_data["display_order"],
            )
            db.add(option)

    # Seed Review Criteria with their questions
    for criterion_data in DEFAULT_REVIEW_CRITERIA:
        criterion = ReviewCriterion(
            tenant_id=tenant_id,
            conference_id=conference_id,
            title=criterion_data["title"],
            description=criterion_data["description"],
            display_order=criterion_data["display_order"],
        )
        db.add(criterion)
        await db.flush()  # Get the criterion ID

        for question_data in criterion_data["questions"]:
            # Look up the scale by name if specified
            scale_id = None
            if "scale_name" in question_data:
                scale = scale_by_name.get(question_data["scale_name"])
                if scale:
                    scale_id = scale.id

            question = ReviewQuestion(
                criterion_id=criterion.id,
                tenant_id=tenant_id,
                conference_id=conference_id,
                text=question_data["text"],
                help_text=question_data.get("help_text"),
                score_scale_id=scale_id,
                display_order=question_data["display_order"],
            )
            db.add(question)

    # Note: We don't commit here - the calling code will commit
    # after all operations are complete
