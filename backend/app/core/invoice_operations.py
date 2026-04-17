"""Backwards-compatible shim for :mod:`app.core.invoice.operations`.

Moved under ``app.core.invoice`` in audit Step 28. This shim preserves
the historical import path and will be removed once callers are updated.
"""

from __future__ import annotations

from app.core.invoice.operations import create_credit_note_for_invoice

__all__ = ["create_credit_note_for_invoice"]
