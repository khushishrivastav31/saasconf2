"""Unit tests for the applicant_security module."""

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
from datetime import datetime, timedelta
from uuid import uuid4

import pytest
from jose import jwt

from app.config import get_settings
from app.core.applicant_security import (
    create_applicant_access_token,
    create_applicant_refresh_token,
    decode_applicant_token,
    generate_email_verification_token,
)
from app.core.exceptions import AuthenticationError

settings = get_settings()


# ---------------------------------------------------------------------------
# create_applicant_access_token tests
# ---------------------------------------------------------------------------


class TestCreateApplicantAccessToken:
    """Tests for create_applicant_access_token."""

    def test_creates_valid_jwt(self):
        """Creates a valid JWT token."""
        applicant_id = uuid4()
        tenant_id = uuid4()

        token = create_applicant_access_token(applicant_id, tenant_id)

        assert isinstance(token, str)
        assert len(token) > 0
        # Verify it's a valid JWT with three parts
        assert token.count(".") == 2

    def test_contains_correct_claims(self):
        """Token contains correct claims."""
        applicant_id = uuid4()
        tenant_id = uuid4()

        token = create_applicant_access_token(applicant_id, tenant_id)
        payload = jwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )

        assert payload["sub"] == str(applicant_id)
        assert payload["tenant_id"] == str(tenant_id)
        assert payload["type"] == "applicant_access"

    def test_contains_expiry_and_issued_at(self):
        """Token contains exp and iat claims."""
        applicant_id = uuid4()
        tenant_id = uuid4()

        before = datetime.utcnow()
        token = create_applicant_access_token(applicant_id, tenant_id)
        payload = jwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )

        assert "exp" in payload
        assert "iat" in payload

        # Verify expiry is roughly ACCESS_TOKEN_EXPIRE_MINUTES from now
        exp_dt = datetime.utcfromtimestamp(payload["exp"])
        expected = before + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        assert abs((exp_dt - expected).total_seconds()) < 5

    def test_different_applicants_get_different_tokens(self):
        """Different applicants receive different tokens."""
        tenant_id = uuid4()
        token1 = create_applicant_access_token(uuid4(), tenant_id)
        token2 = create_applicant_access_token(uuid4(), tenant_id)

        assert token1 != token2


# ---------------------------------------------------------------------------
# create_applicant_refresh_token tests
# ---------------------------------------------------------------------------


class TestCreateApplicantRefreshToken:
    """Tests for create_applicant_refresh_token."""

    def test_returns_tuple_of_three(self):
        """Returns a tuple of (raw_token, token_hash, expiry)."""
        applicant_id = uuid4()
        result = create_applicant_refresh_token(applicant_id)

        assert isinstance(result, tuple)
        assert len(result) == 3

    def test_return_types(self):
        """Returned values have correct types."""
        applicant_id = uuid4()
        raw_token, token_hash, expire = create_applicant_refresh_token(applicant_id)

        assert isinstance(raw_token, str)
        assert isinstance(token_hash, str)
        assert isinstance(expire, datetime)

    def test_raw_token_is_valid_jwt(self):
        """Raw token is a valid JWT."""
        applicant_id = uuid4()
        raw_token, _, _ = create_applicant_refresh_token(applicant_id)

        payload = jwt.decode(
            raw_token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
        assert payload["sub"] == str(applicant_id)
        assert payload["type"] == "applicant_refresh"

    def test_token_hash_matches_sha256(self):
        """Token hash is SHA256 of raw token."""
        applicant_id = uuid4()
        raw_token, token_hash, _ = create_applicant_refresh_token(applicant_id)

        expected_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        assert token_hash == expected_hash

    def test_expiry_is_correct(self):
        """Expiry is REFRESH_TOKEN_EXPIRE_DAYS in the future."""
        before = datetime.utcnow()
        _, _, expire = create_applicant_refresh_token(uuid4())

        expected = before + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
        assert abs((expire - expected).total_seconds()) < 5

    def test_contains_jti(self):
        """Token contains a jti claim."""
        raw_token, _, _ = create_applicant_refresh_token(uuid4())
        payload = jwt.decode(
            raw_token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )

        assert "jti" in payload
        assert len(payload["jti"]) > 0

    def test_unique_jti_per_token(self):
        """Each token has a unique jti."""
        applicant_id = uuid4()
        raw1, _, _ = create_applicant_refresh_token(applicant_id)
        raw2, _, _ = create_applicant_refresh_token(applicant_id)

        payload1 = jwt.decode(
            raw1, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
        payload2 = jwt.decode(
            raw2, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )

        assert payload1["jti"] != payload2["jti"]


# ---------------------------------------------------------------------------
# decode_applicant_token tests
# ---------------------------------------------------------------------------


class TestDecodeApplicantToken:
    """Tests for decode_applicant_token."""

    def test_decode_access_token(self):
        """Decodes access token correctly."""
        applicant_id = uuid4()
        tenant_id = uuid4()

        token = create_applicant_access_token(applicant_id, tenant_id)
        payload = decode_applicant_token(token, token_type="applicant_access")

        assert payload["sub"] == str(applicant_id)
        assert payload["tenant_id"] == str(tenant_id)
        assert payload["type"] == "applicant_access"

    def test_decode_refresh_token(self):
        """Decodes refresh token correctly."""
        applicant_id = uuid4()
        raw_token, _, _ = create_applicant_refresh_token(applicant_id)

        payload = decode_applicant_token(raw_token, token_type="applicant_refresh")

        assert payload["sub"] == str(applicant_id)
        assert payload["type"] == "applicant_refresh"

    def test_default_token_type_is_access(self):
        """Default token type is applicant_access."""
        applicant_id = uuid4()
        tenant_id = uuid4()

        token = create_applicant_access_token(applicant_id, tenant_id)
        payload = decode_applicant_token(token)  # No explicit token_type

        assert payload["type"] == "applicant_access"

    def test_wrong_token_type_raises_error(self):
        """Raises AuthenticationError when token type doesn't match."""
        token = create_applicant_access_token(uuid4(), uuid4())

        with pytest.raises(AuthenticationError, match="Invalid token type"):
            decode_applicant_token(token, token_type="applicant_refresh")

    def test_refresh_decoded_as_access_raises_error(self):
        """Raises error when refresh token is decoded as access."""
        raw_token, _, _ = create_applicant_refresh_token(uuid4())

        with pytest.raises(AuthenticationError, match="Invalid token type"):
            decode_applicant_token(raw_token, token_type="applicant_access")

    def test_expired_token_raises_error(self):
        """Raises AuthenticationError for expired tokens."""
        payload = {
            "sub": str(uuid4()),
            "tenant_id": str(uuid4()),
            "exp": datetime.utcnow() - timedelta(seconds=10),
            "iat": datetime.utcnow() - timedelta(minutes=30),
            "type": "applicant_access",
        }
        token = jwt.encode(
            payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM
        )

        with pytest.raises(AuthenticationError, match="Invalid or expired token"):
            decode_applicant_token(token)

    def test_invalid_token_raises_error(self):
        """Raises AuthenticationError for invalid tokens."""
        with pytest.raises(AuthenticationError, match="Invalid or expired token"):
            decode_applicant_token("not-a-valid-token")

    def test_empty_token_raises_error(self):
        """Raises AuthenticationError for empty token."""
        with pytest.raises(AuthenticationError, match="Invalid or expired token"):
            decode_applicant_token("")

    def test_wrong_secret_key_raises_error(self):
        """Raises error when token signed with different key."""
        payload = {
            "sub": str(uuid4()),
            "tenant_id": str(uuid4()),
            "exp": datetime.utcnow() + timedelta(minutes=30),
            "iat": datetime.utcnow(),
            "type": "applicant_access",
        }
        token = jwt.encode(
            payload,
            "different-secret-key-that-is-long-enough",
            algorithm=settings.JWT_ALGORITHM,
        )

        with pytest.raises(AuthenticationError, match="Invalid or expired token"):
            decode_applicant_token(token)

    def test_tampered_token_raises_error(self):
        """Raises error for tampered tokens."""
        token = create_applicant_access_token(uuid4(), uuid4())
        # Tamper with the signature
        parts = token.rsplit(".", 1)
        tampered_token = parts[0] + "." + parts[1][::-1]

        with pytest.raises(AuthenticationError):
            decode_applicant_token(tampered_token)


# ---------------------------------------------------------------------------
# generate_email_verification_token tests
# ---------------------------------------------------------------------------


class TestGenerateEmailVerificationToken:
    """Tests for generate_email_verification_token."""

    def test_returns_tuple_of_two(self):
        """Returns a tuple of (raw_token, token_hash)."""
        result = generate_email_verification_token()

        assert isinstance(result, tuple)
        assert len(result) == 2

    def test_return_types(self):
        """Returned values have correct types."""
        raw_token, token_hash = generate_email_verification_token()

        assert isinstance(raw_token, str)
        assert isinstance(token_hash, str)

    def test_raw_token_is_url_safe(self):
        """Raw token contains only URL-safe characters."""
        for _ in range(10):
            raw_token, _ = generate_email_verification_token()
            for ch in raw_token:
                assert ch in (
                    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
                    "abcdefghijklmnopqrstuvwxyz"
                    "0123456789"
                    "-_"
                ), f"Unexpected character {ch!r}"

    def test_token_hash_matches_sha256(self):
        """Token hash is SHA256 of raw token."""
        raw_token, token_hash = generate_email_verification_token()

        expected_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        assert token_hash == expected_hash

    def test_hash_is_64_hex_characters(self):
        """Hash is a 64-character hex string."""
        _, token_hash = generate_email_verification_token()

        assert len(token_hash) == 64
        assert all(c in "0123456789abcdef" for c in token_hash)

    def test_tokens_are_unique(self):
        """Each call generates a unique token."""
        tokens = set()
        for _ in range(100):
            raw_token, _ = generate_email_verification_token()
            tokens.add(raw_token)

        assert len(tokens) == 100

    def test_hashes_are_unique(self):
        """Each call generates a unique hash."""
        hashes = set()
        for _ in range(100):
            _, token_hash = generate_email_verification_token()
            hashes.add(token_hash)

        assert len(hashes) == 100

    def test_raw_token_has_sufficient_length(self):
        """Raw token has sufficient length for security."""
        raw_token, _ = generate_email_verification_token()
        # token_urlsafe(32) produces ~43 characters
        assert len(raw_token) >= 40


# ---------------------------------------------------------------------------
# Cross-function interaction tests
# ---------------------------------------------------------------------------


class TestApplicantSecurityIntegration:
    """Integration tests for applicant security functions."""

    def test_access_token_cannot_be_used_as_refresh(self):
        """Access tokens cannot be used as refresh tokens."""
        token = create_applicant_access_token(uuid4(), uuid4())

        with pytest.raises(AuthenticationError, match="Invalid token type"):
            decode_applicant_token(token, token_type="applicant_refresh")

    def test_refresh_token_cannot_be_used_as_access(self):
        """Refresh tokens cannot be used as access tokens."""
        raw_token, _, _ = create_applicant_refresh_token(uuid4())

        with pytest.raises(AuthenticationError, match="Invalid token type"):
            decode_applicant_token(raw_token, token_type="applicant_access")

    def test_applicant_tokens_differ_from_user_tokens(self):
        """Applicant tokens have different type from user tokens."""
        from app.core.security import create_access_token

        user_id = uuid4()
        tenant_id = uuid4()

        user_token = create_access_token(user_id, tenant_id, "user")
        applicant_token = create_applicant_access_token(user_id, tenant_id)

        # Decode both to check types
        user_payload = jwt.decode(
            user_token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
        applicant_payload = jwt.decode(
            applicant_token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )

        assert user_payload["type"] == "access"
        assert applicant_payload["type"] == "applicant_access"

    def test_full_token_lifecycle(self):
        """Tests the full token creation and verification cycle."""
        applicant_id = uuid4()
        tenant_id = uuid4()

        # Create access token
        access_token = create_applicant_access_token(applicant_id, tenant_id)

        # Verify access token
        access_payload = decode_applicant_token(access_token, token_type="applicant_access")
        assert access_payload["sub"] == str(applicant_id)
        assert access_payload["tenant_id"] == str(tenant_id)

        # Create refresh token
        refresh_token, token_hash, expire = create_applicant_refresh_token(applicant_id)

        # Verify refresh token
        refresh_payload = decode_applicant_token(refresh_token, token_type="applicant_refresh")
        assert refresh_payload["sub"] == str(applicant_id)

        # Verify hash can be used to look up token
        computed_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
        assert computed_hash == token_hash
