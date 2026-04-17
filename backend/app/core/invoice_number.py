"""Backwards-compatible shim for :mod:`app.core.invoice.number`.

Moved under ``app.core.invoice`` in audit Step 28. This shim preserves
the historical import path and will be removed once callers are updated.
"""

from __future__ import annotations

from app.core.invoice.number import (
    generate_cancellation_number,
    generate_invoice_number,
    validate_invoice_template,
)

__all__ = [
    "generate_cancellation_number",
    "generate_invoice_number",
    "validate_invoice_template",
]
