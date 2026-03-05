"""Invoice PDF generation utilities.

Provides PDF generation from invoice templates with variable replacement
and items table rendering.
"""

import base64
import re
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.currency_formats import format_amount
from app.models.attachment import Attachment
from app.models.conference import Conference
from app.models.fiscal_representative import FiscalRepresentative
from app.models.invoice import Invoice

# Mapping of full country names to ISO 3166-1 alpha-2 codes.
# Matches frontend/src/config/countries.ts COUNTRY_OPTIONS.
_COUNTRY_NAME_TO_ISO: dict[str, str] = {
    "albania": "AL",
    "andorra": "AD",
    "armenia": "AM",
    "australia": "AU",
    "austria": "AT",
    "azerbaijan": "AZ",
    "belarus": "BY",
    "belgium": "BE",
    "bosnia and herzegovina": "BA",
    "brazil": "BR",
    "bulgaria": "BG",
    "canada": "CA",
    "china": "CN",
    "croatia": "HR",
    "cyprus": "CY",
    "czechia": "CZ",
    "denmark": "DK",
    "estonia": "EE",
    "finland": "FI",
    "france": "FR",
    "georgia": "GE",
    "germany": "DE",
    "greece": "GR",
    "hungary": "HU",
    "iceland": "IS",
    "india": "IN",
    "ireland": "IE",
    "israel": "IL",
    "italy": "IT",
    "japan": "JP",
    "latvia": "LV",
    "liechtenstein": "LI",
    "lithuania": "LT",
    "luxembourg": "LU",
    "malta": "MT",
    "moldova": "MD",
    "monaco": "MC",
    "montenegro": "ME",
    "netherlands": "NL",
    "new zealand": "NZ",
    "north macedonia": "MK",
    "norway": "NO",
    "poland": "PL",
    "portugal": "PT",
    "romania": "RO",
    "russia": "RU",
    "serbia": "RS",
    "slovakia": "SK",
    "slovenia": "SI",
    "south korea": "KR",
    "spain": "ES",
    "sweden": "SE",
    "switzerland": "CH",
    "turkey": "TR",
    "ukraine": "UA",
    "united kingdom": "GB",
    "united states": "US",
}


def _normalize_country_to_iso(value: str) -> str:
    """Convert a country name to its ISO 3166-1 alpha-2 code.

    If the value is already a 2-letter code, return it uppercased.
    If it's a known country name, return the corresponding code.
    Otherwise return the original value unchanged (backward compatible).
    """
    if not value:
        return value
    stripped = value.strip()
    if len(stripped) == 2:
        return stripped.upper()
    return _COUNTRY_NAME_TO_ISO.get(stripped.lower(), stripped)


# Reverse mapping: ISO code → display name (title-cased).
_ISO_TO_COUNTRY_NAME: dict[str, str] = {code: name.title() for name, code in _COUNTRY_NAME_TO_ISO.items()}


def _iso_to_country_name(value: str) -> str:
    """Convert an ISO 3166-1 alpha-2 code to a human-readable country name.

    If the value is a known 2-letter code, return the full name.
    If it's already a full name or unknown, return as-is.
    """
    if not value:
        return value
    stripped = value.strip().upper()
    return _ISO_TO_COUNTRY_NAME.get(stripped, value.strip())


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


def _resolve_bank_info(company_info: dict) -> tuple[str, str, str]:
    """Get bank info from array or legacy fields.

    Args:
        company_info: Invoice company info dictionary

    Returns:
        Tuple of (bank_name, iban, bic)
    """
    bank_accounts = company_info.get("bank_accounts", [])

    if bank_accounts:
        # Use default account or first account
        default_account = next(
            (acc for acc in bank_accounts if acc.get("is_default")),
            bank_accounts[0] if bank_accounts else None,
        )
        if default_account:
            return (
                default_account.get("bank_name", ""),
                default_account.get("iban", ""),
                default_account.get("bic", "") or "",
            )

    # Backward compatibility: legacy single fields
    return (
        company_info.get("bank_name", ""),
        company_info.get("iban", ""),
        company_info.get("bic", "") or "",
    )


async def _resolve_vat_number(company_info: dict, conference: Conference, db: AsyncSession) -> str:
    """Get VAT based on vat_source setting.

    Args:
        company_info: Invoice company info dictionary
        conference: Conference model instance
        db: Database session

    Returns:
        VAT number string
    """
    vat_source = company_info.get("vat_source", "company")

    if vat_source == "fiscal_rep":
        # Fetch fiscal rep VAT
        result = await db.execute(
            select(FiscalRepresentative)
            .where(FiscalRepresentative.conference_id == conference.id)
            .where(FiscalRepresentative.tenant_id == conference.tenant_id)
        )
        fiscal_rep = result.scalar_one_or_none()
        return fiscal_rep.conference_vat_number if fiscal_rep and fiscal_rep.conference_vat_number else ""
    else:
        # Use company tax_id
        return company_info.get("tax_id", "")


def _get_page_size_css(page_format: str) -> str:
    """Get CSS @page size declaration for the given format.

    Args:
        page_format: Page format (A4, Letter, Legal, A5, B5, Tabloid)

    Returns:
        CSS size declaration for @page rule
    """
    # Map format names to CSS sizes
    # WeasyPrint supports named sizes (A4, Letter, etc.) and explicit dimensions
    formats = {
        "A4": "A4",  # 210mm × 297mm (European standard)
        "A5": "A5",  # 148mm × 210mm
        "Letter": "letter",  # 8.5in × 11in (US standard)
        "Legal": "legal",  # 8.5in × 14in (US legal)
        "B5": "B5",  # 176mm × 250mm (Asian standard)
        "Tabloid": "11in 17in",  # 11in × 17in (US large format)
    }
    return formats.get(page_format, "A4")  # Default to A4 if unknown


def _generate_pdf_with_weasyprint(html_content: str, page_format: str = "A4") -> bytes:
    """Generate PDF from HTML using WeasyPrint (full HTML/CSS support).

    Args:
        html_content: HTML string with full CSS styling
        page_format: Page format (A4, Letter, Legal, A5, B5, Tabloid)

    Returns:
        PDF file as bytes
    """
    from weasyprint import HTML

    # Inject page size into HTML if not already present
    page_size = _get_page_size_css(page_format)
    if "@page" not in html_content:
        # Add @page rule with size and margins
        style_tag = f"""
        <style>
            @page {{
                size: {page_size};
                margin: 2cm;
            }}
        </style>
        """
        # Insert before closing </head> or at the start if no head
        if "</head>" in html_content:
            html_content = html_content.replace("</head>", f"{style_tag}</head>")
        elif "<html>" in html_content:
            html_content = html_content.replace("<html>", f"<html><head>{style_tag}</head>")
        else:
            html_content = f"<html><head>{style_tag}</head><body>{html_content}</body></html>"

    # Generate PDF with WeasyPrint (supports full HTML/CSS + images)
    pdf_bytes = HTML(string=html_content).write_pdf()
    return pdf_bytes


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


_PAGE_WIDTHS_MM: dict[str, float] = {
    "A4": 210,
    "A5": 148,
    "Letter": 215.9,
    "Legal": 215.9,
    "B5": 176,
    "Tabloid": 279.4,
}


def _get_image_scale_factor(page_format: str) -> float:
    """Return the ratio of PDF content width to editor canvas width.

    The TipTap editor canvas uses the full page width at 96 CSS-dpi
    (e.g. 794 px for A4 ≈ 210 mm).  The PDF, however, has 2 cm margins
    on each side, so the printable content area is narrower.  Images
    stored with absolute pixel widths must be scaled by this factor so
    they occupy the same visual proportion in the PDF as in the editor.
    """
    page_width = _PAGE_WIDTHS_MM.get(page_format, 210)
    content_width = page_width - 40  # 2 cm margin on each side
    return content_width / page_width


def _get_content_width_px(page_format: str) -> int:
    """Return the PDF content width in CSS pixels (96 dpi).

    Used to set explicit max-width on images that have no width attribute,
    preventing high-resolution originals from overflowing the page.
    """
    page_width_mm = _PAGE_WIDTHS_MM.get(page_format, 210)
    content_width_mm = page_width_mm - 40  # 2 cm margins
    return int(content_width_mm * 96 / 25.4)  # mm → px at 96 dpi


def _normalize_image_widths(html: str, scale: float = 1.0, content_width_px: int = 0) -> str:
    """Convert ``<img width="X">`` HTML attributes to scaled inline CSS.

    TipTap's ResizableImage stores user-set widths as HTML ``width``
    attributes.  WeasyPrint renders these inconsistently — it handles
    CSS ``style="width: Xpx"`` much more reliably.

    When *scale* ≠ 1.0 the pixel width is multiplied by the factor so
    that the image occupies the same visual proportion of the PDF
    content area as it does of the editor canvas.

    Images WITHOUT a width attribute get explicit max-width/max-height
    inline styles so WeasyPrint doesn't render them at natural (often
    very large) resolution.
    """

    def _replace_img(match: re.Match[str]) -> str:
        tag = match.group(0)
        # Match integer or decimal widths (TipTap may store float values like width="350.5")
        width_match = re.search(r'\bwidth="(\d+(?:\.\d+)?)"', tag)
        if width_match:
            width_px = float(width_match.group(1))
            scaled_width = max(1, int(width_px * scale))
            # Remove the HTML width attribute
            tag = re.sub(r'\s*width="\d+(?:\.\d+)?"', "", tag)
            # Inject CSS width (merge into existing style if present)
            if 'style="' in tag:
                tag = tag.replace('style="', f'style="width: {scaled_width}px; ')
            else:
                tag = tag.replace(
                    "<img",
                    f'<img style="width: {scaled_width}px; max-width: 100%; height: auto;"',
                )
        else:
            # No explicit width — add constraining inline styles so
            # high-res images don't blow up to their natural size.
            max_w = f"{content_width_px}px" if content_width_px else "100%"
            constraint = f"max-width: {max_w}; max-height: 250px; height: auto;"
            if 'style="' in tag:
                tag = tag.replace('style="', f'style="{constraint} ')
            else:
                tag = tag.replace("<img", f'<img style="{constraint}"')
        return tag

    return re.sub(r"<img\s[^>]+>", _replace_img, html)


def _normalize_table_widths(html: str) -> str:
    """Convert TipTap pixel-based column widths to percentages.

    TipTap outputs <col> elements with absolute pixel widths matching the
    editor canvas (e.g. 794px for A4 at 96 DPI).  These pixel values can
    exceed the PDF content area, causing columns to overflow.

    This function finds each <colgroup>…</colgroup> block, extracts the
    pixel widths, and replaces them with percentage widths that preserve the
    original proportions while fitting within the page.
    """

    def _replace_colgroup(match: re.Match[str]) -> str:
        colgroup_html = match.group(0)
        # Extract all pixel widths from <col> elements
        col_widths = re.findall(r"width:\s*(\d+(?:\.\d+)?)px", colgroup_html)
        if not col_widths:
            return colgroup_html
        widths = [float(w) for w in col_widths]
        total = sum(widths)
        if total <= 0:
            return colgroup_html
        # Convert each pixel width to a percentage
        pcts = [w / total * 100 for w in widths]
        # Rebuild <col> elements with percentage widths
        cols = "".join(f'<col style="width: {p:.1f}%">' for p in pcts)
        return f"<colgroup>{cols}</colgroup>"

    html = re.sub(
        r"<colgroup>.*?</colgroup>",
        _replace_colgroup,
        html,
        flags=re.DOTALL,
    )
    # TipTap also stores pixel widths on <td>/<th> as colwidth attributes
    # and inline style="width: Xpx".  These override the percentage colgroup
    # and prevent the table from filling the container.  Strip them.
    html = re.sub(r'\s*colwidth="[^"]*"', "", html)
    # Remove only width-related CSS properties from td/th inline styles,
    # preserving other properties like text-align and padding.
    html = re.sub(
        r'(<t[dh][^>]*style="[^"]*?);\s*width:\s*[^;"]+',
        r"\1",
        html,
    )
    html = re.sub(
        r'(<t[dh][^>]*style=")\s*width:\s*[^;"]+;\s*',
        r"\1",
        html,
    )
    return html


def _strip_table_widths(html: str) -> str:
    """Remove all width constraints from footer tables.

    TipTap stores column widths in multiple places:
    1. ``<colgroup>`` with ``<col>`` elements
    2. ``colwidth`` attributes on ``<td>``/``<th>``
    3. Inline ``style`` on ``<table>``, ``<td>``, ``<th>`` (pixel widths)

    We strip everything and force ``width: 100%`` on the table so it
    fills the full footer area with content-based column distribution.
    """
    # Remove <colgroup>…</colgroup> blocks entirely
    html = re.sub(r"<colgroup>.*?</colgroup>", "", html, flags=re.DOTALL)
    # Remove colwidth attributes from <td> and <th>
    html = re.sub(r'\s*colwidth="[^"]*"', "", html)
    # Remove inline style from <td> and <th> (pixel widths set by TipTap)
    html = re.sub(r'(<t[dh][^>]*)\s*style="[^"]*"', r"\1", html)
    # Replace inline style on <table> with width:100%, or add it if none
    html = re.sub(r'(<table[^>]*)\s*style="[^"]*"', r'\1 style="width:100%"', html)
    html = re.sub(r"<table(?![^>]*style=)", '<table style="width:100%"', html)
    return html


def _preserve_empty_paragraphs(html: str) -> str:
    """Convert empty paragraphs to non-breaking spaces for WeasyPrint.

    TipTap uses empty paragraphs as line spacers.  It outputs them as
    ``<p></p>`` or ``<p><br></p>``.  WeasyPrint collapses these to zero
    height.  Inserting ``&nbsp;`` preserves the visual line break.
    """
    html = re.sub(r"<p>\s*</p>", "<p>&nbsp;</p>", html)
    html = re.sub(r"<p>\s*<br\s*/?\s*>\s*</p>", "<p>&nbsp;</p>", html)
    return html


def _compute_fixed_block_padding(html: str, side: str) -> str:
    """Compute body padding CSS to reserve space for a fixed header/footer.

    Headers are compact (images capped at ``max-height: 60px``, positioned
    in the page margin) so they need less padding than footers which can
    contain multi-row bank-detail tables.

    Args:
        html: The processed header/footer HTML content
        side: "top" for header, "bottom" for footer

    Returns:
        CSS rule string like ``body { padding-bottom: 5cm; }``
    """
    has_tables = "<table" in html
    has_images = "<img" in html
    is_complex = has_tables or has_images

    # Headers: compact (images max 60px); footers: can be large (bank details, legal text)
    padding_cm = ("2cm" if is_complex else "1.5cm") if side == "top" else ("5cm" if is_complex else "3cm")

    return f"body {{ padding-{side}: {padding_cm}; }}"


def _apply_placeholders(html: str, replacements: dict[str, str]) -> str:
    """Apply all placeholder replacements to an HTML string.

    Args:
        html: HTML string containing placeholders like [COMPANY_NAME]
        replacements: Dict mapping placeholder strings to their values

    Returns:
        HTML with all placeholders replaced
    """
    for placeholder, value in replacements.items():
        html = html.replace(placeholder, value)
    return html


async def generate_invoice_pdf(
    invoice: Invoice,
    conference: Conference,
    db: AsyncSession,
) -> bytes:
    """Generate PDF from invoice template and data.

    Args:
        invoice: Invoice model instance
        conference: Conference model instance
        db: Database session (for future use with attachments)

    Returns:
        PDF file as bytes

    The function:
    1. Loads template HTML from conference settings
    2. Replaces all placeholders with invoice/conference data
    3. Renders items table
    4. Generates PDF using WeasyPrint (full HTML/CSS support)
    """

    settings = conference.settings or {}

    # Look up template by invoice's template_type, fall back to legacy field
    template_type = getattr(invoice, "template_type", "bank_transfer") or "bank_transfer"
    templates = settings.get("invoice_templates", {})
    template_html = templates.get(template_type) or settings.get("invoice_template_html", DEFAULT_INVOICE_TEMPLATE_HTML)

    company_info = settings.get("invoice_company_info", {})
    page_format = settings.get("invoice_page_format", "A4")

    # Replace all placeholders
    html = template_html

    # Resolve bank info (from array or legacy fields)
    bank_name, iban, bic = _resolve_bank_info(company_info)

    # Fetch fiscal representative data
    result = await db.execute(
        select(FiscalRepresentative)
        .where(FiscalRepresentative.conference_id == conference.id)
        .where(FiscalRepresentative.tenant_id == conference.tenant_id)
    )
    fiscal_rep = result.scalar_one_or_none()

    # Company VAT
    company_vat = company_info.get("tax_id", "")

    # Fiscal rep VAT
    fiscal_rep_vat = ""
    if fiscal_rep and fiscal_rep.conference_vat_number:
        fiscal_rep_vat = fiscal_rep.conference_vat_number

    # Determine which VAT to use for backward-compatible [COMPANY_TAX_ID]
    vat_source = company_info.get("vat_source", "company")
    legacy_vat_number = fiscal_rep_vat if vat_source == "fiscal_rep" else company_vat

    # Logo: fetch tenant logo from attachments and embed as base64
    logo_html = ""
    if conference.tenant_id:
        logo_result = await db.execute(
            select(Attachment)
            .where(Attachment.entity_type == "tenant_logo")
            .where(Attachment.entity_id == conference.tenant_id)
            .order_by(Attachment.created_at.desc())
            .limit(1)
        )
        logo_attachment = logo_result.scalar_one_or_none()

        if logo_attachment and logo_attachment.file_data:
            import mimetypes

            mime_type = mimetypes.guess_type(logo_attachment.filename)[0] or "image/png"
            logo_base64 = base64.b64encode(logo_attachment.file_data).decode("utf-8")
            logo_data_url = f"data:{mime_type};base64,{logo_base64}"
            logo_html = f'<img src="{logo_data_url}" style="max-width: 150px; height: auto;" alt="Company Logo">'

    # Fiscal representative address
    if fiscal_rep:
        fiscal_rep_address_parts = [
            fiscal_rep.address_line1 or "",
            fiscal_rep.address_line2 or "",
        ]
        fiscal_rep_address = ", ".join(p for p in fiscal_rep_address_parts if p)
    else:
        fiscal_rep_address = ""

    # Build replacements dict — applied to template body, header AND footer
    contact_email = conference.contact_email or conference.support_email or ""
    phone = company_info.get("phone", "") or conference.phone or ""
    primary_currency = invoice.currency or conference.currency or "EUR"

    # Dual currency support — check company_info first, then conference.invoice_currency
    second_currency = company_info.get("second_currency", "") or getattr(conference, "invoice_currency", "") or ""
    # Exchange rate: check company_info (legacy), then conference.settings
    raw_rate = company_info.get("exchange_rate") or settings.get("invoice_exchange_rate")
    exchange_rate = Decimal(str(raw_rate)) if raw_rate else None

    replacements: dict[str, str] = {
        # Company info
        "[COMPANY_NAME]": company_info.get("name", ""),
        "[COMPANY_ADDRESS]": _format_address(company_info),
        "[COMPANY_CITY]": company_info.get("city", ""),
        "[COMPANY_POSTAL_CODE]": company_info.get("postal_code", ""),
        "[COMPANY_COUNTRY]": _normalize_country_to_iso(company_info.get("country", "")),
        "[COMPANY_TAX_ID]": legacy_vat_number,
        "[COMPANY_VAT]": company_vat,
        "[COMPANY_LOGO]": logo_html,
        # Fiscal representative
        "[FISCAL_REP_NAME]": (fiscal_rep.company_name or "") if fiscal_rep else "",
        "[FISCAL_REP_ADDRESS]": fiscal_rep_address,
        "[FISCAL_REP_CITY]": (fiscal_rep.city or "") if fiscal_rep else "",
        "[FISCAL_REP_POSTAL_CODE]": (fiscal_rep.postal_code or "") if fiscal_rep else "",
        "[FISCAL_REP_COUNTRY]": _normalize_country_to_iso((fiscal_rep.country or "") if fiscal_rep else ""),
        "[FISCAL_REP_VAT]": fiscal_rep_vat,
        "[FISCAL_REP_TAX_ID]": (fiscal_rep.vat_number or "") if fiscal_rep else "",
        # Banking (both underscore and space variants)
        "[BANK_NAME]": bank_name,
        "[BANK NAME]": bank_name,
        "[IBAN]": iban,
        "[BIC]": bic,
        # Footer text
        "[FOOTER_TEXT]": company_info.get("footer_text", ""),
        # Invoice data (for credit notes, [INVOICE_NUMBER] shows the original invoice's number)
        "[INVOICE_NUMBER]": invoice.invoice_number or "",  # overridden below for credit notes
        "[ISSUE_DATE]": invoice.issue_date.strftime("%Y-%m-%d") if invoice.issue_date else "",
        "[DUE_DATE]": invoice.due_date.strftime("%Y-%m-%d") if invoice.due_date else "",
        # Recipient
        "[RECIPIENT_NAME]": invoice.recipient_name or "",
        "[RECIPIENT_ADDRESS]": _format_recipient_address(invoice),
        "[RECIPIENT_VAT]": invoice.recipient_vat_number or "",
        # Financial (formatted using conference number format settings)
        "[SUBTOTAL]": format_amount(invoice.subtotal, settings) if invoice.subtotal else format_amount(0, settings),
        "[TAX_RATE]": f"{invoice.tax_rate:.2f}" if invoice.tax_rate else "0.00",
        "[TAX_AMOUNT]": format_amount(invoice.tax_amount, settings)
        if invoice.tax_amount
        else format_amount(0, settings),
        "[TOTAL]": format_amount(invoice.total, settings) if invoice.total else format_amount(0, settings),
        # Currency
        "[CURRENCY]": primary_currency,
        "[CURRENCY_1]": primary_currency,
        "[CURRENCY_2]": second_currency,
        # Dual currency
        "[SECOND_CURRENCY]": second_currency,
        "[SECOND_TOTAL]": format_amount(Decimal(str(invoice.total)) * exchange_rate, settings)
        if exchange_rate and invoice.total
        else "",
        "[SECOND_SUBTOTAL]": format_amount(Decimal(str(invoice.subtotal)) * exchange_rate, settings)
        if exchange_rate and invoice.subtotal
        else "",
        "[SECOND_TAX_AMOUNT]": format_amount(Decimal(str(invoice.tax_amount)) * exchange_rate, settings)
        if exchange_rate and invoice.tax_amount
        else "",
        # Contact info (both underscore and space variants)
        "[CONTACT_EMAIL]": contact_email,
        "[CONTACT EMAIL]": contact_email,
        "[PHONE]": phone,
        "[TELEFON]": phone,
        # Credit note
        "[CREDIT_NOTE_NUMBER]": invoice.invoice_number or "",
        "[ORIGINAL_INVOICE_NUMBER]": "",
        "[ORIGINAL INVOICE NUMBER]": "",
        # Notes
        "[NOTES]": invoice.notes or "",
    }

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

    # Items table (special handling — preserves font context from template)
    items_table_html = _render_items_table(invoice.line_items or [], currency=primary_currency, settings=settings)
    html = _replace_items_placeholder(html, items_table_html)

    # Normalize TipTap output for PDF
    html = _preserve_empty_paragraphs(html)
    html = _normalize_table_widths(html)
    img_scale = _get_image_scale_factor(page_format)
    content_px = _get_content_width_px(page_format)
    html = _normalize_image_widths(html, scale=img_scale, content_width_px=content_px)

    # Header HTML (fixed at top of every page)
    header_html = settings.get("invoice_header_html", "")
    header_block = ""
    header_padding = ""
    if header_html and header_html.strip():
        # Apply the SAME placeholder replacements to header
        header_html = _apply_placeholders(header_html, replacements)
        # Normalize same as body
        header_html = _preserve_empty_paragraphs(header_html)
        header_html = _normalize_table_widths(header_html)
        header_html = _normalize_image_widths(header_html, scale=img_scale, content_width_px=content_px)
        header_block = f'<div class="page-header">{header_html}</div>'
        # Dynamic padding: complex headers (tables/images) need more space
        header_padding = _compute_fixed_block_padding(header_html, "top")

    # Footer HTML (fixed at bottom of every page)
    footer_html = settings.get("invoice_footer_html", "")
    footer_block = ""
    footer_padding = ""
    if footer_html and footer_html.strip():
        # Apply the SAME placeholder replacements to footer
        footer_html = _apply_placeholders(footer_html, replacements)
        # Normalize same as body
        footer_html = _preserve_empty_paragraphs(footer_html)
        footer_html = _normalize_table_widths(footer_html)
        footer_html = _normalize_image_widths(footer_html, scale=img_scale, content_width_px=content_px)
        footer_block = f'<div class="page-footer">{footer_html}</div>'
        # Dynamic padding: complex footers (tables/images) need more space
        footer_padding = _compute_fixed_block_padding(footer_html, "bottom")

    # Wrap in full HTML document for WeasyPrint
    full_html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>{EDITOR_MATCHING_CSS}
        {header_padding}
        {footer_padding}
        </style>
    </head>
    <body>
        {header_block}
        {html}
        {footer_block}
    </body>
    </html>
    """

    # Generate PDF with WeasyPrint (full HTML/CSS support + page format)
    return _generate_pdf_with_weasyprint(full_html, page_format)


async def generate_invoice_pdf_from_data(
    invoice_data: dict,
    settings: dict,
    conference: Conference,
    db: AsyncSession,
) -> bytes:
    """Generate PDF from invoice data dictionary (for preview).

    Args:
        invoice_data: Dictionary with invoice fields (invoice_number, issue_date, etc.)
        settings: Conference settings dictionary with invoice_template_html and invoice_company_info
        conference: Conference model instance
        db: Database session

    Returns:
        PDF file as bytes

    This function mirrors generate_invoice_pdf but accepts dict data instead of Invoice model.
    Used for previewing PDFs with unsaved settings.
    """

    template_html = settings.get("invoice_template_html", DEFAULT_INVOICE_TEMPLATE_HTML)
    company_info = settings.get("invoice_company_info", {})
    page_format = settings.get("invoice_page_format", "A4")

    html = template_html

    # Resolve bank info (from array or legacy fields)
    bank_name, iban, bic = _resolve_bank_info(company_info)

    # Fetch fiscal representative data
    result = await db.execute(
        select(FiscalRepresentative)
        .where(FiscalRepresentative.conference_id == conference.id)
        .where(FiscalRepresentative.tenant_id == conference.tenant_id)
    )
    fiscal_rep = result.scalar_one_or_none()

    # Company VAT
    company_vat = company_info.get("tax_id", "")

    # Fiscal rep VAT
    fiscal_rep_vat = ""
    if fiscal_rep and fiscal_rep.conference_vat_number:
        fiscal_rep_vat = fiscal_rep.conference_vat_number

    # Determine which VAT to use for backward-compatible [COMPANY_TAX_ID]
    vat_source = company_info.get("vat_source", "company")
    legacy_vat_number = fiscal_rep_vat if vat_source == "fiscal_rep" else company_vat

    # Logo: fetch tenant logo from attachments and embed as base64
    logo_html = ""
    if conference.tenant_id:
        logo_result = await db.execute(
            select(Attachment)
            .where(Attachment.entity_type == "tenant_logo")
            .where(Attachment.entity_id == conference.tenant_id)
            .order_by(Attachment.created_at.desc())
            .limit(1)
        )
        logo_attachment = logo_result.scalar_one_or_none()

        if logo_attachment and logo_attachment.file_data:
            import mimetypes

            mime_type = mimetypes.guess_type(logo_attachment.filename)[0] or "image/png"
            logo_base64 = base64.b64encode(logo_attachment.file_data).decode("utf-8")
            logo_data_url = f"data:{mime_type};base64,{logo_base64}"
            logo_html = f'<img src="{logo_data_url}" style="max-width: 150px; height: auto;" alt="Company Logo">'

    # Fiscal representative address
    if fiscal_rep:
        fiscal_rep_address_parts = [
            fiscal_rep.address_line1 or "",
            fiscal_rep.address_line2 or "",
        ]
        fiscal_rep_address = ", ".join(p for p in fiscal_rep_address_parts if p)
    else:
        fiscal_rep_address = ""

    # Format dates
    issue_date = invoice_data.get("issue_date")
    issue_date_str = issue_date.strftime("%Y-%m-%d") if issue_date else ""
    due_date = invoice_data.get("due_date")
    due_date_str = due_date.strftime("%Y-%m-%d") if due_date else ""

    # Build replacements dict — applied to template body, header AND footer
    contact_email = conference.contact_email or conference.support_email or ""
    phone = company_info.get("phone", "") or conference.phone or ""
    primary_currency = invoice_data.get("currency") or conference.currency or "EUR"
    invoice_number = invoice_data.get("invoice_number", "")

    # Dual currency support — check company_info first, then conference.invoice_currency
    second_currency = company_info.get("second_currency", "") or getattr(conference, "invoice_currency", "") or ""
    # Exchange rate: check company_info (legacy), then conference.settings
    raw_rate = company_info.get("exchange_rate") or settings.get("invoice_exchange_rate")
    exchange_rate = Decimal(str(raw_rate)) if raw_rate else None

    subtotal_val = invoice_data.get("subtotal", 0)
    tax_amount_val = invoice_data.get("tax_amount", 0)
    total_val = invoice_data.get("total", 0)

    replacements: dict[str, str] = {
        # Company info
        "[COMPANY_NAME]": company_info.get("name", ""),
        "[COMPANY_ADDRESS]": _format_address(company_info),
        "[COMPANY_CITY]": company_info.get("city", ""),
        "[COMPANY_POSTAL_CODE]": company_info.get("postal_code", ""),
        "[COMPANY_COUNTRY]": _normalize_country_to_iso(company_info.get("country", "")),
        "[COMPANY_TAX_ID]": legacy_vat_number,
        "[COMPANY_VAT]": company_vat,
        "[COMPANY_LOGO]": logo_html,
        # Fiscal representative
        "[FISCAL_REP_NAME]": (fiscal_rep.company_name or "") if fiscal_rep else "",
        "[FISCAL_REP_ADDRESS]": fiscal_rep_address,
        "[FISCAL_REP_CITY]": (fiscal_rep.city or "") if fiscal_rep else "",
        "[FISCAL_REP_POSTAL_CODE]": (fiscal_rep.postal_code or "") if fiscal_rep else "",
        "[FISCAL_REP_COUNTRY]": _normalize_country_to_iso((fiscal_rep.country or "") if fiscal_rep else ""),
        "[FISCAL_REP_VAT]": fiscal_rep_vat,
        "[FISCAL_REP_TAX_ID]": (fiscal_rep.vat_number or "") if fiscal_rep else "",
        # Banking (both underscore and space variants)
        "[BANK_NAME]": bank_name,
        "[BANK NAME]": bank_name,
        "[IBAN]": iban,
        "[BIC]": bic,
        # Footer text
        "[FOOTER_TEXT]": company_info.get("footer_text", ""),
        # Invoice data
        "[INVOICE_NUMBER]": invoice_number,
        "[ISSUE_DATE]": issue_date_str,
        "[DUE_DATE]": due_date_str,
        # Recipient
        "[RECIPIENT_NAME]": invoice_data.get("recipient_name", ""),
        "[RECIPIENT_ADDRESS]": _format_recipient_address_from_data(invoice_data),
        "[RECIPIENT_VAT]": invoice_data.get("recipient_vat_number", ""),
        # Financial (formatted using conference number format settings)
        "[SUBTOTAL]": format_amount(subtotal_val, settings),
        "[TAX_RATE]": f"{invoice_data.get('tax_rate', 0):.2f}",
        "[TAX_AMOUNT]": format_amount(tax_amount_val, settings),
        "[TOTAL]": format_amount(total_val, settings),
        # Currency
        "[CURRENCY]": primary_currency,
        "[CURRENCY_1]": primary_currency,
        "[CURRENCY_2]": second_currency,
        # Dual currency
        "[SECOND_CURRENCY]": second_currency,
        "[SECOND_TOTAL]": format_amount(Decimal(str(total_val)) * exchange_rate, settings)
        if exchange_rate and total_val
        else "",
        "[SECOND_SUBTOTAL]": format_amount(Decimal(str(subtotal_val)) * exchange_rate, settings)
        if exchange_rate and subtotal_val
        else "",
        "[SECOND_TAX_AMOUNT]": format_amount(Decimal(str(tax_amount_val)) * exchange_rate, settings)
        if exchange_rate and tax_amount_val
        else "",
        # Contact info (both underscore and space variants)
        "[CONTACT_EMAIL]": contact_email,
        "[CONTACT EMAIL]": contact_email,
        "[PHONE]": phone,
        "[TELEFON]": phone,
        # Credit note
        "[CREDIT_NOTE_NUMBER]": invoice_number,
        "[ORIGINAL_INVOICE_NUMBER]": invoice_data.get("original_invoice_number", ""),
        "[ORIGINAL INVOICE NUMBER]": invoice_data.get("original_invoice_number", ""),
        # Notes
        "[NOTES]": invoice_data.get("notes", ""),
    }

    # For credit notes: [INVOICE_NUMBER] = original invoice number
    orig_inv_num = invoice_data.get("original_invoice_number", "")
    if orig_inv_num:
        replacements["[INVOICE_NUMBER]"] = orig_inv_num

    # Apply placeholders to template body
    html = _apply_placeholders(html, replacements)

    # Items table (special handling — preserves font context from template)
    items_table_html = _render_items_table(
        invoice_data.get("line_items", []), currency=primary_currency, settings=settings
    )
    html = _replace_items_placeholder(html, items_table_html)

    # Normalize TipTap output for PDF
    html = _preserve_empty_paragraphs(html)
    html = _normalize_table_widths(html)
    img_scale = _get_image_scale_factor(page_format)
    content_px = _get_content_width_px(page_format)
    html = _normalize_image_widths(html, scale=img_scale, content_width_px=content_px)

    # Header HTML (fixed at top of every page)
    header_html = settings.get("invoice_header_html", "")
    header_block = ""
    header_padding = ""
    if header_html and header_html.strip():
        # Apply the SAME placeholder replacements to header
        header_html = _apply_placeholders(header_html, replacements)
        # Normalize same as body
        header_html = _preserve_empty_paragraphs(header_html)
        header_html = _normalize_table_widths(header_html)
        header_html = _normalize_image_widths(header_html, scale=img_scale, content_width_px=content_px)
        header_block = f'<div class="page-header">{header_html}</div>'
        # Dynamic padding: complex headers (tables/images) need more space
        header_padding = _compute_fixed_block_padding(header_html, "top")

    # Footer HTML (fixed at bottom of every page)
    footer_html = settings.get("invoice_footer_html", "")
    footer_block = ""
    footer_padding = ""
    if footer_html and footer_html.strip():
        # Apply the SAME placeholder replacements to footer
        footer_html = _apply_placeholders(footer_html, replacements)
        # Normalize same as body
        footer_html = _preserve_empty_paragraphs(footer_html)
        footer_html = _normalize_table_widths(footer_html)
        footer_html = _normalize_image_widths(footer_html, scale=img_scale, content_width_px=content_px)
        footer_block = f'<div class="page-footer">{footer_html}</div>'
        # Dynamic padding: complex footers (tables/images) need more space
        footer_padding = _compute_fixed_block_padding(footer_html, "bottom")

    # Wrap in full HTML document for WeasyPrint
    full_html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>{EDITOR_MATCHING_CSS}
        {header_padding}
        {footer_padding}
        </style>
    </head>
    <body>
        {header_block}
        {html}
        {footer_block}
    </body>
    </html>
    """

    # Generate PDF with WeasyPrint (full HTML/CSS support + page format)
    return _generate_pdf_with_weasyprint(full_html, page_format)


def _replace_items_placeholder(html: str, items_table_html: str) -> str:
    """Replace ``[ITEMS_TABLE]`` with the rendered table, preserving context font.

    TipTap wraps the placeholder text in ``<p><span style="…">`` with the
    user's chosen font-family / font-size.  We extract those font properties
    and apply them to the generated ``<table>``.  The wrapping ``<p>`` is
    stripped so the ``<table>`` sits at block level (table-inside-p is
    invalid HTML).
    """
    placeholder = "[ITEMS_TABLE]"
    idx = html.find(placeholder)
    if idx < 0:
        return html

    # ── 1. Extract font info from the enclosing <p>…</p> ───────────────
    # Walk backward from the placeholder to find the opening <p>, then
    # forward to find the closing </p>.  This is more reliable than a
    # single greedy regex that can over-match across paragraphs.
    before = html[:idx]
    after = html[idx + len(placeholder) :]

    font_family: str | None = None
    font_size: str | None = None

    # Find the last <p…> before the placeholder
    p_open = before.rfind("<p")
    if p_open >= 0:
        # Extract font info only from WITHIN this paragraph's content
        p_content = before[p_open:]
        for m in re.finditer(r'font-family:\s*([^;"]+)', p_content):
            font_family = m.group(1).strip()
        for m in re.finditer(r'font-size:\s*([^;"]+)', p_content):
            font_size = m.group(1).strip()

        # Find the corresponding </p> after the placeholder
        p_close = after.find("</p>")
        if p_close >= 0:
            # Strip the wrapping <p>…[ITEMS_TABLE]…</p> and replace
            # with just the placeholder (which we'll swap for the table).
            html = before[:p_open] + placeholder + after[p_close + 4 :]

    # ── 2. Apply extracted font to the table ────────────────────────────
    if font_family or font_size:
        parts: list[str] = []
        if font_family:
            parts.append(f"font-family: {font_family}")
        if font_size:
            parts.append(f"font-size: {font_size}")
        extra_css = "; ".join(parts) + "; "
        # Merge into existing style attribute if present, otherwise add new one
        if 'style="' in items_table_html:
            items_table_html = items_table_html.replace('style="', f'style="{extra_css}', 1)
        else:
            items_table_html = items_table_html.replace("<table", f'<table style="{extra_css.rstrip("; ")}"', 1)

    return html.replace(placeholder, items_table_html)


def _render_items_table(line_items: list, currency: str = "EUR", settings: dict | None = None) -> str:
    """Render line items as an HTML table matching the TipTap editor style.

    Uses minimal inline styles (only text-alignment) so the table inherits
    borders, padding, and header background from EDITOR_MATCHING_CSS — the
    same CSS that styles tables created in the rich-text editor.

    Args:
        line_items: List of line item dicts with description, quantity,
                    unit_price, discount, total
        currency: Currency code to display after amounts (e.g. "EUR")
        settings: Conference settings dict for number formatting

    Returns:
        HTML table string
    """
    if not line_items:
        return "<p>No items</p>"

    fmt_settings = settings or {}
    cell = "padding: 1px 4px;"
    cur = f" {currency}" if currency else ""
    table = f"""
    <table style="line-height: 1.1; border-collapse: collapse;">
      <thead>
        <tr>
          <th style="text-align: center; {cell}">Pos</th>
          <th style="text-align: left; {cell}">Description</th>
          <th style="text-align: right; {cell}">Qty</th>
          <th style="text-align: right; {cell}">Unit Price</th>
          <th style="text-align: right; {cell}">Discount</th>
          <th style="text-align: right; {cell}">Total</th>
        </tr>
      </thead>
      <tbody>
    """

    for idx, item in enumerate(line_items, start=1):
        desc = item.get("description", "")
        raw_qty = item.get("quantity", 1)
        # Display whole numbers without decimals (1 not 1.0)
        qty_display = (
            str(int(raw_qty)) if isinstance(raw_qty, (int, float)) and raw_qty == int(raw_qty) else str(raw_qty)
        )
        unit_price = Decimal(str(item.get("unit_price", 0)))
        discount = Decimal(str(item.get("discount", 0)))
        total = Decimal(str(item.get("total", 0)))

        discount_display = f"-{format_amount(discount, fmt_settings)}{cur}" if discount > 0 else "-"

        table += f"""
        <tr>
          <td style="text-align: center; {cell}">{idx}</td>
          <td style="{cell}">{desc}</td>
          <td style="text-align: right; {cell}">{qty_display}</td>
          <td style="text-align: right; {cell}">{format_amount(unit_price, fmt_settings)}{cur}</td>
          <td style="text-align: right; {cell}">{discount_display}</td>
          <td style="text-align: right; {cell}"><strong>{format_amount(total, fmt_settings)}{cur}</strong></td>
        </tr>
        """

    table += """
      </tbody>
    </table>
    """
    return table


def _format_address(company_info: dict) -> str:
    """Format company address as single string with line breaks.

    Supports both new single address field and legacy address_line1/address_line2.
    Migration from two-field to single-field is handled transparently.

    Args:
        company_info: Dictionary with address fields

    Returns:
        Formatted address string with <br> tags
    """
    # Use new single address field if present
    if company_info.get("address"):
        parts = [
            company_info.get("address"),
            f"{company_info.get('postal_code', '')} {company_info.get('city', '')}".strip(),
            company_info.get("country"),
        ]
    else:
        # Backward compatibility: legacy two-field address
        parts = [
            company_info.get("address_line1"),
            company_info.get("address_line2"),
            f"{company_info.get('postal_code', '')} {company_info.get('city', '')}".strip(),
            company_info.get("country"),
        ]
    return "<br>".join(p for p in parts if p)


def _format_recipient_address(invoice: Invoice) -> str:
    """Format recipient address from invoice fields.

    Args:
        invoice: Invoice model instance

    Returns:
        Formatted address string with <br> tags
    """
    country = invoice.recipient_country
    parts = [
        invoice.recipient_address_line1,
        invoice.recipient_address_line2,
        f"{invoice.recipient_postal_code or ''} {invoice.recipient_city or ''}".strip(),
        _iso_to_country_name(country) if country else None,
    ]
    return "<br>".join(p for p in parts if p)


def _format_recipient_address_from_data(invoice_data: dict) -> str:
    """Format recipient address from invoice data dictionary.

    Args:
        invoice_data: Dictionary with recipient address fields

    Returns:
        Formatted address string with <br> tags
    """
    country = invoice_data.get("recipient_country")
    parts = [
        invoice_data.get("recipient_address_line1"),
        invoice_data.get("recipient_address_line2"),
        f"{invoice_data.get('recipient_postal_code', '')} {invoice_data.get('recipient_city', '')}".strip(),
        _iso_to_country_name(country) if country else None,
    ]
    return "<br>".join(p for p in parts if p)
