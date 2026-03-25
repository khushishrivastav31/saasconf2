"""Delete stale global tenant_user_welcome template so invite emails use DEFAULT_TEMPLATES.

Migration 053 seeded a global record (tenant_id=NULL) with outdated content.
The get_template() lookup found it before reaching the hardcoded DEFAULT_TEMPLATES,
causing a mismatch between what the admin UI shows and what's actually sent.

Revision ID: 169
Revises: 168
Create Date: 2026-03-25
"""

from alembic import op

revision = "169"
down_revision = "168"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        DELETE FROM email_templates
        WHERE tenant_id IS NULL
          AND conference_id IS NULL
          AND template_type = 'tenant_user_welcome'
    """)


def downgrade() -> None:
    # Re-insert the original global template from migration 053
    op.execute("""
        INSERT INTO email_templates (id, tenant_id, conference_id, template_type, subject, body_html, body_text)
        VALUES (
            gen_random_uuid(),
            NULL,
            NULL,
            'tenant_user_welcome',
            'Welcome! Please confirm your email',
            '<h2>Welcome!</h2>
<p>Hello,</p>
<p>You''ve been added as [User Type] to the conference administration solution of [Company Name].</p>
<p>To activate your account and confirm your email address, please click the link below:</p>
<p><a href="[Verify Link]" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 6px;">Verify my email address</a></p>
<p>If you weren''t expecting this invitation, you can safely ignore this email — no action is required.</p>
<p>If you have any questions or need help getting started, feel free to reach out to us at [Support Email].</p>
<p>Welcome aboard,<br>The [Company Name] Team</p>',
            'Welcome!

Hello,

You''ve been added as [User Type] to the conference administration solution of [Company Name].

To activate your account and confirm your email address, please visit:
[Verify Link]

If you weren''t expecting this invitation, you can safely ignore this email — no action is required.

If you have any questions or need help getting started, feel free to reach out to us at [Support Email].

Welcome aboard,
The [Company Name] Team'
        )
    """)
