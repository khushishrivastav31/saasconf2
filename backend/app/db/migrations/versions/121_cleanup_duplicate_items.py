"""cleanup duplicate registration items

Revision ID: 121
Revises: 120
Create Date: 2026-03-07 12:05:00.000000

Removes RegistrationItems that duplicate the main booking_option_id.
This migration cleans up data created by the old frontend logic that
incorrectly created RegistrationItems for the main booking option.
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "121"
down_revision = "120"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Migrate session data to main_session_id, then delete duplicate RegistrationItems."""
    # Step 1: Copy program_session_id from duplicate RegistrationItems to registrations.main_session_id
    op.execute("""
        UPDATE registrations r
        SET main_session_id = ri.program_session_id
        FROM registration_items ri
        WHERE ri.registration_id = r.id
          AND ri.booking_option_id = r.booking_option_id
          AND ri.item_type = 'booking_option'
          AND ri.program_session_id IS NOT NULL
          AND r.main_session_id IS NULL
    """)

    # Step 2: Delete duplicate RegistrationItems (now that session data is preserved)
    op.execute("""
        DELETE FROM registration_items ri
        USING registrations r
        WHERE ri.registration_id = r.id
          AND ri.booking_option_id = r.booking_option_id
          AND ri.item_type = 'booking_option'
    """)


def downgrade() -> None:
    """No downgrade - this is a data cleanup operation."""
    pass
