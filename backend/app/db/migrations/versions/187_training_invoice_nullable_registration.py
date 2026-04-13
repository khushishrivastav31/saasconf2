"""Make training_registration_id nullable on training_invoices.

Allows manually created invoices that are not linked to a registration.
Also changes ondelete from CASCADE to SET NULL to preserve manually
created invoices when a registration is deleted.

Revision ID: 187
Revises: 186
"""

from alembic import op

revision = "187"
down_revision = "186"


def upgrade() -> None:
    # Drop the existing FK constraint (CASCADE) first
    op.drop_constraint(
        "training_invoices_training_registration_id_fkey",
        "training_invoices",
        type_="foreignkey",
    )
    # Make column nullable
    op.alter_column("training_invoices", "training_registration_id", nullable=True)
    # Re-add FK with SET NULL
    op.create_foreign_key(
        "training_invoices_training_registration_id_fkey",
        "training_invoices",
        "training_registrations",
        ["training_registration_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "training_invoices_training_registration_id_fkey",
        "training_invoices",
        type_="foreignkey",
    )
    op.alter_column("training_invoices", "training_registration_id", nullable=False)
    op.create_foreign_key(
        "training_invoices_training_registration_id_fkey",
        "training_invoices",
        "training_registrations",
        ["training_registration_id"],
        ["id"],
        ondelete="CASCADE",
    )
