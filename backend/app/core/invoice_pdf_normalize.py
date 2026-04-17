"""Backwards-compatible shim for :mod:`app.core.invoice.pdf_normalize`.

Moved under ``app.core.invoice`` in audit Step 28. This shim preserves
the historical import path and will be removed once callers are updated.
"""

from __future__ import annotations

from app.core.invoice.pdf_normalize import (
    _compute_fixed_block_padding,
    _generate_pdf_with_weasyprint,
    _get_content_width_px,
    _get_image_scale_factor,
    _get_page_size_css,
    _normalize_image_widths,
    _normalize_table_widths,
    _preserve_empty_paragraphs,
    _strip_table_widths,
    build_full_html,
    normalize_html_for_pdf,
)

__all__ = [
    "_compute_fixed_block_padding",
    "_generate_pdf_with_weasyprint",
    "_get_content_width_px",
    "_get_image_scale_factor",
    "_get_page_size_css",
    "_normalize_image_widths",
    "_normalize_table_widths",
    "_preserve_empty_paragraphs",
    "_strip_table_widths",
    "build_full_html",
    "normalize_html_for_pdf",
]
