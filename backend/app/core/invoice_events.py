"""Backwards-compatible shim for :mod:`app.core.invoice.events`.

Moved under ``app.core.invoice`` in audit Step 28. This shim preserves
the historical import path and will be removed once callers are updated.
"""

from __future__ import annotations

from app.core.invoice.events import InvoiceEventType, log_invoice_event

__all__ = ["InvoiceEventType", "log_invoice_event"]
