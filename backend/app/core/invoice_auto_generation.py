"""Backwards-compatible shim for :mod:`app.core.invoice.auto_generation`.

Moved under ``app.core.invoice`` in audit Step 28. This shim preserves
the historical import path and will be removed once callers are updated.
"""

from __future__ import annotations

from app.core.invoice.auto_generation import create_invoice_for_registrations

__all__ = ["create_invoice_for_registrations"]
