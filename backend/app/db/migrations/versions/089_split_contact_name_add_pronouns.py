"""Split contact_person_name into first/last, add pronouns to registrations.

Revision ID: 089_contact_name_pronouns
Revises: 088_billing_vat_validated
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "089_contact_name_pronouns"
down_revision: str = "088_billing_vat_validated"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Split contact_person_name into first/last on billing_profiles
    op.add_column(
        "billing_profiles",
        sa.Column("contact_first_name", sa.String(255), nullable=True),
    )
    op.add_column(
        "billing_profiles",
        sa.Column("contact_last_name", sa.String(255), nullable=True),
    )

    # Migrate existing data: put full name in first_name, empty string in last_name
    op.execute(
        "UPDATE billing_profiles SET contact_first_name = contact_person_name, contact_last_name = ''"
    )

    # Now make them non-nullable
    op.alter_column("billing_profiles", "contact_first_name", nullable=False)
    op.alter_column("billing_profiles", "contact_last_name", nullable=False)

    # Drop old column
    op.drop_column("billing_profiles", "contact_person_name")

    # Add pronouns to registrations
    op.add_column(
        "registrations",
        sa.Column("pronouns", sa.String(50), nullable=True),
    )


def downgrade() -> None:
    # Remove pronouns
    op.drop_column("registrations", "pronouns")

    # Restore contact_person_name from first + last
    op.add_column(
        "billing_profiles",
        sa.Column("contact_person_name", sa.String(255), nullable=True),
    )
    op.execute(
        "UPDATE billing_profiles SET contact_person_name = TRIM(contact_first_name || ' ' || contact_last_name)"
    )
    op.alter_column("billing_profiles", "contact_person_name", nullable=False)

    op.drop_column("billing_profiles", "contact_last_name")
    op.drop_column("billing_profiles", "contact_first_name")
