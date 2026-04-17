"""Backwards-compatible shim for :mod:`app.core.invoice.validation`.

Moved under ``app.core.invoice`` in audit Step 28. This shim preserves
the historical import path and will be removed once callers are updated.
"""

from __future__ import annotations

from app.core.invoice.validation import (
    validate_recipient_fields,
    validate_vat_requirements,
)

__all__ = [
    "validate_recipient_fields",
    "validate_vat_requirements",
]
