"""Backwards-compatible shim for :mod:`app.core.invoice.registration_cancellation`.

Moved under ``app.core.invoice`` in audit Step 28. This shim preserves
the historical import path and will be removed once callers are updated.
"""

from __future__ import annotations

from app.core.invoice.registration_cancellation import (
    cancel_registrations_for_invoice,
)

__all__ = ["cancel_registrations_for_invoice"]
