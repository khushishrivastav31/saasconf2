"""Training finance settings endpoints.

All training finance settings are tenant-scoped, stored in
tenant.settings["training_finance"]. Covers: currency & tax, numbering,
company data, bank accounts, invoice templates, ZUGFeRD, Stripe,
and payment reminders.
"""

from fastapi import APIRouter
from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

from app.core.dependencies import DbSessionDep, TenantAdminDep
from app.core.exceptions import ValidationError
from app.core.html_sanitize import sanitize_html
from app.models.tenant import Tenant

router = APIRouter(prefix="/finance", tags=["training-finance"])

SETTINGS_KEY = "training_finance"

DEFAULT_FINANCE: dict = {
    "currency": "EUR",
    "invoice_currency": "EUR",
    "invoice_exchange_rate": None,
    "number_format_preset": "european",
    "decimal_separator": ",",
    "thousands_separator": ".",
    "currency_position": "after",
    "vat_rules": [],
    "eu_countries": [],
    "vat_rates": {},
    "invoice_number_template": "TR-[YYYY]-[Count]",
    "invoice_counter_reset": "yearly",
    "invoice_counter_value": 1,
    "cancellation_number_template": "TR-CN-[YYYY]-[Count]",
    "cancellation_counter_reset": "yearly",
    "cancellation_counter_value": 1,
    "company_info": {
        "name": "",
        "address_line1": "",
        "address_line2": "",
        "city": "",
        "postal_code": "",
        "country": "",
        "vat_number": "",
        "tax_id": "",
        "phone": "",
        "email": "",
        "footer_text": "",
    },
    "bank_accounts": [],
    "invoice_templates": {},
    "invoice_header_html": "",
    "invoice_footer_html": "",
    "invoice_page_format": "A4",
    "zugferd_enabled": False,
    "stripe": {
        "publishable_key": "",
        "secret_key": "",
        "webhook_secret": "",
        "is_enabled": False,
        "bank_transfer_countries": [],
    },
    "payment_reminders": {
        "enabled": True,
        "first_reminder_days": 2,
        "second_reminder_days": 17,
        "notify_admin_after_second": True,
    },
}


async def _get_tenant(db: DbSessionDep, current_user: TenantAdminDep) -> Tenant:
    result = await db.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))
    return result.scalar_one()


def _get_finance(tenant: Tenant) -> dict:
    return (tenant.settings or {}).get(SETTINGS_KEY, {})


def _save_finance(tenant: Tenant, finance: dict) -> None:
    settings = tenant.settings or {}
    settings[SETTINGS_KEY] = finance
    tenant.settings = settings
    flag_modified(tenant, "settings")


def _val(finance: dict, key: str, fallback: object = None) -> object:
    default = DEFAULT_FINANCE.get(key, fallback)
    return finance.get(key, default)


# ── Number format preset resolution ──────────────────────────────

NUMBER_FORMAT_PRESETS: dict[str, dict[str, str]] = {
    "us_uk": {"decimal_separator": ".", "thousands_separator": ",", "currency_position": "before"},
    "european": {"decimal_separator": ",", "thousands_separator": ".", "currency_position": "after"},
    "swiss": {"decimal_separator": ".", "thousands_separator": "'", "currency_position": "before"},
    "french": {"decimal_separator": ",", "thousands_separator": " ", "currency_position": "after"},
    "indian": {"decimal_separator": ".", "thousands_separator": ",", "currency_position": "before"},
    "no_separator": {"decimal_separator": ".", "thousands_separator": "", "currency_position": "before"},
}


def _build_currency_tax_response(f: dict) -> dict:
    from app.core.default_settings import DEFAULT_EU_COUNTRIES, DEFAULT_VAT_RULES

    return {
        "currency": _val(f, "currency"),
        "invoice_currency": _val(f, "invoice_currency"),
        "invoice_exchange_rate": _val(f, "invoice_exchange_rate"),
        "number_format_preset": _val(f, "number_format_preset"),
        "decimal_separator": _val(f, "decimal_separator"),
        "thousands_separator": _val(f, "thousands_separator"),
        "currency_position": _val(f, "currency_position"),
        "vat_rules": f.get("vat_rules") or DEFAULT_VAT_RULES,
        "eu_countries": f.get("eu_countries") or DEFAULT_EU_COUNTRIES,
        "vat_rates": f.get("vat_rates", {}),
    }


# ── Currency & Tax ───────────────────────────────────────────────


@router.get("/currency-tax")
async def get_currency_tax(current_user: TenantAdminDep, db: DbSessionDep) -> dict:
    tenant = await _get_tenant(db, current_user)
    f = _get_finance(tenant)
    return _build_currency_tax_response(f)


@router.put("/currency-tax")
async def update_currency_tax(data: dict, current_user: TenantAdminDep, db: DbSessionDep) -> dict:
    tenant = await _get_tenant(db, current_user)
    f = _get_finance(tenant)

    for key in (
        "currency",
        "invoice_currency",
        "invoice_exchange_rate",
        "vat_rules",
        "eu_countries",
        "vat_rates",
    ):
        if key in data:
            f[key] = data[key]

    # Resolve number format preset to separators
    if "number_format_preset" in data:
        preset_code = data["number_format_preset"]
        f["number_format_preset"] = preset_code
        fmt = NUMBER_FORMAT_PRESETS.get(preset_code)
        if fmt:
            f["decimal_separator"] = fmt["decimal_separator"]
            f["thousands_separator"] = fmt["thousands_separator"]
            f["currency_position"] = fmt["currency_position"]

    _save_finance(tenant, f)
    await db.commit()
    await db.refresh(tenant)
    f = _get_finance(tenant)
    return _build_currency_tax_response(f)


# ── Numbering ────────────────────────────────────────────────────


@router.get("/numbering")
async def get_numbering(current_user: TenantAdminDep, db: DbSessionDep) -> dict:
    tenant = await _get_tenant(db, current_user)
    f = _get_finance(tenant)
    return {
        "invoice_number_template": _val(f, "invoice_number_template"),
        "invoice_counter_reset": _val(f, "invoice_counter_reset"),
        "invoice_counter_value": _val(f, "invoice_counter_value"),
        "cancellation_number_template": _val(f, "cancellation_number_template"),
        "cancellation_counter_reset": _val(f, "cancellation_counter_reset"),
        "cancellation_counter_value": _val(f, "cancellation_counter_value"),
    }


@router.put("/numbering")
async def update_numbering(data: dict, current_user: TenantAdminDep, db: DbSessionDep) -> dict:
    tenant = await _get_tenant(db, current_user)
    f = _get_finance(tenant)
    for key in (
        "invoice_number_template",
        "invoice_counter_reset",
        "invoice_counter_value",
        "cancellation_number_template",
        "cancellation_counter_reset",
        "cancellation_counter_value",
    ):
        if key in data:
            f[key] = data[key]
    _save_finance(tenant, f)
    await db.commit()
    await db.refresh(tenant)
    f = _get_finance(tenant)
    return {
        "invoice_number_template": _val(f, "invoice_number_template"),
        "invoice_counter_reset": _val(f, "invoice_counter_reset"),
        "invoice_counter_value": _val(f, "invoice_counter_value"),
        "cancellation_number_template": _val(f, "cancellation_number_template"),
        "cancellation_counter_reset": _val(f, "cancellation_counter_reset"),
        "cancellation_counter_value": _val(f, "cancellation_counter_value"),
    }


# ── Company Data ─────────────────────────────────────────────────


@router.get("/company-data")
async def get_company_data(current_user: TenantAdminDep, db: DbSessionDep) -> dict:
    tenant = await _get_tenant(db, current_user)
    f = _get_finance(tenant)
    return {"company_info": f.get("company_info", DEFAULT_FINANCE["company_info"])}


@router.put("/company-data")
async def update_company_data(data: dict, current_user: TenantAdminDep, db: DbSessionDep) -> dict:
    tenant = await _get_tenant(db, current_user)
    f = _get_finance(tenant)
    if "company_info" in data:
        info = data["company_info"]
        if isinstance(info, dict):
            # Sanitize text fields
            for key in ("name", "address_line1", "address_line2", "footer_text"):
                if info.get(key):
                    info[key] = sanitize_html(info[key])
            f["company_info"] = info
    _save_finance(tenant, f)
    await db.commit()
    await db.refresh(tenant)
    f = _get_finance(tenant)
    return {"company_info": f.get("company_info", DEFAULT_FINANCE["company_info"])}


# ── Bank Accounts ────────────────────────────────────────────────


@router.get("/bank-accounts")
async def get_bank_accounts(current_user: TenantAdminDep, db: DbSessionDep) -> dict:
    tenant = await _get_tenant(db, current_user)
    f = _get_finance(tenant)
    return {"bank_accounts": f.get("bank_accounts", [])}


@router.put("/bank-accounts")
async def update_bank_accounts(data: dict, current_user: TenantAdminDep, db: DbSessionDep) -> dict:
    tenant = await _get_tenant(db, current_user)
    f = _get_finance(tenant)
    if "bank_accounts" in data:
        accounts = data["bank_accounts"]
        if not isinstance(accounts, list):
            raise ValidationError("bank_accounts must be an array")
        # Validate: at most one default
        defaults = [a for a in accounts if a.get("is_default")]
        if len(defaults) > 1:
            raise ValidationError("Only one bank account can be marked as default")
        f["bank_accounts"] = accounts
    _save_finance(tenant, f)
    await db.commit()
    await db.refresh(tenant)
    f = _get_finance(tenant)
    return {"bank_accounts": f.get("bank_accounts", [])}


# ── Invoice Templates ────────────────────────────────────────────


@router.get("/invoice-templates")
async def get_invoice_templates(current_user: TenantAdminDep, db: DbSessionDep) -> dict:
    tenant = await _get_tenant(db, current_user)
    f = _get_finance(tenant)
    return {
        "invoice_templates": f.get("invoice_templates", {}),
        "invoice_header_html": f.get("invoice_header_html", ""),
        "invoice_footer_html": f.get("invoice_footer_html", ""),
        "invoice_page_format": f.get("invoice_page_format", "A4"),
    }


@router.put("/invoice-templates")
async def update_invoice_templates(data: dict, current_user: TenantAdminDep, db: DbSessionDep) -> dict:
    tenant = await _get_tenant(db, current_user)
    f = _get_finance(tenant)
    if "invoice_templates" in data:
        templates = data["invoice_templates"]
        if isinstance(templates, dict):
            for key, html in templates.items():
                if html:
                    templates[key] = sanitize_html(html)
            f["invoice_templates"] = templates
    if "invoice_header_html" in data:
        f["invoice_header_html"] = sanitize_html(data["invoice_header_html"]) if data["invoice_header_html"] else ""
    if "invoice_footer_html" in data:
        f["invoice_footer_html"] = sanitize_html(data["invoice_footer_html"]) if data["invoice_footer_html"] else ""
    if "invoice_page_format" in data:
        fmt = data["invoice_page_format"]
        if fmt not in ("A4", "Letter", "Legal", "A5", "B5", "Tabloid"):
            raise ValidationError(f"Invalid page format: {fmt}")
        f["invoice_page_format"] = fmt
    _save_finance(tenant, f)
    await db.commit()
    await db.refresh(tenant)
    f = _get_finance(tenant)
    return {
        "invoice_templates": f.get("invoice_templates", {}),
        "invoice_header_html": f.get("invoice_header_html", ""),
        "invoice_footer_html": f.get("invoice_footer_html", ""),
        "invoice_page_format": f.get("invoice_page_format", "A4"),
    }


@router.post("/invoice-templates/preview")
async def preview_training_invoice_pdf(
    data: dict,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    template_type: str = "bank_transfer",
):
    """Generate preview PDF with unsaved training invoice settings."""
    from datetime import date, timedelta
    from io import BytesIO

    from fastapi.responses import StreamingResponse

    tenant = await _get_tenant(db, current_user)
    f = _get_finance(tenant)

    # Build preview settings from tenant finance + unsaved overrides
    preview_settings: dict = {
        "invoice_company_info": f.get("company_info", DEFAULT_FINANCE["company_info"]),
        "invoice_header_html": data.get("invoice_header_html", f.get("invoice_header_html", "")),
        "invoice_footer_html": data.get("invoice_footer_html", f.get("invoice_footer_html", "")),
        "invoice_page_format": f.get("invoice_page_format", "A4"),
    }

    if "invoice_company_info" in data:
        existing = preview_settings.get("invoice_company_info", {})
        preview_settings["invoice_company_info"] = {**existing, **data["invoice_company_info"]}

    # Resolve template HTML for the requested type
    templates = data.get("invoice_templates", f.get("invoice_templates", {}))
    if template_type in templates:
        preview_settings["invoice_template_html"] = templates[template_type]
    elif data.get("invoice_template_html"):
        preview_settings["invoice_template_html"] = data["invoice_template_html"]

    # Mock invoice data
    currency = f.get("currency", "EUR")
    mock_invoice_data = {
        "invoice_number": "PREVIEW-2026-00001",
        "issue_date": date.today(),
        "due_date": date.today() + timedelta(days=30),
        "recipient_name": "Sample Customer Ltd",
        "recipient_address_line1": "123 Example Street",
        "recipient_address_line2": None,
        "recipient_city": "Sample City",
        "recipient_postal_code": "12345",
        "recipient_country": "Germany",
        "recipient_vat_number": "DE123456789",
        "line_items": [
            {
                "description": "Training Registration - Standard",
                "quantity": 2,
                "unit_price": 250.00,
                "discount": 0.00,
                "total": 500.00,
            }
        ],
        "subtotal": 500.00,
        "tax_rate": 19.0,
        "tax_amount": 95.00,
        "total": 595.00,
        "currency": currency,
        "notes": "Sample training invoice for preview purposes.",
    }

    from app.core.invoice_pdf import generate_invoice_pdf_from_data

    # Create a minimal mock conference-like object for PDF generation
    class _MockConference:
        def __init__(self, t: Tenant, settings: dict, curr: str):
            self.id = t.id
            self.tenant_id = t.id
            self.tenant = t
            self.name = "Training Invoice Preview"
            self.settings = settings
            self.currency = curr
            self.invoice_currency = curr
            self.contact_email = t.resend_from_email or ""
            self.support_email = ""
            self.phone = t.phone or ""
            self.logo_url = t.logo_url
            self.abbreviation = ""
            self.vat_number = t.vat_number or ""
            self.country = t.country or ""

    mock_conf = _MockConference(tenant, preview_settings, currency)
    pdf_bytes = await generate_invoice_pdf_from_data(
        invoice_data=mock_invoice_data, settings=preview_settings, conference=mock_conf, db=db
    )

    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": "inline; filename=invoice_preview.pdf"},
    )


# ── ZUGFeRD ──────────────────────────────────────────────────────


@router.get("/zugferd")
async def get_zugferd(current_user: TenantAdminDep, db: DbSessionDep) -> dict:
    tenant = await _get_tenant(db, current_user)
    f = _get_finance(tenant)
    return {"zugferd_enabled": f.get("zugferd_enabled", False)}


@router.put("/zugferd")
async def update_zugferd(data: dict, current_user: TenantAdminDep, db: DbSessionDep) -> dict:
    tenant = await _get_tenant(db, current_user)
    f = _get_finance(tenant)
    if "zugferd_enabled" in data:
        f["zugferd_enabled"] = bool(data["zugferd_enabled"])
    _save_finance(tenant, f)
    await db.commit()
    await db.refresh(tenant)
    f = _get_finance(tenant)
    return {"zugferd_enabled": f.get("zugferd_enabled", False)}


# ── Stripe ───────────────────────────────────────────────────────


def _mask_key(key: str) -> str:
    """Mask a secret key, showing only first 3 and last 3 chars."""
    if not key or len(key) < 10:
        return key
    return key[:3] + "****" + key[-3:]


@router.get("/stripe")
async def get_stripe(current_user: TenantAdminDep, db: DbSessionDep) -> dict:
    tenant = await _get_tenant(db, current_user)
    f = _get_finance(tenant)
    stripe = f.get("stripe", DEFAULT_FINANCE["stripe"])
    # Mask secrets for non-super-users
    result = {**stripe}
    if not current_user.is_super_admin and not current_user.is_tenant_super_user:
        result["secret_key"] = _mask_key(result.get("secret_key", ""))
        result["webhook_secret"] = _mask_key(result.get("webhook_secret", ""))
    return result


@router.put("/stripe")
async def update_stripe(data: dict, current_user: TenantAdminDep, db: DbSessionDep) -> dict:
    tenant = await _get_tenant(db, current_user)
    f = _get_finance(tenant)
    stripe = f.get("stripe", {**DEFAULT_FINANCE["stripe"]})
    for key in ("publishable_key", "secret_key", "webhook_secret", "is_enabled", "bank_transfer_countries"):
        if key in data:
            # Don't overwrite with masked value
            if key in ("secret_key", "webhook_secret") and data[key] and "****" in str(data[key]):
                continue
            stripe[key] = data[key]
    f["stripe"] = stripe
    _save_finance(tenant, f)
    await db.commit()
    await db.refresh(tenant)
    f = _get_finance(tenant)
    result = {**f.get("stripe", DEFAULT_FINANCE["stripe"])}
    if not current_user.is_super_admin and not current_user.is_tenant_super_user:
        result["secret_key"] = _mask_key(result.get("secret_key", ""))
        result["webhook_secret"] = _mask_key(result.get("webhook_secret", ""))
    return result


# ── Payment Reminders ────────────────────────────────────────────


@router.get("/payment-reminders")
async def get_payment_reminders(current_user: TenantAdminDep, db: DbSessionDep) -> dict:
    tenant = await _get_tenant(db, current_user)
    f = _get_finance(tenant)
    return f.get("payment_reminders", DEFAULT_FINANCE["payment_reminders"])


@router.put("/payment-reminders")
async def update_payment_reminders(data: dict, current_user: TenantAdminDep, db: DbSessionDep) -> dict:
    tenant = await _get_tenant(db, current_user)
    f = _get_finance(tenant)
    pr = f.get("payment_reminders", {**DEFAULT_FINANCE["payment_reminders"]})
    for key in ("enabled", "first_reminder_days", "second_reminder_days", "notify_admin_after_second"):
        if key in data:
            pr[key] = data[key]
    if isinstance(pr.get("first_reminder_days"), int) and pr["first_reminder_days"] < 1:
        raise ValidationError("first_reminder_days must be at least 1")
    if isinstance(pr.get("second_reminder_days"), int) and pr["second_reminder_days"] < 1:
        raise ValidationError("second_reminder_days must be at least 1")
    f["payment_reminders"] = pr
    _save_finance(tenant, f)
    await db.commit()
    await db.refresh(tenant)
    f = _get_finance(tenant)
    return f.get("payment_reminders", DEFAULT_FINANCE["payment_reminders"])
