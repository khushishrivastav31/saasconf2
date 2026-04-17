"""Backwards-compatible shim for :mod:`app.core.invoice.pdf_placeholders`.

Moved under ``app.core.invoice`` in audit Step 28. This shim preserves
the historical import path and will be removed once callers are updated.
"""

from __future__ import annotations

from app.core.invoice.pdf_placeholders import (
    _apply_placeholders,
    _format_address,
    _format_notes_for_html,
    _format_recipient_address_from_parts,
    _iso_to_country_name,
    _normalize_country_to_iso,
    _resolve_bank_info,
    build_company_replacements,
    build_dual_currency_replacements,
    fetch_fiscal_rep_and_logo,
)

__all__ = [
    "_apply_placeholders",
    "_format_address",
    "_format_notes_for_html",
    "_format_recipient_address_from_parts",
    "_iso_to_country_name",
    "_normalize_country_to_iso",
    "_resolve_bank_info",
    "build_company_replacements",
    "build_dual_currency_replacements",
    "fetch_fiscal_rep_and_logo",
]
