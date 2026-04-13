"""Training email settings and template endpoints.

Manages:
1. Email settings (sending toggle, header/footer HTML) stored in tenant.settings
2. Email templates for training registration + invoicing stored in tenant.settings

All tenant-scoped — shared across all trainings.
"""

from fastapi import APIRouter
from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

from app.core.dependencies import DbSessionDep, TenantAdminDep
from app.core.exceptions import NotFoundError, ValidationError
from app.core.html_sanitize import sanitize_html
from app.models.tenant import Tenant

router = APIRouter(tags=["training-email"])

# ── Settings key in tenant.settings ──────────────────────────────

SETTINGS_KEY = "training_email_settings"
TEMPLATES_KEY = "training_email_templates"

# ── Training template types ──────────────────────────────────────

TRAINING_TEMPLATE_TYPES = [
    "training_registration_confirmation",
    "training_registration_cancellation",
    "training_attendee_welcome",
    "training_schedule_publish",
    "training_schedule_update",
    "training_invoice_send",
    "training_payment_reminder_first",
    "training_payment_reminder_second",
    "training_payment_overdue_admin",
]

TRAINING_TEMPLATE_LABELS = {
    "training_registration_confirmation": "Registration Confirmation",
    "training_registration_cancellation": "Registration Cancellation",
    "training_attendee_welcome": "Attendee Welcome",
    "training_schedule_publish": "Trainer Schedule (Initial Publish)",
    "training_schedule_update": "Trainer Schedule (Update)",
    "training_invoice_send": "Invoice Send",
    "training_payment_reminder_first": "Payment Reminder (First)",
    "training_payment_reminder_second": "Payment Reminder (Second)",
    "training_payment_overdue_admin": "Payment Overdue (Admin)",
}

TRAINING_DEFAULT_TEMPLATES: dict[str, dict[str, str]] = {
    "training_registration_confirmation": {
        "subject": "Registration Confirmed — [Training Name]",
        "body_html": (
            "<h2>Registration Confirmed</h2>"
            "<p>Hi [First Name],</p>"
            "<p>Your registration for <strong>[Training Name]</strong> has been confirmed.</p>"
            "<p>We look forward to seeing you!</p>"
            "<p>Best regards,<br>[Company Name]</p>"
        ),
        "body_text": (
            "Registration Confirmed\n\n"
            "Hi [First Name],\n\n"
            "Your registration for [Training Name] has been confirmed.\n\n"
            "We look forward to seeing you!\n\n"
            "Best regards,\n[Company Name]"
        ),
    },
    "training_registration_cancellation": {
        "subject": "Registration Cancelled — [Training Name]",
        "body_html": (
            "<h2>Registration Cancelled</h2>"
            "<p>Hi [First Name],</p>"
            "<p>Your registration for <strong>[Training Name]</strong> has been cancelled.</p>"
            "<p>If this was a mistake, please contact us at [Support Email].</p>"
            "<p>Best regards,<br>[Company Name]</p>"
        ),
        "body_text": (
            "Registration Cancelled\n\n"
            "Hi [First Name],\n\n"
            "Your registration for [Training Name] has been cancelled.\n\n"
            "If this was a mistake, please contact us at [Support Email].\n\n"
            "Best regards,\n[Company Name]"
        ),
    },
    "training_attendee_welcome": {
        "subject": "Welcome to [Training Name]",
        "body_html": (
            "<h2>Welcome!</h2>"
            "<p>Hi [First Name],</p>"
            "<p>Welcome to <strong>[Training Name]</strong>. We're excited to have you.</p>"
            "<p>If you have any questions, reach out to us at [Support Email].</p>"
            "<p>Best regards,<br>[Company Name]</p>"
        ),
        "body_text": (
            "Welcome!\n\n"
            "Hi [First Name],\n\n"
            "Welcome to [Training Name]. We're excited to have you.\n\n"
            "If you have any questions, reach out to us at [Support Email].\n\n"
            "Best regards,\n[Company Name]"
        ),
    },
    "training_schedule_publish": {
        "subject": "Your Training Schedule [Year]",
        "body_html": (
            "<p>Dear [First Name],</p>"
            "<p>Your training schedule for <strong>[Year]</strong> has been finalized.</p>"
            "<p>Please find your personal schedule attached.</p>"
            "<p>You have <strong>[Training Count]</strong> training(s) scheduled.</p>"
            "<p>Best regards,<br>[Company Name]</p>"
        ),
        "body_text": (
            "Dear [First Name],\n\n"
            "Your training schedule for [Year] has been finalized.\n"
            "Please find your personal schedule attached.\n\n"
            "You have [Training Count] training(s) scheduled.\n\n"
            "Best regards,\n[Company Name]"
        ),
    },
    "training_schedule_update": {
        "subject": "Updated Training Schedule [Year]",
        "body_html": (
            "<p>Dear [First Name],</p>"
            "<p>Your training schedule for <strong>[Year]</strong> has been updated.</p>"
            "[Changes]"
            "<p>Please find your updated schedule attached.</p>"
            "<p>Best regards,<br>[Company Name]</p>"
        ),
        "body_text": (
            "Dear [First Name],\n\n"
            "Your training schedule for [Year] has been updated.\n\n"
            "[Changes]\n\n"
            "Please find your updated schedule attached.\n\n"
            "Best regards,\n[Company Name]"
        ),
    },
    "training_invoice_send": {
        "subject": "Invoice [Invoice Number] — [Training Name]",
        "body_html": (
            "<h2>Invoice</h2>"
            "<p>Hi [First Name],</p>"
            "<p>Please find attached your invoice <strong>[Invoice Number]</strong> "
            "for <strong>[Training Name]</strong>.</p>"
            "<p>Amount due: <strong>[Amount Due]</strong><br>Due date: <strong>[Due Date]</strong></p>"
            "[Payment Link]"
            "<p>Best regards,<br>[Company Name]</p>"
        ),
        "body_text": (
            "Invoice\n\n"
            "Hi [First Name],\n\n"
            "Please find attached your invoice [Invoice Number] for [Training Name].\n\n"
            "Amount due: [Amount Due]\nDue date: [Due Date]\n\n"
            "Best regards,\n[Company Name]"
        ),
    },
    "training_payment_reminder_first": {
        "subject": "Payment Reminder — [Training Name]",
        "body_html": (
            "<h2>Payment Reminder</h2>"
            "<p>Hi [First Name],</p>"
            "<p>This is a friendly reminder that invoice <strong>[Invoice Number]</strong> "
            "for <strong>[Training Name]</strong> is due on <strong>[Due Date]</strong>.</p>"
            "<p>Amount due: <strong>[Amount Due]</strong></p>"
            "<p>Best regards,<br>[Company Name]</p>"
        ),
        "body_text": (
            "Payment Reminder\n\n"
            "Hi [First Name],\n\n"
            "This is a friendly reminder that invoice [Invoice Number] "
            "for [Training Name] is due on [Due Date].\n\n"
            "Amount due: [Amount Due]\n\n"
            "Best regards,\n[Company Name]"
        ),
    },
    "training_payment_reminder_second": {
        "subject": "Second Payment Reminder — [Training Name]",
        "body_html": (
            "<h2>Second Payment Reminder</h2>"
            "<p>Hi [First Name],</p>"
            "<p>We noticed that invoice <strong>[Invoice Number]</strong> "
            "for <strong>[Training Name]</strong> is still outstanding.</p>"
            "<p>Amount due: <strong>[Amount Due]</strong><br>Due date: <strong>[Due Date]</strong></p>"
            "<p>Please arrange payment at your earliest convenience.</p>"
            "<p>Best regards,<br>[Company Name]</p>"
        ),
        "body_text": (
            "Second Payment Reminder\n\n"
            "Hi [First Name],\n\n"
            "We noticed that invoice [Invoice Number] for [Training Name] is still outstanding.\n\n"
            "Amount due: [Amount Due]\nDue date: [Due Date]\n\n"
            "Please arrange payment at your earliest convenience.\n\n"
            "Best regards,\n[Company Name]"
        ),
    },
    "training_payment_overdue_admin": {
        "subject": "Overdue Payment Alert — [Training Name]",
        "body_html": (
            "<h2>Overdue Payment Alert</h2>"
            "<p>Invoice <strong>[Invoice Number]</strong> for <strong>[Training Name]</strong> "
            "is overdue.</p>"
            "<p>Attendee: <strong>[First Name] [Last Name]</strong><br>"
            "Amount: <strong>[Amount Due]</strong><br>Due date: <strong>[Due Date]</strong></p>"
        ),
        "body_text": (
            "Overdue Payment Alert\n\n"
            "Invoice [Invoice Number] for [Training Name] is overdue.\n\n"
            "Attendee: [First Name] [Last Name]\n"
            "Amount: [Amount Due]\nDue date: [Due Date]"
        ),
    },
}

TRAINING_TEMPLATE_PLACEHOLDERS = [
    "[Training Name]",
    "[First Name]",
    "[Last Name]",
    "[Company Name]",
    "[Support Email]",
    "[Invoice Number]",
    "[Amount Due]",
    "[Due Date]",
    "[Year]",
    "[Training Count]",
    "[Changes]",
]


# ── Helpers ──────────────────────────────────────────────────────


async def _get_tenant(db: DbSessionDep, current_user: TenantAdminDep) -> Tenant:
    result = await db.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))
    return result.scalar_one()


# ── Email Settings Endpoints ─────────────────────────────────────


@router.get("/email-settings")
async def get_training_email_settings(
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Get training email settings (sending toggle + header/footer)."""
    tenant = await _get_tenant(db, current_user)
    settings = (tenant.settings or {}).get(SETTINGS_KEY, {})
    return {
        "email_sending_enabled": settings.get("email_sending_enabled", True),
        "email_header_html": settings.get("email_header_html", ""),
        "email_footer_html": settings.get("email_footer_html", ""),
    }


@router.put("/email-settings")
async def update_training_email_settings(
    data: dict,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Update training email settings."""
    tenant = await _get_tenant(db, current_user)

    settings = tenant.settings or {}
    existing = settings.get(SETTINGS_KEY, {})

    if "email_sending_enabled" in data:
        existing["email_sending_enabled"] = bool(data["email_sending_enabled"])
    if "email_header_html" in data:
        existing["email_header_html"] = sanitize_html(data["email_header_html"]) if data["email_header_html"] else ""
    if "email_footer_html" in data:
        existing["email_footer_html"] = sanitize_html(data["email_footer_html"]) if data["email_footer_html"] else ""

    settings[SETTINGS_KEY] = existing
    tenant.settings = settings
    flag_modified(tenant, "settings")
    await db.commit()
    await db.refresh(tenant)

    return {
        "email_sending_enabled": existing.get("email_sending_enabled", True),
        "email_header_html": existing.get("email_header_html", ""),
        "email_footer_html": existing.get("email_footer_html", ""),
    }


# ── Email Templates Endpoints ────────────────────────────────────


def _build_template_response(template_type: str, saved: dict | None) -> dict:
    """Build a single template response, merging saved data with defaults."""
    defaults = TRAINING_DEFAULT_TEMPLATES.get(template_type, {})
    if saved:
        return {
            "template_type": template_type,
            "display_name": TRAINING_TEMPLATE_LABELS.get(template_type, template_type),
            "subject": saved.get("subject", defaults.get("subject", "")),
            "body_html": saved.get("body_html", defaults.get("body_html", "")),
            "body_text": saved.get("body_text", defaults.get("body_text", "")),
            "is_active": saved.get("is_active", True),
            "is_default": False,
        }
    return {
        "template_type": template_type,
        "display_name": TRAINING_TEMPLATE_LABELS.get(template_type, template_type),
        "subject": defaults.get("subject", ""),
        "body_html": defaults.get("body_html", ""),
        "body_text": defaults.get("body_text", ""),
        "is_active": True,
        "is_default": True,
    }


@router.get("/email-templates")
async def list_training_email_templates(
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> list[dict]:
    """List all training email templates (saved + defaults)."""
    tenant = await _get_tenant(db, current_user)
    saved_templates = (tenant.settings or {}).get(TEMPLATES_KEY, {})

    return [_build_template_response(tt, saved_templates.get(tt)) for tt in TRAINING_TEMPLATE_TYPES]


@router.get("/email-templates/{template_type}")
async def get_training_email_template(
    template_type: str,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Get a single training email template."""
    if template_type not in TRAINING_TEMPLATE_TYPES:
        raise NotFoundError(f"Unknown template type: {template_type}")

    tenant = await _get_tenant(db, current_user)
    saved_templates = (tenant.settings or {}).get(TEMPLATES_KEY, {})

    return _build_template_response(template_type, saved_templates.get(template_type))


@router.put("/email-templates/{template_type}")
async def update_training_email_template(
    template_type: str,
    data: dict,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Create or update a training email template."""
    if template_type not in TRAINING_TEMPLATE_TYPES:
        raise ValidationError(f"Unknown template type: {template_type}")

    tenant = await _get_tenant(db, current_user)

    settings = tenant.settings or {}
    saved_templates = settings.get(TEMPLATES_KEY, {})

    template_data = saved_templates.get(template_type, {})

    if "subject" in data:
        template_data["subject"] = data["subject"]
    if "body_html" in data:
        template_data["body_html"] = sanitize_html(data["body_html"]) if data["body_html"] else ""
    if "body_text" in data:
        template_data["body_text"] = data["body_text"]
    if "is_active" in data:
        template_data["is_active"] = bool(data["is_active"])

    saved_templates[template_type] = template_data
    settings[TEMPLATES_KEY] = saved_templates
    tenant.settings = settings
    flag_modified(tenant, "settings")
    await db.commit()
    await db.refresh(tenant)

    return _build_template_response(template_type, template_data)


@router.delete("/email-templates/{template_type}")
async def reset_training_email_template(
    template_type: str,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Reset a training email template to its default."""
    if template_type not in TRAINING_TEMPLATE_TYPES:
        raise NotFoundError(f"Unknown template type: {template_type}")

    tenant = await _get_tenant(db, current_user)

    settings = tenant.settings or {}
    saved_templates = settings.get(TEMPLATES_KEY, {})

    if template_type in saved_templates:
        del saved_templates[template_type]
        settings[TEMPLATES_KEY] = saved_templates
        tenant.settings = settings
        flag_modified(tenant, "settings")
        await db.commit()
        await db.refresh(tenant)

    return _build_template_response(template_type, None)
