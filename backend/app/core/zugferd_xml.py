"""Backwards-compatible shim for :mod:`app.core.zugferd.xml`.

The actual implementation moved to :mod:`app.core.zugferd.xml` as part of the
``app.core`` subpackaging (audit Step 28). This shim preserves the historical
import path ``from app.core.zugferd_xml import ...``. It will be removed in a
later release once callers are updated.
"""

from __future__ import annotations

from app.core.zugferd.xml import generate_zugferd_xml

__all__ = ["generate_zugferd_xml"]
