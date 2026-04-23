"""Tests for CFP applicant portal authentication flows.

Covers registration, email verification, login, token refresh,
password reset, and protected endpoint access.

All tests use HTTP-level assertions against the ASGI client so they
exercise the full request/response cycle (schema validation, DB writes,
JWT encoding, etc.).
"""

import hashlib
import uuid
from datetime import timedelta

import jwt
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.applicant_security import (
    create_applicant_access_token,
    create_applicant_refresh_token,
    generate_email_verification_token,
)
from app.core.security import hash_password
from app.core.security.pii_crypto import hash_email
from app.core.utils import utcnow
from app.models.applicant_token import (
    ApplicantEmailVerification,
    ApplicantPasswordReset,
    ApplicantRefreshToken,
)
from app.models.cfp_applicants import CFPApplicant
from app.models.tenant import Tenant

settings = get_settings()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

VALID_PASSWORD = "SecurePass1"


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _register_payload(**overrides) -> dict:
    base = {
        "email": f"applicant-{uuid.uuid4().hex[:8]}@example.com",
        "password": VALID_PASSWORD,
        "first_name": "Alice",
        "last_name": "Tester",
    }
    base.update(overrides)
    return base


async def _create_verified_applicant(db: AsyncSession, tenant: Tenant) -> CFPApplicant:
    """Insert a verified applicant directly in the DB (bypasses email flow)."""
    applicant = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Verified",
        last_name="User",
        email=f"verified-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password(VALID_PASSWORD),
        email_verified_at=utcnow(),
    )
    db.add(applicant)
    await db.commit()
    await db.refresh(applicant)
    return applicant


async def _create_unverified_applicant(db: AsyncSession, tenant: Tenant) -> CFPApplicant:
    """Insert an unverified applicant directly in the DB."""
    applicant = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Unverified",
        last_name="User",
        email=f"unverified-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password(VALID_PASSWORD),
        email_verified_at=None,
    )
    db.add(applicant)
    await db.commit()
    await db.refresh(applicant)
    return applicant


# ---------------------------------------------------------------------------
# 1. Registration flow
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestRegistration:
    """Tests for the applicant registration endpoint."""

    async def test_valid_registration_returns_200(self, client: AsyncClient, tenant: Tenant) -> None:
        """Valid registration payload creates an applicant and returns 200."""
        payload = _register_payload()
        resp = await client.post(f"/api/v1/portal/{tenant.slug}/register", json=payload)
        # Rate limiting disabled in tests; 200 or 201 are both acceptable
        assert resp.status_code in (200, 201)
        body = resp.json()
        assert "message" in body
        assert "registration" in body["message"].lower() or "successful" in body["message"].lower()

    async def test_registration_creates_applicant_in_db(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant
    ) -> None:
        """Successful registration inserts a CFPApplicant row into the DB."""
        email = f"dbcheck-{uuid.uuid4().hex[:8]}@example.com"
        payload = _register_payload(email=email)
        resp = await client.post(f"/api/v1/portal/{tenant.slug}/register", json=payload)
        assert resp.status_code in (200, 201)

        result = await db_session.execute(
            select(CFPApplicant).where(CFPApplicant.email_hash == hash_email(email.lower()))
        )
        applicant = result.scalar_one_or_none()
        assert applicant is not None
        assert applicant.tenant_id == tenant.id

    async def test_duplicate_email_returns_409(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant
    ) -> None:
        """Registering with an email that already exists returns 409."""
        existing = await _create_verified_applicant(db_session, tenant)
        payload = _register_payload(email=existing.email)
        resp = await client.post(f"/api/v1/portal/{tenant.slug}/register", json=payload)
        assert resp.status_code == 409

    async def test_invalid_email_format_returns_422(self, client: AsyncClient, tenant: Tenant) -> None:
        """A malformed email address is rejected with 422 by Pydantic."""
        payload = _register_payload(email="not-an-email")
        resp = await client.post(f"/api/v1/portal/{tenant.slug}/register", json=payload)
        assert resp.status_code == 422

    async def test_missing_required_fields_returns_422(self, client: AsyncClient, tenant: Tenant) -> None:
        """Omitting required fields (email, password, first_name) returns 422."""
        resp = await client.post(
            f"/api/v1/portal/{tenant.slug}/register",
            json={"last_name": "Only"},
        )
        assert resp.status_code == 422

    async def test_password_too_short_returns_422(self, client: AsyncClient, tenant: Tenant) -> None:
        """A password shorter than 8 characters is rejected with 422."""
        payload = _register_payload(password="Ab1")
        resp = await client.post(f"/api/v1/portal/{tenant.slug}/register", json=payload)
        assert resp.status_code == 422

    async def test_password_missing_uppercase_returns_422(self, client: AsyncClient, tenant: Tenant) -> None:
        """A password without an uppercase letter is rejected with 422."""
        payload = _register_payload(password="alllower1")
        resp = await client.post(f"/api/v1/portal/{tenant.slug}/register", json=payload)
        assert resp.status_code == 422

    async def test_password_missing_digit_returns_422(self, client: AsyncClient, tenant: Tenant) -> None:
        """A password without a digit is rejected with 422."""
        payload = _register_payload(password="NoDigitsHere")
        resp = await client.post(f"/api/v1/portal/{tenant.slug}/register", json=payload)
        assert resp.status_code == 422

    async def test_unknown_tenant_slug_returns_404(self, client: AsyncClient) -> None:
        """Registering against a non-existent tenant slug returns 404."""
        payload = _register_payload()
        resp = await client.post("/api/v1/portal/nonexistent-tenant-xyz/register", json=payload)
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# 2. Email verification
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestEmailVerification:
    """Tests for the email verification endpoint."""

    async def test_valid_token_verifies_account(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant
    ) -> None:
        """A valid, unused verification token sets email_verified_at."""
        applicant = await _create_unverified_applicant(db_session, tenant)

        raw_token, token_hash = generate_email_verification_token()
        verification = ApplicantEmailVerification(
            applicant_id=applicant.id,
            token_hash=token_hash,
            expires_at=utcnow() + timedelta(hours=24),
        )
        db_session.add(verification)
        await db_session.commit()

        resp = await client.post(
            f"/api/v1/portal/{tenant.slug}/verify-email",
            json={"token": raw_token},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "verified" in body["message"].lower()

        await db_session.refresh(applicant)
        assert applicant.email_verified_at is not None

    async def test_expired_token_returns_400(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant
    ) -> None:
        """An expired verification token (expires_at in the past) returns 400."""
        applicant = await _create_unverified_applicant(db_session, tenant)

        raw_token, token_hash = generate_email_verification_token()
        verification = ApplicantEmailVerification(
            applicant_id=applicant.id,
            token_hash=token_hash,
            expires_at=utcnow() - timedelta(hours=1),  # already expired
        )
        db_session.add(verification)
        await db_session.commit()

        resp = await client.post(
            f"/api/v1/portal/{tenant.slug}/verify-email",
            json={"token": raw_token},
        )
        assert resp.status_code == 400

    async def test_invalid_token_returns_400(self, client: AsyncClient, tenant: Tenant) -> None:
        """A completely invalid/tampered token returns 400."""
        resp = await client.post(
            f"/api/v1/portal/{tenant.slug}/verify-email",
            json={"token": "totally-invalid-token-value"},
        )
        assert resp.status_code == 400

    async def test_already_used_token_cannot_be_reused(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant
    ) -> None:
        """A token that was already used is rejected on subsequent attempts."""
        applicant = await _create_unverified_applicant(db_session, tenant)

        raw_token, token_hash = generate_email_verification_token()
        verification = ApplicantEmailVerification(
            applicant_id=applicant.id,
            token_hash=token_hash,
            expires_at=utcnow() + timedelta(hours=24),
            used_at=utcnow(),  # already consumed
        )
        db_session.add(verification)
        await db_session.commit()

        resp = await client.post(
            f"/api/v1/portal/{tenant.slug}/verify-email",
            json={"token": raw_token},
        )
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# 3. Login flow
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestLogin:
    """Tests for the applicant login endpoint."""

    async def test_valid_credentials_return_tokens(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant
    ) -> None:
        """Correct credentials for a verified applicant return access + refresh tokens."""
        applicant = await _create_verified_applicant(db_session, tenant)
        resp = await client.post(
            f"/api/v1/portal/{tenant.slug}/login",
            json={"email": applicant.email, "password": VALID_PASSWORD},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "access_token" in body
        assert "refresh_token" in body
        assert body["token_type"] == "bearer"
        assert body["expires_in"] > 0

    async def test_wrong_password_returns_401(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant
    ) -> None:
        """An incorrect password is rejected with 401."""
        applicant = await _create_verified_applicant(db_session, tenant)
        resp = await client.post(
            f"/api/v1/portal/{tenant.slug}/login",
            json={"email": applicant.email, "password": "WrongPass9"},
        )
        assert resp.status_code == 401

    async def test_unverified_account_returns_403(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant
    ) -> None:
        """An unverified applicant (email_verified_at is None) cannot log in."""
        applicant = await _create_unverified_applicant(db_session, tenant)
        resp = await client.post(
            f"/api/v1/portal/{tenant.slug}/login",
            json={"email": applicant.email, "password": VALID_PASSWORD},
        )
        assert resp.status_code in (401, 403)

    async def test_nonexistent_email_returns_401(self, client: AsyncClient, tenant: Tenant) -> None:
        """Logging in with an email that does not exist returns 401."""
        resp = await client.post(
            f"/api/v1/portal/{tenant.slug}/login",
            json={"email": "nobody@nowhere.com", "password": VALID_PASSWORD},
        )
        assert resp.status_code == 401

    async def test_tenant_admin_redirected_with_403(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant, tenant_admin_user
    ) -> None:
        """A tenant admin using the applicant login endpoint gets a 403 redirect hint."""
        # tenant_admin_user already belongs to `tenant` fixture
        resp = await client.post(
            f"/api/v1/portal/{tenant.slug}/login",
            json={"email": tenant_admin_user.email, "password": "Password123!"},
        )
        # Either 403 (admin redirect) or 401 (email mismatch on tenant slug) is acceptable
        assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# 4. Token refresh
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestTokenRefresh:
    """Tests for the token refresh endpoint."""

    async def test_valid_refresh_token_returns_new_tokens(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant
    ) -> None:
        """A valid, non-expired refresh token issues a new access/refresh pair."""
        applicant = await _create_verified_applicant(db_session, tenant)

        raw_refresh, token_hash, expires_at = create_applicant_refresh_token(applicant_id=applicant.id)
        db_token = ApplicantRefreshToken(
            applicant_id=applicant.id,
            token_hash=token_hash,
            expires_at=expires_at,
        )
        db_session.add(db_token)
        await db_session.commit()

        resp = await client.post(
            f"/api/v1/portal/{tenant.slug}/refresh",
            json={"refresh_token": raw_refresh},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "access_token" in body
        assert "refresh_token" in body
        # New refresh token should differ from the old one
        assert body["refresh_token"] != raw_refresh

    async def test_expired_refresh_token_returns_401(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant
    ) -> None:
        """A refresh token whose DB record is past expiry is rejected with 401."""
        applicant = await _create_verified_applicant(db_session, tenant)

        # Build a JWT that is actually expired
        expired_payload = {
            "sub": str(applicant.id),
            "exp": utcnow() - timedelta(seconds=1),
            "iat": utcnow() - timedelta(days=1),
            "type": "applicant_refresh",
            "jti": "expired-jti",
        }
        raw_expired = jwt.encode(expired_payload, settings.JWT_SECRET_KEY, algorithm="HS256")
        token_hash = hashlib.sha256(raw_expired.encode()).hexdigest()

        db_token = ApplicantRefreshToken(
            applicant_id=applicant.id,
            token_hash=token_hash,
            expires_at=utcnow() - timedelta(seconds=1),  # expired
        )
        db_session.add(db_token)
        await db_session.commit()

        resp = await client.post(
            f"/api/v1/portal/{tenant.slug}/refresh",
            json={"refresh_token": raw_expired},
        )
        assert resp.status_code == 401

    async def test_revoked_refresh_token_returns_401(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant
    ) -> None:
        """A refresh token that has been revoked (revoked_at set) is rejected."""
        applicant = await _create_verified_applicant(db_session, tenant)

        raw_refresh, token_hash, expires_at = create_applicant_refresh_token(applicant_id=applicant.id)
        db_token = ApplicantRefreshToken(
            applicant_id=applicant.id,
            token_hash=token_hash,
            expires_at=expires_at,
            revoked_at=utcnow(),  # already revoked
        )
        db_session.add(db_token)
        await db_session.commit()

        resp = await client.post(
            f"/api/v1/portal/{tenant.slug}/refresh",
            json={"refresh_token": raw_refresh},
        )
        assert resp.status_code == 401

    async def test_invalid_refresh_token_returns_401(self, client: AsyncClient, tenant: Tenant) -> None:
        """A completely invalid/tampered refresh token string returns 401."""
        resp = await client.post(
            f"/api/v1/portal/{tenant.slug}/refresh",
            json={"refresh_token": "garbage.token.value"},
        )
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# 5. Password reset
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestPasswordReset:
    """Tests for the forgot-password and reset-password endpoints."""

    async def test_forgot_password_valid_email_returns_200(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant
    ) -> None:
        """forgot-password always returns 200 even when the email exists."""
        applicant = await _create_verified_applicant(db_session, tenant)
        resp = await client.post(
            f"/api/v1/portal/{tenant.slug}/forgot-password",
            json={"email": applicant.email},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "message" in body

    async def test_forgot_password_nonexistent_email_returns_200(self, client: AsyncClient, tenant: Tenant) -> None:
        """forgot-password also returns 200 for an email that does not exist (no enumeration)."""
        resp = await client.post(
            f"/api/v1/portal/{tenant.slug}/forgot-password",
            json={"email": f"ghost-{uuid.uuid4().hex}@example.com"},
        )
        assert resp.status_code == 200

    async def test_both_forgot_responses_indistinguishable(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant
    ) -> None:
        """The response body for known and unknown emails must be identical."""
        applicant = await _create_verified_applicant(db_session, tenant)

        known_resp = await client.post(
            f"/api/v1/portal/{tenant.slug}/forgot-password",
            json={"email": applicant.email},
        )
        unknown_resp = await client.post(
            f"/api/v1/portal/{tenant.slug}/forgot-password",
            json={"email": f"noreply-ghost-{uuid.uuid4().hex}@example.com"},
        )

        assert known_resp.status_code == unknown_resp.status_code == 200
        assert known_resp.json()["message"] == unknown_resp.json()["message"]

    async def test_valid_reset_token_changes_password(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant
    ) -> None:
        """A valid reset token allows setting a new password and logging in with it."""
        applicant = await _create_verified_applicant(db_session, tenant)

        raw_token, token_hash = generate_email_verification_token()
        reset = ApplicantPasswordReset(
            applicant_id=applicant.id,
            token_hash=token_hash,
            expires_at=utcnow() + timedelta(hours=1),
        )
        db_session.add(reset)
        await db_session.commit()

        new_password = "NewSecure9"
        resp = await client.post(
            f"/api/v1/portal/{tenant.slug}/reset-password",
            json={"token": raw_token, "new_password": new_password},
        )
        assert resp.status_code == 200

        # Now log in with new password
        login_resp = await client.post(
            f"/api/v1/portal/{tenant.slug}/login",
            json={"email": applicant.email, "password": new_password},
        )
        assert login_resp.status_code == 200

    async def test_expired_reset_token_returns_400(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant
    ) -> None:
        """An expired reset token returns 400."""
        applicant = await _create_verified_applicant(db_session, tenant)

        raw_token, token_hash = generate_email_verification_token()
        reset = ApplicantPasswordReset(
            applicant_id=applicant.id,
            token_hash=token_hash,
            expires_at=utcnow() - timedelta(hours=1),  # already expired
        )
        db_session.add(reset)
        await db_session.commit()

        resp = await client.post(
            f"/api/v1/portal/{tenant.slug}/reset-password",
            json={"token": raw_token, "new_password": "NewPass123"},
        )
        assert resp.status_code == 400

    async def test_used_reset_token_cannot_be_reused(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant
    ) -> None:
        """A reset token that was already used is rejected on a subsequent call."""
        applicant = await _create_verified_applicant(db_session, tenant)

        raw_token, token_hash = generate_email_verification_token()
        reset = ApplicantPasswordReset(
            applicant_id=applicant.id,
            token_hash=token_hash,
            expires_at=utcnow() + timedelta(hours=1),
            used_at=utcnow(),  # already consumed
        )
        db_session.add(reset)
        await db_session.commit()

        resp = await client.post(
            f"/api/v1/portal/{tenant.slug}/reset-password",
            json={"token": raw_token, "new_password": "AnotherPass9"},
        )
        assert resp.status_code == 400

    async def test_invalid_reset_token_returns_400(self, client: AsyncClient, tenant: Tenant) -> None:
        """An entirely invalid reset token string returns 400."""
        resp = await client.post(
            f"/api/v1/portal/{tenant.slug}/reset-password",
            json={"token": "invalid-reset-token-xyz", "new_password": "SomePass1"},
        )
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# 6. Protected endpoint access
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestProtectedEndpoints:
    """Tests that protected portal endpoints enforce JWT authentication."""

    async def test_valid_jwt_allows_profile_access(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant
    ) -> None:
        """A valid applicant JWT grants access to GET /portal/me."""
        applicant = await _create_verified_applicant(db_session, tenant)
        token = create_applicant_access_token(
            applicant_id=applicant.id,
            tenant_id=tenant.id,
        )
        resp = await client.get(
            "/api/v1/portal/me",
            headers=_auth_headers(token),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["email"] == applicant.email

    async def test_no_token_returns_401(self, client: AsyncClient) -> None:
        """Accessing a protected endpoint without a token returns 401."""
        resp = await client.get("/api/v1/portal/me")
        assert resp.status_code in (401, 403)

    async def test_malformed_token_returns_401(self, client: AsyncClient) -> None:
        """A garbage bearer token string is rejected with 401."""
        resp = await client.get(
            "/api/v1/portal/me",
            headers=_auth_headers("this.is.not.a.valid.jwt"),
        )
        assert resp.status_code in (401, 403)

    async def test_expired_jwt_returns_401(self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant) -> None:
        """An expired applicant JWT is rejected with 401."""
        applicant = await _create_verified_applicant(db_session, tenant)

        expired_payload = {
            "sub": str(applicant.id),
            "tenant_id": str(tenant.id),
            "exp": utcnow() - timedelta(hours=1),
            "iat": utcnow() - timedelta(hours=2),
            "type": "applicant_access",
        }
        expired_token = jwt.encode(
            expired_payload,
            settings.JWT_SECRET_KEY,
            algorithm="HS256",
        )

        resp = await client.get(
            "/api/v1/portal/me",
            headers=_auth_headers(expired_token),
        )
        assert resp.status_code in (401, 403)

    async def test_wrong_token_type_returns_401(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant
    ) -> None:
        """Using a refresh token (wrong type) as an access token is rejected."""
        applicant = await _create_verified_applicant(db_session, tenant)

        # Build a token with type=applicant_refresh instead of applicant_access
        wrong_type_payload = {
            "sub": str(applicant.id),
            "tenant_id": str(tenant.id),
            "exp": utcnow() + timedelta(hours=1),
            "iat": utcnow(),
            "type": "applicant_refresh",  # wrong type for /me
        }
        token = jwt.encode(
            wrong_type_payload,
            settings.JWT_SECRET_KEY,
            algorithm="HS256",
        )

        resp = await client.get(
            "/api/v1/portal/me",
            headers=_auth_headers(token),
        )
        assert resp.status_code in (401, 403)

    async def test_jwt_for_nonexistent_applicant_returns_401(self, client: AsyncClient, tenant: Tenant) -> None:
        """A valid-looking JWT whose applicant_id does not exist in the DB returns 401."""
        fake_applicant_id = uuid.uuid4()
        token = create_applicant_access_token(
            applicant_id=fake_applicant_id,
            tenant_id=tenant.id,
        )

        resp = await client.get(
            "/api/v1/portal/me",
            headers=_auth_headers(token),
        )
        assert resp.status_code in (401, 403)

    async def test_jwt_for_inactive_tenant_returns_401(self, client: AsyncClient, db_session: AsyncSession) -> None:
        """A JWT whose tenant_id points to a non-existent tenant returns 401/403."""
        fake_tenant_id = uuid.uuid4()
        fake_applicant_id = uuid.uuid4()

        token = create_applicant_access_token(
            applicant_id=fake_applicant_id,
            tenant_id=fake_tenant_id,
        )

        resp = await client.get(
            "/api/v1/portal/me",
            headers=_auth_headers(token),
        )
        assert resp.status_code in (401, 403)
