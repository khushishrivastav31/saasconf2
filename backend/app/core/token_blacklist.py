"""Backwards-compatible shim for :mod:`app.core.security.token_blacklist`.

Moved under ``app.core.security`` in audit Step 28. This shim preserves
the historical import path and will be removed once callers are updated.
"""

from __future__ import annotations

from app.core.security.token_blacklist import (
    blacklist_token,
    clear_failed_logins,
    close_redis,
    init_redis,
    is_account_locked,
    is_token_blacklisted,
    record_failed_login,
)

__all__ = [
    "blacklist_token",
    "clear_failed_logins",
    "close_redis",
    "init_redis",
    "is_account_locked",
    "is_token_blacklisted",
    "record_failed_login",
]
