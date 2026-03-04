"""Consolidate invoice company info address fields.

Migrates from address_line1 + address_line2 to single address field.
Data transformation: combines existing two-field addresses into single field.

Revision ID: 106_invoice_address_single_field
Revises: 105_deadlines
Create Date: 2026-03-03
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "106_invoice_address_single_field"
down_revision: Union[str, None] = "105_deadlines"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Migrate invoice company info from two address fields to one.

    Data transformation strategy:
    - Read all conference.settings JSONB
    - If invoice_company_info.address_line1 or address_line2 exist:
      - Combine into single address field
      - Keep legacy fields for backward compatibility
    - Update conference.settings

    No schema changes needed - JSONB is flexible.
    """
    conn = op.get_bind()

    # Fetch all conferences with invoice company info
    result = conn.execute(
        sa.text("""
            SELECT id, settings
            FROM conferences
            WHERE settings IS NOT NULL
            AND settings ? 'invoice_company_info'
        """)
    )

    for row in result:
        conference_id = row[0]
        settings = row[1]

        if "invoice_company_info" not in settings:
            continue

        company_info = settings["invoice_company_info"]

        # Skip if already has single address field or no address data
        if company_info.get("address"):
            continue

        address_line1 = company_info.get("address_line1", "")
        address_line2 = company_info.get("address_line2", "")

        if not address_line1 and not address_line2:
            continue

        # Combine address lines (skip empty lines)
        address_parts = [p.strip() for p in [address_line1, address_line2] if p and p.strip()]
        combined_address = ", ".join(address_parts)

        # Update company_info with new single address field
        company_info["address"] = combined_address
        # Keep legacy fields for backward compatibility during rollout

        # Update settings
        conn.execute(
            sa.text("""
                UPDATE conferences
                SET settings = :settings
                WHERE id = :id
            """),
            {"settings": settings, "id": conference_id},
        )


def downgrade() -> None:
    """No downgrade - single address field is backward compatible.

    Legacy address_line1/address_line2 fields are preserved during upgrade.
    Rollback is safe as old code can still use legacy fields.
    """
    pass
