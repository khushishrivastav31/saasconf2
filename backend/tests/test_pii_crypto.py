"""Unit tests for column-level PII encryption helpers.

Covers the Fernet round-trip, key-rotation fallback, the searchable-hash
functions, and the SQLAlchemy ``EncryptedString`` TypeDecorator.
"""

from __future__ import annotations

import hashlib

import pytest
from cryptography.fernet import Fernet

from app.core.security import pii_crypto
from app.core.security.pii_crypto import (
    EncryptedString,
    PiiEncryptionNotConfigured,
    decrypt_pii,
    encrypt_pii,
    generate_pii_key,
    hash_email,
    hash_phone,
    hash_vat,
    read_pii,
    reset_fernet_cache,
)

# ---------------------------------------------------------------------------
# Round-trip encryption
# ---------------------------------------------------------------------------


def test_round_trip_preserves_plaintext() -> None:
    token = encrypt_pii("user@example.com")
    assert token != "user@example.com"
    assert decrypt_pii(token) == "user@example.com"


def test_round_trip_unicode() -> None:
    token = encrypt_pii("Jürgen Müller ✉️ jürgen@exämple.de")
    assert decrypt_pii(token) == "Jürgen Müller ✉️ jürgen@exämple.de"


def test_round_trip_empty_string() -> None:
    token = encrypt_pii("")
    assert decrypt_pii(token) == ""


def test_same_plaintext_yields_different_tokens() -> None:
    # Fernet embeds a random IV, so repeated encryptions differ.
    a = encrypt_pii("same")
    b = encrypt_pii("same")
    assert a != b
    assert decrypt_pii(a) == decrypt_pii(b) == "same"


def test_decrypt_invalid_token_raises() -> None:
    with pytest.raises(ValueError, match="Failed to decrypt PII"):
        decrypt_pii("not-a-valid-fernet-token")


# ---------------------------------------------------------------------------
# Missing-key behaviour
# ---------------------------------------------------------------------------


def test_raises_when_key_not_configured() -> None:
    """Without a configured key, encrypt/decrypt must fail loudly."""
    from app.config import get_settings

    settings = get_settings()
    original = settings.PII_ENCRYPTION_KEY
    reset_fernet_cache()
    try:
        settings.PII_ENCRYPTION_KEY = ""
        with pytest.raises(PiiEncryptionNotConfigured):
            encrypt_pii("anything")
    finally:
        settings.PII_ENCRYPTION_KEY = original
        reset_fernet_cache()


# ---------------------------------------------------------------------------
# Key rotation (MultiFernet)
# ---------------------------------------------------------------------------


def test_old_key_can_still_decrypt_after_rotation() -> None:
    """A token written with the old key must decrypt after rotating keys."""
    from app.config import get_settings

    settings = get_settings()
    original_key = settings.PII_ENCRYPTION_KEY
    original_old = settings.PII_ENCRYPTION_KEYS_OLD

    # Encrypt with the current key, then rotate: new key becomes primary,
    # original key moves to PII_ENCRYPTION_KEYS_OLD.
    token = encrypt_pii("legacy-value")

    new_key = generate_pii_key()
    reset_fernet_cache()
    try:
        settings.PII_ENCRYPTION_KEY = new_key
        settings.PII_ENCRYPTION_KEYS_OLD = original_key
        assert decrypt_pii(token) == "legacy-value"
        # New writes use the new key — also decryptable.
        fresh = encrypt_pii("rotated")
        assert decrypt_pii(fresh) == "rotated"
    finally:
        settings.PII_ENCRYPTION_KEY = original_key
        settings.PII_ENCRYPTION_KEYS_OLD = original_old
        reset_fernet_cache()


# ---------------------------------------------------------------------------
# Searchable hashes
# ---------------------------------------------------------------------------


def test_hash_email_normalizes_case_and_whitespace() -> None:
    expected = hashlib.sha256(b"jose@example.com").hexdigest()
    assert hash_email("jose@example.com") == expected
    assert hash_email("JOSE@EXAMPLE.COM") == expected
    assert hash_email("  Jose@Example.com  ") == expected


def test_hash_phone_strips_formatting() -> None:
    expected = hashlib.sha256(b"491701234567").hexdigest()
    assert hash_phone("+49 170 1234567") == expected
    assert hash_phone("+49-170-1234567") == expected
    assert hash_phone("491701234567") == expected


def test_hash_vat_normalizes_case_and_punctuation() -> None:
    expected = hashlib.sha256(b"DE123456789").hexdigest()
    assert hash_vat("DE123456789") == expected
    assert hash_vat("de123456789") == expected
    assert hash_vat("DE 123.456.789") == expected


def test_hashes_differ_across_types() -> None:
    # Guards against accidental collisions — same input, different hashers.
    assert hash_email("alice@example.com") != hash_phone("alice@example.com")


# ---------------------------------------------------------------------------
# TypeDecorator bind/result behaviour
# ---------------------------------------------------------------------------


def test_encrypted_string_process_bind_param_encrypts() -> None:
    col = EncryptedString()
    encrypted = col.process_bind_param("secret", None)
    assert encrypted is not None
    assert encrypted != "secret"
    # Round-trip through the column matches the original.
    assert col.process_result_value(encrypted, None) == "secret"


def test_encrypted_string_passes_through_none() -> None:
    col = EncryptedString()
    assert col.process_bind_param(None, None) is None
    assert col.process_result_value(None, None) is None


def test_encrypted_string_cache_ok() -> None:
    # SQLAlchemy uses cache_ok=True to allow query caching; guard against regression.
    assert EncryptedString.cache_ok is True


# ---------------------------------------------------------------------------
# Key helper
# ---------------------------------------------------------------------------


def test_generate_pii_key_returns_valid_fernet_key() -> None:
    key = generate_pii_key()
    # Valid keys are accepted by Fernet without error.
    Fernet(key.encode())


# ---------------------------------------------------------------------------
# read_pii — display-read helper with plaintext fallback
# ---------------------------------------------------------------------------


class _Row:
    def __init__(self, **kwargs: object) -> None:
        for k, v in kwargs.items():
            setattr(self, k, v)


def test_read_pii_prefers_encrypted_companion() -> None:
    row = _Row(email="stale@old.tld", email_encrypted=encrypt_pii("fresh@new.tld"))
    assert read_pii(row, "email") == "fresh@new.tld"


def test_read_pii_falls_back_to_plaintext_when_encrypted_is_null() -> None:
    row = _Row(email="legacy@example.com", email_encrypted=None)
    assert read_pii(row, "email") == "legacy@example.com"


def test_read_pii_returns_none_when_both_missing() -> None:
    row = _Row(email=None, email_encrypted=None)
    assert read_pii(row, "email") is None


def test_read_pii_returns_none_when_plaintext_empty_string() -> None:
    row = _Row(email="", email_encrypted=None)
    assert read_pii(row, "email") is None


def test_read_pii_works_for_phone_and_vat_attrs() -> None:
    row = _Row(phone_encrypted=encrypt_pii("+49 170 1234567"), vat_number_encrypted=encrypt_pii("DE123456789"))
    assert read_pii(row, "phone") == "+49 170 1234567"
    assert read_pii(row, "vat_number") == "DE123456789"


# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------


def teardown_module(_module: object) -> None:
    """Reset the module-level fernet cache so later tests pick up fresh config."""
    pii_crypto.reset_fernet_cache()
