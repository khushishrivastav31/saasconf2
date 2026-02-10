"""Add email_templates table.

Revision ID: 053_email_templates
Revises: 052_tenant_super_user
Create Date: 2026-02-10
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "053_email_templates"
down_revision = "052_tenant_super_user"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "email_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "conference_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("conferences.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("template_type", sa.String(50), nullable=False),
        sa.Column("subject", sa.String(255), nullable=False),
        sa.Column("body_html", sa.Text(), nullable=False),
        sa.Column("body_text", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # Indexes
    op.create_index("idx_email_templates_tenant", "email_templates", ["tenant_id"])
    op.create_index("idx_email_templates_conference", "email_templates", ["conference_id"])
    op.create_index(
        "idx_email_templates_type",
        "email_templates",
        ["tenant_id", "conference_id", "template_type"],
        unique=True,
    )

    # Insert default system template for tenant user welcome
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


def downgrade() -> None:
    op.drop_index("idx_email_templates_type", table_name="email_templates")
    op.drop_index("idx_email_templates_conference", table_name="email_templates")
    op.drop_index("idx_email_templates_tenant", table_name="email_templates")
    op.drop_table("email_templates")
