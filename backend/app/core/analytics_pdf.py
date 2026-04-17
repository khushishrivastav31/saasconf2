"""Backwards-compatible shim for :mod:`app.core.pdf.analytics`.

Moved under ``app.core.pdf`` in audit Step 28. This shim preserves the
historical import path and will be removed once callers are updated.
"""

from __future__ import annotations

from app.core.pdf.analytics import build_financial_report_pdf

__all__ = ["build_financial_report_pdf"]
