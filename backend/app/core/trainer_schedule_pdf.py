"""Backwards-compatible shim for :mod:`app.core.pdf.trainer_schedule`.

Moved under ``app.core.pdf`` in audit Step 28. This shim preserves the
historical import path and will be removed once callers are updated.
"""

from __future__ import annotations

from app.core.pdf.trainer_schedule import generate_trainer_schedule_pdf

__all__ = ["generate_trainer_schedule_pdf"]
