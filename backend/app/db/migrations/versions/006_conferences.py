"""Add conferences table for conference management module.

Revision ID: 006_conferences
Revises: 005_tenant_company_details
Create Date: 2026-01-23

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


# revision identifiers, used by Alembic.
revision = "006_conferences"
down_revision = "005_tenant_company_details"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create conferences table
    op.create_table(
        'conferences',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('uuid_generate_v4()')),
        sa.Column('tenant_id', UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),

        # Basic info
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('abbreviation', sa.String(50), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('website', sa.String(500), nullable=True),
        sa.Column('logo_url', sa.String(500), nullable=True),

        # Dates
        sa.Column('start_date', sa.Date(), nullable=True),
        sa.Column('end_date', sa.Date(), nullable=True),

        # Location (can be virtual or physical)
        sa.Column('venue_name', sa.String(255), nullable=True),
        sa.Column('venue_address', sa.String(500), nullable=True),
        sa.Column('city', sa.String(100), nullable=True),
        sa.Column('country', sa.String(100), nullable=True),
        sa.Column('timezone', sa.String(50), nullable=True),
        sa.Column('is_virtual', sa.Boolean(), default=False),
        sa.Column('virtual_platform_url', sa.String(500), nullable=True),

        # Social media links stored as JSONB
        # Structure: {"linkedin": "url", "bluesky": "url", "mastodon": "url", "reddit": "url",
        #             "tiktok": "url", "instagram": "url", "facebook": "url", "twitter": "url", "youtube": "url"}
        sa.Column('social_links', JSONB, nullable=True, server_default='{}'),

        # Team members stored as JSONB array
        # Structure: [{"user_id": "uuid or null", "name": "John", "email": "john@example.com",
        #              "phone": "+123", "role": "Conference Chair", "is_manager": true}, ...]
        sa.Column('team_members', JSONB, nullable=True, server_default='[]'),

        # Settings and configuration
        sa.Column('settings', JSONB, nullable=True, server_default='{}'),

        # Status
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('is_published', sa.Boolean(), default=False),

        # Timestamps
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )

    # Create indexes
    op.create_index('ix_conferences_tenant_id', 'conferences', ['tenant_id'])
    op.create_index('ix_conferences_start_date', 'conferences', ['start_date'])
    op.create_index('ix_conferences_is_active', 'conferences', ['is_active'])


def downgrade() -> None:
    op.drop_index('ix_conferences_is_active', table_name='conferences')
    op.drop_index('ix_conferences_start_date', table_name='conferences')
    op.drop_index('ix_conferences_tenant_id', table_name='conferences')
    op.drop_table('conferences')
