"""Backwards-compatible shim for :mod:`app.core.invoice.queries`.

Moved under ``app.core.invoice`` in audit Step 28. This shim preserves
the historical import path and will be removed once callers are updated.
"""

from __future__ import annotations

from app.core.invoice.queries import (
    get_invoice_basic,
    get_invoice_with_events,
    refresh_invoice_with_events,
)

__all__ = [
    "get_invoice_basic",
    "get_invoice_with_events",
    "refresh_invoice_with_events",
]
