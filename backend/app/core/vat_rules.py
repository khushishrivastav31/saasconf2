"""Backwards-compatible shim for :mod:`app.core.vat.rules`.

Moved under ``app.core.vat`` in audit Step 28. This shim preserves the
historical import path and will be removed once callers are updated.
"""

from __future__ import annotations

from app.core.vat.rules import get_vat_rule

__all__ = ["get_vat_rule"]
