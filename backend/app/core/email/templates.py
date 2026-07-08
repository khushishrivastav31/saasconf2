"""Email template rendering with placeholder replacement.

Fetches templates from DB (with fallback to defaults) and replaces placeholders.
Context values are HTML-escaped before insertion to prevent XSS.
"""

from html import escape as html_escape
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.settings.email_templates import DEFAULT_TEMPLATES
from app.models.conference import Conference
from app.models.settings import EmailTemplate
from app.schemas.email_template import EmailTemplateType


class RenderedEmail:
    """Container for a rendered email."""

    def __init__(self, subject: str, body_html: str, body_text: str | None):
        self.subject = subject
        self.body_html = body_html
        self.body_text = body_text


def replace_placeholders(
    text: str,
    context: dict[str, str],
    *,
    is_html: bool = False,
    raw_html_keys: set[str] | None = None,
) -> str:
    """Replace all placeholders in text with values from context.

    Args:
        text: Template text containing [Placeholder] tokens.
        context: Mapping of placeholder names to values.
        is_html: When True, context values are HTML-escaped before insertion
                 to prevent XSS via user-supplied data (e.g. paper titles).
        raw_html_keys: Optional set of context keys whose values are
                 already-trusted HTML and must NOT be escaped (e.g. the
                 news article body in the direct-message template).
                 Ignored when ``is_html=False`` since no escaping happens
                 either way. Caller is responsible for ensuring such
                 values were sanitized upstream (``nh3`` etc.). Closes
                 Brandon's QA 6.2.1, where news emails showed
                 ``<p>article 1</p>`` as literal text.
    """
    raw_keys = raw_html_keys or set()
    result = text
    for key, value in context.items():
        safe_value = html_escape(value) if is_html and key not in raw_keys else value
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

    # Try tenant-level system template (customized per tenant)
    if template_type in EmailTemplateType.SYSTEM_TYPES and tenant_id:
        result = await db.execute(
            select(EmailTemplate).where(
                EmailTemplate.tenant_id == tenant_id,
                EmailTemplate.conference_id.is_(None),
                EmailTemplate.template_type == template_type,
                EmailTemplate.is_active == True,
            )
        )
        template = result.scalar_one_or_none()
        if template:
            return template.subject, template.body_html, template.body_text

    # Try global system-level template (tenant_id=NULL, for backwards compat)
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
        default.get("subject", "Notification from SaaSConf"),
        default.get("body_html", ""),
        default.get("body_text"),
    )


async def _get_email_header_footer(
    db: AsyncSession,
    conference_id: UUID | None,
) -> tuple[str, str]:
    """Load email header/footer HTML from conference settings.

    Returns (header_html, footer_html) — empty strings when not configured.
    """
    if not conference_id:
        return "", ""
    result = await db.execute(select(Conference.settings).where(Conference.id == conference_id))
    settings = result.scalar_one_or_none()
    if not settings:
        return "", ""
    return (
        settings.get("email_header_html", "") or "",
        settings.get("email_footer_html", "") or "",
    )


def _wrap_with_header_footer(body_html: str, header_html: str, footer_html: str) -> str:
    """Wrap email body HTML with header and footer if configured."""
    if not header_html and not footer_html:
        return body_html
    parts: list[str] = []
    if header_html:
        parts.append(f'<div style="margin-bottom: 16px;">{header_html}</div>')
    parts.append(body_html)
    if footer_html:
        parts.append(
            f'<div style="margin-top: 16px; border-top: 1px solid #e5e7eb; padding-top: 16px;">{footer_html}</div>'
        )
    return "\n".join(parts)


async def render_email(
    db: AsyncSession,
    template_type: str,
    context: dict[str, str],
    conference_id: UUID | None = None,
    tenant_id: UUID | None = None,
    raw_html_keys: set[str] | None = None,
) -> RenderedEmail:
    """
    Render an email by fetching template and replacing placeholders.

    Args:
        db: Database session
        template_type: Type of template (e.g., 'applicant_verification')
        context: Dict of placeholder values (e.g., {'First Name': 'John', 'Conference Name': 'PyCon'})
        conference_id: Optional conference ID for conference-specific templates
        tenant_id: Optional tenant ID for tenant-level templates
        raw_html_keys: Optional set of context keys whose values are
            already-trusted HTML (skip escape). Used by the direct-message
            path so the article body isn't HTML-escaped into garbage —
            see ``replace_placeholders`` docstring.

    Returns:
        RenderedEmail with subject, body_html, and body_text
    """
    subject, body_html, body_text = await get_template(db, template_type, conference_id, tenant_id)

    rendered_subject = replace_placeholders(subject, context)
    rendered_html = replace_placeholders(body_html, context, is_html=True, raw_html_keys=raw_html_keys)
    rendered_text = replace_placeholders(body_text, context) if body_text else None

    # Wrap with conference-level email header/footer (replace placeholders in them too)
    header_html, footer_html = await _get_email_header_footer(db, conference_id)
    if header_html or footer_html:
        rendered_header = (
            replace_placeholders(header_html, context, is_html=True, raw_html_keys=raw_html_keys) if header_html else ""
        )
        rendered_footer = (
            replace_placeholders(footer_html, context, is_html=True, raw_html_keys=raw_html_keys) if footer_html else ""
        )
        rendered_html = _wrap_with_header_footer(rendered_html, rendered_header, rendered_footer)

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
    main_speaker_email: str = "",
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
        "Main Speaker Email": main_speaker_email,
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


def build_conference_team_invitation_context(
    *,
    first_name: str = "",
    last_name: str = "",
    email: str = "",
    conference_name: str = "",
    company_name: str = "",
    access_level: str = "",
    dashboard_link: str = "",
    support_email: str = "",
) -> dict[str, str]:
    """Build context for conference team invitation emails."""
    full_name = f"{first_name} {last_name}".strip() or email.split("@")[0]
    return {
        "First Name": first_name or full_name,
        "Last Name": last_name,
        "Full Name": full_name,
        "Email": email,
        "Conference Name": conference_name,
        "Company Name": company_name,
        "Access Level": access_level,
        "Dashboard Link": dashboard_link,
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


def build_sponsor_contract_context(
    *,
    recipient_name: str = "",
    company_name: str = "",
    conference_name: str = "",
    package_name: str = "",
    custom_message: str = "",
    contract_content: str = "",
) -> dict[str, str]:
    """Build context for sponsor contract send emails."""
    # Custom message block — only render if the user typed something
    custom_block = ""
    if custom_message:
        custom_block = (
            '<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />'
            f'<div style="margin-bottom: 16px;">{custom_message}</div>'
        )

    # Contract content block — inline HTML when not sent as attachment
    content_block = ""
    if contract_content:
        content_block = (
            '<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />'
            '<div style="padding: 24px; background-color: #ffffff; '
            'border: 1px solid #e5e7eb; border-radius: 8px;">'
            f"{contract_content}</div>"
        )

    return {
        "Recipient Name": recipient_name or "Sir or Madam",
        "Company Name": company_name,
        "Conference Name": conference_name,
        "Package Name": package_name,
        "Custom Message": custom_block,
        "Contract Content": content_block,
    }


def build_registration_invoice_context(
    *,
    recipient_name: str = "",
    conference_name: str = "",
    invoice_number: str = "",
    total_amount: str = "",
    due_date: str = "",
    support_email: str = "",
) -> dict[str, str]:
    """Build context for registration invoice emails."""
    return {
        "Recipient Name": recipient_name or "Sir or Madam",
        "Conference Name": conference_name,
        "Invoice Number": invoice_number,
        "Total Amount": total_amount,
        "Due Date": due_date,
        "Support Email": support_email,
    }


def build_attendee_welcome_context(
    *,
    first_name: str = "",
    last_name: str = "",
    email: str = "",
    conference_name: str = "",
    booking_option_name: str = "",
    password_setup_link: str = "",
    support_email: str = "",
) -> dict[str, str]:
    """Build context for attendee welcome emails."""
    full_name = f"{first_name} {last_name}".strip() or email.split("@")[0]
    return {
        "First Name": first_name or full_name,
        "Last Name": last_name,
        "Full Name": full_name,
        "Email": email,
        "Conference Name": conference_name,
        "Booking Option Name": booking_option_name,
        "Password Setup Link": password_setup_link,
        "Support Email": support_email,
    }


def build_payment_reminder_context(
    *,
    recipient_name: str = "",
    conference_name: str = "",
    invoice_number: str = "",
    invoice_amount: str = "",
    currency: str = "",
    due_date: str = "",
    days_overdue: str = "",
    support_email: str = "",
) -> dict[str, str]:
    """Build context for payment reminder emails."""
    return {
        "Recipient Name": recipient_name or "Sir or Madam",
        "Conference Name": conference_name,
        "Invoice Number": invoice_number,
        "Invoice Amount": invoice_amount,
        "Currency": currency,
        "Due Date": due_date,
        "Days Overdue": days_overdue,
        "Support Email": support_email,
    }


def build_registration_cancellation_context(
    *,
    registration_name: str = "",
    conference_name: str = "",
    invoice_number: str = "",
    cancellation_message: str = "",
) -> dict[str, str]:
    """Build context for registration cancellation emails."""
    # Format cancellation message as HTML block if provided
    message_block = ""
    if cancellation_message:
        message_block = (
            '<div style="margin: 20px 0; padding: 16px; background-color: #fffbeb; '
            'border-left: 4px solid #f59e0b; border-radius: 8px;">'
            f'<p style="margin: 0;"><strong>Message from organizers:</strong></p>'
            f'<p style="margin: 8px 0 0 0;">{cancellation_message}</p>'
            "</div>"
        )

    return {
        "Registration Name": registration_name or "Sir or Madam",
        "Conference Name": conference_name,
        "Invoice Number": invoice_number,
        "Cancellation Message": message_block,
    }


def build_invoice_send_context(
    *,
    recipient_name: str = "",
    conference_name: str = "",
    invoice_number: str = "",
    total_amount: str = "",
    due_date: str = "",
    support_email: str = "",
    custom_message: str = "",
    payment_link: str = "",
) -> dict[str, str]:
    """Build context for manual invoice send emails."""
    # Format custom message as HTML block if provided
    message_block = ""
    if custom_message:
        message_block = (
            '<div style="margin: 16px 0; padding: 16px; background-color: #f0f9ff; '
            'border-left: 4px solid #3b82f6; border-radius: 8px;">'
            f'<p style="margin: 0;">{custom_message}</p>'
            "</div>"
        )

    # Format payment link as button if provided
    link_block = ""
    if payment_link:
        link_block = (
            '<p><a href="' + payment_link + '" style="display: inline-block; padding: 12px 24px; '
            'background-color: #16a34a; color: white; text-decoration: none; border-radius: 6px;">'
            "Pay Online</a></p>"
        )

    return {
        "Recipient Name": recipient_name or "Sir or Madam",
        "Conference Name": conference_name,
        "Invoice Number": invoice_number,
        "Total Amount": total_amount,
        "Due Date": due_date,
        "Support Email": support_email,
        "Custom Message": message_block,
        "Payment Link": link_block,
    }


def build_direct_message_context(
    *,
    first_name: str = "",
    conference_name: str = "",
    sender_name: str = "",
    message_subject: str = "",
    message_content: str = "",
) -> dict[str, str]:
    """Build context for direct message emails (email-only messaging mode)."""
    return {
        "First Name": first_name or "there",
        "Conference Name": conference_name,
        "Sender Name": sender_name,
        "Message Subject": message_subject,
        "Message Content": message_content,
    }


def build_deadline_reminder_context(
    *,
    conference_name: str = "",
    deadline_title: str = "",
    deadline_description: str = "",
    due_date: str = "",
    reminder_status: str = "",
) -> dict[str, str]:
    """Build context for deadline reminder emails."""
    # Format description as HTML paragraph if provided
    desc_block = ""
    if deadline_description:
        desc_block = f'<p style="color: #374151; margin: 8px 0;">{deadline_description}</p>'

    return {
        "Conference Name": conference_name,
        "Deadline Title": deadline_title,
        "Deadline Description": desc_block,
        "Due Date": due_date,
        "Reminder Status": reminder_status,
    }


def build_paper_decision_context(
    *,
    first_name: str = "",
    last_name: str = "",
    email: str = "",
    conference_name: str = "",
    company_name: str = "",
    paper_title: str = "",
    support_email: str = "",
    speaker_feedback: str = "",
) -> dict[str, str]:
    """Build context for the immediate accept/reject decision email.

    ``Paper List`` mirrors the placeholder used by the batched program-publish
    notification so the same template works for both — here it's always a
    single-item list since this fires per-paper, per-decision.
    """
    full_name = f"{first_name} {last_name}".strip() or email.split("@")[0]
    feedback_block = ""
    if speaker_feedback:
        feedback_block = f'<p style="margin-top: 12px;"><strong>Feedback:</strong> {speaker_feedback}</p>'

    return {
        "First Name": first_name or full_name,
        "Last Name": last_name,
        "Full Name": full_name,
        "Email": email,
        "Conference Name": conference_name,
        "Company Name": company_name,
        "Paper Title": paper_title,
        "Paper List": f"<ul><li>{paper_title}</li></ul>",
        "Support Email": support_email,
        "Speaker Feedback": feedback_block,
    }


def build_payment_overdue_admin_context(
    *,
    conference_name: str = "",
    recipient_name: str = "",
    invoice_number: str = "",
    invoice_amount: str = "",
    currency: str = "",
    days_overdue: str = "",
    support_email: str = "",
) -> dict[str, str]:
    """Build context for payment overdue admin notification emails."""
    return {
        "Conference Name": conference_name,
        "Recipient Name": recipient_name,
        "Invoice Number": invoice_number,
        "Invoice Amount": invoice_amount,
        "Currency": currency,
        "Days Overdue": days_overdue,
        "Support Email": support_email,
    }
