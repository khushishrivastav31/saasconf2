"""Column-level PII encryption and deterministic hashing.

Encryption uses Fernet (AES-128-CBC + HMAC-SHA256) via a key supplied in
``PII_ENCRYPTION_KEY``.  A single-value envelope, ``MultiFernet``, allows
rotating keys: new writes use the current key, and reads fall back through
older keys listed in ``PII_ENCRYPTION_KEYS_OLD``.

Deterministic hashing lets us keep emails, phones and VAT numbers searchable
once the plaintext column is encrypted — consumers look up rows via a
matching ``_hash`` column (normalized + SHA-256) instead of by plaintext.

See ``docs/secret-rotation.md`` for the operational rotation procedure.
"""

from __future__ import annotations

import hashlib
import re
from functools import lru_cache
from typing import Any

from cryptography.fernet import Fernet, InvalidToken, MultiFernet
from sqlalchemy.types import String, TypeDecorator

from app.config import get_settings


class PiiEncryptionNotConfigured(RuntimeError):
    """Raised when PII encryption is invoked but no key is configured."""


@lru_cache(maxsize=1)
def _get_fernet() -> MultiFernet:
    settings = get_settings()
    if not settings.PII_ENCRYPTION_KEY:
        raise PiiEncryptionNotConfigured("PII_ENCRYPTION_KEY is not set — cannot encrypt/decrypt PII columns.")
    keys = [Fernet(settings.PII_ENCRYPTION_KEY.encode())]
    for old in _split_keys(settings.PII_ENCRYPTION_KEYS_OLD):
        keys.append(Fernet(old.encode()))
    return MultiFernet(keys)


def _split_keys(raw: str) -> list[str]:
    return [k.strip() for k in raw.split(",") if k.strip()]


def reset_fernet_cache() -> None:
    """Drop the cached MultiFernet instance — call after rotating keys in-process."""
    _get_fernet.cache_clear()


def encrypt_pii(value: str) -> str:
    """Encrypt a plaintext PII value; returns a Fernet token."""
    return _get_fernet().encrypt(value.encode()).decode()


def decrypt_pii(token: str) -> str:
    """Decrypt a Fernet token; raises ValueError if no key can decrypt it."""
    try:
        return _get_fernet().decrypt(token.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("Failed to decrypt PII — wrong or missing key") from exc


def generate_pii_key() -> str:
    """Generate a fresh Fernet key (44-char urlsafe base64). For ops use."""
    return Fernet.generate_key().decode()


def read_pii(obj: Any, plaintext_attr: str) -> str | None:
    """Return the decrypted PII value for an ORM row.

    Reads the encrypted companion column (``<attr>_encrypted``) and decrypts
    it via MultiFernet. Returns ``None`` when the column is NULL. The
    ``plaintext_attr`` argument is the conventional field name (``email``,
    ``phone``, ``vat_number``) — kept so existing call sites stay stable
    after plaintext columns were dropped in migration 199.
    """
    encrypted = getattr(obj, f"{plaintext_attr}_encrypted", None)
    if encrypted:
        return decrypt_pii(encrypted)
    return None


# ---------------------------------------------------------------------------
# Deterministic hashes for searchable columns
# ---------------------------------------------------------------------------


def hash_email(email: str) -> str:
    """SHA-256 hex digest of an email normalized to lowercase + stripped."""
    return hashlib.sha256(email.strip().lower().encode()).hexdigest()


_PHONE_STRIP = re.compile(r"\D")


def hash_phone(phone: str) -> str:
    """SHA-256 hex digest of a phone number reduced to digits only."""
    return hashlib.sha256(_PHONE_STRIP.sub("", phone).encode()).hexdigest()


_VAT_STRIP = re.compile(r"[^A-Z0-9]")


def hash_vat(vat: str) -> str:
    """SHA-256 hex digest of a VAT number normalized to uppercase alphanumerics."""
    return hashlib.sha256(_VAT_STRIP.sub("", vat.upper()).encode()).hexdigest()


# ---------------------------------------------------------------------------
# SQLAlchemy TypeDecorator
# ---------------------------------------------------------------------------


class EncryptedString(TypeDecorator[str]):
    """Transparently encrypts/decrypts a string column via Fernet.

    A Fernet token is roughly ``ceil(n / 16) * 16 + 73`` bytes for n plaintext
    bytes; ``length=2048`` gives room for ~1.4 KB plaintext (well beyond
    emails/phones/VAT).  NULL round-trips unchanged.
    """

    impl = String
    cache_ok = True

    def process_bind_param(self, value: str | None, dialect: Any) -> str | None:
        if value is None:
            return None
        return encrypt_pii(value)

    def process_result_value(self, value: str | None, dialect: Any) -> str | None:
        if value is None:
            return None
        return decrypt_pii(value)
