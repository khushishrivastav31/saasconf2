"""Unit tests for the security module."""

import os

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://saasconf:saasconf_dev_password@localhost:5432/saasconf_test",
)
os.environ.setdefault(
    "JWT_SECRET_KEY", "test-secret-key-for-unit-tests-minimum-32-chars"
)
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "testpassword123")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")

import hashlib
import time
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from app.core.utils import utcnow

import pytest
import jwt

from app.core.exceptions import AuthenticationError
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_secure_password,
    hash_password,
    hash_token,
    verify_password,
)
from app.config import get_settings

settings = get_settings()


# ---------------------------------------------------------------------------
# Password hashing and verification
# ---------------------------------------------------------------------------


class TestHashPassword:
    """Tests for hash_password and verify_password."""

    def test_hash_password_returns_argon2id_hash(self):
        hashed = hash_password("my-secret-password")
        assert hashed.startswith("$argon2id$")

    def test_hash_password_produces_different_hashes_for_same_input(self):
        """Argon2 uses a random salt each time, so hashes must differ."""
        h1 = hash_password("same-password")
        h2 = hash_password("same-password")
        assert h1 != h2

    def test_verify_password_correct(self):
        password = "correct-horse-battery-staple"
        hashed = hash_password(password)
        assert verify_password(password, hashed) is True

    def test_verify_password_wrong(self):
        hashed = hash_password("right-password")
        assert verify_password("wrong-password", hashed) is False

    def test_verify_password_empty_password(self):
        hashed = hash_password("non-empty")
        assert verify_password("", hashed) is False

    def test_hash_and_verify_unicode_password(self):
        password = "p\u00e4ssw\u00f6rd-\u00fc\u00f1\u00eec\u00f8de-\u2603"
        hashed = hash_password(password)
        assert verify_password(password, hashed) is True
        assert verify_password("plain-ascii", hashed) is False


# ---------------------------------------------------------------------------
# Access token creation and decoding
# ---------------------------------------------------------------------------


class TestAccessToken:
    """Tests for create_access_token and decode_token with access tokens."""

    def test_create_and_decode_with_tenant(self):
        user_id = uuid4()
        tenant_id = uuid4()
        role = "admin"
        modules = ["billing", "crm"]

        token = create_access_token(user_id, tenant_id, role, modules)
        payload = decode_token(token, token_type="access")

        assert payload["sub"] == str(user_id)
        assert payload["tenant_id"] == str(tenant_id)
        assert payload["role"] == role
        assert payload["modules"] == modules
        assert payload["type"] == "access"

    def test_create_and_decode_without_tenant(self):
        """Super-admin tokens have tenant_id=None."""
        user_id = uuid4()
        token = create_access_token(user_id, tenant_id=None, role="super_admin")
        payload = decode_token(token, token_type="access")

        assert payload["sub"] == str(user_id)
        assert payload["tenant_id"] is None
        assert payload["role"] == "super_admin"

    def test_create_access_token_modules_default_empty(self):
        user_id = uuid4()
        token = create_access_token(user_id, tenant_id=None, role="viewer")
        payload = decode_token(token, token_type="access")
        assert payload["modules"] == []

    def test_create_access_token_modules_none_becomes_empty_list(self):
        user_id = uuid4()
        token = create_access_token(
            user_id, tenant_id=uuid4(), role="editor", modules=None
        )
        payload = decode_token(token, token_type="access")
        assert payload["modules"] == []

    def test_access_token_contains_exp_and_iat(self):
        before = utcnow()
        token = create_access_token(uuid4(), uuid4(), "admin")
        payload = decode_token(token, token_type="access")

        assert "exp" in payload
        assert "iat" in payload
        # exp should be roughly ACCESS_TOKEN_EXPIRE_MINUTES from now
        exp_dt = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
        expected = before + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        # Allow a 5-second tolerance for test execution time
        assert abs((exp_dt - expected).total_seconds()) < 5

    def test_decode_access_token_default_type(self):
        """decode_token defaults to token_type='access'."""
        token = create_access_token(uuid4(), uuid4(), "admin")
        payload = decode_token(token)  # no explicit token_type
        assert payload["type"] == "access"


# ---------------------------------------------------------------------------
# Refresh token creation and decoding
# ---------------------------------------------------------------------------


class TestRefreshToken:
    """Tests for create_refresh_token and decode_token with refresh tokens."""

    def test_create_refresh_token_returns_tuple(self):
        user_id = uuid4()
        result = create_refresh_token(user_id)
        assert isinstance(result, tuple)
        assert len(result) == 3

    def test_create_refresh_token_structure(self):
        user_id = uuid4()
        raw_token, token_hash, expire = create_refresh_token(user_id)

        assert isinstance(raw_token, str)
        assert isinstance(token_hash, str)
        assert isinstance(expire, datetime)

    def test_refresh_token_decode(self):
        user_id = uuid4()
        raw_token, _, _ = create_refresh_token(user_id)
        payload = decode_token(raw_token, token_type="refresh")

        assert payload["sub"] == str(user_id)
        assert payload["type"] == "refresh"
        assert "jti" in payload

    def test_refresh_token_hash_matches(self):
        """The returned hash should match SHA256 of the raw token."""
        user_id = uuid4()
        raw_token, token_hash, _ = create_refresh_token(user_id)
        expected_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        assert token_hash == expected_hash

    def test_refresh_token_expiry(self):
        before = utcnow()
        _, _, expire = create_refresh_token(uuid4())
        expected = before + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
        assert abs((expire - expected).total_seconds()) < 5

    def test_refresh_tokens_have_unique_jti(self):
        user_id = uuid4()
        raw1, _, _ = create_refresh_token(user_id)
        raw2, _, _ = create_refresh_token(user_id)

        payload1 = decode_token(raw1, token_type="refresh")
        payload2 = decode_token(raw2, token_type="refresh")
        assert payload1["jti"] != payload2["jti"]


# ---------------------------------------------------------------------------
# Token type mismatch
# ---------------------------------------------------------------------------


class TestTokenTypeMismatch:
    """Ensure decoding a token with the wrong type raises AuthenticationError."""

    def test_access_token_decoded_as_refresh_raises(self):
        token = create_access_token(uuid4(), uuid4(), "admin")
        with pytest.raises(AuthenticationError, match="Invalid token type"):
            decode_token(token, token_type="refresh")

    def test_refresh_token_decoded_as_access_raises(self):
        raw_token, _, _ = create_refresh_token(uuid4())
        with pytest.raises(AuthenticationError, match="Invalid token type"):
            decode_token(raw_token, token_type="access")


# ---------------------------------------------------------------------------
# Expired token handling
# ---------------------------------------------------------------------------


class TestExpiredToken:
    """Tests for expired token detection."""

    def test_expired_access_token_raises(self):
        """Manually craft an expired token and verify decode_token rejects it."""
        payload = {
            "sub": str(uuid4()),
            "tenant_id": str(uuid4()),
            "role": "admin",
            "modules": [],
            "exp": utcnow() - timedelta(seconds=10),
            "iat": utcnow() - timedelta(minutes=20),
            "type": "access",
        }
        token = jwt.encode(
            payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM
        )
        with pytest.raises(AuthenticationError, match="Invalid or expired token"):
            decode_token(token, token_type="access")

    def test_expired_refresh_token_raises(self):
        payload = {
            "sub": str(uuid4()),
            "exp": utcnow() - timedelta(seconds=10),
            "iat": utcnow() - timedelta(days=8),
            "type": "refresh",
            "jti": "expired-jti",
        }
        token = jwt.encode(
            payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM
        )
        with pytest.raises(AuthenticationError, match="Invalid or expired token"):
            decode_token(token, token_type="refresh")


# ---------------------------------------------------------------------------
# Invalid token handling
# ---------------------------------------------------------------------------


class TestInvalidToken:
    """Tests for completely invalid tokens."""

    def test_garbage_string_raises(self):
        with pytest.raises(AuthenticationError, match="Invalid or expired token"):
            decode_token("not-a-valid-jwt")

    def test_empty_string_raises(self):
        with pytest.raises(AuthenticationError, match="Invalid or expired token"):
            decode_token("")

    def test_wrong_secret_key_raises(self):
        """Token signed with a different key should fail verification."""
        payload = {
            "sub": str(uuid4()),
            "tenant_id": None,
            "role": "admin",
            "modules": [],
            "exp": utcnow() + timedelta(minutes=30),
            "iat": utcnow(),
            "type": "access",
        }
        token = jwt.encode(
            payload,
            "a-completely-different-secret-key-that-is-long",
            algorithm=settings.JWT_ALGORITHM,
        )
        with pytest.raises(AuthenticationError, match="Invalid or expired token"):
            decode_token(token, token_type="access")

    def test_tampered_token_raises(self):
        token = create_access_token(uuid4(), uuid4(), "admin")
        # Flip a character in the signature (last segment)
        parts = token.rsplit(".", 1)
        tampered_sig = parts[1][::-1]  # reverse the signature
        tampered_token = parts[0] + "." + tampered_sig
        with pytest.raises(AuthenticationError):
            decode_token(tampered_token, token_type="access")


# ---------------------------------------------------------------------------
# Token hashing (SHA256)
# ---------------------------------------------------------------------------


class TestHashToken:
    """Tests for hash_token (SHA256 hashing)."""

    def test_hash_token_returns_hex_string(self):
        result = hash_token("some-token-value")
        assert isinstance(result, str)
        # SHA256 produces 64 hex characters
        assert len(result) == 64
        assert all(c in "0123456789abcdef" for c in result)

    def test_hash_token_deterministic(self):
        """Same input must always produce the same hash."""
        token = "deterministic-test-token"
        assert hash_token(token) == hash_token(token)

    def test_hash_token_matches_hashlib_directly(self):
        token = "verify-against-hashlib"
        expected = hashlib.sha256(token.encode()).hexdigest()
        assert hash_token(token) == expected

    def test_hash_token_different_inputs_differ(self):
        assert hash_token("token-a") != hash_token("token-b")

    def test_hash_token_empty_string(self):
        """Empty string should still produce a valid SHA256 hash."""
        result = hash_token("")
        expected = hashlib.sha256(b"").hexdigest()
        assert result == expected


# ---------------------------------------------------------------------------
# Secure password generation
# ---------------------------------------------------------------------------


class TestGenerateSecurePassword:
    """Tests for generate_secure_password."""

    def test_default_length_returns_string(self):
        password = generate_secure_password()
        assert isinstance(password, str)
        assert len(password) > 0

    def test_custom_length(self):
        """token_urlsafe(n) produces ~4/3 * n characters (base64).
        We just verify the function accepts the length parameter and
        returns a non-empty string."""
        password = generate_secure_password(length=32)
        assert isinstance(password, str)
        assert len(password) > 0

    def test_short_length(self):
        password = generate_secure_password(length=4)
        assert isinstance(password, str)
        assert len(password) > 0

    def test_uniqueness(self):
        """Two calls should produce different passwords (astronomically
        unlikely to collide)."""
        p1 = generate_secure_password()
        p2 = generate_secure_password()
        assert p1 != p2

    def test_bulk_uniqueness(self):
        """Generate many passwords and verify all are unique."""
        passwords = {generate_secure_password() for _ in range(100)}
        assert len(passwords) == 100

    def test_password_characters_are_url_safe(self):
        """secrets.token_urlsafe produces only URL-safe base64 chars."""
        for _ in range(20):
            password = generate_secure_password()
            for ch in password:
                assert ch in (
                    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
                    "abcdefghijklmnopqrstuvwxyz"
                    "0123456789"
                    "-_"
                ), f"Unexpected character {ch!r} in generated password"
