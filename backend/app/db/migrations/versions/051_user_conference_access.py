"""Add user_conference_access table for user-conference permissions.

Revision ID: 051_user_conference_access
Revises: 050_pronouns_conference_scoped
Create Date: 2026-02-08
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = "051_user_conference_access"
down_revision = "050_pronouns_conference_scoped"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create enum for access level
    access_level_enum = postgresql.ENUM(
        "admin", "read_only", name="conference_access_level", create_type=False
    )
    access_level_enum.create(op.get_bind(), checkfirst=True)

    # Create user_conference_access table
    op.create_table(
        "user_conference_access",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "conference_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("conferences.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "access_level",
            access_level_enum,
            nullable=False,
            server_default="read_only",
        ),
        sa.Column(
            "granted_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "granted_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # Create unique constraint: one access record per user-conference pair
    op.create_index(
        "idx_user_conference_access_unique",
        "user_conference_access",
        ["user_id", "conference_id"],
        unique=True,
    )

    # Create indexes for lookups
    op.create_index(
        "idx_user_conference_access_user",
        "user_conference_access",
        ["user_id"],
    )
    op.create_index(
        "idx_user_conference_access_conference",
        "user_conference_access",
        ["conference_id"],
    )

    # Add has_all_conference_access flag to users table
    # When True, user can access all conferences in the tenant
    op.add_column(
        "users",
        sa.Column(
            "has_all_conference_access",
            sa.Boolean(),
            nullable=False,
            server_default="true",
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "has_all_conference_access")
    op.drop_index("idx_user_conference_access_conference")
    op.drop_index("idx_user_conference_access_user")
    op.drop_index("idx_user_conference_access_unique")
    op.drop_table("user_conference_access")

    # Drop enum
    access_level_enum = postgresql.ENUM(
        "admin", "read_only", name="conference_access_level"
    )
    access_level_enum.drop(op.get_bind(), checkfirst=True)
