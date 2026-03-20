"""HTML normalization utilities for invoice PDF generation.

Converts TipTap editor HTML output into WeasyPrint-compatible HTML:
image width scaling, table column percentage conversion, empty paragraph
preservation, and fixed header/footer padding computation.
"""

import re

from .invoice_pdf_placeholders import _apply_placeholders

_PAGE_WIDTHS_MM: dict[str, float] = {
    "A4": 210,
    "A5": 148,
    "Letter": 215.9,
    "Legal": 215.9,
    "B5": 176,
    "Tabloid": 279.4,
}


def _get_page_size_css(page_format: str) -> str:
    """Get CSS @page size declaration for the given format."""
    formats = {
        "A4": "A4",
        "A5": "A5",
        "Letter": "letter",
        "Legal": "legal",
        "B5": "B5",
        "Tabloid": "11in 17in",
    }
    return formats.get(page_format, "A4")


def _generate_pdf_with_weasyprint(html_content: str, page_format: str = "A4") -> bytes:
    """Generate PDF from HTML using WeasyPrint (full HTML/CSS support)."""
    from weasyprint import HTML

    page_size = _get_page_size_css(page_format)
    if "@page" not in html_content:
        style_tag = f"""
        <style>
            @page {{
                size: {page_size};
                margin: 2cm;
            }}
        </style>
        """
        if "</head>" in html_content:
            html_content = html_content.replace("</head>", f"{style_tag}</head>")
        elif "<html>" in html_content:
            html_content = html_content.replace("<html>", f"<html><head>{style_tag}</head>")
        else:
            html_content = f"<html><head>{style_tag}</head><body>{html_content}</body></html>"

    pdf_bytes = HTML(string=html_content).write_pdf()
    return pdf_bytes


def _get_image_scale_factor(page_format: str) -> float:
    """Return the ratio of PDF content width to editor canvas width."""
    page_width = _PAGE_WIDTHS_MM.get(page_format, 210)
    content_width = page_width - 40  # 2 cm margin on each side
    return content_width / page_width


def _get_content_width_px(page_format: str) -> int:
    """Return the PDF content width in CSS pixels (96 dpi)."""
    page_width_mm = _PAGE_WIDTHS_MM.get(page_format, 210)
    content_width_mm = page_width_mm - 40
    return int(content_width_mm * 96 / 25.4)


def _normalize_image_widths(html: str, scale: float = 1.0, content_width_px: int = 0) -> str:
    """Convert ``<img width="X">`` HTML attributes to scaled inline CSS.

    TipTap's ResizableImage stores user-set widths as HTML ``width``
    attributes.  WeasyPrint renders these inconsistently -- it handles
    CSS ``style="width: Xpx"`` much more reliably.

    When *scale* != 1.0 the pixel width is multiplied by the factor so
    that the image occupies the same visual proportion of the PDF
    content area as it does of the editor canvas.

    Images WITHOUT a width attribute get explicit max-width/max-height
    inline styles so WeasyPrint doesn't render them at natural (often
    very large) resolution.
    """

    def _replace_img(match: re.Match[str]) -> str:
        tag = match.group(0)
        width_match = re.search(r'\bwidth="(\d+(?:\.\d+)?)"', tag)
        if width_match:
            width_px = float(width_match.group(1))
            scaled_width = max(1, int(width_px * scale))
            tag = re.sub(r'\s*width="\d+(?:\.\d+)?"', "", tag)
            if 'style="' in tag:
                tag = tag.replace('style="', f'style="width: {scaled_width}px; ')
            else:
                tag = tag.replace(
                    "<img",
                    f'<img style="width: {scaled_width}px; max-width: 100%; height: auto;"',
                )
        else:
            max_w = f"{content_width_px}px" if content_width_px else "100%"
            constraint = f"max-width: {max_w}; max-height: 250px; height: auto;"
            if 'style="' in tag:
                tag = tag.replace('style="', f'style="{constraint} ')
            else:
                tag = tag.replace("<img", f'<img style="{constraint}"')
        return tag

    return re.sub(r"<img\s[^>]+>", _replace_img, html)


def _normalize_table_widths(html: str) -> str:
    """Convert TipTap pixel-based column widths to percentages."""

    def _replace_colgroup(match: re.Match[str]) -> str:
        colgroup_html = match.group(0)
        col_widths = re.findall(r"width:\s*(\d+(?:\.\d+)?)px", colgroup_html)
        if not col_widths:
            return colgroup_html
        widths = [float(w) for w in col_widths]
        total = sum(widths)
        if total <= 0:
            return colgroup_html
        pcts = [w / total * 100 for w in widths]
        cols = "".join(f'<col style="width: {p:.1f}%">' for p in pcts)
        return f"<colgroup>{cols}</colgroup>"

    html = re.sub(
        r"<colgroup>.*?</colgroup>",
        _replace_colgroup,
        html,
        flags=re.DOTALL,
    )
    html = re.sub(r'\s*colwidth="[^"]*"', "", html)
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

    Forces ``width: 100%`` on the table so it fills the full footer area
    with content-based column distribution.
    """
    html = re.sub(r"<colgroup>.*?</colgroup>", "", html, flags=re.DOTALL)
    html = re.sub(r'\s*colwidth="[^"]*"', "", html)
    html = re.sub(r'(<t[dh][^>]*)\s*style="[^"]*"', r"\1", html)
    html = re.sub(r'(<table[^>]*)\s*style="[^"]*"', r'\1 style="width:100%"', html)
    html = re.sub(r"<table(?![^>]*style=)", '<table style="width:100%"', html)
    return html


def _preserve_empty_paragraphs(html: str) -> str:
    """Convert empty paragraphs to non-breaking spaces for WeasyPrint."""
    html = re.sub(r"<p>\s*</p>", "<p>&nbsp;</p>", html)
    html = re.sub(r"<p>\s*<br\s*/?\s*>\s*</p>", "<p>&nbsp;</p>", html)
    return html


def _compute_fixed_block_padding(html: str, side: str) -> str:
    """Compute body padding CSS to reserve space for a fixed header/footer."""
    if side == "top":
        is_complex = "<table" in html or "<img" in html
        padding = "2cm" if is_complex else "1.5cm"
        return f"body {{ padding-top: {padding}; }}"

    html_lower = html.lower()
    height_cm = 0.0
    height_cm += html_lower.count("<tr") * 0.6
    height_cm += html_lower.count("<img") * 1.6
    block_count = sum(html_lower.count(tag) for tag in ("<p", "<div", "<br", "<li"))
    if block_count == 0:
        text_only = re.sub(r"<[^>]+>", "", html)
        block_count = max(1, len(text_only) // 80)
    height_cm += block_count * 0.35
    height_cm += 1.0
    height_cm = max(2.0, min(height_cm, 8.0))

    return f"body {{ padding-bottom: {height_cm:.1f}cm; }}"


def normalize_html_for_pdf(html: str, page_format: str) -> str:
    """Apply all HTML normalizations for PDF rendering in one call."""
    html = _preserve_empty_paragraphs(html)
    html = _normalize_table_widths(html)
    img_scale = _get_image_scale_factor(page_format)
    content_px = _get_content_width_px(page_format)
    html = _normalize_image_widths(html, scale=img_scale, content_width_px=content_px)
    return html


def build_full_html(
    body_html: str,
    settings: dict,
    replacements: dict[str, str],
    page_format: str,
    editor_css: str,
) -> str:
    """Build the complete HTML document with header, footer, and normalized body.

    Applies placeholder replacements and HTML normalization to header/footer,
    then wraps everything in a full HTML document.
    """
    body_html = normalize_html_for_pdf(body_html, page_format)

    header_html = settings.get("invoice_header_html", "")
    header_block = ""
    header_padding = ""
    if header_html and header_html.strip():
        header_html = _apply_placeholders(header_html, replacements)
        header_html = normalize_html_for_pdf(header_html, page_format)
        header_block = f'<div class="page-header">{header_html}</div>'
        header_padding = _compute_fixed_block_padding(header_html, "top")

    footer_html = settings.get("invoice_footer_html", "")
    footer_block = ""
    footer_padding = ""
    if footer_html and footer_html.strip():
        footer_html = _apply_placeholders(footer_html, replacements)
        footer_html = normalize_html_for_pdf(footer_html, page_format)
        footer_block = f'<div class="page-footer">{footer_html}</div>'
        footer_padding = _compute_fixed_block_padding(footer_html, "bottom")

    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>{editor_css}
        {header_padding}
        {footer_padding}
        </style>
    </head>
    <body>
        {header_block}
        {body_html}
        {footer_block}
    </body>
    </html>
    """
