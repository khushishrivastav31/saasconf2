"""Backwards-compatible shim for :mod:`app.core.invoice.audit`.

Moved under ``app.core.invoice`` in audit Step 28. This shim preserves
the historical import path and will be removed once callers are updated.
"""

from __future__ import annotations

from app.core.invoice.audit import (
    create_bulk_invoice_audit_logs,
    create_invoice_audit_log,
)

__all__ = [
    "create_bulk_invoice_audit_logs",
    "create_invoice_audit_log",
]
