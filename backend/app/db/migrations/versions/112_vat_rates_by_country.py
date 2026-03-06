"""Create vat_rates_by_country table and seed EU rates.

Revision ID: 112
Revises: 111
Create Date: 2026-03-06
"""

import uuid
from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "112"
down_revision: Union[str, None] = "111"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create vat_rates_by_country table and seed with 27 EU countries."""
    # Create table
    op.create_table(
        "vat_rates_by_country",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("country_code", sa.String(2), unique=True, nullable=False),
        sa.Column("country_name", sa.String(100), nullable=False),
        sa.Column("standard_rate", sa.Numeric(5, 2), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
    )

    # Create index
    op.create_index("idx_vat_rates_country_code", "vat_rates_by_country", ["country_code"])

    # Seed 27 EU countries with current standard VAT rates (as of 2026)
    conn = op.get_bind()
    eu_vat_rates = [
        ("AT", "Austria", "20.00"),
        ("BE", "Belgium", "21.00"),
        ("BG", "Bulgaria", "20.00"),
        ("HR", "Croatia", "25.00"),
        ("CY", "Cyprus", "19.00"),
        ("CZ", "Czech Republic", "21.00"),
        ("DK", "Denmark", "25.00"),
        ("EE", "Estonia", "22.00"),
        ("FI", "Finland", "25.50"),
        ("FR", "France", "20.00"),
        ("DE", "Germany", "19.00"),
        ("GR", "Greece", "24.00"),
        ("HU", "Hungary", "27.00"),
        ("IE", "Ireland", "23.00"),
        ("IT", "Italy", "22.00"),
        ("LV", "Latvia", "21.00"),
        ("LT", "Lithuania", "21.00"),
        ("LU", "Luxembourg", "17.00"),
        ("MT", "Malta", "18.00"),
        ("NL", "Netherlands", "21.00"),
        ("PL", "Poland", "23.00"),
        ("PT", "Portugal", "23.00"),
        ("RO", "Romania", "19.00"),
        ("SK", "Slovakia", "20.00"),
        ("SI", "Slovenia", "22.00"),
        ("ES", "Spain", "21.00"),
        ("SE", "Sweden", "25.00"),
    ]

    for code, name, rate in eu_vat_rates:
        conn.execute(
            sa.text("""
                INSERT INTO vat_rates_by_country (id, country_code, country_name, standard_rate)
                VALUES (gen_random_uuid(), :code, :name, :rate)
            """),
            {"code": code, "name": name, "rate": rate},
        )


def downgrade() -> None:
    """Drop vat_rates_by_country table."""
    op.drop_index("idx_vat_rates_country_code", table_name="vat_rates_by_country")
    op.drop_table("vat_rates_by_country")
