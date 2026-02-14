"""Email template rendering with placeholder replacement.

Fetches templates from DB (with fallback to defaults) and replaces placeholders.
Context values are HTML-escaped before insertion to prevent XSS.
"""

from html import escape as html_escape
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.settings import EmailTemplate
from app.api.v1.settings.email_templates import DEFAULT_TEMPLATES
from app.schemas.email_template import EmailTemplateType


class RenderedEmail:
    """Container for a rendered email."""

    def __init__(self, subject: str, body_html: str, body_text: str | None):
        self.subject = subject
        self.body_html = body_html
        self.body_text = body_text


def replace_placeholders(text: str, context: dict[str, str], *, is_html: bool = False) -> str:
    """Replace all placeholders in text with values from context.

    Args:
        text: Template text containing [Placeholder] tokens.
        context: Mapping of placeholder names to values.
        is_html: When True, context values are HTML-escaped before insertion
                 to prevent XSS via user-supplied data (e.g. paper titles).
    """
    result = text
    for key, value in context.items():
        safe_value = html_escape(value) if is_html else value
        # Support both [Key] and [key] formats
        result = result.replace(f"[{key}]", safe_value)
    return result


async def get_template(
    db: AsyncSession,
    template_type: str,
    conference_id: UUID | None = None,
    tenant_id: UUID | None = None,
) -> tuple[str, str, str | None]:
    """
    Get email template content with fallback chain:
    1. Conference-specific template (if conference_id provided)
    2. Tenant-level template (if tenant_id provided) - future use
    3. System default template

    Returns (subject, body_html, body_text)
    """
    # Try conference-specific template first
    if conference_id:
        result = await db.execute(
            select(EmailTemplate).where(
                EmailTemplate.conference_id == conference_id,
                EmailTemplate.template_type == template_type,
                EmailTemplate.is_active == True,
            )
        )
        template = result.scalar_one_or_none()
        if template:
            return template.subject, template.body_html, template.body_text

    # Try system-level template (for system types like tenant_user_welcome)
    if template_type in EmailTemplateType.SYSTEM_TYPES:
        result = await db.execute(
            select(EmailTemplate).where(
                EmailTemplate.tenant_id.is_(None),
                EmailTemplate.conference_id.is_(None),
                EmailTemplate.template_type == template_type,
                EmailTemplate.is_active == True,
            )
        )
        template = result.scalar_one_or_none()
        if template:
            return template.subject, template.body_html, template.body_text

    # Fall back to hardcoded defaults
    default = DEFAULT_TEMPLATES.get(template_type, {})
    return (
        default.get("subject", f"Notification from SaaSConf"),
        default.get("body_html", ""),
        default.get("body_text"),
    )


async def render_email(
    db: AsyncSession,
    template_type: str,
    context: dict[str, str],
    conference_id: UUID | None = None,
    tenant_id: UUID | None = None,
) -> RenderedEmail:
    """
    Render an email by fetching template and replacing placeholders.

    Args:
        db: Database session
        template_type: Type of template (e.g., 'applicant_verification')
        context: Dict of placeholder values (e.g., {'First Name': 'John', 'Conference Name': 'PyCon'})
        conference_id: Optional conference ID for conference-specific templates
        tenant_id: Optional tenant ID for tenant-level templates

    Returns:
        RenderedEmail with subject, body_html, and body_text
    """
    subject, body_html, body_text = await get_template(
        db, template_type, conference_id, tenant_id
    )

    rendered_subject = replace_placeholders(subject, context)
    rendered_html = replace_placeholders(body_html, context, is_html=True)
    rendered_text = replace_placeholders(body_text, context) if body_text else None

    return RenderedEmail(rendered_subject, rendered_html, rendered_text)


# Convenience functions for building context dicts

def build_verification_context(
    *,
    first_name: str = "",
    last_name: str = "",
    email: str = "",
    conference_name: str = "",
    company_name: str = "",
    verify_link: str = "",
    support_email: str = "",
) -> dict[str, str]:
    """Build context for verification emails."""
    full_name = f"{first_name} {last_name}".strip() or email.split("@")[0]
    return {
        "First Name": first_name or full_name,
        "Last Name": last_name,
        "Full Name": full_name,
        "Email": email,
        "Conference Name": conference_name,
        "Company Name": company_name,
        "Verify Link": verify_link,
        "Support Email": support_email,
    }


def build_submission_context(
    *,
    first_name: str = "",
    last_name: str = "",
    email: str = "",
    conference_name: str = "",
    company_name: str = "",
    paper_title: str = "",
    speakers: str = "",
    portal_link: str = "",
    support_email: str = "",
) -> dict[str, str]:
    """Build context for submission confirmation emails."""
    full_name = f"{first_name} {last_name}".strip() or email.split("@")[0]
    return {
        "First Name": first_name or full_name,
        "Last Name": last_name,
        "Full Name": full_name,
        "Email": email,
        "Conference Name": conference_name,
        "Company Name": company_name,
        "Paper Title": paper_title,
        "Speakers": speakers,
        "Portal Link": portal_link,
        "Support Email": support_email,
    }


def build_cospeaker_context(
    *,
    first_name: str = "",
    last_name: str = "",
    email: str = "",
    conference_name: str = "",
    company_name: str = "",
    paper_title: str = "",
    main_speaker_name: str = "",
    portal_link: str = "",
    support_email: str = "",
) -> dict[str, str]:
    """Build context for co-speaker invitation emails."""
    full_name = f"{first_name} {last_name}".strip() or email.split("@")[0]
    return {
        "First Name": first_name or full_name,
        "Last Name": last_name,
        "Full Name": full_name,
        "Email": email,
        "Conference Name": conference_name,
        "Company Name": company_name,
        "Paper Title": paper_title,
        "Main Speaker Name": main_speaker_name,
        "Portal Link": portal_link,
        "Support Email": support_email,
    }


def build_password_reset_context(
    *,
    first_name: str = "",
    last_name: str = "",
    email: str = "",
    conference_name: str = "",
    company_name: str = "",
    reset_link: str = "",
    support_email: str = "",
) -> dict[str, str]:
    """Build context for password reset emails."""
    full_name = f"{first_name} {last_name}".strip() or email.split("@")[0]
    return {
        "First Name": first_name or full_name,
        "Last Name": last_name,
        "Full Name": full_name,
        "Email": email,
        "Conference Name": conference_name,
        "Company Name": company_name,
        "Reset Link": reset_link,
        "Support Email": support_email,
    }


def build_tenant_welcome_context(
    *,
    first_name: str = "",
    last_name: str = "",
    email: str = "",
    company_name: str = "",
    user_type: str = "",
    verify_link: str = "",
    support_email: str = "",
) -> dict[str, str]:
    """Build context for tenant user welcome emails."""
    full_name = f"{first_name} {last_name}".strip() or email.split("@")[0]
    return {
        "First Name": first_name or full_name,
        "Last Name": last_name,
        "Full Name": full_name,
        "Email": email,
        "Company Name": company_name,
        "User Type": user_type,
        "Verify Link": verify_link,
        "Support Email": support_email,
    }


def build_new_message_context(
    *,
    first_name: str = "",
    conference_name: str = "",
    message_subject: str = "",
    messages_link: str = "",
) -> dict[str, str]:
    """Build context for new message notification emails."""
    return {
        "First Name": first_name,
        "Conference Name": conference_name,
        "Message Subject": message_subject,
        "Messages Link": messages_link,
    }
