"""Default settings seeder for new conferences.

This module provides functions to create standard default settings
when a new conference is created, ensuring consistent baseline data
across all conferences.

Locale-aware formatting defaults
---------------------------------
``DEFAULT_SETTINGS`` contains baseline format values (US/English conventions).
``LOCALE_OVERRIDES`` maps BCP 47 locale tags to the subset of keys that
differ from the baseline.  ``get_default_settings(locale)`` merges them.

Supported locales: en-US, de-DE, fr-FR, es-ES, pt-BR, nl-NL, it-IT, ja-JP.
A bare language code (e.g. "de") is resolved to the most common regional
variant (e.g. "de-DE") automatically.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.models.review import ReviewCriterion, ReviewQuestion, ReviewScaleOption, ReviewScoreScale
from app.models.settings import CFPCommitteeRole, PronounOption, VolunteerRole

# ---------------------------------------------------------------------------
# Locale-aware formatting defaults
# ---------------------------------------------------------------------------

# Baseline defaults (US/English conventions).  Importable for callers that
# do not have a locale context.
DEFAULT_SETTINGS: dict[str, str | int] = {
    "date_format": "MM/DD/YYYY",
    "time_format": "12h",
    "decimal_separator": ".",
    "thousands_separator": ",",
    "currency_position": "before",
}

# Per-locale overrides -- only keys that differ from DEFAULT_SETTINGS.
LOCALE_OVERRIDES: dict[str, dict[str, str | int]] = {
    "en-US": {},  # identical to base defaults
    "de-DE": {
        "date_format": "DD.MM.YYYY",
        "time_format": "24h",
        "decimal_separator": ",",
        "thousands_separator": ".",
        "currency_position": "after",
    },
    "fr-FR": {
        "date_format": "DD/MM/YYYY",
        "time_format": "24h",
        "decimal_separator": ",",
        "thousands_separator": " ",
        "currency_position": "after",
    },
    "es-ES": {
        "date_format": "DD/MM/YYYY",
        "time_format": "24h",
        "decimal_separator": ",",
        "thousands_separator": ".",
        "currency_position": "after",
    },
    "pt-BR": {
        "date_format": "DD/MM/YYYY",
        "time_format": "24h",
        "decimal_separator": ",",
        "thousands_separator": ".",
        "currency_position": "before",
    },
    "nl-NL": {
        "date_format": "DD-MM-YYYY",
        "time_format": "24h",
        "decimal_separator": ",",
        "thousands_separator": ".",
        "currency_position": "after",
    },
    "it-IT": {
        "date_format": "DD/MM/YYYY",
        "time_format": "24h",
        "decimal_separator": ",",
        "thousands_separator": ".",
        "currency_position": "after",
    },
    "ja-JP": {
        "date_format": "YYYY/MM/DD",
        "time_format": "24h",
        "decimal_separator": ".",
        "thousands_separator": ",",
        "currency_position": "before",
    },
}

# Map bare language codes to their most common regional variant so that
# callers can pass either "de" or "de-DE".
_LANGUAGE_TO_LOCALE: dict[str, str] = {
    "en": "en-US",
    "de": "de-DE",
    "fr": "fr-FR",
    "es": "es-ES",
    "pt": "pt-BR",
    "nl": "nl-NL",
    "it": "it-IT",
    "ja": "ja-JP",
}


def get_default_settings(locale: str | None = None) -> dict[str, str | int]:
    """Return format defaults, optionally tailored to a locale.

    Args:
        locale: BCP 47 locale tag (e.g. ``"de-DE"``) or bare language code
                (e.g. ``"de"``).  ``None`` returns the base US/English defaults.

    Returns:
        A new dict with format settings.  The caller receives a copy so
        mutations do not affect the module-level constants.
    """
    if locale is None:
        return dict(DEFAULT_SETTINGS)

    # Normalise the locale tag: "de" -> "de-DE", "de-de" -> "de-DE"
    normalised = locale.strip()
    if "-" in normalised or "_" in normalised:
        # e.g. "de-de" / "de_DE" -> "de-DE"
        parts = normalised.replace("_", "-").split("-")
        normalised = f"{parts[0].lower()}-{parts[1].upper()}"
    else:
        normalised = _LANGUAGE_TO_LOCALE.get(normalised.lower(), normalised)

    overrides = LOCALE_OVERRIDES.get(normalised)
    if overrides is None:
        # Unknown locale -- fall back to base defaults
        return dict(DEFAULT_SETTINGS)

    merged = dict(DEFAULT_SETTINGS)
    merged.update(overrides)
    return merged


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

# Default Invoice Settings
# Used to populate invoice configuration when not explicitly set
DEFAULT_INVOICE_SETTINGS: dict[str, str | int | dict | None] = {
    "invoice_number_template": "[ConferenceSlug]_[YYYY]_[Count]",
    "invoice_counter_reset": "yearly",  # or "daily"
    "invoice_counter_value": 1,
    "invoice_counter_last_reset": None,
    "invoice_page_format": "A4",  # A4, Letter, Legal, A5, B5, Tabloid
    "invoice_company_info": {
        "name": "",
        "address_line1": "",
        "address_line2": "",
        "city": "",
        "postal_code": "",
        "country": "",
        "tax_id": "",
        "bank_name": "",
        "iban": "",
        "bic": "",
        "footer_text": "",
        "logo_url": None,
    },
    # Footer HTML rendered at the bottom of every PDF page (position: fixed)
    "invoice_footer_html": "",
    # Cancellation number settings (separate counter from invoices)
    "cancellation_number_template": "[ConferenceSlug]_C_[YYYY]_[Count]",
    "cancellation_counter_reset": "yearly",  # or "daily"
    "cancellation_counter_value": 1,
    "cancellation_counter_last_reset": None,
}

# Note: invoice_template_html is imported from invoice_pdf.py to avoid duplication
# Access via: from app.core.invoice_pdf import DEFAULT_INVOICE_TEMPLATE_HTML

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
    locale: str | None = None,
) -> None:
    """
    Create default settings for a newly created conference.

    This function is called after a conference is created to populate
    standard settings that most conferences need.

    When *locale* is provided, locale-aware formatting defaults (date format,
    number separators, currency position, etc.) are merged into the
    conference's ``settings`` JSONB column.

    Args:
        db: Database session
        tenant_id: The tenant ID
        conference_id: The newly created conference ID
        locale: Optional BCP 47 locale tag (e.g. ``"de-DE"``).
    """
    # Merge locale-aware format defaults into the conference settings JSONB
    if locale is not None:
        from app.models.conference import Conference  # local import to avoid circular deps

        format_defaults = get_default_settings(locale)
        result = await db.execute(select(Conference).where(Conference.id == conference_id))
        conference = result.scalar_one()
        existing = conference.settings or {}
        # Only set keys that are not already explicitly provided
        merged = {**format_defaults, **existing}
        conference.settings = merged
        flag_modified(conference, "settings")

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
        role = CFPCommitteeRole(  # type: ignore[assignment]
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
            name=scale_data["name"],  # type: ignore[index]
            scale_type=scale_data["scale_type"],  # type: ignore[index]
        )
        db.add(scale)
        await db.flush()  # Get the scale ID
        scale_by_name[scale_data["name"]] = scale  # type: ignore[index]

        for option_data in scale_data["options"]:  # type: ignore[index]
            option = ReviewScaleOption(  # type: ignore[assignment]
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

        for question_data in criterion_data["questions"]:  # type: ignore[attr-defined]
            # Look up the scale by name if specified
            scale_id = None
            if "scale_name" in question_data:
                scale = scale_by_name.get(question_data["scale_name"])  # type: ignore[assignment]
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
