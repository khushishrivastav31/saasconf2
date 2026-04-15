"""Add FK constraint on inhouse_trainings.offer_id → customer_offers.id.

Previously offer_id was a plain UUID with no referential integrity.
This migration adds a proper FK with SET NULL on delete.

Revision ID: 191
Revises: 190
"""

from alembic import op

revision = "191"
down_revision = "190"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Clean up any orphaned offer_id references before adding FK
    op.execute("""
        UPDATE inhouse_trainings
        SET offer_id = NULL
        WHERE offer_id IS NOT NULL
          AND offer_id NOT IN (SELECT id FROM customer_offers)
    """)

    op.create_foreign_key(
        "fk_inhouse_trainings_offer_id",
        "inhouse_trainings",
        "customer_offers",
        ["offer_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_inhouse_trainings_offer_id", "inhouse_trainings", type_="foreignkey")
