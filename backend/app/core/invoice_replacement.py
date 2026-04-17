"""Backwards-compatible shim for :mod:`app.core.invoice.replacement`.

Moved under ``app.core.invoice`` in audit Step 28. This shim preserves
the historical import path and will be removed once callers are updated.
"""

from __future__ import annotations

from app.core.invoice.replacement import create_replacement_invoice

__all__ = ["create_replacement_invoice"]
