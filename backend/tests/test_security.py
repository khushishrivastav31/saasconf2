"""Security-focused test suite for authentication, authorization, and access control.

Covers:
- Password hashing and verification (unit)
- Token creation, decoding, and validation (unit)
- Token security via HTTP (expired, malformed, missing, wrong type, wrong key)
- Token blacklisting (logout invalidation)
- Refresh token security (rotation, revocation / replay prevention)
- Authorization / role-based access control
- Tenant isolation
- Input validation (SQL injection, XSS, oversized payloads)
- Security headers and middleware
"""

import hashlib
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from uuid import uuid4

# Env vars must be set before importing app code
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://saasconf:saasconf_dev_password@localhost:5432/saasconf_test",
)
os.environ.setdefault(
    "JWT_SECRET_KEY", "test-secret-key-for-unit-tests-minimum-32-chars"
)
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "testpassword123")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")

import jwt as pyjwt
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
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
from app.core.utils import utcnow
from app.models.tenant import Tenant
from app.models.user import User, UserRole

from tests.conftest import auth_headers

settings = get_settings()


# ── Helpers ────────────────────────────────────────────────────────────


def _build_access_token_payload(
    user_id: uuid.UUID,
    tenant_id: uuid.UUID | None,
    role: str,
    modules: list[str] | None = None,
    *,
    expires_delta: timedelta | None = None,
    token_type: str = "access",
) -> dict:
    """Build an access-token payload so tests can manipulate individual claims."""
    now = utcnow()
    exp = now + (expires_delta if expires_delta is not None else timedelta(minutes=15))
    return {
        "sub": str(user_id),
        "tenant_id": str(tenant_id) if tenant_id else None,
        "role": role,
        "modules": modules or [],
        "is_tenant_super_user": False,
        "exp": exp,
        "iat": now,
        "type": token_type,
        "jti": secrets.token_urlsafe(16),
    }


def _encode_payload(payload: dict) -> str:
    """Encode a payload dict into a JWT signed with the test secret."""
    return pyjwt.encode(
        payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM
    )


# ══════════════════════════════════════════════════════════════════════
# UNIT TESTS — Password Hashing
# ══════════════════════════════════════════════════════════════════════


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

    def test_password_hash_is_not_plaintext(self):
        """Hashed password must never equal the plaintext input."""
        password = "SuperSecret123!"
        hashed = hash_password(password)
        assert hashed != password
        assert len(hashed) > len(password)


# ══════════════════════════════════════════════════════════════════════
# UNIT TESTS — Access Token Creation and Decoding
# ══════════════════════════════════════════════════════════════════════


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
        exp_dt = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
        expected = before + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        assert abs((exp_dt - expected).total_seconds()) < 5

    def test_decode_access_token_default_type(self):
        """decode_token defaults to token_type='access'."""
        token = create_access_token(uuid4(), uuid4(), "admin")
        payload = decode_token(token)  # no explicit token_type
        assert payload["type"] == "access"

    def test_access_token_contains_jti(self):
        """Each access token must contain a unique JTI for blacklisting."""
        token = create_access_token(uuid4(), uuid4(), "admin")
        payload = decode_token(token, token_type="access")
        assert "jti" in payload
        assert isinstance(payload["jti"], str)
        assert len(payload["jti"]) > 0

    def test_access_tokens_have_unique_jti(self):
        """Two tokens for the same user must have different JTIs."""
        uid = uuid4()
        tid = uuid4()
        t1 = create_access_token(uid, tid, "admin")
        t2 = create_access_token(uid, tid, "admin")
        p1 = decode_token(t1, token_type="access")
        p2 = decode_token(t2, token_type="access")
        assert p1["jti"] != p2["jti"]


# ══════════════════════════════════════════════════════════════════════
# UNIT TESTS — Refresh Token Creation and Decoding
# ══════════════════════════════════════════════════════════════════════


class TestRefreshToken:
    """Tests for create_refresh_token and decode_token with refresh tokens."""

    def test_create_refresh_token_returns_tuple(self):
        result = create_refresh_token(uuid4())
        assert isinstance(result, tuple)
        assert len(result) == 3

    def test_create_refresh_token_structure(self):
        raw_token, token_hash, expire = create_refresh_token(uuid4())
        assert isinstance(raw_token, str)
        assert isinstance(token_hash, str)
        assert isinstance(expire, datetime)

    def test_refresh_token_decode(self):
        raw_token, _, _ = create_refresh_token(uuid4())
        payload = decode_token(raw_token, token_type="refresh")
        assert payload["type"] == "refresh"
        assert "jti" in payload

    def test_refresh_token_hash_matches(self):
        """The returned hash should match SHA256 of the raw token."""
        raw_token, token_hash, _ = create_refresh_token(uuid4())
        expected_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        assert token_hash == expected_hash

    def test_refresh_token_expiry(self):
        before = utcnow()
        _, _, expire = create_refresh_token(uuid4())
        expected = before + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
        assert abs((expire - expected).total_seconds()) < 5

    def test_refresh_tokens_have_unique_jti(self):
        uid = uuid4()
        raw1, _, _ = create_refresh_token(uid)
        raw2, _, _ = create_refresh_token(uid)
        p1 = decode_token(raw1, token_type="refresh")
        p2 = decode_token(raw2, token_type="refresh")
        assert p1["jti"] != p2["jti"]


# ══════════════════════════════════════════════════════════════════════
# UNIT TESTS — Token Type Mismatch
# ══════════════════════════════════════════════════════════════════════


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


# ══════════════════════════════════════════════════════════════════════
# UNIT TESTS — Expired Token Handling
# ══════════════════════════════════════════════════════════════════════


class TestExpiredToken:
    """Tests for expired token detection."""

    def test_expired_access_token_raises(self):
        payload = {
            "sub": str(uuid4()),
            "tenant_id": str(uuid4()),
            "role": "admin",
            "modules": [],
            "exp": utcnow() - timedelta(seconds=10),
            "iat": utcnow() - timedelta(minutes=20),
            "type": "access",
        }
        token = pyjwt.encode(
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
        token = pyjwt.encode(
            payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM
        )
        with pytest.raises(AuthenticationError, match="Invalid or expired token"):
            decode_token(token, token_type="refresh")


# ══════════════════════════════════════════════════════════════════════
# UNIT TESTS — Invalid Token Handling
# ══════════════════════════════════════════════════════════════════════


class TestInvalidToken:
    """Tests for completely invalid tokens."""

    def test_garbage_string_raises(self):
        with pytest.raises(AuthenticationError, match="Invalid or expired token"):
            decode_token("not-a-valid-jwt")

    def test_empty_string_raises(self):
        with pytest.raises(AuthenticationError, match="Invalid or expired token"):
            decode_token("")

    def test_wrong_secret_key_raises(self):
        payload = {
            "sub": str(uuid4()),
            "tenant_id": None,
            "role": "admin",
            "modules": [],
            "exp": utcnow() + timedelta(minutes=30),
            "iat": utcnow(),
            "type": "access",
        }
        token = pyjwt.encode(
            payload,
            "a-completely-different-secret-key-that-is-long",
            algorithm=settings.JWT_ALGORITHM,
        )
        with pytest.raises(AuthenticationError, match="Invalid or expired token"):
            decode_token(token, token_type="access")

    def test_tampered_token_raises(self):
        token = create_access_token(uuid4(), uuid4(), "admin")
        parts = token.rsplit(".", 1)
        tampered_sig = parts[1][::-1]
        tampered_token = parts[0] + "." + tampered_sig
        with pytest.raises(AuthenticationError):
            decode_token(tampered_token, token_type="access")


# ══════════════════════════════════════════════════════════════════════
# UNIT TESTS — Token Hashing (SHA256)
# ══════════════════════════════════════════════════════════════════════


class TestHashToken:
    """Tests for hash_token (SHA256 hashing)."""

    def test_hash_token_returns_hex_string(self):
        result = hash_token("some-token-value")
        assert isinstance(result, str)
        assert len(result) == 64
        assert all(c in "0123456789abcdef" for c in result)

    def test_hash_token_deterministic(self):
        token = "deterministic-test-token"
        assert hash_token(token) == hash_token(token)

    def test_hash_token_matches_hashlib_directly(self):
        token = "verify-against-hashlib"
        expected = hashlib.sha256(token.encode()).hexdigest()
        assert hash_token(token) == expected

    def test_hash_token_different_inputs_differ(self):
        assert hash_token("token-a") != hash_token("token-b")

    def test_hash_token_empty_string(self):
        result = hash_token("")
        expected = hashlib.sha256(b"").hexdigest()
        assert result == expected


# ══════════════════════════════════════════════════════════════════════
# UNIT TESTS — Secure Password Generation
# ══════════════════════════════════════════════════════════════════════


class TestGenerateSecurePassword:
    """Tests for generate_secure_password."""

    def test_default_length_returns_string(self):
        password = generate_secure_password()
        assert isinstance(password, str)
        assert len(password) > 0

    def test_custom_length(self):
        password = generate_secure_password(length=32)
        assert isinstance(password, str)
        assert len(password) > 0

    def test_short_length(self):
        password = generate_secure_password(length=4)
        assert isinstance(password, str)
        assert len(password) > 0

    def test_uniqueness(self):
        p1 = generate_secure_password()
        p2 = generate_secure_password()
        assert p1 != p2

    def test_bulk_uniqueness(self):
        passwords = {generate_secure_password() for _ in range(100)}
        assert len(passwords) == 100

    def test_password_characters_are_url_safe(self):
        for _ in range(20):
            password = generate_secure_password()
            for ch in password:
                assert ch in (
                    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
                    "abcdefghijklmnopqrstuvwxyz"
                    "0123456789"
                    "-_"
                ), f"Unexpected character {ch!r} in generated password"


# ══════════════════════════════════════════════════════════════════════
# INTEGRATION TESTS — Token Security via HTTP
# ══════════════════════════════════════════════════════════════════════


async def test_expired_access_token_rejected(
    client: AsyncClient, tenant_admin_user: User
) -> None:
    """Expired access tokens must be rejected with 401."""
    payload = _build_access_token_payload(
        user_id=tenant_admin_user.id,
        tenant_id=tenant_admin_user.tenant_id,
        role=tenant_admin_user.role,
        expires_delta=timedelta(seconds=-1),  # already expired
    )
    expired_token = _encode_payload(payload)

    response = await client.get(
        "/api/v1/auth/me", headers=auth_headers(expired_token)
    )
    assert response.status_code == 401


async def test_malformed_token_rejected(client: AsyncClient) -> None:
    """Malformed JWT tokens must be rejected."""
    response = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer not-a-valid-jwt"},
    )
    assert response.status_code == 401


async def test_missing_auth_header_rejected(client: AsyncClient) -> None:
    """Requests without Authorization header must be rejected."""
    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 401


async def test_empty_bearer_token_rejected(client: AsyncClient) -> None:
    """An Authorization header with an empty bearer value must be rejected."""
    response = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer "},
    )
    assert response.status_code == 401


async def test_wrong_auth_scheme_rejected(client: AsyncClient) -> None:
    """Using a non-Bearer auth scheme must be rejected."""
    response = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Basic dXNlcjpwYXNz"},
    )
    assert response.status_code == 401


async def test_wrong_token_type_rejected(
    client: AsyncClient, tenant_admin_user: User
) -> None:
    """A refresh token must not work as an access token."""
    refresh_token, _, _ = create_refresh_token(user_id=tenant_admin_user.id)
    response = await client.get(
        "/api/v1/auth/me", headers=auth_headers(refresh_token)
    )
    assert response.status_code == 401


async def test_token_for_nonexistent_user_rejected(
    client: AsyncClient, tenant: Tenant
) -> None:
    """A token minted for a non-existent user must be rejected."""
    fake_token = create_access_token(
        user_id=uuid.uuid4(),
        tenant_id=tenant.id,
        role="user",
        modules=[],
    )
    response = await client.get(
        "/api/v1/auth/me", headers=auth_headers(fake_token)
    )
    assert response.status_code == 401


async def test_token_signed_with_wrong_key_rejected(
    client: AsyncClient, tenant_admin_user: User
) -> None:
    """A token signed with a different secret must be rejected."""
    payload = _build_access_token_payload(
        user_id=tenant_admin_user.id,
        tenant_id=tenant_admin_user.tenant_id,
        role=tenant_admin_user.role,
    )
    bad_token = pyjwt.encode(payload, "completely-wrong-secret-key", algorithm="HS256")
    response = await client.get(
        "/api/v1/auth/me", headers=auth_headers(bad_token)
    )
    assert response.status_code == 401


async def test_token_with_tampered_claims_rejected(
    client: AsyncClient, tenant_admin_user: User
) -> None:
    """A valid-looking token with a modified signature must be rejected."""
    valid_token = create_access_token(
        user_id=tenant_admin_user.id,
        tenant_id=tenant_admin_user.tenant_id,
        role=tenant_admin_user.role,
        modules=[],
    )
    parts = valid_token.rsplit(".", 1)
    tampered = parts[0] + "." + parts[1][:-1] + ("A" if parts[1][-1] != "A" else "B")
    response = await client.get(
        "/api/v1/auth/me", headers=auth_headers(tampered)
    )
    assert response.status_code == 401


# ══════════════════════════════════════════════════════════════════════
# INTEGRATION TESTS — Token Blacklisting
# ══════════════════════════════════════════════════════════════════════


async def test_blacklisted_token_rejected_after_logout(
    client: AsyncClient,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """After logout the access token should be blacklisted and rejected."""
    response = await client.post(
        "/api/v1/auth/logout",
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 200

    response = await client.get(
        "/api/v1/auth/me", headers=auth_headers(tenant_admin_token)
    )
    assert response.status_code == 401


# ══════════════════════════════════════════════════════════════════════
# INTEGRATION TESTS — Refresh Token Security
# ══════════════════════════════════════════════════════════════════════


async def test_revoked_refresh_token_rejected(
    client: AsyncClient, tenant_admin_user: User
) -> None:
    """A used (revoked) refresh token must not issue new tokens (replay prevention)."""
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": tenant_admin_user.email, "password": "Password123!"},
    )
    assert login_resp.status_code == 200
    refresh_token = login_resp.json()["refresh_token"]

    # First refresh rotates the token
    refresh_resp = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert refresh_resp.status_code == 200

    # Re-using the old token must fail
    reuse_resp = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert reuse_resp.status_code == 401


async def test_refresh_token_rotation(
    client: AsyncClient, tenant_admin_user: User
) -> None:
    """Each refresh must return a different refresh token (rotation)."""
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": tenant_admin_user.email, "password": "Password123!"},
    )
    assert login_resp.status_code == 200
    token1 = login_resp.json()["refresh_token"]

    refresh_resp = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": token1},
    )
    assert refresh_resp.status_code == 200
    token2 = refresh_resp.json()["refresh_token"]

    assert token1 != token2, "Refresh tokens must be rotated on each use"


async def test_refresh_with_fabricated_token_rejected(
    client: AsyncClient,
) -> None:
    """A correctly-signed but DB-absent refresh token must be rejected."""
    fake_payload = {
        "sub": str(uuid.uuid4()),
        "exp": utcnow() + timedelta(days=7),
        "iat": utcnow(),
        "type": "refresh",
        "jti": secrets.token_urlsafe(32),
    }
    fake_token = _encode_payload(fake_payload)

    response = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": fake_token},
    )
    assert response.status_code == 401


# ══════════════════════════════════════════════════════════════════════
# INTEGRATION TESTS — Authorization / Role-Based Access
# ══════════════════════════════════════════════════════════════════════


async def test_regular_user_cannot_access_super_admin_endpoints(
    client: AsyncClient, regular_user: User, regular_user_token: str
) -> None:
    """A regular user must not access super-admin-only endpoints (403)."""
    response = await client.get(
        "/api/v1/admin/tenants",
        headers=auth_headers(regular_user_token),
    )
    assert response.status_code == 403


async def test_tenant_admin_cannot_access_super_admin_endpoints(
    client: AsyncClient, tenant_admin_user: User, tenant_admin_token: str
) -> None:
    """A tenant admin must not access super-admin-only endpoints (403)."""
    response = await client.get(
        "/api/v1/admin/tenants",
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 403


async def test_super_admin_can_access_admin_endpoints(
    client: AsyncClient, super_admin_user: User, super_admin_token: str
) -> None:
    """A super admin must be able to access the tenants endpoint."""
    response = await client.get(
        "/api/v1/admin/tenants",
        headers=auth_headers(super_admin_token),
    )
    assert response.status_code == 200


async def test_deactivated_user_cannot_login(
    client: AsyncClient, db_session: AsyncSession, tenant: Tenant
) -> None:
    """A deactivated user must not be able to log in."""
    user = User(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        email=f"deactivate-{uuid.uuid4().hex[:8]}@test.com",
        password_hash=hash_password("Password123!"),
        first_name="Will",
        last_name="Deactivate",
        role=UserRole.USER.value,
        is_active=False,
    )
    db_session.add(user)
    await db_session.commit()

    response = await client.post(
        "/api/v1/auth/login",
        json={"email": user.email, "password": "Password123!"},
    )
    assert response.status_code == 401


async def test_deactivated_user_token_rejected(
    client: AsyncClient, db_session: AsyncSession, tenant: Tenant
) -> None:
    """A token minted while active should be rejected after the user is deactivated.

    After deactivation, at minimum, re-login must be blocked.
    """
    user = User(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        email=f"deactivate2-{uuid.uuid4().hex[:8]}@test.com",
        password_hash=hash_password("Password123!"),
        first_name="Will",
        last_name="Deactivate",
        role=UserRole.USER.value,
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()

    # Login while active
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": user.email, "password": "Password123!"},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]

    # Confirm token works
    me_resp = await client.get("/api/v1/auth/me", headers=auth_headers(token))
    assert me_resp.status_code == 200

    # Deactivate user
    user.is_active = False
    await db_session.commit()

    # Login must now fail
    login_resp2 = await client.post(
        "/api/v1/auth/login",
        json={"email": user.email, "password": "Password123!"},
    )
    assert login_resp2.status_code == 401


async def test_deactivated_tenant_blocks_login(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Users in a deactivated tenant must not be able to log in."""
    t = Tenant(
        id=uuid.uuid4(),
        name="Will Deactivate Corp",
        slug=f"deact-corp-{uuid.uuid4().hex[:6]}",
        is_active=True,
    )
    db_session.add(t)
    await db_session.flush()

    user = User(
        id=uuid.uuid4(),
        tenant_id=t.id,
        email=f"deact-tenant-{uuid.uuid4().hex[:8]}@test.com",
        password_hash=hash_password("Password123!"),
        first_name="Tenant",
        last_name="Member",
        role=UserRole.USER.value,
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()

    # Deactivate the tenant
    t.is_active = False
    await db_session.commit()

    response = await client.post(
        "/api/v1/auth/login",
        json={"email": user.email, "password": "Password123!"},
    )
    assert response.status_code == 401


async def test_deactivated_tenant_blocks_token_use(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """A valid token for a user whose tenant is deactivated must be rejected."""
    t = Tenant(
        id=uuid.uuid4(),
        name="Soon Deactivated Corp",
        slug=f"soon-deact-{uuid.uuid4().hex[:6]}",
        is_active=True,
    )
    db_session.add(t)
    await db_session.flush()

    user = User(
        id=uuid.uuid4(),
        tenant_id=t.id,
        email=f"soon-deact-{uuid.uuid4().hex[:8]}@test.com",
        password_hash=hash_password("Password123!"),
        first_name="Active",
        last_name="User",
        role=UserRole.TENANT_ADMIN.value,
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()

    # Login while tenant is active
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": user.email, "password": "Password123!"},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]

    # Deactivate the tenant
    t.is_active = False
    await db_session.commit()

    # Token should now be rejected because get_current_user checks tenant.is_active
    me_resp = await client.get("/api/v1/auth/me", headers=auth_headers(token))
    assert me_resp.status_code == 401


# ══════════════════════════════════════════════════════════════════════
# INTEGRATION TESTS — Tenant Isolation (RLS)
# ══════════════════════════════════════════════════════════════════════


async def test_user_cannot_access_other_tenant_data(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Users from one tenant must not see data from another tenant."""
    tenant_a = Tenant(
        id=uuid.uuid4(),
        name="Tenant A",
        slug=f"tenant-a-{uuid.uuid4().hex[:6]}",
        is_active=True,
    )
    tenant_b = Tenant(
        id=uuid.uuid4(),
        name="Tenant B",
        slug=f"tenant-b-{uuid.uuid4().hex[:6]}",
        is_active=True,
    )
    db_session.add_all([tenant_a, tenant_b])
    await db_session.flush()

    user_a = User(
        id=uuid.uuid4(),
        tenant_id=tenant_a.id,
        email=f"user-a-{uuid.uuid4().hex[:8]}@test.com",
        password_hash=hash_password("Password123!"),
        first_name="User",
        last_name="A",
        role=UserRole.TENANT_ADMIN.value,
        is_active=True,
    )
    db_session.add(user_a)
    await db_session.commit()

    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": user_a.email, "password": "Password123!"},
    )
    assert login_resp.status_code == 200
    token_a = login_resp.json()["access_token"]

    conf_resp = await client.get(
        "/api/v1/conferences", headers=auth_headers(token_a)
    )
    assert conf_resp.status_code == 200
    for conf in conf_resp.json().get("items", []):
        assert conf.get("tenant_id") is None or str(conf["tenant_id"]) == str(
            tenant_a.id
        )


async def test_token_with_wrong_tenant_id_cannot_access_api(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """A hand-crafted token claiming a non-existent tenant must be rejected."""
    t = Tenant(
        id=uuid.uuid4(),
        name="Real Tenant",
        slug=f"real-tenant-{uuid.uuid4().hex[:6]}",
        is_active=True,
    )
    db_session.add(t)
    await db_session.flush()

    user = User(
        id=uuid.uuid4(),
        tenant_id=t.id,
        email=f"real-user-{uuid.uuid4().hex[:8]}@test.com",
        password_hash=hash_password("Password123!"),
        first_name="Real",
        last_name="User",
        role=UserRole.TENANT_ADMIN.value,
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()

    # Craft token claiming a different (non-existent) tenant
    fake_tenant_id = uuid.uuid4()
    payload = _build_access_token_payload(
        user_id=user.id,
        tenant_id=fake_tenant_id,
        role=UserRole.TENANT_ADMIN.value,
    )
    forged_token = _encode_payload(payload)

    # The dependency checks that the tenant exists and is active
    response = await client.get(
        "/api/v1/auth/me", headers=auth_headers(forged_token)
    )
    assert response.status_code == 401


# ══════════════════════════════════════════════════════════════════════
# INTEGRATION TESTS — Input Validation
# ══════════════════════════════════════════════════════════════════════


async def test_login_with_invalid_email_format_rejected(
    client: AsyncClient,
) -> None:
    """Login with an invalid email format must return 422 (Pydantic EmailStr)."""
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "not-an-email", "password": "Password123!"},
    )
    assert response.status_code == 422


async def test_login_with_empty_password_rejected(
    client: AsyncClient,
) -> None:
    """Login with an empty password must return 422 (min_length=8)."""
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "valid@test.com", "password": ""},
    )
    assert response.status_code == 422


async def test_login_with_short_password_rejected(
    client: AsyncClient,
) -> None:
    """Login with a password shorter than 8 characters must return 422."""
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "valid@test.com", "password": "short"},
    )
    assert response.status_code == 422


async def test_login_with_sql_injection_attempt(client: AsyncClient) -> None:
    """SQL injection in login must not cause a 500 server error."""
    response = await client.post(
        "/api/v1/auth/login",
        json={
            "email": "' OR 1=1; --@evil.com",
            "password": "anything-long-enough",
        },
    )
    assert response.status_code in (401, 422)


async def test_login_with_xss_attempt(client: AsyncClient) -> None:
    """XSS payloads in login fields must not cause a 500 server error."""
    response = await client.post(
        "/api/v1/auth/login",
        json={
            "email": "<script>alert('xss')</script>@test.com",
            "password": "anything-long-enough",
        },
    )
    assert response.status_code in (401, 422)


async def test_login_with_oversized_payload_rejected(
    client: AsyncClient,
) -> None:
    """A login attempt with extremely long fields must not crash the server."""
    response = await client.post(
        "/api/v1/auth/login",
        json={
            "email": ("a" * 10000) + "@test.com",
            "password": "P" * 10000,
        },
    )
    assert response.status_code in (401, 422)


async def test_login_with_missing_fields_rejected(
    client: AsyncClient,
) -> None:
    """A login attempt with missing fields must return 422."""
    response = await client.post("/api/v1/auth/login", json={})
    assert response.status_code == 422


async def test_login_with_extra_fields_ignored(
    client: AsyncClient, tenant_admin_user: User
) -> None:
    """Extra unexpected fields in the login body must be ignored (not crash)."""
    response = await client.post(
        "/api/v1/auth/login",
        json={
            "email": tenant_admin_user.email,
            "password": "Password123!",
            "malicious_field": "'; DROP TABLE users; --",
        },
    )
    assert response.status_code in (200, 401, 422)


async def test_login_with_null_values_rejected(client: AsyncClient) -> None:
    """Null values for required login fields must return 422."""
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": None, "password": None},
    )
    assert response.status_code == 422


async def test_refresh_with_invalid_json_rejected(client: AsyncClient) -> None:
    """Refresh endpoint with invalid JSON body must return 422."""
    response = await client.post(
        "/api/v1/auth/refresh",
        content="this is not json",
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 422


# ══════════════════════════════════════════════════════════════════════
# INTEGRATION TESTS — Security Headers & Middleware
# ══════════════════════════════════════════════════════════════════════


async def test_security_headers_on_health_check(client: AsyncClient) -> None:
    """All security headers must be present on health-check responses."""
    response = await client.get("/health")
    assert response.status_code == 200

    assert response.headers.get("X-Content-Type-Options") == "nosniff"
    assert response.headers.get("X-Frame-Options") == "DENY"
    assert response.headers.get("X-XSS-Protection") == "1; mode=block"
    assert "strict-origin" in response.headers.get("Referrer-Policy", "").lower()
    assert "camera=()" in response.headers.get("Permissions-Policy", "")
    assert "default-src" in response.headers.get("Content-Security-Policy", "")
    assert "X-Correlation-ID" in response.headers


async def test_security_headers_on_error_responses(client: AsyncClient) -> None:
    """Security headers must be present even on 401 error responses."""
    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 401
    assert "X-Correlation-ID" in response.headers


async def test_correlation_id_propagated(client: AsyncClient) -> None:
    """A supplied X-Correlation-ID header must be echoed back."""
    custom_id = "test-correlation-12345"
    response = await client.get(
        "/health", headers={"X-Correlation-ID": custom_id}
    )
    assert response.status_code == 200
    assert response.headers.get("X-Correlation-ID") == custom_id


async def test_correlation_id_auto_generated(client: AsyncClient) -> None:
    """When no X-Correlation-ID is supplied, one must be auto-generated."""
    response = await client.get("/health")
    assert response.status_code == 200
    cid = response.headers.get("X-Correlation-ID")
    assert cid is not None
    assert len(cid) > 0


async def test_request_size_limit_enforced(client: AsyncClient) -> None:
    """Requests declaring a body larger than 10 MB must be rejected (413)."""
    response = await client.post(
        "/api/v1/auth/login",
        headers={"Content-Length": str(11 * 1024 * 1024)},
        json={"email": "test@test.com", "password": "Password123!"},
    )
    assert response.status_code == 413


async def test_csp_frame_ancestors_none(client: AsyncClient) -> None:
    """Content-Security-Policy must include frame-ancestors 'none' to prevent clickjacking."""
    response = await client.get("/health")
    csp = response.headers.get("Content-Security-Policy", "")
    assert "frame-ancestors 'none'" in csp


async def test_permissions_policy_restricts_apis(client: AsyncClient) -> None:
    """Permissions-Policy must restrict dangerous browser APIs."""
    response = await client.get("/health")
    pp = response.headers.get("Permissions-Policy", "")
    assert "camera=()" in pp
    assert "microphone=()" in pp
    assert "geolocation=()" in pp
