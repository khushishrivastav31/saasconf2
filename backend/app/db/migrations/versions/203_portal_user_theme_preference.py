"""Add theme_preference to portal_users and backfill from cfp_applicants.

The unified portal UI needs a per-user theme preference. Before the portal
unification, this setting lived on ``cfp_applicants.theme_preference`` and
``users.theme_preference`` — with the unified login replacing the CFP-only
applicant session, the preference must follow the portal identity.

Backfill strategy: for each portal_user, inherit the theme from any linked
cfp_applicant that has a non-null preference (applicants were the original
source of truth). Users who never set a theme remain NULL — the frontend
falls back to the system default.

Revision ID: 203
Revises: 202
"""

import sqlalchemy as sa
from alembic import op

revision = "203"
down_revision = "202"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "portal_users",
        sa.Column("theme_preference", sa.String(5), nullable=True),
    )

    op.execute(
        """
        UPDATE portal_users pu
        SET theme_preference = ca.theme_preference
        FROM cfp_applicants ca
        WHERE ca.portal_user_id = pu.id
          AND ca.theme_preference IS NOT NULL
          AND pu.theme_preference IS NULL
        """
    )


def downgrade() -> None:
    op.drop_column("portal_users", "theme_preference")
