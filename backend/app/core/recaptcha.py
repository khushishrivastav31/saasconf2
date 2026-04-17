"""Backwards-compatible shim for :mod:`app.core.security.recaptcha`.

Moved under ``app.core.security`` in audit Step 28. This shim preserves
the historical import path and will be removed once callers are updated.
"""

from __future__ import annotations

from app.core.security.recaptcha import validate_recaptcha

__all__ = ["validate_recaptcha"]
