"""Call for Papers tables.

Revision ID: 003_call_for_papers
Revises: 002_volunteers_locations
Create Date: 2024-01-03

"""
from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '003_call_for_papers'
down_revision: Union[str, None] = '002_volunteers_locations'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create call_for_papers table
    op.create_table(
        'call_for_papers',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='draft'),
        sa.Column('open_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('close_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('max_submissions_per_speaker', sa.Integer, nullable=True),
        sa.Column('require_abstract', sa.Boolean, server_default='true'),
        sa.Column('require_bio', sa.Boolean, server_default='true'),
        sa.Column('allowed_formats', postgresql.JSONB, server_default='[]'),
        sa.Column('tracks', postgresql.JSONB, server_default='[]'),
        sa.Column('custom_fields', postgresql.JSONB, server_default='{}'),
        sa.Column('settings', postgresql.JSONB, server_default='{}'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )

    op.create_index('idx_cfp_tenant', 'call_for_papers', ['tenant_id'])
    op.create_index('idx_cfp_status', 'call_for_papers', ['tenant_id', 'status'])

    # Create submissions table
    op.create_table(
        'submissions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('cfp_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('call_for_papers.id', ondelete='CASCADE'), nullable=False),
        # Speaker info
        sa.Column('speaker_email', sa.String(255), nullable=False),
        sa.Column('speaker_name', sa.String(255), nullable=False),
        sa.Column('speaker_bio', sa.Text, nullable=True),
        sa.Column('speaker_company', sa.String(255), nullable=True),
        sa.Column('speaker_title', sa.String(255), nullable=True),
        # Submission content
        sa.Column('title', sa.String(500), nullable=False),
        sa.Column('abstract', sa.Text, nullable=True),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('format', sa.String(50), nullable=True),
        sa.Column('track', sa.String(100), nullable=True),
        sa.Column('level', sa.String(50), nullable=True),
        sa.Column('duration', sa.Integer, nullable=True),
        sa.Column('language', sa.String(10), nullable=True),
        sa.Column('tags', postgresql.JSONB, server_default='[]'),
        sa.Column('custom_answers', postgresql.JSONB, server_default='{}'),
        # Status
        sa.Column('status', sa.String(20), nullable=False, server_default='submitted'),
        # Review
        sa.Column('review_notes', sa.Text, nullable=True),
        sa.Column('review_score', sa.Float, nullable=True),
        # Timestamps
        sa.Column('submitted_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )

    op.create_index('idx_submission_tenant', 'submissions', ['tenant_id'])
    op.create_index('idx_submission_cfp', 'submissions', ['cfp_id'])
    op.create_index('idx_submission_status', 'submissions', ['tenant_id', 'status'])
    op.create_index('idx_submission_speaker', 'submissions', ['tenant_id', 'speaker_email'])

    # Enable RLS on new tables
    op.execute('ALTER TABLE call_for_papers ENABLE ROW LEVEL SECURITY')
    op.execute('ALTER TABLE submissions ENABLE ROW LEVEL SECURITY')

    # Create RLS policies for call_for_papers (only if app_user role exists)
    op.execute('''
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
                EXECUTE 'CREATE POLICY cfp_tenant_isolation ON call_for_papers
                    FOR ALL TO app_user
                    USING (
                        tenant_id = current_setting(''app.current_tenant_id'', true)::UUID
                        OR current_setting(''app.is_super_admin'', true)::BOOLEAN = true
                    )';
            END IF;
        END $$;
    ''')

    # Create RLS policies for submissions (only if app_user role exists)
    op.execute('''
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
                EXECUTE 'CREATE POLICY submissions_tenant_isolation ON submissions
                    FOR ALL TO app_user
                    USING (
                        tenant_id = current_setting(''app.current_tenant_id'', true)::UUID
                        OR current_setting(''app.is_super_admin'', true)::BOOLEAN = true
                    )';
            END IF;
        END $$;
    ''')


def downgrade() -> None:
    # Drop RLS policies
    op.execute('DROP POLICY IF EXISTS cfp_tenant_isolation ON call_for_papers')
    op.execute('DROP POLICY IF EXISTS submissions_tenant_isolation ON submissions')

    # Disable RLS
    op.execute('ALTER TABLE call_for_papers DISABLE ROW LEVEL SECURITY')
    op.execute('ALTER TABLE submissions DISABLE ROW LEVEL SECURITY')

    # Drop indexes
    op.drop_index('idx_submission_speaker', table_name='submissions')
    op.drop_index('idx_submission_status', table_name='submissions')
    op.drop_index('idx_submission_cfp', table_name='submissions')
    op.drop_index('idx_submission_tenant', table_name='submissions')
    op.drop_index('idx_cfp_status', table_name='call_for_papers')
    op.drop_index('idx_cfp_tenant', table_name='call_for_papers')

    # Drop tables
    op.drop_table('submissions')
    op.drop_table('call_for_papers')
