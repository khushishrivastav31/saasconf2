"""Email Template CRUD endpoints (conference-scoped)."""

from uuid import UUID

from fastapi import APIRouter, Request
from sqlalchemy import select

from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    get_client_ip,
)
from app.core.exceptions import NotFoundError, ValidationError
from app.models.audit import AuditLog
from app.models.settings import EmailTemplate
from app.schemas.email_template import (
    EmailTemplateCreate,
    EmailTemplateListResponse,
    EmailTemplateResponse,
    EmailTemplateType,
    EmailTemplateUpdate,
)

from ._shared import _check_conference_admin, _resolve_conference

router = APIRouter()


# Default templates for each conference type
DEFAULT_TEMPLATES = {
    EmailTemplateType.APPLICANT_VERIFICATION: {
        "subject": "Please confirm your email for [Conference Name]",
        "body_html": """<h2>Please confirm your email</h2>
<p>Hi there,</p>
<p>Thanks for your involvement with <strong>[Conference Name]</strong> — you've been registered in our system as part of the Call for Papers.</p>
<p>Before we move forward, we just need you to confirm your email address:</p>
<p><a href="[Verify Link]" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 6px;">Verify my email address</a></p>
<p>If this email came as a surprise, you can simply ignore it — nothing else will happen.</p>
<p>If you have questions or need support, we're happy to help at [Support Email].</p>
<p>Warm regards,<br>The [Conference Name] Team</p>""",
        "body_text": """Please confirm your email

Hi there,

Thanks for your involvement with [Conference Name] — you've been registered in our system as part of the Call for Papers.

Before we move forward, we just need you to confirm your email address:
[Verify Link]

If this email came as a surprise, you can simply ignore it — nothing else will happen.

If you have questions or need support, we're happy to help at [Support Email].

Warm regards,
The [Conference Name] Team""",
    },
    EmailTemplateType.COMMITTEE_VERIFICATION: {
        "subject": "Please confirm your email for [Conference Name]",
        "body_html": """<h2>Please confirm your email</h2>
<p>Hi there,</p>
<p>Thanks for your involvement with <strong>[Conference Name]</strong> — you've been registered in our system as part of the Program Committee.</p>
<p>Before we move forward, we just need you to confirm your email address:</p>
<p><a href="[Verify Link]" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 6px;">Verify my email address</a></p>
<p>If this email came as a surprise, you can simply ignore it — nothing else will happen.</p>
<p>If you have questions or need support, we're happy to help at [Support Email].</p>
<p>Warm regards,<br>The [Conference Name] Team</p>""",
        "body_text": """Please confirm your email

Hi there,

Thanks for your involvement with [Conference Name] — you've been registered in our system as part of the Program Committee.

Before we move forward, we just need you to confirm your email address:
[Verify Link]

If this email came as a surprise, you can simply ignore it — nothing else will happen.

If you have questions or need support, we're happy to help at [Support Email].

Warm regards,
The [Conference Name] Team""",
    },
    EmailTemplateType.SUBMISSION_CONFIRMATION: {
        "subject": "Your Submission for [Conference Name]",
        "body_html": """<h2>Your Submission</h2>
<p>Hi there,</p>
<p>Thank you for submitting a proposal to <strong>[Conference Name]</strong>.</p>
<div style="margin: 20px 0; padding: 16px; background-color: #f3f4f6; border-radius: 8px;">
    <p style="margin: 0;"><strong>Proposal title:</strong> [Paper Title]</p>
    <p style="margin: 8px 0 0 0;"><strong>Speaker(s):</strong> [Speakers]</p>
</div>
<p>We will come back to you as soon as we have made a decision.</p>
<p>You can see the status of your paper in the CFP system.</p>
<p>Warm regards,<br>The [Conference Name] Team</p>""",
        "body_text": """Your Submission

Hi there,

Thank you for submitting a proposal to [Conference Name].

Proposal title: [Paper Title]
Speaker(s): [Speakers]

We will come back to you as soon as we have made a decision.

You can see the status of your paper in the CFP system.

Warm regards,
The [Conference Name] Team""",
    },
    EmailTemplateType.CO_SPEAKER_INVITATION: {
        "subject": "You've been invited as a co-speaker for '[Paper Title]'",
        "body_html": """<h2>Co-Speaker Invitation</h2>
<p>Hi there!</p>
<p><strong>[Main Speaker Name]</strong> has invited you to be a co-speaker for their presentation:</p>
<div style="margin: 20px 0; padding: 16px; background-color: #f3f4f6; border-radius: 8px;">
    <p style="margin: 0; font-size: 18px; font-weight: 600;">[Paper Title]</p>
    <p style="margin: 8px 0 0 0; color: #6b7280;">[Conference Name]</p>
</div>
<p>To view and respond to this invitation:</p>
<p><a href="[Portal Link]" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 6px;">View Invitation</a></p>
<p>If you have questions or need support, we're happy to help at [Support Email].</p>
<p>Warm regards,<br>The [Conference Name] Team</p>""",
        "body_text": """Co-Speaker Invitation

Hi there!

[Main Speaker Name] has invited you to be a co-speaker for their presentation:

"[Paper Title]"
[Conference Name]

To view and respond to this invitation, visit:
[Portal Link]

If you have questions or need support, we're happy to help at [Support Email].

Warm regards,
The [Conference Name] Team""",
    },
    EmailTemplateType.PASSWORD_RESET: {
        "subject": "Reset your password for [Conference Name]",
        "body_html": """<h2>Password Reset Request</h2>
<p>You requested to reset your password. Click the button below to set a new password:</p>
<p><a href="[Reset Link]" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 6px;">Reset Password</a></p>
<p>Or copy and paste this link into your browser:</p>
<p><a href="[Reset Link]">[Reset Link]</a></p>
<p>This link will expire in 1 hour.</p>
<p>If you didn't request a password reset, you can safely ignore this email.</p>
<p>Warm regards,<br>The [Conference Name] Team</p>""",
        "body_text": """Password Reset Request

You requested to reset your password. Visit the link below to set a new password:
[Reset Link]

This link will expire in 1 hour.

If you didn't request a password reset, you can safely ignore this email.

Warm regards,
The [Conference Name] Team""",
    },
    EmailTemplateType.NEW_MESSAGE_NOTIFICATION: {
        "subject": "New message: [Message Subject]",
        "body_html": """<h2>You have a new message</h2>
<p>Hi [First Name],</p>
<p>You have received a new message regarding <strong>[Conference Name]</strong>.</p>
<p><strong>Subject:</strong> [Message Subject]</p>
<p><a href="[Messages Link]" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 6px;">View Message</a></p>
<p>Or copy and paste this link into your browser:</p>
<p><a href="[Messages Link]">[Messages Link]</a></p>
<p>You can manage your notification preferences in your profile settings.</p>
<p>Warm regards,<br>The [Conference Name] Team</p>""",
        "body_text": """You have a new message

Hi [First Name],

You have received a new message regarding [Conference Name].

Subject: [Message Subject]

View your message here: [Messages Link]

You can manage your notification preferences in your profile settings.

Warm regards,
The [Conference Name] Team""",
    },
    EmailTemplateType.PAPER_ACCEPTANCE: {
        "subject": "Paper Acceptance - [Conference Name]",
        "body_html": """<p>Dear [First Name],</p>
<p>We are pleased to inform you that the following paper(s) have been accepted for <strong>[Conference Name]</strong>:</p>
[Paper List]
<p>We will be in touch with further details about the schedule and logistics.</p>
<p>Thank you for your contribution!</p>
<p>Warm regards,<br>The [Conference Name] Team</p>""",
        "body_text": """Dear [First Name],

We are pleased to inform you that the following paper(s) have been accepted for [Conference Name]:

[Paper List]

We will be in touch with further details about the schedule and logistics.

Thank you for your contribution!

Warm regards,
The [Conference Name] Team""",
    },
    EmailTemplateType.PAPER_REJECTION: {
        "subject": "Paper Decision - [Conference Name]",
        "body_html": """<p>Dear [First Name],</p>
<p>Thank you for your submission(s) to <strong>[Conference Name]</strong>. After careful review, we regret to inform you that the following paper(s) were not selected for this year's program:</p>
[Paper List]
<p>We appreciate your interest and encourage you to submit again in the future.</p>
<p>Warm regards,<br>The [Conference Name] Team</p>""",
        "body_text": """Dear [First Name],

Thank you for your submission(s) to [Conference Name]. After careful review, we regret to inform you that the following paper(s) were not selected for this year's program:

[Paper List]

We appreciate your interest and encourage you to submit again in the future.

Warm regards,
The [Conference Name] Team""",
    },
}


@router.get("/email-templates", response_model=EmailTemplateListResponse)
async def list_email_templates(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> EmailTemplateListResponse:
    """List all email templates for a conference."""
    conference = await _resolve_conference(conference_id, current_user, db)

    query = (
        select(EmailTemplate)
        .where(
            EmailTemplate.conference_id == conference.id,
            EmailTemplate.tenant_id == conference.tenant_id,
        )
        .order_by(EmailTemplate.template_type)
    )
    result = await db.execute(query)
    templates = list(result.scalars().all())

    # Get existing template types
    existing_types = {t.template_type for t in templates}

    # Add any missing default templates that haven't been customized yet
    for template_type in EmailTemplateType.CONFERENCE_TYPES:
        if template_type not in existing_types:
            # Create default template in memory (not saved to DB until customized)
            default = DEFAULT_TEMPLATES.get(template_type, {})
            templates.append(
                EmailTemplate(
                    id=None,  # Will be None for unsaved defaults
                    tenant_id=conference.tenant_id,
                    conference_id=conference.id,
                    template_type=template_type,
                    subject=default.get("subject", f"Default subject for {template_type}"),
                    body_html=default.get("body_html", ""),
                    body_text=default.get("body_text"),
                    is_active=True,
                )
            )

    items = [EmailTemplateResponse.model_validate(t) for t in templates]

    return EmailTemplateListResponse(
        items=items,
        total=len(items),
        page=1,
        page_size=len(items),
        pages=1,
    )


@router.get("/email-templates/{template_type}", response_model=EmailTemplateResponse)
async def get_email_template(
    conference_id: UUID,
    template_type: str,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> EmailTemplateResponse:
    """Get a specific email template for a conference."""
    if template_type not in EmailTemplateType.CONFERENCE_TYPES:
        raise ValidationError(f"Invalid conference template type: {template_type}")

    conference = await _resolve_conference(conference_id, current_user, db)

    result = await db.execute(
        select(EmailTemplate).where(
            EmailTemplate.conference_id == conference.id,
            EmailTemplate.tenant_id == conference.tenant_id,
            EmailTemplate.template_type == template_type,
        )
    )
    template = result.scalar_one_or_none()

    if not template:
        # Return default template (not saved to DB yet)
        default = DEFAULT_TEMPLATES.get(template_type, {})
        template = EmailTemplate(
            id=None,
            tenant_id=conference.tenant_id,
            conference_id=conference.id,
            template_type=template_type,
            subject=default.get("subject", f"Default subject for {template_type}"),
            body_html=default.get("body_html", ""),
            body_text=default.get("body_text"),
            is_active=True,
        )

    return EmailTemplateResponse.model_validate(template)


@router.post("/email-templates", response_model=EmailTemplateResponse)
async def create_email_template(
    conference_id: UUID,
    template_data: EmailTemplateCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> EmailTemplateResponse:
    """Create a new email template for a conference."""
    if template_data.template_type not in EmailTemplateType.CONFERENCE_TYPES:
        raise ValidationError(f"Invalid conference template type: {template_data.template_type}")

    conference = await _resolve_conference(conference_id, current_user, db)
    await _check_conference_admin(conference_id, current_user, db)

    # Check if template type already exists for this conference
    existing = await db.execute(
        select(EmailTemplate).where(
            EmailTemplate.conference_id == conference.id,
            EmailTemplate.tenant_id == conference.tenant_id,
            EmailTemplate.template_type == template_data.template_type,
        )
    )
    if existing.scalar_one_or_none():
        raise ValidationError(f"Template type '{template_data.template_type}' already exists for this conference")

    template = EmailTemplate(
        tenant_id=conference.tenant_id,
        conference_id=conference.id,
        template_type=template_data.template_type,
        subject=template_data.subject,
        body_html=template_data.body_html,
        body_text=template_data.body_text,
        is_active=template_data.is_active,
    )
    db.add(template)

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="email_template.create",
        resource_type="email_template",
        resource_id=template.id,
        details={"template_type": template.template_type, "conference_id": str(conference.id)},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(template)

    return EmailTemplateResponse.model_validate(template)


@router.put("/email-templates/{template_type}", response_model=EmailTemplateResponse)
async def update_email_template(
    conference_id: UUID,
    template_type: str,
    template_data: EmailTemplateUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> EmailTemplateResponse:
    """Update an existing email template or create from default."""
    if template_type not in EmailTemplateType.CONFERENCE_TYPES:
        raise ValidationError(f"Invalid conference template type: {template_type}")

    conference = await _resolve_conference(conference_id, current_user, db)
    await _check_conference_admin(conference_id, current_user, db)

    result = await db.execute(
        select(EmailTemplate).where(
            EmailTemplate.conference_id == conference.id,
            EmailTemplate.tenant_id == conference.tenant_id,
            EmailTemplate.template_type == template_type,
        )
    )
    template = result.scalar_one_or_none()

    if not template:
        # Create from default
        default = DEFAULT_TEMPLATES.get(template_type, {})
        template = EmailTemplate(
            tenant_id=conference.tenant_id,
            conference_id=conference.id,
            template_type=template_type,
            subject=default.get("subject", f"Default subject for {template_type}"),
            body_html=default.get("body_html", ""),
            body_text=default.get("body_text"),
            is_active=True,
        )
        db.add(template)

    update_data = template_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(template, field, value)

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="email_template.update",
        resource_type="email_template",
        resource_id=template.id,
        details={"template_type": template_type, "updated_fields": list(update_data.keys())},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(template)

    return EmailTemplateResponse.model_validate(template)


@router.delete("/email-templates/{template_type}")
async def delete_email_template(
    conference_id: UUID,
    template_type: str,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete (reset to default) an email template."""
    if template_type not in EmailTemplateType.CONFERENCE_TYPES:
        raise ValidationError(f"Invalid conference template type: {template_type}")

    conference = await _resolve_conference(conference_id, current_user, db)
    await _check_conference_admin(conference_id, current_user, db)

    result = await db.execute(
        select(EmailTemplate).where(
            EmailTemplate.conference_id == conference.id,
            EmailTemplate.tenant_id == conference.tenant_id,
            EmailTemplate.template_type == template_type,
        )
    )
    template = result.scalar_one_or_none()

    if not template:
        raise NotFoundError(f"Email template '{template_type}' not found (already using default)")

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="email_template.delete",
        resource_type="email_template",
        resource_id=template.id,
        details={"template_type": template_type},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.delete(template)
    await db.commit()

    return {"message": f"Email template '{template_type}' reset to default"}
