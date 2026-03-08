"""update registration item names with session titles

Revision ID: 118
Revises: 117
Create Date: 2026-03-07 10:00:00.000000

Updates existing RegistrationItem records to combine booking option names
with session titles where both are present.
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "118"
down_revision = "117"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Update registration item names to include session titles."""
    # Get database connection
    conn = op.get_bind()

    # Query all registration items that have both booking_option_id and program_session_id
    items_to_update = conn.execute(
        sa.text("""
            SELECT
                ri.id,
                bo.name as option_name,
                ps.title as session_title
            FROM registration_items ri
            JOIN booking_options bo ON ri.booking_option_id = bo.id
            LEFT JOIN program_sessions ps ON ri.program_session_id = ps.id
            WHERE ri.booking_option_id IS NOT NULL
                AND ri.program_session_id IS NOT NULL
                AND ps.title IS NOT NULL
                AND ps.title != ''
        """)
    ).fetchall()

    # Update each item with combined name
    for item in items_to_update:
        item_id = item[0]
        option_name = item[1]
        session_title = item[2]

        # Combine: "Day 1 - Python Basics Tutorial"
        new_name = f"{option_name} - {session_title}"

        conn.execute(
            sa.text("""
                UPDATE registration_items
                SET item_name = :new_name
                WHERE id = :item_id
            """),
            {"new_name": new_name, "item_id": item_id},
        )

    # Commit is handled by alembic
    print(f"Updated {len(items_to_update)} registration items with session titles")


def downgrade() -> None:
    """Revert to just booking option names."""
    # Get database connection
    conn = op.get_bind()

    # Query all registration items that have booking_option_id
    items_to_revert = conn.execute(
        sa.text("""
            SELECT
                ri.id,
                bo.name as option_name
            FROM registration_items ri
            JOIN booking_options bo ON ri.booking_option_id = bo.id
            WHERE ri.booking_option_id IS NOT NULL
                AND ri.program_session_id IS NOT NULL
        """)
    ).fetchall()

    # Revert each item to just option name
    for item in items_to_revert:
        item_id = item[0]
        option_name = item[1]

        conn.execute(
            sa.text("""
                UPDATE registration_items
                SET item_name = :option_name
                WHERE id = :item_id
            """),
            {"option_name": option_name, "item_id": item_id},
        )

    print(f"Reverted {len(items_to_revert)} registration items to option names only")
