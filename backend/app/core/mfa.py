"""Backwards-compatible shim for :mod:`app.core.security.mfa`.

Moved under ``app.core.security`` in audit Step 28. This shim preserves
the historical import path and will be removed once callers are updated.
"""

from __future__ import annotations

from app.core.security.mfa import (
    decrypt_secret,
    encrypt_secret,
    generate_recovery_codes,
    generate_totp_secret,
    get_provisioning_uri,
    hash_recovery_codes,
    verify_recovery_code,
    verify_totp_code,
)

__all__ = [
    "decrypt_secret",
    "encrypt_secret",
    "generate_recovery_codes",
    "generate_totp_secret",
    "get_provisioning_uri",
    "hash_recovery_codes",
    "verify_recovery_code",
    "verify_totp_code",
]
