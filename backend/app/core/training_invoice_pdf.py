"""Training invoice PDF generation.

Thin adapter that delegates to the conference invoice PDF infrastructure,
mapping tenant training_finance settings to the expected conference settings format.
This ensures training invoices have identical quality: header/footer borders,
page breaks, placeholder cleanup, items table formatting, and ZUGFeRD support.
"""

import asyncio
import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.currency_formats import format_amount
from app.models.tenant import Tenant
from app.models.training_invoice import TrainingInvoice

from .invoice_pdf import EDITOR_MATCHING_CSS, _render_items_table, _replace_items_placeholder
from .invoice_pdf_normalize import (
    _generate_pdf_with_weasyprint,
    build_full_html,
)
from .invoice_pdf_placeholders import (
    _apply_placeholders,
    _format_notes_for_html,
    _format_recipient_address_from_parts,
    build_company_replacements,
    build_dual_currency_replacements,
)

logger = logging.getLogger(__name__)

DEFAULT_TEMPLATE_HTML = """
<p><strong>Bill To:</strong></p>
<p><strong>[RECIPIENT_NAME]</strong></p>
<p>[RECIPIENT_ADDRESS]</p>
<p>VAT: [RECIPIENT_VAT]</p>
<p><strong>Invoice #:</strong> [INVOICE_NUMBER] <strong>Date:</strong> [ISSUE_DATE] <strong>Due:</strong> [DUE_DATE]</p>
[ITEMS_TABLE]
<p><strong>Subtotal:</strong> [SUBTOTAL]</p>
<p><strong>VAT ([TAX_RATE]%):</strong> [TAX_AMOUNT]</p>
<p><strong>Total:</strong> [TOTAL]</p>
<p>[NOTES]</p>
"""


def _build_conference_compatible_settings(tenant: Tenant) -> dict:
    """Map training_finance settings to conference-compatible settings dict.

    The conference PDF generator reads settings like `invoice_company_info`,
    `invoice_header_html`, etc. Training stores them as `company_info`,
    `invoice_header_html` (same key), etc. under `training_finance`.
    """
    finance = (tenant.settings or {}).get("training_finance", {})

    # Map company_info → invoice_company_info (conference key)
    company_info = finance.get("company_info", {})

    # Build bank info from bank_accounts array (conference uses legacy fields)
    bank_accounts = finance.get("bank_accounts", [])
    primary_bank = bank_accounts[0] if bank_accounts else {}

    settings = {
        # Templates
        "invoice_templates": finance.get("invoice_templates", {}),
        "invoice_header_html": finance.get("invoice_header_html", ""),
        "invoice_footer_html": finance.get("invoice_footer_html", ""),
        "invoice_page_format": finance.get("invoice_page_format", "A4"),
        # Company info (conference key name)
        "invoice_company_info": {
            **company_info,
            # Map bank account fields for placeholder resolution
            "bank_name": primary_bank.get("bank_name", ""),
            "iban": primary_bank.get("iban", ""),
            "bic": primary_bank.get("bic", ""),
        },
        # Number formatting
        "number_format_preset": finance.get("number_format_preset", "european"),
        "decimal_separator": finance.get("decimal_separator", ","),
        "thousands_separator": finance.get("thousands_separator", "."),
        "currency_position": finance.get("currency_position", "after"),
        # VAT rules (needed for ZUGFeRD)
        "eu_countries": finance.get("eu_countries", []),
        "vat_rules": finance.get("vat_rules", []),
        # ZUGFeRD
        "zugferd_settings": {"enabled": finance.get("zugferd_enabled", False)},
    }

    return settings


async def generate_training_invoice_pdf(
    invoice: TrainingInvoice,
    tenant: Tenant,
    db: AsyncSession,
) -> bytes:
    """Generate PDF from training invoice using the conference PDF infrastructure.

    Maps training_finance settings to conference-compatible format, then uses
    the same placeholder system, items table renderer, header/footer builder,
    and ZUGFeRD embedding as conference invoices.
    """
    settings = _build_conference_compatible_settings(tenant)

    # Look up template
    template_type = invoice.template_type or "bank_transfer"
    templates = settings.get("invoice_templates", {})
    template_html = templates.get(template_type) or DEFAULT_TEMPLATE_HTML

    company_info = settings.get("invoice_company_info", {})
    page_format = settings.get("invoice_page_format", "A4")

    html = template_html

    # Build company replacements (same as conference)
    contact_email = company_info.get("email", "")
    phone = company_info.get("phone", "")
    primary_currency = invoice.currency or "EUR"

    replacements = build_company_replacements(
        company_info=company_info,
        fiscal_rep=None,
        logo_html="",
        contact_email=contact_email,
        phone=phone,
        primary_currency=primary_currency,
        second_currency="",
        settings=settings,
    )

    # Invoice-specific replacements (matches conference pattern exactly)
    replacements.update(
        {
            "[INVOICE_NUMBER]": invoice.invoice_number or "",
            "[ISSUE_DATE]": invoice.issue_date.strftime("%Y-%m-%d") if invoice.issue_date else "",
            "[DUE_DATE]": invoice.due_date.strftime("%Y-%m-%d") if invoice.due_date else "",
            "[RECIPIENT_NAME]": invoice.recipient_name or "",
            "[RECIPIENT_ADDRESS]": _format_recipient_address_from_parts(
                invoice.recipient_address_line1,
                None,
                invoice.recipient_postal_code,
                invoice.recipient_city,
                invoice.recipient_country,
            ),
            "[RECIPIENT_VAT]": invoice.recipient_vat_number or "",
            "[PROCUREMENT_CODE]": getattr(invoice, "po_number", "") or "",
            "[PO_NUMBER]": getattr(invoice, "po_number", "") or "",
            "[SUBTOTAL]": format_amount(invoice.subtotal, settings) if invoice.subtotal else format_amount(0, settings),
            "[DISCOUNT_CODE]": "",
            "[TAX_RATE]": f"{invoice.tax_rate:.2f}" if invoice.tax_rate else "0.00",
            "[TAX_AMOUNT]": format_amount(invoice.tax_amount, settings)
            if invoice.tax_amount
            else format_amount(0, settings),
            "[TOTAL]": format_amount(invoice.total, settings) if invoice.total else format_amount(0, settings),
            "[CREDIT_NOTE_NUMBER]": invoice.invoice_number or "",
            "[ORIGINAL_INVOICE_NUMBER]": "",
            "[ORIGINAL INVOICE NUMBER]": "",
            "[NOTES]": _format_notes_for_html(invoice.notes),
        }
    )

    # Dual currency (not used for trainings, but prevents [SECOND_*] placeholders)
    replacements.update(
        build_dual_currency_replacements(
            subtotal=invoice.subtotal or 0,
            tax_amount=invoice.tax_amount or 0,
            total=invoice.total or 0,
            exchange_rate=None,
            settings=settings,
        )
    )

    # Apply placeholders to template body
    html = _apply_placeholders(html, replacements)

    # Items table — use the same renderer as conferences
    items_table_html = _render_items_table(invoice.line_items or [], currency=primary_currency, settings=settings)
    html = _replace_items_placeholder(html, items_table_html)

    # Build full HTML document with header, footer, and normalization
    full_html = build_full_html(
        body_html=html,
        settings=settings,
        replacements=replacements,
        page_format=page_format,
        editor_css=EDITOR_MATCHING_CSS,
    )

    # Generate PDF
    pdf_bytes = await asyncio.to_thread(_generate_pdf_with_weasyprint, full_html, page_format)

    # ZUGFeRD embedding
    zugferd_config = settings.get("zugferd_settings", {})
    enable_zugferd = zugferd_config.get("enabled", False)

    if not enable_zugferd:
        return pdf_bytes

    try:
        from app.core.zugferd_xml import generate_zugferd_xml

        # generate_zugferd_xml expects (invoice, conference, db) where conference provides:
        # .settings (with invoice_company_info, eu_countries, vat_rules)
        # .contact_email, .phone, .country
        # Create a duck-type adapter that wraps tenant for conference-compatible access
        class _TenantAsConference:
            """Adapter to make Tenant look like Conference for ZUGFeRD XML generation."""

            def __init__(self, t: Tenant, s: dict):
                self.settings = s
                self.tenant_id = t.id
                self.country = t.country or ""
                ci = s.get("invoice_company_info", {})
                self.contact_email = ci.get("email", "")
                self.phone = ci.get("phone", "")

        conference_adapter = _TenantAsConference(tenant, settings)
        zugferd_xml = await generate_zugferd_xml(invoice, conference_adapter, db)

        from weasyprint import HTML
        from weasyprint import Attachment as WeasyAttachment

        html_obj = HTML(string=full_html)
        xml_string = zugferd_xml.decode("utf-8") if isinstance(zugferd_xml, bytes) else zugferd_xml

        facturx_attachment = WeasyAttachment(
            string=xml_string,
            name="factur-x.xml",
            description="Factur-X/ZUGFeRD invoice data",
            relationship="Data",
        )

        zugferd_pdf_bytes = html_obj.write_pdf(
            pdf_variant="pdf/a-3b",
            attachments=[facturx_attachment],
        )

        logger.info("ZUGFeRD PDF generated for training invoice %s", invoice.id)
        return zugferd_pdf_bytes

    except Exception as e:
        logger.error("ZUGFeRD embedding failed for training invoice %s: %s", invoice.id, e)
        return pdf_bytes
