"""Backfill default settings for existing conferences.

Seeds pronoun options, volunteer roles, committee roles, score scales,
review criteria, and review questions for any conference missing them.
This ensures conferences created before the auto-seeding logic have
the same baseline data as newly created ones.

Revision ID: 073_backfill_default_settings
Revises: 072_applicant_password_resets
Create Date: 2026-02-14
"""

from collections.abc import Sequence
from uuid import uuid4

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers
revision: str = "073_backfill_default_settings"
down_revision: str | None = "072_applicant_password_resets"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# ---------------------------------------------------------------------------
# Default data (mirrors app/core/default_settings.py)
# ---------------------------------------------------------------------------

DEFAULT_PRONOUNS = [
    "He/Him", "She/Her", "They/Them", "He/They", "She/They", "Prefer not to say",
]

DEFAULT_VOLUNTEER_ROLES = [
    ("Registration", "Help attendees check in and receive badges"),
    ("Room Monitor", "Assist speakers and manage session rooms"),
    ("AV Support", "Help with audio/visual equipment setup"),
    ("Wayfinding", "Guide attendees around the venue"),
    ("Speaker Liaison", "Assist speakers with their needs"),
    ("Social Media", "Help with live coverage and social media"),
]

DEFAULT_COMMITTEE_ROLES = [
    ("Chair", "Overall program committee leadership"),
    ("Co-Chair", "Assists the chair with program decisions"),
    ("Reviewer", "Reviews and scores paper submissions"),
    ("Track Lead", "Leads a specific topic track"),
]

DEFAULT_SCORE_SCALES = [
    {
        "name": "1-5 Rating",
        "scale_type": "numeric_range",
        "options": [
            ("1 - Poor", 1, False, 1),
            ("2 - Below Average", 2, False, 2),
            ("3 - Average", 3, False, 3),
            ("4 - Good", 4, False, 4),
            ("5 - Excellent", 5, False, 5),
            ("N/A - Cannot evaluate", None, True, 6),
        ],
    },
    {
        "name": "Yes/No",
        "scale_type": "binary",
        "options": [
            ("Yes", 1, False, 1),
            ("No", 0, False, 2),
            ("Unsure", None, True, 3),
        ],
    },
    {
        "name": "Accept/Reject",
        "scale_type": "binary",
        "options": [
            ("Strong Accept", 2, False, 1),
            ("Accept", 1, False, 2),
            ("Borderline", 0, False, 3),
            ("Reject", -1, False, 4),
            ("Strong Reject", -2, False, 5),
        ],
    },
]

DEFAULT_REVIEW_CRITERIA = [
    {
        "title": "Content Quality",
        "description": "Evaluate the quality and depth of the proposed content",
        "display_order": 1,
        "questions": [
            ("Is the topic relevant to the conference theme?",
             "Consider how well the topic aligns with the conference tracks and audience interests.",
             "1-5 Rating", 1),
            ("Is the content original or does it bring a fresh perspective?",
             "Look for unique insights, new approaches, or innovative ideas.",
             "1-5 Rating", 2),
            ("Is the abstract clear and well-structured?",
             "The abstract should clearly communicate what attendees will learn.",
             "1-5 Rating", 3),
        ],
    },
    {
        "title": "Speaker Experience",
        "description": "Assess the speaker's ability to deliver this content",
        "display_order": 2,
        "questions": [
            ("Does the speaker have relevant experience with this topic?",
             "Consider their background, previous talks, and expertise.",
             "1-5 Rating", 1),
            ("Has the speaker demonstrated good presentation skills?",
             "Look at videos, previous conference feedback, or speaking history.",
             "1-5 Rating", 2),
        ],
    },
    {
        "title": "Overall Recommendation",
        "description": "Your final assessment of this submission",
        "display_order": 3,
        "questions": [
            ("Would you recommend accepting this submission?",
             "Consider all factors: content quality, speaker ability, audience value.",
             "Accept/Reject", 1),
        ],
    },
]


def upgrade() -> None:
    conn = op.get_bind()

    # Find conferences missing pronoun options (proxy for "never seeded")
    rows = conn.execute(sa.text("""
        SELECT c.id, c.tenant_id
        FROM conferences c
        WHERE NOT EXISTS (
            SELECT 1 FROM pronoun_options po
            WHERE po.conference_id = c.id
        )
    """)).fetchall()

    if not rows:
        return  # All conferences already have defaults

    for conf_id, tenant_id in rows:
        # --- Pronouns ---
        for name in DEFAULT_PRONOUNS:
            conn.execute(sa.text("""
                INSERT INTO pronoun_options (id, tenant_id, conference_id, name, is_active)
                VALUES (:id, :tid, :cid, :name, true)
                ON CONFLICT DO NOTHING
            """), {"id": str(uuid4()), "tid": str(tenant_id), "cid": str(conf_id), "name": name})

        # --- Volunteer Roles ---
        for name, description in DEFAULT_VOLUNTEER_ROLES:
            conn.execute(sa.text("""
                INSERT INTO volunteer_roles (id, tenant_id, conference_id, name, description, is_active)
                VALUES (:id, :tid, :cid, :name, :desc, true)
                ON CONFLICT DO NOTHING
            """), {"id": str(uuid4()), "tid": str(tenant_id), "cid": str(conf_id),
                   "name": name, "desc": description})

        # --- Committee Roles ---
        for name, description in DEFAULT_COMMITTEE_ROLES:
            conn.execute(sa.text("""
                INSERT INTO cfp_committee_roles (id, tenant_id, conference_id, name, description, is_active)
                VALUES (:id, :tid, :cid, :name, :desc, true)
                ON CONFLICT DO NOTHING
            """), {"id": str(uuid4()), "tid": str(tenant_id), "cid": str(conf_id),
                   "name": name, "desc": description})

        # --- Score Scales + Options ---
        scale_ids: dict[str, str] = {}
        for scale_data in DEFAULT_SCORE_SCALES:
            scale_id = str(uuid4())
            scale_ids[scale_data["name"]] = scale_id
            conn.execute(sa.text("""
                INSERT INTO review_score_scales (id, tenant_id, conference_id, name, scale_type, is_active)
                VALUES (:id, :tid, :cid, :name, :stype, true)
                ON CONFLICT DO NOTHING
            """), {"id": scale_id, "tid": str(tenant_id), "cid": str(conf_id),
                   "name": scale_data["name"], "stype": scale_data["scale_type"]})

            for label, numeric_value, is_unsure, display_order in scale_data["options"]:
                conn.execute(sa.text("""
                    INSERT INTO review_scale_options (id, scale_id, label, numeric_value, is_unsure, display_order)
                    VALUES (:id, :sid, :label, :nval, :unsure, :dorder)
                """), {"id": str(uuid4()), "sid": scale_id, "label": label,
                       "nval": numeric_value, "unsure": is_unsure, "dorder": display_order})

        # --- Review Criteria + Questions ---
        for crit_data in DEFAULT_REVIEW_CRITERIA:
            crit_id = str(uuid4())
            conn.execute(sa.text("""
                INSERT INTO review_criteria (id, tenant_id, conference_id, title, description, display_order, is_active)
                VALUES (:id, :tid, :cid, :title, :desc, :dorder, true)
                ON CONFLICT DO NOTHING
            """), {"id": crit_id, "tid": str(tenant_id), "cid": str(conf_id),
                   "title": crit_data["title"], "desc": crit_data["description"],
                   "dorder": crit_data["display_order"]})

            for q_text, q_help, scale_name, q_order in crit_data["questions"]:
                conn.execute(sa.text("""
                    INSERT INTO review_questions (id, criterion_id, tenant_id, conference_id,
                        text, help_text, score_scale_id, display_order, is_active)
                    VALUES (:id, :crit_id, :tid, :cid, :text, :help, :sid, :dorder, true)
                """), {"id": str(uuid4()), "crit_id": crit_id,
                       "tid": str(tenant_id), "cid": str(conf_id),
                       "text": q_text, "help": q_help,
                       "sid": scale_ids.get(scale_name), "dorder": q_order})


def downgrade() -> None:
    # Data-only migration — downgrade is a no-op.
    # Removing seeded data could break conferences that have customized their settings.
    pass
