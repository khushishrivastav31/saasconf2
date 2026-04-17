"""Backwards-compatible shim for :mod:`app.core.email.trainings`.

Moved under ``app.core.email`` in audit Step 28. This shim preserves the
historical import path and will be removed once callers are updated.
"""

from __future__ import annotations

from app.core.email.trainings import (
    send_training_confirmation_email,
    send_training_invoice_email,
)

__all__ = [
    "send_training_confirmation_email",
    "send_training_invoice_email",
]
