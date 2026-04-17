"""Backwards-compatible shim for :mod:`app.core.invoice.pdf`.

Moved under ``app.core.invoice`` in audit Step 28. This shim preserves
the historical import path and will be removed once callers are updated.
"""

from __future__ import annotations

from app.core.invoice.pdf import (
    DEFAULT_INVOICE_TEMPLATE_HTML,
    EDITOR_MATCHING_CSS,
    _iso_to_country_name,
    _normalize_country_to_iso,
    _render_items_table,
    generate_invoice_pdf,
    generate_invoice_pdf_from_data,
)

__all__ = [
    "DEFAULT_INVOICE_TEMPLATE_HTML",
    "EDITOR_MATCHING_CSS",
    "_iso_to_country_name",
    "_normalize_country_to_iso",
    "_render_items_table",
    "generate_invoice_pdf",
    "generate_invoice_pdf_from_data",
]
