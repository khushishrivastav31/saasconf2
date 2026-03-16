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

from datetime import timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.models.booking import BookingPeriod
from app.models.budget import Budget, BudgetCategory
from app.models.form_schema import ConferencePaperFormSchema
from app.models.review import ReviewCriterion, ReviewQuestion, ReviewScaleOption, ReviewScoreScale
from app.models.settings import (
    CFPCommitteeRole,
    ConferenceCurrency,
    EmailTemplate,
    PronounOption,
    SponsorPackage,
    TenantLocationType,
    VolunteerRole,
)

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

# Default EU member states (ISO 3166-1 alpha-2).
# Used when conference has no custom eu_countries configured.
DEFAULT_EU_COUNTRIES: list[str] = [
    "AT",
    "BE",
    "BG",
    "HR",
    "CY",
    "CZ",
    "DK",
    "EE",
    "FI",
    "FR",
    "DE",
    "GR",
    "HU",
    "IE",
    "IT",
    "LV",
    "LT",
    "LU",
    "MT",
    "NL",
    "PL",
    "PT",
    "RO",
    "SK",
    "SI",
    "ES",
    "SE",
]

# Countries where bank transfer payment is available (European countries).
# All other countries must use credit card.
BANK_TRANSFER_COUNTRIES: list[str] = [
    *DEFAULT_EU_COUNTRIES,
    # EEA (non-EU)
    "IS",  # Iceland
    "LI",  # Liechtenstein
    "NO",  # Norway
    # Other European
    "GB",  # United Kingdom
    "CH",  # Switzerland
    "AL",  # Albania
    "AD",  # Andorra
    "AM",  # Armenia
    "AZ",  # Azerbaijan
    "BY",  # Belarus
    "BA",  # Bosnia and Herzegovina
    "GE",  # Georgia
    "XK",  # Kosovo
    "MD",  # Moldova
    "MC",  # Monaco
    "ME",  # Montenegro
    "MK",  # North Macedonia
    "RU",  # Russia
    "SM",  # San Marino
    "RS",  # Serbia
    "TR",  # Turkey
    "UA",  # Ukraine
    "VA",  # Vatican City
]


# Default speaker expense settings (stored in conference.settings["speaker_expenses"])
DEFAULT_SPEAKER_EXPENSE_SETTINGS: dict[str, bool] = {
    "expenses_enabled": False,
}


# Default payment reminder settings (stored in conference.settings["payment_reminders"])
DEFAULT_PAYMENT_REMINDER_SETTINGS: dict[str, bool | int] = {
    "payment_reminders_enabled": True,
    "first_reminder_days": 2,
    "second_reminder_days": 17,
    "notify_admin_after_second": True,
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
    # Header HTML rendered at the top of every PDF page (position: fixed)
    "invoice_header_html": "",
    # Cancellation number settings (separate counter from invoices)
    "cancellation_number_template": "[ConferenceSlug]_C_[YYYY]_[Count]",
    "cancellation_counter_reset": "yearly",  # or "daily"
    "cancellation_counter_value": 1,
    "cancellation_counter_last_reset": None,
}

# Note: invoice_template_html is imported from invoice_pdf.py to avoid duplication
# Access via: from app.core.invoice_pdf import DEFAULT_INVOICE_TEMPLATE_HTML

# Default VAT Rules — EU standard decision table for conference invoices
# Each rule is identified by (attendance_type, customer_type, customer_location).
# Populated with standard EU rules; editable per conference if needed.
VALID_ATTENDANCE_TYPES = {"in_person", "virtual", "hybrid_onsite", "hybrid_online"}
VALID_CUSTOMER_TYPES = {"b2b", "b2c"}
VALID_CUSTOMER_LOCATIONS = {"domestic", "eu", "non_eu"}
VALID_VAT_RATE_SOURCES = {"conference", "customer", "none"}

DEFAULT_VAT_RULES: list[dict[str, str | bool]] = [
    # ── IN-PERSON — VAT always at event country (Art. 53 / Art. 54(1)) ──
    {
        "attendance_type": "in_person",
        "customer_type": "b2b",
        "customer_location": "domestic",
        "charge_vat": True,
        "vat_rate_source": "conference",
        "reverse_charge": False,
        "oss_applicable": False,
        "note": "Organiser charges local VAT",
    },
    {
        "attendance_type": "in_person",
        "customer_type": "b2b",
        "customer_location": "eu",
        "charge_vat": True,
        "vat_rate_source": "conference",
        "reverse_charge": False,
        "oss_applicable": False,
        "note": "Organiser charges local VAT (Art. 53)",
    },
    {
        "attendance_type": "in_person",
        "customer_type": "b2b",
        "customer_location": "non_eu",
        "charge_vat": True,
        "vat_rate_source": "conference",
        "reverse_charge": False,
        "oss_applicable": False,
        "note": "Organiser charges local VAT (Art. 53)",
    },
    {
        "attendance_type": "in_person",
        "customer_type": "b2c",
        "customer_location": "domestic",
        "charge_vat": True,
        "vat_rate_source": "conference",
        "reverse_charge": False,
        "oss_applicable": False,
        "note": "Organiser charges local VAT",
    },
    {
        "attendance_type": "in_person",
        "customer_type": "b2c",
        "customer_location": "eu",
        "charge_vat": True,
        "vat_rate_source": "conference",
        "reverse_charge": False,
        "oss_applicable": False,
        "note": "Organiser charges local VAT (Art. 54(1))",
    },
    {
        "attendance_type": "in_person",
        "customer_type": "b2c",
        "customer_location": "non_eu",
        "charge_vat": True,
        "vat_rate_source": "conference",
        "reverse_charge": False,
        "oss_applicable": False,
        "note": "Organiser charges local VAT (Art. 54(1))",
    },
    # ── VIRTUAL — B2B: reverse charge (Art. 44); B2C: consumer's country (Art. 54(1)) ──
    {
        "attendance_type": "virtual",
        "customer_type": "b2b",
        "customer_location": "domestic",
        "charge_vat": True,
        "vat_rate_source": "conference",
        "reverse_charge": False,
        "oss_applicable": False,
        "note": "Domestic B2B — organiser charges local VAT",
    },
    {
        "attendance_type": "virtual",
        "customer_type": "b2b",
        "customer_location": "eu",
        "charge_vat": False,
        "vat_rate_source": "none",
        "reverse_charge": True,
        "oss_applicable": False,
        "note": "Reverse charge — customer self-accounts (Art. 44)",
    },
    {
        "attendance_type": "virtual",
        "customer_type": "b2b",
        "customer_location": "non_eu",
        "charge_vat": False,
        "vat_rate_source": "none",
        "reverse_charge": False,
        "oss_applicable": False,
        "note": "Outside EU scope — no VAT charged",
    },
    {
        "attendance_type": "virtual",
        "customer_type": "b2c",
        "customer_location": "domestic",
        "charge_vat": True,
        "vat_rate_source": "conference",
        "reverse_charge": False,
        "oss_applicable": False,
        "note": "Domestic B2C — organiser charges local VAT",
    },
    {
        "attendance_type": "virtual",
        "customer_type": "b2c",
        "customer_location": "eu",
        "charge_vat": True,
        "vat_rate_source": "customer",
        "reverse_charge": False,
        "oss_applicable": True,
        "note": "Organiser charges customer's country VAT rate (Art. 54(1), OSS)",
    },
    {
        "attendance_type": "virtual",
        "customer_type": "b2c",
        "customer_location": "non_eu",
        "charge_vat": False,
        "vat_rate_source": "none",
        "reverse_charge": False,
        "oss_applicable": False,
        "note": "Outside EU scope — no VAT charged",
    },
    # ── HYBRID ONSITE — same rules as in-person ──
    {
        "attendance_type": "hybrid_onsite",
        "customer_type": "b2b",
        "customer_location": "domestic",
        "charge_vat": True,
        "vat_rate_source": "conference",
        "reverse_charge": False,
        "oss_applicable": False,
        "note": "Same as in-person",
    },
    {
        "attendance_type": "hybrid_onsite",
        "customer_type": "b2b",
        "customer_location": "eu",
        "charge_vat": True,
        "vat_rate_source": "conference",
        "reverse_charge": False,
        "oss_applicable": False,
        "note": "Same as in-person (Art. 53)",
    },
    {
        "attendance_type": "hybrid_onsite",
        "customer_type": "b2b",
        "customer_location": "non_eu",
        "charge_vat": True,
        "vat_rate_source": "conference",
        "reverse_charge": False,
        "oss_applicable": False,
        "note": "Same as in-person (Art. 53)",
    },
    {
        "attendance_type": "hybrid_onsite",
        "customer_type": "b2c",
        "customer_location": "domestic",
        "charge_vat": True,
        "vat_rate_source": "conference",
        "reverse_charge": False,
        "oss_applicable": False,
        "note": "Same as in-person",
    },
    {
        "attendance_type": "hybrid_onsite",
        "customer_type": "b2c",
        "customer_location": "eu",
        "charge_vat": True,
        "vat_rate_source": "conference",
        "reverse_charge": False,
        "oss_applicable": False,
        "note": "Same as in-person (Art. 54(1))",
    },
    {
        "attendance_type": "hybrid_onsite",
        "customer_type": "b2c",
        "customer_location": "non_eu",
        "charge_vat": True,
        "vat_rate_source": "conference",
        "reverse_charge": False,
        "oss_applicable": False,
        "note": "Same as in-person (Art. 54(1))",
    },
    # ── HYBRID ONLINE — same rules as virtual ──
    {
        "attendance_type": "hybrid_online",
        "customer_type": "b2b",
        "customer_location": "domestic",
        "charge_vat": True,
        "vat_rate_source": "conference",
        "reverse_charge": False,
        "oss_applicable": False,
        "note": "Domestic B2B — organiser charges local VAT",
    },
    {
        "attendance_type": "hybrid_online",
        "customer_type": "b2b",
        "customer_location": "eu",
        "charge_vat": False,
        "vat_rate_source": "none",
        "reverse_charge": True,
        "oss_applicable": False,
        "note": "Reverse charge — customer self-accounts (Art. 44)",
    },
    {
        "attendance_type": "hybrid_online",
        "customer_type": "b2b",
        "customer_location": "non_eu",
        "charge_vat": False,
        "vat_rate_source": "none",
        "reverse_charge": False,
        "oss_applicable": False,
        "note": "Outside EU scope — no VAT charged",
    },
    {
        "attendance_type": "hybrid_online",
        "customer_type": "b2c",
        "customer_location": "domestic",
        "charge_vat": True,
        "vat_rate_source": "conference",
        "reverse_charge": False,
        "oss_applicable": False,
        "note": "Domestic B2C — organiser charges local VAT",
    },
    {
        "attendance_type": "hybrid_online",
        "customer_type": "b2c",
        "customer_location": "eu",
        "charge_vat": True,
        "vat_rate_source": "customer",
        "reverse_charge": False,
        "oss_applicable": True,
        "note": "Organiser charges customer's country VAT rate (Art. 54(1), OSS)",
    },
    {
        "attendance_type": "hybrid_online",
        "customer_type": "b2c",
        "customer_location": "non_eu",
        "charge_vat": False,
        "vat_rate_source": "none",
        "reverse_charge": False,
        "oss_applicable": False,
        "note": "Outside EU scope — no VAT charged",
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


# ---------------------------------------------------------------------------
# New seed data constants
# ---------------------------------------------------------------------------

# Default Budget Categories (8 categories with colors for chart display)
DEFAULT_BUDGET_CATEGORIES: list[dict[str, str | int]] = [
    {"name": "Venue", "color": "#3B82F6", "sort_order": 1},
    {"name": "Catering", "color": "#10B981", "sort_order": 2},
    {"name": "AV/Technology", "color": "#8B5CF6", "sort_order": 3},
    {"name": "Marketing", "color": "#F59E0B", "sort_order": 4},
    {"name": "Travel", "color": "#EF4444", "sort_order": 5},
    {"name": "Speakers", "color": "#6366F1", "sort_order": 6},
    {"name": "Staffing", "color": "#EC4899", "sort_order": 7},
    {"name": "Miscellaneous", "color": "#6B7280", "sort_order": 8},
]

# Default Location Types
DEFAULT_LOCATION_TYPES: list[dict[str, str]] = [
    {"name": "Main Hall", "slug": "main_hall", "description": "Primary conference hall for keynotes and plenaries"},
    {"name": "Breakout Room", "slug": "breakout", "description": "Smaller room for parallel sessions"},
    {"name": "Workshop Room", "slug": "workshop", "description": "Hands-on workshop and tutorial space"},
    {"name": "Lobby/Foyer", "slug": "lobby", "description": "Common area for networking and sponsor booths"},
    {"name": "Outdoor Area", "slug": "outdoor", "description": "Outdoor space for breaks or social events"},
    {"name": "Virtual Room", "slug": "virtual", "description": "Online meeting room for remote participants"},
]

# Default Sponsor Packages (5 tiers)
DEFAULT_SPONSOR_PACKAGES: list[dict[str, str | int]] = [
    {"name": "Platinum", "description": "Top-tier sponsorship with maximum visibility", "price": 10000},
    {"name": "Gold", "description": "Premium sponsorship with prominent branding", "price": 5000},
    {"name": "Silver", "description": "Mid-tier sponsorship with good exposure", "price": 2500},
    {"name": "Bronze", "description": "Entry-level sponsorship", "price": 1000},
    {"name": "Community Partner", "description": "Non-monetary community partnership", "price": 0},
]

# Default Booking Periods (offsets relative to conference.start_date)
# Only seeded when the conference has a start_date set.
DEFAULT_BOOKING_PERIODS: list[dict[str, str | int]] = [
    {"name": "Super Early Bird", "sort_order": 1, "start_offset_days": -180, "end_offset_days": -91},
    {"name": "Early Bird", "sort_order": 2, "start_offset_days": -90, "end_offset_days": -31},
    {"name": "Regular", "sort_order": 3, "start_offset_days": -30, "end_offset_days": -1},
]

# Default Registration Questions (stored in conference.settings, disabled by default)
DEFAULT_REGISTRATION_QUESTIONS: list[dict] = [
    {
        "id": "dietary_requirements",
        "label": "Dietary Requirements",
        "type": "dropdown",
        "required": False,
        "enabled": False,
        "options": ["None", "Vegetarian", "Vegan", "Gluten-free", "Halal", "Kosher", "Other"],
    },
    {
        "id": "tshirt_size",
        "label": "T-Shirt Size",
        "type": "dropdown",
        "required": False,
        "enabled": False,
        "options": ["XS", "S", "M", "L", "XL", "XXL", "3XL"],
    },
    {
        "id": "accessibility_needs",
        "label": "Accessibility Needs",
        "type": "text",
        "required": False,
        "enabled": False,
        "placeholder": "Please describe any accessibility requirements",
    },
]

# Default Paper Form Built-in Fields Configuration
DEFAULT_PAPER_FORM_BUILTIN_FIELDS: dict[str, dict] = {
    "title": {"visible": True, "required": True, "max_chars": 500},
    "abstract_short": {"visible": True, "required": True, "max_chars": 800},
    "abstract_long": {"visible": True, "required": False, "max_chars": 8000},
    "level": {"visible": True, "required": False},
    "learning_objectives": {"visible": True, "required": False, "max_chars": 600},
}

# Fallback currency info when PlatformCurrency lookup fails
_FALLBACK_CURRENCIES: dict[str, dict[str, str]] = {
    "EUR": {"name": "Euro", "symbol": "€"},
    "USD": {"name": "US Dollar", "symbol": "$"},
    "GBP": {"name": "British Pound", "symbol": "£"},
    "CHF": {"name": "Swiss Franc", "symbol": "CHF"},
}


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
    # Always fetch the conference (needed for currency, start_date, settings writes)
    from app.models.conference import Conference  # local import to avoid circular deps

    result = await db.execute(select(Conference).where(Conference.id == conference_id))
    conference = result.scalar_one()

    # Merge locale-aware format defaults into the conference settings JSONB
    if locale is not None:
        format_defaults = get_default_settings(locale)
        existing = conference.settings or {}
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

    # Seed Budget Categories
    for cat_data in DEFAULT_BUDGET_CATEGORIES:
        db.add(
            BudgetCategory(
                tenant_id=tenant_id,
                conference_id=conference_id,
                name=cat_data["name"],  # type: ignore[arg-type]
                color=cat_data["color"],  # type: ignore[arg-type]
                sort_order=cat_data["sort_order"],  # type: ignore[arg-type]
            )
        )

    # Seed Initial Draft Budget
    currency = getattr(conference, "currency", None) or "EUR"
    db.add(
        Budget(
            tenant_id=tenant_id,
            conference_id=conference_id,
            name="Main Budget",
            status="draft",
            currency=currency,
        )
    )

    # Seed Location Types
    for loc_data in DEFAULT_LOCATION_TYPES:
        db.add(
            TenantLocationType(
                tenant_id=tenant_id,
                conference_id=conference_id,
                name=loc_data["name"],
                slug=loc_data["slug"],
                description=loc_data["description"],
            )
        )

    # Seed Sponsor Packages
    for pkg_data in DEFAULT_SPONSOR_PACKAGES:
        db.add(
            SponsorPackage(
                tenant_id=tenant_id,
                conference_id=conference_id,
                name=pkg_data["name"],  # type: ignore[arg-type]
                description=pkg_data["description"],  # type: ignore[arg-type]
                price=Decimal(str(pkg_data["price"])),
                currency=currency,
            )
        )

    # Seed Booking Periods (only if conference has a start_date)
    start_date = getattr(conference, "start_date", None)
    if start_date is not None:
        for period_data in DEFAULT_BOOKING_PERIODS:
            db.add(
                BookingPeriod(
                    tenant_id=tenant_id,
                    conference_id=conference_id,
                    name=period_data["name"],  # type: ignore[arg-type]
                    sort_order=period_data["sort_order"],  # type: ignore[arg-type]
                    start_date=start_date + timedelta(days=int(period_data["start_offset_days"])),
                    end_date=start_date + timedelta(days=int(period_data["end_offset_days"])),
                    is_active=True,
                )
            )

    # Seed Email Templates (all 14 conference types)
    from app.api.v1.settings.email_templates import DEFAULT_TEMPLATES  # local import
    from app.schemas.email_template import EmailTemplateType

    for template_type in EmailTemplateType.CONFERENCE_TYPES:
        defaults = DEFAULT_TEMPLATES.get(template_type)
        if defaults:
            db.add(
                EmailTemplate(
                    tenant_id=tenant_id,
                    conference_id=conference_id,
                    template_type=template_type,
                    subject=defaults["subject"],
                    body_html=defaults["body_html"],
                    body_text=defaults.get("body_text"),
                )
            )

    # Seed Registration Questions in conference.settings
    settings = conference.settings or {}
    if "registration_questions" not in settings:
        settings["registration_questions"] = DEFAULT_REGISTRATION_QUESTIONS
        conference.settings = settings
        flag_modified(conference, "settings")

    # Seed Standard Paper Form Schema
    db.add(
        ConferencePaperFormSchema(
            tenant_id=tenant_id,
            conference_id=conference_id,
            version=1,
            builtin_fields_config=DEFAULT_PAPER_FORM_BUILTIN_FIELDS,
        )
    )

    # Seed single Conference Currency from PlatformCurrency
    from app.models.platform_currency import PlatformCurrency

    platform_result = await db.execute(select(PlatformCurrency).where(PlatformCurrency.code == currency))
    platform_cur = platform_result.scalar_one_or_none()
    if platform_cur:
        cur_name = platform_cur.name
        cur_symbol = platform_cur.symbol
    else:
        fallback = _FALLBACK_CURRENCIES.get(currency, {"name": currency, "symbol": currency})
        cur_name = fallback["name"]
        cur_symbol = fallback["symbol"]

    db.add(
        ConferenceCurrency(
            tenant_id=tenant_id,
            conference_id=conference_id,
            code=currency,
            name=cur_name,
            symbol=cur_symbol,
        )
    )

    # Seed Currency & Tax settings into conference.settings JSONB
    settings = conference.settings or {}
    if "vat_rules" not in settings:
        settings["vat_rules"] = DEFAULT_VAT_RULES
    if "eu_countries" not in settings:
        settings["eu_countries"] = DEFAULT_EU_COUNTRIES
    if "bank_transfer_countries" not in settings:
        settings["bank_transfer_countries"] = BANK_TRANSFER_COUNTRIES
    if "speaker_expenses" not in settings:
        settings["speaker_expenses"] = DEFAULT_SPEAKER_EXPENSE_SETTINGS
    if "payment_reminders" not in settings:
        settings["payment_reminders"] = DEFAULT_PAYMENT_REMINDER_SETTINGS
    conference.settings = settings
    flag_modified(conference, "settings")

    # Seed Invoice Template settings into conference.settings JSONB
    for key, value in DEFAULT_INVOICE_SETTINGS.items():
        if key not in settings:
            settings[key] = value
    # Add invoice template HTML
    if "invoice_template_html" not in settings:
        from app.core.invoice_pdf import DEFAULT_INVOICE_TEMPLATE_HTML

        settings["invoice_template_html"] = DEFAULT_INVOICE_TEMPLATE_HTML
    conference.settings = settings
    flag_modified(conference, "settings")

    # Note: We don't commit here - the calling code will commit
    # after all operations are complete
