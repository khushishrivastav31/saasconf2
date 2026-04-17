"""Backwards-compatible shim for :mod:`app.core.security.portal`.

Moved under ``app.core.security`` in audit Step 28. This shim preserves
the historical import path and will be removed once callers are updated.
"""

from __future__ import annotations

from app.core.security.portal import (
    create_portal_access_token,
    create_portal_refresh_token,
    decode_portal_token,
    generate_password_reset_token,
)

__all__ = [
    "create_portal_access_token",
    "create_portal_refresh_token",
    "decode_portal_token",
    "generate_password_reset_token",
]
