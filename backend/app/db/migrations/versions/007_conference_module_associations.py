"""Add conference-module association tables for many-to-many relationships.

Revision ID: 007_conf_associations
Revises: 006_conferences
Create Date: 2026-01-26

"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision = "007_conf_associations"
down_revision = "006_conferences"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # conference_volunteers junction table
    op.create_table(
        'conference_volunteers',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('uuid_generate_v4()')),
        sa.Column('conference_id', UUID(as_uuid=True), sa.ForeignKey('conferences.id', ondelete='CASCADE'), nullable=False),
        sa.Column('volunteer_id', UUID(as_uuid=True), sa.ForeignKey('volunteers.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('conference_id', 'volunteer_id', name='uq_conference_volunteer'),
    )
    op.create_index('ix_conf_vol_conference', 'conference_volunteers', ['conference_id'])
    op.create_index('ix_conf_vol_volunteer', 'conference_volunteers', ['volunteer_id'])

    # conference_locations junction table
    op.create_table(
        'conference_locations',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('uuid_generate_v4()')),
        sa.Column('conference_id', UUID(as_uuid=True), sa.ForeignKey('conferences.id', ondelete='CASCADE'), nullable=False),
        sa.Column('location_id', UUID(as_uuid=True), sa.ForeignKey('locations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('conference_id', 'location_id', name='uq_conference_location'),
    )
    op.create_index('ix_conf_loc_conference', 'conference_locations', ['conference_id'])
    op.create_index('ix_conf_loc_location', 'conference_locations', ['location_id'])

    # conference_cfps junction table
    op.create_table(
        'conference_cfps',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('uuid_generate_v4()')),
        sa.Column('conference_id', UUID(as_uuid=True), sa.ForeignKey('conferences.id', ondelete='CASCADE'), nullable=False),
        sa.Column('cfp_id', UUID(as_uuid=True), sa.ForeignKey('call_for_papers.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('conference_id', 'cfp_id', name='uq_conference_cfp'),
    )
    op.create_index('ix_conf_cfp_conference', 'conference_cfps', ['conference_id'])
    op.create_index('ix_conf_cfp_cfp', 'conference_cfps', ['cfp_id'])


def downgrade() -> None:
    op.drop_index('ix_conf_cfp_cfp', table_name='conference_cfps')
    op.drop_index('ix_conf_cfp_conference', table_name='conference_cfps')
    op.drop_table('conference_cfps')

    op.drop_index('ix_conf_loc_location', table_name='conference_locations')
    op.drop_index('ix_conf_loc_conference', table_name='conference_locations')
    op.drop_table('conference_locations')

    op.drop_index('ix_conf_vol_volunteer', table_name='conference_volunteers')
    op.drop_index('ix_conf_vol_conference', table_name='conference_volunteers')
    op.drop_table('conference_volunteers')
