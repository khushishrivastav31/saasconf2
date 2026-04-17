"""Backwards-compatible shim for :mod:`app.core.vat.validation`.

Moved under ``app.core.vat`` in audit Step 28. This shim preserves the
historical import path and will be removed once callers are updated.
"""

from __future__ import annotations

from app.core.vat.validation import (
    EU_COUNTRIES,
    normalize_country,
    normalize_vat,
    validate_regex,
    validate_stdnum,
    validate_vat_number,
    validate_vies,
)

__all__ = [
    "EU_COUNTRIES",
    "normalize_country",
    "normalize_vat",
    "validate_regex",
    "validate_stdnum",
    "validate_vat_number",
    "validate_vies",
]
