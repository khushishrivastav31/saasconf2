"""Invoice PDF generation utilities.

Provides PDF generation from invoice templates with variable replacement
and items table rendering.
"""

import asyncio
import logging
import re
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.currency_formats import format_amount
from app.models.conference import Conference
from app.models.invoice import Invoice

from .invoice_pdf_normalize import (
    _generate_pdf_with_weasyprint,
    build_full_html,
)
from .invoice_pdf_placeholders import (
    _apply_placeholders,
    _format_notes_for_html,
    _format_recipient_address_from_parts,
    _iso_to_country_name,  # noqa: F401 — re-exported for backward compat
    _normalize_country_to_iso,  # noqa: F401 — re-exported for backward compat
    build_company_replacements,
    build_dual_currency_replacements,
    fetch_fiscal_rep_and_logo,
)

logger = logging.getLogger(__name__)

# Default invoice template HTML (can be overridden in conference settings)
DEFAULT_INVOICE_TEMPLATE_HTML = """
<div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
  <div style="display: flex; justify-content: space-between; margin-bottom: 40px;">
    <div>
      [COMPANY_LOGO]
      <h2>[COMPANY_NAME]</h2>
      <p>[COMPANY_ADDRESS]</p>
      <p>Tax ID: [COMPANY_TAX_ID]</p>
    </div>
    <div style="text-align: right;">
      <h1 style="color: #333;">INVOICE</h1>
      <p><strong>Invoice #:</strong> [INVOICE_NUMBER]</p>
      <p><strong>Date:</strong> [ISSUE_DATE]</p>
      <p><strong>Due:</strong> [DUE_DATE]</p>
    </div>
  </div>

  <div style="margin-bottom: 40px;">
    <h3>Bill To:</h3>
    <p><strong>[RECIPIENT_NAME]</strong></p>
    <p>[RECIPIENT_ADDRESS]</p>
    <p>VAT: [RECIPIENT_VAT]</p>
    <p>PO Number: [PROCUREMENT_CODE]</p>
  </div>

  [ITEMS_TABLE]

  <div style="margin-top: 40px; text-align: right;">
    <p><strong>Subtotal:</strong> [SUBTOTAL]</p>
    <p><strong>VAT ([TAX_RATE]%):</strong> [TAX_AMOUNT]</p>
    <h3><strong>Total:</strong> [TOTAL] [CURRENCY]</h3>
  </div>

  <div style="margin-top: 60px; border-top: 1px solid #ccc; padding-top: 20px;">
    <h4>Payment Information</h4>
    <p>Bank: [BANK_NAME]</p>
    <p>IBAN: [IBAN]</p>
    <p>BIC: [BIC]</p>
  </div>

  <div style="margin-top: 20px; font-size: 12px; color: #666;">
    [FOOTER_TEXT]
  </div>

  <div style="margin-top: 20px;">
    [NOTES]
  </div>
</div>
"""


# CSS that matches the TipTap WYSIWYG editor rendering (prose-tight).
# This ensures the PDF output looks the same as what the user sees in the editor.
EDITOR_MATCHING_CSS = """
    body {
        font-family: Arial, Helvetica, sans-serif;
        font-size: 14px;
        line-height: 1.4;
        color: #111;
    }
    /* Match prose-tight: zero paragraph margins */
    p {
        margin: 0;
        line-height: 1.4;
    }
    /* Empty paragraphs are used as spacers in the editor.
       Without content they collapse to zero height in WeasyPrint. */
    p:empty {
        min-height: 1.4em;
    }
    h1, h2, h3, h4, h5, h6 {
        margin: 0.25rem 0;
    }
    /* TipTap table styles */
    table {
        border-collapse: collapse;
        width: 100%;
    }
    th, td {
        padding: 8px;
        vertical-align: top;
    }
    th {
        background-color: #f3f4f6;
        font-weight: 600;
    }
    /* Constrain images — inline styles from _normalize_image_widths
       handle explicit widths; this rule catches unsized images. */
    img {
        max-width: 100%;
        height: auto;
    }
    /* Lists */
    ul { list-style-type: disc; padding-left: 1.25rem; }
    ol { list-style-type: decimal; padding-left: 1.25rem; }
    /* Links */
    a { color: #2563eb; text-decoration: underline; }
    /* Fixed page footer — repeats at the bottom of every PDF page.
       The body padding-bottom prevents content from overlapping.
       In WeasyPrint, position:fixed uses the page content area
       (after @page margins) as its containing block, so left/right: 0
       aligns with the body content edges. */
    .page-footer {
        position: fixed;
        bottom: -1.5cm;
        left: 0;
        right: 0;
        border-top: 1px solid #d1d5db;
        padding-top: 6px;
        font-size: 9px;
        line-height: 1.3;
    }
    .page-footer th,
    .page-footer td {
        border: none;
    }
    .page-footer img {
        max-height: 60px;
        height: auto;
    }
    /* Fixed page header — repeats at the top of every PDF page.
       Mirrors the footer pattern with position:fixed at the top. */
    .page-header {
        position: fixed;
        top: -1.5cm;
        left: 0;
        right: 0;
        border-bottom: 1px solid #d1d5db;
        padding-bottom: 6px;
        font-size: 9px;
        line-height: 1.3;
    }
    .page-header th,
    .page-header td {
        border: none;
    }
    .page-header img {
        max-height: 60px;
        height: auto;
    }
"""


async def generate_invoice_pdf(
    invoice: Invoice,
    conference: Conference,
    db: AsyncSession,
    enable_zugferd: bool | None = None,
) -> bytes:
    """Generate PDF from invoice template and data with optional ZUGFeRD embedding.

    Args:
        invoice: Invoice model instance
        conference: Conference model instance
        db: Database session (for future use with attachments)
        enable_zugferd: Override ZUGFeRD setting (None = auto-detect from conference settings)

    Returns:
        PDF file as bytes
    """

    settings = conference.settings or {}

    # Look up template by invoice's template_type, fall back to legacy field
    template_type = getattr(invoice, "template_type", "bank_transfer") or "bank_transfer"
    templates = settings.get("invoice_templates", {})
    template_html = templates.get(template_type) or settings.get("invoice_template_html", DEFAULT_INVOICE_TEMPLATE_HTML)

    company_info = settings.get("invoice_company_info", {})
    page_format = settings.get("invoice_page_format", "A4")

    html = template_html

    # Fetch shared data (fiscal rep + logo)
    fiscal_rep, logo_html = await fetch_fiscal_rep_and_logo(conference, db)

    # Build shared replacements (company, fiscal rep, banking, contact, currency)
    contact_email = conference.contact_email or conference.support_email or ""
    phone = company_info.get("phone", "") or conference.phone or ""
    primary_currency = invoice.currency or conference.currency or "EUR"
    second_currency = company_info.get("second_currency", "") or getattr(conference, "invoice_currency", "") or ""
    raw_rate = company_info.get("exchange_rate") or settings.get("invoice_exchange_rate")
    exchange_rate = Decimal(str(raw_rate)) if raw_rate else None

    replacements = build_company_replacements(
        company_info=company_info,
        fiscal_rep=fiscal_rep,
        logo_html=logo_html,
        contact_email=contact_email,
        phone=phone,
        primary_currency=primary_currency,
        second_currency=second_currency,
        settings=settings,
    )

    # Invoice-specific replacements
    replacements.update(
        {
            # Invoice data (for credit notes, [INVOICE_NUMBER] shows the original invoice's number)
            "[INVOICE_NUMBER]": invoice.invoice_number or "",  # overridden below for credit notes
            "[ISSUE_DATE]": invoice.issue_date.strftime("%Y-%m-%d") if invoice.issue_date else "",
            "[DUE_DATE]": invoice.due_date.strftime("%Y-%m-%d") if invoice.due_date else "",
            # Recipient
            "[RECIPIENT_NAME]": invoice.recipient_name or "",
            "[RECIPIENT_ADDRESS]": _format_recipient_address_from_parts(
                invoice.recipient_address_line1,
                invoice.recipient_address_line2,
                invoice.recipient_postal_code,
                invoice.recipient_city,
                invoice.recipient_country,
            ),
            "[RECIPIENT_VAT]": invoice.recipient_vat_number or "",
            "[PROCUREMENT_CODE]": invoice.procurement_code or "",
            "[PO_NUMBER]": invoice.procurement_code or "",
            # Financial (formatted using conference number format settings)
            "[SUBTOTAL]": format_amount(invoice.subtotal, settings) if invoice.subtotal else format_amount(0, settings),
            "[DISCOUNT_CODE]": invoice.discount_code or "",
            "[TAX_RATE]": f"{invoice.tax_rate:.2f}" if invoice.tax_rate else "0.00",
            "[TAX_AMOUNT]": format_amount(invoice.tax_amount, settings)
            if invoice.tax_amount
            else format_amount(0, settings),
            "[TOTAL]": format_amount(invoice.total, settings) if invoice.total else format_amount(0, settings),
            # Credit note
            "[CREDIT_NOTE_NUMBER]": invoice.invoice_number or "",
            "[ORIGINAL_INVOICE_NUMBER]": "",
            "[ORIGINAL INVOICE NUMBER]": "",
            # Notes
            "[NOTES]": _format_notes_for_html(invoice.notes),
        }
    )

    # Dual currency
    replacements.update(
        build_dual_currency_replacements(
            subtotal=invoice.subtotal or 0,
            tax_amount=invoice.tax_amount or 0,
            total=invoice.total or 0,
            exchange_rate=exchange_rate,
            settings=settings,
        )
    )

    # Resolve original invoice number if this is a credit note
    if invoice.related_invoice_id:
        from app.models.invoice import Invoice as InvoiceModel

        orig_result = await db.execute(
            select(InvoiceModel.invoice_number).where(InvoiceModel.id == invoice.related_invoice_id)
        )
        orig_number = orig_result.scalar_one_or_none() or ""
        replacements["[ORIGINAL_INVOICE_NUMBER]"] = orig_number
        replacements["[ORIGINAL INVOICE NUMBER]"] = orig_number
        # For credit notes: [INVOICE_NUMBER] = original invoice, [CREDIT_NOTE_NUMBER] = this credit note
        replacements["[INVOICE_NUMBER]"] = orig_number

    # Apply placeholders to template body
    html = _apply_placeholders(html, replacements)

    # Items table (special handling -- preserves font context from template)
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

    # Generate standard PDF first (in thread pool to avoid blocking event loop)
    pdf_bytes = await asyncio.to_thread(_generate_pdf_with_weasyprint, full_html, page_format)

    # Check if ZUGFeRD/Factur-X embedding should be applied
    zugferd_config = settings.get("zugferd_settings", {})

    if enable_zugferd is None:
        enable_zugferd = zugferd_config.get("enabled", False)

    if not enable_zugferd:
        return pdf_bytes  # Return standard PDF without ZUGFeRD

    # Validate invoice meets ZUGFeRD requirements
    from app.core.zugferd_validation import validate_zugferd_requirements

    validation_errors = validate_zugferd_requirements(invoice)
    if validation_errors:
        logger.warning(
            f"Invoice {invoice.id} doesn't meet ZUGFeRD requirements: {validation_errors}",
            extra={"invoice_id": str(invoice.id), "errors": validation_errors},
        )
        return pdf_bytes  # Fallback to standard PDF

    # Generate ZUGFeRD XML
    try:
        from app.core.zugferd_xml import generate_zugferd_xml

        zugferd_xml = await generate_zugferd_xml(invoice, conference, db)
    except Exception as e:
        logger.error(
            f"ZUGFeRD XML generation failed for invoice {invoice.id}: {e}",
            extra={"invoice_id": str(invoice.id), "error": str(e)},
        )
        return pdf_bytes  # Fallback to standard PDF

    # Embed XML in PDF using WeasyPrint Attachment API
    try:
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

        logger.info(
            f"ZUGFeRD PDF generated for invoice {invoice.id}",
            extra={
                "invoice_id": str(invoice.id),
                "profile": zugferd_config.get("profile"),
                "xml_size_bytes": len(zugferd_xml),
            },
        )

        return zugferd_pdf_bytes

    except Exception as e:
        logger.error(
            f"ZUGFeRD PDF embedding failed for invoice {invoice.id}: {e}",
            extra={"invoice_id": str(invoice.id), "error": str(e)},
        )
        return pdf_bytes  # Fallback to standard PDF


async def generate_invoice_pdf_from_data(
    invoice_data: dict,
    settings: dict,
    conference: Conference,
    db: AsyncSession,
) -> bytes:
    """Generate PDF from invoice data dictionary (for preview).

    This function mirrors generate_invoice_pdf but accepts dict data instead of Invoice model.
    Used for previewing PDFs with unsaved settings.
    """

    template_html = settings.get("invoice_template_html", DEFAULT_INVOICE_TEMPLATE_HTML)
    company_info = settings.get("invoice_company_info", {})
    page_format = settings.get("invoice_page_format", "A4")

    html = template_html

    # Fetch shared data (fiscal rep + logo)
    fiscal_rep, logo_html = await fetch_fiscal_rep_and_logo(conference, db)

    # Build shared replacements (company, fiscal rep, banking, contact, currency)
    contact_email = conference.contact_email or conference.support_email or ""
    phone = company_info.get("phone", "") or conference.phone or ""
    primary_currency = invoice_data.get("currency") or conference.currency or "EUR"
    second_currency = company_info.get("second_currency", "") or getattr(conference, "invoice_currency", "") or ""
    raw_rate = company_info.get("exchange_rate") or settings.get("invoice_exchange_rate")
    exchange_rate = Decimal(str(raw_rate)) if raw_rate else None

    replacements = build_company_replacements(
        company_info=company_info,
        fiscal_rep=fiscal_rep,
        logo_html=logo_html,
        contact_email=contact_email,
        phone=phone,
        primary_currency=primary_currency,
        second_currency=second_currency,
        settings=settings,
    )

    # Format dates
    issue_date = invoice_data.get("issue_date")
    issue_date_str = issue_date.strftime("%Y-%m-%d") if issue_date else ""
    due_date = invoice_data.get("due_date")
    due_date_str = due_date.strftime("%Y-%m-%d") if due_date else ""

    invoice_number = invoice_data.get("invoice_number", "")
    subtotal_val = invoice_data.get("subtotal", 0)
    tax_amount_val = invoice_data.get("tax_amount", 0)
    total_val = invoice_data.get("total", 0)

    # Invoice-specific replacements
    replacements.update(
        {
            # Invoice data
            "[INVOICE_NUMBER]": invoice_number,
            "[ISSUE_DATE]": issue_date_str,
            "[DUE_DATE]": due_date_str,
            # Recipient
            "[RECIPIENT_NAME]": invoice_data.get("recipient_name", ""),
            "[RECIPIENT_ADDRESS]": _format_recipient_address_from_parts(
                invoice_data.get("recipient_address_line1"),
                invoice_data.get("recipient_address_line2"),
                invoice_data.get("recipient_postal_code"),
                invoice_data.get("recipient_city"),
                invoice_data.get("recipient_country"),
            ),
            "[RECIPIENT_VAT]": invoice_data.get("recipient_vat_number", ""),
            # Financial (formatted using conference number format settings)
            "[SUBTOTAL]": format_amount(subtotal_val, settings),
            "[TAX_RATE]": f"{invoice_data.get('tax_rate', 0):.2f}",
            "[TAX_AMOUNT]": format_amount(tax_amount_val, settings),
            "[TOTAL]": format_amount(total_val, settings),
            # Credit note
            "[CREDIT_NOTE_NUMBER]": invoice_number,
            "[ORIGINAL_INVOICE_NUMBER]": invoice_data.get("original_invoice_number", ""),
            "[ORIGINAL INVOICE NUMBER]": invoice_data.get("original_invoice_number", ""),
            # Notes
            "[NOTES]": _format_notes_for_html(invoice_data.get("notes")),
        }
    )

    # Dual currency
    replacements.update(
        build_dual_currency_replacements(
            subtotal=subtotal_val,
            tax_amount=tax_amount_val,
            total=total_val,
            exchange_rate=exchange_rate,
            settings=settings,
        )
    )

    # For credit notes: [INVOICE_NUMBER] = original invoice number
    orig_inv_num = invoice_data.get("original_invoice_number", "")
    if orig_inv_num:
        replacements["[INVOICE_NUMBER]"] = orig_inv_num

    # Apply placeholders to template body
    html = _apply_placeholders(html, replacements)

    # Items table (special handling -- preserves font context from template)
    items_table_html = _render_items_table(
        invoice_data.get("line_items", []), currency=primary_currency, settings=settings
    )
    html = _replace_items_placeholder(html, items_table_html)

    # Build full HTML document with header, footer, and normalization
    full_html = build_full_html(
        body_html=html,
        settings=settings,
        replacements=replacements,
        page_format=page_format,
        editor_css=EDITOR_MATCHING_CSS,
    )

    # Generate PDF with WeasyPrint (full HTML/CSS support + page format)
    return await asyncio.to_thread(_generate_pdf_with_weasyprint, full_html, page_format)


def _replace_items_placeholder(html: str, items_table_html: str) -> str:
    """Replace ``[ITEMS_TABLE]`` with the rendered table, preserving context font.

    TipTap wraps the placeholder text in ``<p><span style="...">`` with the
    user's chosen font-family / font-size.  We extract those font properties
    and apply them to the generated ``<table>``.  The wrapping ``<p>`` is
    stripped so the ``<table>`` sits at block level (table-inside-p is
    invalid HTML).
    """
    placeholder = "[ITEMS_TABLE]"
    idx = html.find(placeholder)
    if idx < 0:
        return html

    before = html[:idx]
    after = html[idx + len(placeholder) :]

    font_family: str | None = None
    font_size: str | None = None

    p_open = before.rfind("<p")
    if p_open >= 0:
        p_content = before[p_open:]
        for m in re.finditer(r'font-family:\s*([^;"]+)', p_content):
            font_family = m.group(1).strip()
        for m in re.finditer(r'font-size:\s*([^;"]+)', p_content):
            font_size = m.group(1).strip()

        p_close = after.find("</p>")
        if p_close >= 0:
            html = before[:p_open] + placeholder + after[p_close + 4 :]

    if font_family or font_size:
        parts: list[str] = []
        if font_family:
            parts.append(f"font-family: {font_family}")
        if font_size:
            parts.append(f"font-size: {font_size}")
        extra_css = "; ".join(parts) + "; "
        if 'style="' in items_table_html:
            items_table_html = items_table_html.replace('style="', f'style="{extra_css}', 1)
        else:
            items_table_html = items_table_html.replace("<table", f'<table style="{extra_css.rstrip("; ")}"', 1)

    return html.replace(placeholder, items_table_html)


def _render_items_table(line_items: list, currency: str = "EUR", settings: dict | None = None) -> str:
    """Render line items as an HTML table matching the TipTap editor style."""
    if not line_items:
        return "<p>No items</p>"

    fmt_settings = settings or {}
    cell = "padding: 1px 4px;"
    num = f"text-align: right; white-space: nowrap; {cell}"
    cur = f" {currency}" if currency else ""
    table = f"""
    <table style="line-height: 1.1; border-collapse: collapse; width: 100%;">
      <thead>
        <tr>
          <th style="text-align: center; white-space: nowrap; {cell}">Pos</th>
          <th style="text-align: left; {cell}">Description</th>
          <th style="{num}">Qty</th>
          <th style="{num}">Unit Price</th>
          <th style="{num}">Discount</th>
          <th style="{num}">Total</th>
        </tr>
      </thead>
      <tbody>
    """

    for idx, item in enumerate(line_items, start=1):
        desc = item.get("description", "")
        raw_qty = item.get("quantity", 1)
        qty_display = (
            str(int(raw_qty)) if isinstance(raw_qty, (int, float)) and raw_qty == int(raw_qty) else str(raw_qty)
        )
        unit_price = Decimal(str(item.get("unit_price", 0)))
        discount = Decimal(str(item.get("discount", 0)))
        total = Decimal(str(item.get("total", 0)))

        discount_display = f"-{format_amount(discount, fmt_settings)}{cur}" if discount > 0 else "-"

        table += f"""
        <tr>
          <td style="text-align: center; white-space: nowrap; {cell}">{idx}</td>
          <td style="{cell}">{desc}</td>
          <td style="{num}">{qty_display}</td>
          <td style="{num}">{format_amount(unit_price, fmt_settings)}{cur}</td>
          <td style="{num}">{discount_display}</td>
          <td style="{num}"><strong>{format_amount(total, fmt_settings)}{cur}</strong></td>
        </tr>
        """

    table += """
      </tbody>
    </table>
    """
    return table
