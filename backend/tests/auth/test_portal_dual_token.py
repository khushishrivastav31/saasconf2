"""Tests for the portal unification Phase 2.5 backend — dual-token support + orphan heal.

Covers three bits of surgery:

1. ``get_current_applicant`` accepts both ``applicant_access`` and ``portal_access``
   JWTs and resolves the correct CFPApplicant row for each.
2. Legacy CFP login auto-heals an orphan applicant by creating/linking a portal_user.
3. The ``/portal/unified/me`` endpoint returns the composite profile with
   ``theme_preference`` and the ``has_*_account`` flags.
"""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.portal_linkage import ensure_portal_user_for_applicant
from app.core.security import hash_password
from app.core.security.applicants import create_applicant_access_token
from app.core.security.pii_crypto import encrypt_pii, hash_email
from app.core.security.portal import create_portal_access_token
from app.core.utils import utcnow
from app.models.cfp_applicants import CFPApplicant
from app.models.portal_user import PortalUser
from app.models.tenant import Tenant

VALID_PASSWORD = "SecurePass1"


async def _make_applicant_with_portal_user(
    db: AsyncSession, tenant: Tenant, email: str | None = None
) -> tuple[CFPApplicant, PortalUser]:
    """Create a CFP applicant fully linked to a portal_user — the happy post-migration shape."""
    addr = email or f"linked-{uuid.uuid4().hex[:8]}@example.com"
    pw_hash = hash_password(VALID_PASSWORD)
    portal_user = PortalUser(
        tenant_id=tenant.id,
        email_encrypted=encrypt_pii(addr),
        email_hash=hash_email(addr),
        password_hash=pw_hash,
        first_name="Linked",
        last_name="User",
        email_verified_at=utcnow(),
    )
    db.add(portal_user)
    await db.flush()

    applicant = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Linked",
        last_name="User",
        email=addr,
        password_hash=pw_hash,
        email_verified_at=utcnow(),
        portal_user_id=portal_user.id,
    )
    db.add(applicant)
    await db.commit()
    await db.refresh(applicant)
    await db.refresh(portal_user)
    return applicant, portal_user


async def _make_orphan_applicant(db: AsyncSession, tenant: Tenant) -> CFPApplicant:
    """Create an applicant with NO linked portal_user — the migration-192 orphan shape."""
    addr = f"orphan-{uuid.uuid4().hex[:8]}@example.com"
    applicant = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Orphan",
        last_name="User",
        email=addr,
        password_hash=hash_password(VALID_PASSWORD),
        email_verified_at=utcnow(),
        portal_user_id=None,
    )
    db.add(applicant)
    await db.commit()
    await db.refresh(applicant)
    return applicant


# ---------------------------------------------------------------------------
# 1. Dual-token acceptance on CFP-applicant endpoints
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestDualTokenAcceptance:
    """``/portal/me`` (CFP applicant endpoint) must accept both token types."""

    async def test_applicant_token_resolves_to_applicant(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant
    ) -> None:
        applicant, _ = await _make_applicant_with_portal_user(db_session, tenant)
        token = create_applicant_access_token(applicant.id, tenant.id)

        resp = await client.get("/api/v1/portal/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == str(applicant.id)
        assert body["email"] == applicant.email

    async def test_portal_access_token_resolves_to_linked_applicant(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant
    ) -> None:
        applicant, portal_user = await _make_applicant_with_portal_user(db_session, tenant)
        token = create_portal_access_token(portal_user.id, tenant.id)

        resp = await client.get("/api/v1/portal/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == str(applicant.id)

    async def test_portal_access_token_without_linked_applicant_is_401(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant
    ) -> None:
        """A portal_user with no CFP applicant (training-only) cannot hit CFP endpoints."""
        addr = f"trainingonly-{uuid.uuid4().hex[:8]}@example.com"
        portal_user = PortalUser(
            tenant_id=tenant.id,
            email_encrypted=encrypt_pii(addr),
            email_hash=hash_email(addr),
            password_hash=hash_password(VALID_PASSWORD),
            first_name="Training",
            last_name="Only",
            email_verified_at=utcnow(),
        )
        db_session.add(portal_user)
        await db_session.commit()
        await db_session.refresh(portal_user)

        token = create_portal_access_token(portal_user.id, tenant.id)
        resp = await client.get("/api/v1/portal/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 401

    async def test_bogus_token_type_is_rejected(self, client: AsyncClient, tenant: Tenant) -> None:
        """Admin 'access' tokens are not a valid portal token — 401, not 200."""
        from datetime import timedelta

        import jwt

        from app.config import get_settings

        settings = get_settings()
        payload = {
            "sub": str(uuid.uuid4()),
            "tenant_id": str(tenant.id),
            "exp": utcnow() + timedelta(minutes=10),
            "iat": utcnow(),
            "type": "access",
        }
        admin_token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
        resp = await client.get("/api/v1/portal/me", headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# 2. Orphan auto-heal on legacy login
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestOrphanAutoHeal:
    async def test_ensure_creates_portal_user_for_orphan(self, db_session: AsyncSession, tenant: Tenant) -> None:
        applicant = await _make_orphan_applicant(db_session, tenant)
        assert applicant.portal_user_id is None

        portal_user = await ensure_portal_user_for_applicant(db_session, applicant)
        await db_session.commit()
        await db_session.refresh(applicant)

        assert portal_user is not None
        assert applicant.portal_user_id == portal_user.id
        assert portal_user.email_hash == hash_email(applicant.email)
        assert portal_user.password_hash == applicant.password_hash

    async def test_ensure_links_to_existing_portal_user_by_email(
        self, db_session: AsyncSession, tenant: Tenant
    ) -> None:
        """If a portal_user already exists under the same email (e.g. seeded by the training
        side), the orphan applicant must link to it rather than create a duplicate.
        """
        shared_email = f"shared-{uuid.uuid4().hex[:8]}@example.com"

        existing = PortalUser(
            tenant_id=tenant.id,
            email_encrypted=encrypt_pii(shared_email),
            email_hash=hash_email(shared_email),
            password_hash=hash_password(VALID_PASSWORD),
            first_name="Shared",
            last_name="User",
            email_verified_at=utcnow(),
        )
        db_session.add(existing)
        await db_session.flush()

        applicant = CFPApplicant(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            first_name="Orphan",
            last_name="Shared",
            email=shared_email,
            password_hash=hash_password(VALID_PASSWORD),
            email_verified_at=utcnow(),
        )
        db_session.add(applicant)
        await db_session.commit()
        await db_session.refresh(applicant)

        linked = await ensure_portal_user_for_applicant(db_session, applicant)
        await db_session.commit()
        await db_session.refresh(applicant)

        assert linked is not None
        assert linked.id == existing.id
        assert applicant.portal_user_id == existing.id

        result = await db_session.execute(
            select(PortalUser).where(
                PortalUser.tenant_id == tenant.id, PortalUser.email_hash == hash_email(shared_email)
            )
        )
        assert len(result.scalars().all()) == 1  # no duplicate

    async def test_legacy_login_heals_orphan(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant
    ) -> None:
        applicant = await _make_orphan_applicant(db_session, tenant)

        resp = await client.post(
            f"/api/v1/portal/{tenant.slug}/login",
            json={"email": applicant.email, "password": VALID_PASSWORD},
        )
        assert resp.status_code == 200

        await db_session.refresh(applicant)
        assert applicant.portal_user_id is not None

    async def test_backfill_script_heals_all_orphans(self, db_session: AsyncSession, tenant: Tenant) -> None:
        """The one-shot backfill script heals every orphan it can."""
        from scripts.backfill_orphan_portal_users import backfill

        a1 = await _make_orphan_applicant(db_session, tenant)
        a2 = await _make_orphan_applicant(db_session, tenant)

        healed, skipped, _ = await backfill(db_session)
        await db_session.commit()

        assert healed == 2
        assert skipped == 0

        await db_session.refresh(a1)
        await db_session.refresh(a2)
        assert a1.portal_user_id is not None
        assert a2.portal_user_id is not None


# ---------------------------------------------------------------------------
# 3. Composite /portal/unified/me
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestCompositePortalMe:
    async def test_unified_me_returns_composite_profile(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant
    ) -> None:
        _, portal_user = await _make_applicant_with_portal_user(db_session, tenant)
        portal_user.theme_preference = "dark"
        portal_user.bio = "Hello there"
        await db_session.commit()

        token = create_portal_access_token(portal_user.id, tenant.id)
        resp = await client.get("/api/v1/portal/unified/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == str(portal_user.id)
        assert body["theme_preference"] == "dark"
        assert body["bio"] == "Hello there"
        assert body["has_conference_account"] is True
        assert body["has_training_account"] is False

    async def test_patch_theme_preference(self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant) -> None:
        _, portal_user = await _make_applicant_with_portal_user(db_session, tenant)
        token = create_portal_access_token(portal_user.id, tenant.id)

        resp = await client.patch(
            "/api/v1/portal/unified/me",
            json={"theme_preference": "dark"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["theme_preference"] == "dark"

        await db_session.refresh(portal_user)
        assert portal_user.theme_preference == "dark"

    async def test_patch_theme_preference_rejects_invalid_value(
        self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant
    ) -> None:
        _, portal_user = await _make_applicant_with_portal_user(db_session, tenant)
        token = create_portal_access_token(portal_user.id, tenant.id)

        resp = await client.patch(
            "/api/v1/portal/unified/me",
            json={"theme_preference": "neon"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 422
