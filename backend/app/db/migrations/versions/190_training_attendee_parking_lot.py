"""Training attendee parking lot — central identity + history.

Creates training_attendees (central identity, dedup by email) and
training_attendee_history (chronological events). Adds attendee_id FK
to both training_registration_attendees and offer_attendees.

Revision ID: 190
Revises: 189
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "190"
down_revision = "189"


def upgrade() -> None:
    # Central attendee identity
    op.create_table(
        "training_attendees",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("first_name", sa.String(200), nullable=False),
        sa.Column("last_name", sa.String(200), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index("idx_training_attendees_tenant", "training_attendees", ["tenant_id"])
    op.create_index("idx_training_attendees_status", "training_attendees", ["status"])
    op.create_unique_constraint("uq_training_attendees_tenant_email", "training_attendees", ["tenant_id", "email"])

    # Attendee history
    op.create_table(
        "training_attendee_history",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "attendee_id",
            UUID(as_uuid=True),
            sa.ForeignKey("training_attendees.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("event_type", sa.String(30), nullable=False),
        sa.Column(
            "placement_id",
            UUID(as_uuid=True),
            sa.ForeignKey("program_year_trainings.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("source_type", sa.String(30), nullable=True),
        sa.Column("source_id", UUID(as_uuid=True), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_training_att_history_attendee", "training_attendee_history", ["attendee_id"])
    op.create_index("idx_training_att_history_placement", "training_attendee_history", ["placement_id"])

    # FK links on existing tables
    op.add_column(
        "training_registration_attendees",
        sa.Column(
            "attendee_id",
            UUID(as_uuid=True),
            sa.ForeignKey("training_attendees.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("idx_training_reg_att_attendee", "training_registration_attendees", ["attendee_id"])

    op.add_column(
        "offer_attendees",
        sa.Column(
            "attendee_id",
            UUID(as_uuid=True),
            sa.ForeignKey("training_attendees.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("idx_offer_att_attendee", "offer_attendees", ["attendee_id"])


def downgrade() -> None:
    op.drop_index("idx_offer_att_attendee", table_name="offer_attendees")
    op.drop_column("offer_attendees", "attendee_id")
    op.drop_index("idx_training_reg_att_attendee", table_name="training_registration_attendees")
    op.drop_column("training_registration_attendees", "attendee_id")
    op.drop_table("training_attendee_history")
    op.drop_table("training_attendees")
