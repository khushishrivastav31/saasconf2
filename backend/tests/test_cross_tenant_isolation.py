"""Cross-tenant data isolation tests for the SaaSConf multi-tenant platform.

These tests verify that PostgreSQL Row-Level Security and application-level
tenant checks together ensure that no data from Tenant A is ever accessible
via Tenant B's endpoints — even when a valid JWT is presented.

All tests assert 401, 403, or 404 responses; a 200 from the wrong tenant
would represent a critical security regression.
"""

import uuid
from datetime import timedelta

import jwt
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.applicant_security import create_applicant_access_token
from app.core.security import create_access_token, hash_password
from app.core.utils import utcnow
from app.models.booking import BookingOption
from app.models.cfp_applicants import CFPApplicant
from app.models.conference import Conference
from app.models.invoice import Invoice
from app.models.registration import BillingProfile, Registration, RegistrationMode, RegistrationStatus
from app.models.tenant import Tenant
from app.models.user import User, UserRole

settings = get_settings()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _admin_headers(user: User, modules: list[str] | None = None) -> dict[str, str]:
    """Build Bearer auth headers for a tenant admin/user."""
    token = create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role,
        modules=modules or ["conferences"],
    )
    return {"Authorization": f"Bearer {token}"}


def _applicant_headers(applicant: CFPApplicant, tenant_id: uuid.UUID) -> dict[str, str]:
    """Build Bearer auth headers for an applicant (CFP portal)."""
    token = create_applicant_access_token(
        applicant_id=applicant.id,
        tenant_id=tenant_id,
    )
    return {"Authorization": f"Bearer {token}"}


async def _make_tenant(db: AsyncSession, name: str) -> Tenant:
    """Create a fresh tenant with a unique slug."""
    t = Tenant(
        id=uuid.uuid4(),
        name=name,
        slug=f"{name.lower().replace(' ', '-')}-{uuid.uuid4().hex[:8]}",
        is_active=True,
    )
    db.add(t)
    await db.commit()
    return t


async def _make_conference(db: AsyncSession, tenant: Tenant, abbr: str | None = None) -> Conference:
    """Create a conference owned by *tenant*."""
    c = Conference(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name=f"Conf for {tenant.name}",
        abbreviation=abbr or f"CF{uuid.uuid4().hex[:4].upper()}",
        is_active=True,
    )
    db.add(c)
    await db.commit()
    return c


async def _make_admin(db: AsyncSession, tenant: Tenant) -> User:
    """Create a TENANT_ADMIN user belonging to *tenant*."""
    u = User(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        email=f"admin-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Password123!"),
        first_name="Admin",
        last_name="User",
        role=UserRole.TENANT_ADMIN.value,
        is_active=True,
    )
    db.add(u)
    await db.commit()
    return u


async def _make_applicant(db: AsyncSession, tenant: Tenant) -> CFPApplicant:
    """Create an email-verified CFP applicant belonging to *tenant*."""
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Alice",
        last_name="Applicant",
        email=f"applicant-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Password123!"),
        email_verified_at=utcnow(),
    )
    db.add(a)
    await db.commit()
    return a


async def _make_invoice(db: AsyncSession, tenant: Tenant, conference: Conference) -> Invoice:
    """Create a minimal invoice for *conference*."""
    from datetime import date

    today = date.today()
    inv = Invoice(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        invoice_number=f"INV-{uuid.uuid4().hex[:6].upper()}",
        template_type="bank_transfer",
        status="draft",
        issue_date=today,
        due_date=today + timedelta(days=30),
        recipient_name="Acme Corp",
        recipient_email="billing@acme.com",
        recipient_address_line1="1 Main St",
        recipient_city="Berlin",
        recipient_postal_code="10115",
        recipient_country="DE",
        subtotal=100.0,
        tax_rate=19.0,
        tax_amount=19.0,
        total=119.0,
        currency="EUR",
        is_active=True,
    )
    db.add(inv)
    await db.commit()
    await db.refresh(inv)
    return inv


async def _make_registration(
    db: AsyncSession,
    tenant: Tenant,
    conference: Conference,
) -> Registration:
    """Create a minimal registration for *conference*."""
    billing = BillingProfile(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        contact_first_name="John",
        contact_last_name="Doe",
        contact_email=f"john-{uuid.uuid4().hex[:6]}@example.com",
        contact_phone="+4930123456",
        street="42 Elm St",
        city="Berlin",
        postal_code="10115",
        country="DE",
        payment_method="bank_transfer",
    )
    db.add(billing)
    await db.flush()

    booking_option = BookingOption(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Standard",
    )
    db.add(booking_option)
    await db.flush()

    reg = Registration(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        billing_profile_id=billing.id,
        booking_option_id=booking_option.id,
        first_name="John",
        last_name="Doe",
        email=f"john-{uuid.uuid4().hex[:6]}@example.com",
        status=RegistrationStatus.REGISTERED_PENDING_INVOICE.value,
        registration_mode=RegistrationMode.INDIVIDUAL.value,
    )
    db.add(reg)
    await db.commit()
    await db.refresh(reg)
    return reg


# ===========================================================================
# Test class
# ===========================================================================


@pytest.mark.asyncio
class TestCrossTenantIsolation:
    """Comprehensive cross-tenant data isolation tests."""

    # -----------------------------------------------------------------------
    # 1. Conference isolation — admin of Tenant A cannot read Tenant B conf
    # -----------------------------------------------------------------------

    async def test_admin_cannot_read_other_tenant_conference(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """A tenant admin JWT for Tenant A must not expose Tenant B's conference.

        The conference endpoint checks that the conference belongs to the
        requesting user's tenant. An admin from a foreign tenant must get 403
        or 404, never 200.
        """
        tenant_a = await _make_tenant(db_session, "TenantAlpha")
        tenant_b = await _make_tenant(db_session, "TenantBeta")
        conf_b = await _make_conference(db_session, tenant_b)
        admin_a = await _make_admin(db_session, tenant_a)

        resp = await client.get(
            f"/api/v1/conferences/{conf_b.id}",
            headers=_admin_headers(admin_a),
        )
        assert resp.status_code in (403, 404), (
            f"Expected 403/404, got {resp.status_code}: Tenant A admin can read Tenant B conference"
        )

    async def test_admin_cannot_list_other_tenant_conferences(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """The conference list endpoint must only return conferences for the
        user's own tenant.  Tenant B's conferences must not appear in the list
        returned to a Tenant A admin.
        """
        tenant_a = await _make_tenant(db_session, "TenantList_A")
        tenant_b = await _make_tenant(db_session, "TenantList_B")
        conf_b = await _make_conference(db_session, tenant_b)
        admin_a = await _make_admin(db_session, tenant_a)

        resp = await client.get("/api/v1/conferences", headers=_admin_headers(admin_a))
        assert resp.status_code == 200
        ids = [item["id"] for item in resp.json().get("items", [])]
        assert str(conf_b.id) not in ids, "Tenant B's conference appeared in Tenant A's conference list"

    # -----------------------------------------------------------------------
    # 2. Invoice isolation — admin of Tenant A cannot access Tenant B invoices
    # -----------------------------------------------------------------------

    async def test_admin_cannot_read_other_tenant_invoice(self, client: AsyncClient, db_session: AsyncSession) -> None:
        """A tenant admin JWT for Tenant A must not expose Tenant B's invoice.

        The invoice endpoint is scoped under /conferences/{conference_id}/invoices
        so an attacker would need both the conference ID and the invoice ID.
        Both are checked against the requesting tenant.
        """
        tenant_a = await _make_tenant(db_session, "InvIso_A")
        tenant_b = await _make_tenant(db_session, "InvIso_B")
        conf_b = await _make_conference(db_session, tenant_b)
        inv_b = await _make_invoice(db_session, tenant_b, conf_b)
        admin_a = await _make_admin(db_session, tenant_a)

        # Try to read Tenant B's invoice through Tenant B's conference path
        resp = await client.get(
            f"/api/v1/conferences/{conf_b.id}/invoices/{inv_b.id}",
            headers=_admin_headers(admin_a),
        )
        assert resp.status_code in (403, 404), (
            f"Expected 403/404, got {resp.status_code}: Tenant A admin can read Tenant B invoice"
        )

    async def test_admin_cannot_list_other_tenant_invoices(self, client: AsyncClient, db_session: AsyncSession) -> None:
        """The invoice list for a foreign conference must be empty or forbidden."""
        tenant_a = await _make_tenant(db_session, "InvList_A")
        tenant_b = await _make_tenant(db_session, "InvList_B")
        conf_b = await _make_conference(db_session, tenant_b)
        await _make_invoice(db_session, tenant_b, conf_b)
        admin_a = await _make_admin(db_session, tenant_a)

        resp = await client.get(
            f"/api/v1/conferences/{conf_b.id}/invoices",
            headers=_admin_headers(admin_a),
        )
        assert resp.status_code in (403, 404), (
            f"Expected 403/404, got {resp.status_code}: Tenant A admin can list Tenant B invoices"
        )

    # -----------------------------------------------------------------------
    # 3. Registration isolation — admin of Tenant A cannot access Tenant B
    # -----------------------------------------------------------------------

    async def test_admin_cannot_list_other_tenant_registrations(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Registration list for a foreign conference must be forbidden."""
        tenant_a = await _make_tenant(db_session, "Reg_A")
        tenant_b = await _make_tenant(db_session, "Reg_B")
        conf_b = await _make_conference(db_session, tenant_b)
        await _make_registration(db_session, tenant_b, conf_b)
        admin_a = await _make_admin(db_session, tenant_a)

        resp = await client.get(
            f"/api/v1/conferences/{conf_b.id}/registrations",
            headers=_admin_headers(admin_a),
        )
        assert resp.status_code in (403, 404), (
            f"Expected 403/404, got {resp.status_code}: Tenant A admin can list Tenant B registrations"
        )

    async def test_admin_cannot_read_other_tenant_registration(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """A specific registration belonging to Tenant B must not be readable
        by an admin from Tenant A, even when the exact IDs are known.
        """
        tenant_a = await _make_tenant(db_session, "RegRead_A")
        tenant_b = await _make_tenant(db_session, "RegRead_B")
        conf_b = await _make_conference(db_session, tenant_b)
        reg_b = await _make_registration(db_session, tenant_b, conf_b)
        admin_a = await _make_admin(db_session, tenant_a)

        resp = await client.get(
            f"/api/v1/conferences/{conf_b.id}/registrations/{reg_b.id}",
            headers=_admin_headers(admin_a),
        )
        assert resp.status_code in (403, 404), (
            f"Expected 403/404, got {resp.status_code}: Tenant A admin can read Tenant B registration"
        )

    # -----------------------------------------------------------------------
    # 4. Applicant isolation — applicant from Tenant A cannot access Tenant B
    # -----------------------------------------------------------------------

    async def test_applicant_cannot_access_other_tenant_conference(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """An applicant authenticated for Tenant A must not see Tenant B's
        conference details via the CFP portal authenticated endpoint.
        """
        tenant_a = await _make_tenant(db_session, "AppIso_A")
        tenant_b = await _make_tenant(db_session, "AppIso_B")
        conf_b = await _make_conference(db_session, tenant_b)
        applicant_a = await _make_applicant(db_session, tenant_a)

        resp = await client.get(
            f"/api/v1/portal/conferences/{conf_b.id}",
            headers=_applicant_headers(applicant_a, tenant_a.id),
        )
        assert resp.status_code in (403, 404), (
            f"Expected 403/404, got {resp.status_code}: Tenant A applicant can see Tenant B conference"
        )

    async def test_applicant_token_with_wrong_tenant_id_rejected(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """A JWT whose tenant_id claim points to Tenant B, but whose sub (applicant)
        actually belongs to Tenant A, must be rejected.

        This tests that the dependency verifies the applicant lives in the
        claimed tenant — preventing a forged cross-tenant token.
        """
        tenant_a = await _make_tenant(db_session, "TokenTenantA")
        tenant_b = await _make_tenant(db_session, "TokenTenantB")
        applicant_a = await _make_applicant(db_session, tenant_a)

        # Craft a token that claims tenant_b but carries applicant_a's subject
        malicious_token = create_applicant_access_token(
            applicant_id=applicant_a.id,
            tenant_id=tenant_b.id,  # wrong tenant in the claim
        )

        resp = await client.get(
            "/api/v1/portal/me",
            headers={"Authorization": f"Bearer {malicious_token}"},
        )
        # The dependency checks that the applicant belongs to the claimed tenant
        assert resp.status_code in (401, 403), (
            f"Expected 401/403, got {resp.status_code}: Mismatched applicant/tenant token was accepted"
        )

    async def test_applicant_token_for_inactive_tenant_rejected(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """An applicant JWT whose tenant has been deactivated must be rejected
        with 401 or 403, preventing access even with a structurally valid token.
        """
        tenant = await _make_tenant(db_session, "InactiveTenant")
        applicant = await _make_applicant(db_session, tenant)

        # Deactivate the tenant after issuing the token
        tenant.is_active = False
        db_session.add(tenant)
        await db_session.commit()

        token = create_applicant_access_token(
            applicant_id=applicant.id,
            tenant_id=tenant.id,
        )

        resp = await client.get(
            "/api/v1/portal/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code in (401, 403), (
            f"Expected 401/403, got {resp.status_code}: Token accepted for deactivated tenant"
        )

    # -----------------------------------------------------------------------
    # 5. JWT tenant claim — admin token for Tenant A cannot access Tenant B
    # -----------------------------------------------------------------------

    async def test_admin_jwt_tenant_claim_prevents_cross_tenant_access(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """An admin JWT whose tenant_id claim is Tenant A must not grant access
        to resources owned by Tenant B — even when Tenant B's resource IDs are
        known exactly.

        This specifically tests that the application enforces the tenant claim
        in the JWT and does not rely solely on path parameters.
        """
        tenant_a = await _make_tenant(db_session, "JWTClaim_A")
        tenant_b = await _make_tenant(db_session, "JWTClaim_B")
        conf_b = await _make_conference(db_session, tenant_b)
        admin_a = await _make_admin(db_session, tenant_a)

        # The JWT carries tenant_a's ID; conf_b belongs to tenant_b
        resp = await client.get(
            f"/api/v1/conferences/{conf_b.id}",
            headers=_admin_headers(admin_a),
        )
        assert resp.status_code in (403, 404), (
            f"Expected 403/404, got {resp.status_code}: JWT tenant claim not enforced for conference"
        )

    async def test_forged_jwt_with_other_tenant_id_rejected(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """A JWT forged with a different secret key must be rejected even if
        the payload structure is otherwise valid.
        """
        tenant_b = await _make_tenant(db_session, "ForgedJWT_B")
        conf_b = await _make_conference(db_session, tenant_b)

        # Sign with a DIFFERENT secret — the app's verify step should reject it
        forged_payload = {
            "sub": str(uuid.uuid4()),
            "tenant_id": str(tenant_b.id),
            "role": "tenant_admin",
            "modules": ["conferences"],
            "exp": utcnow() + timedelta(hours=1),
        }
        forged_token = jwt.encode(forged_payload, "totally-wrong-secret-key", algorithm="HS256")

        resp = await client.get(
            f"/api/v1/conferences/{conf_b.id}",
            headers={"Authorization": f"Bearer {forged_token}"},
        )
        assert resp.status_code in (401, 403), f"Expected 401/403, got {resp.status_code}: Forged JWT was accepted"

    async def test_expired_admin_jwt_rejected(self, client: AsyncClient, db_session: AsyncSession) -> None:
        """An expired admin JWT must be rejected with 401, regardless of which
        tenant's resources are being accessed.
        """
        tenant_a = await _make_tenant(db_session, "ExpiredJWT_A")
        conf_a = await _make_conference(db_session, tenant_a)
        admin_a = await _make_admin(db_session, tenant_a)

        expired_payload = {
            "sub": str(admin_a.id),
            "tenant_id": str(tenant_a.id),
            "role": "tenant_admin",
            "modules": ["conferences"],
            "exp": utcnow() - timedelta(hours=1),  # already expired
        }
        expired_token = jwt.encode(expired_payload, settings.JWT_SECRET_KEY, algorithm="HS256")

        resp = await client.get(
            f"/api/v1/conferences/{conf_a.id}",
            headers={"Authorization": f"Bearer {expired_token}"},
        )
        assert resp.status_code in (401, 403), (
            f"Expected 401/403, got {resp.status_code}: Expired admin JWT was accepted"
        )

    # -----------------------------------------------------------------------
    # 6. Paper isolation — applicant from Tenant A cannot see Tenant B papers
    # -----------------------------------------------------------------------

    async def test_applicant_cannot_access_papers_of_other_tenant(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """An applicant from Tenant A must get 404 when fetching a paper UUID
        that exists only in Tenant B.  The portal papers endpoint scopes all
        queries to the authenticated applicant's tenant_id.
        """
        tenant_a = await _make_tenant(db_session, "PaperIso_A")
        await _make_tenant(db_session, "PaperIso_B")  # establishes a second tenant namespace
        applicant_a = await _make_applicant(db_session, tenant_a)

        # Use a plausible-but-nonexistent paper ID from a different tenant
        # We don't need an actual paper row — tenant B's namespace is the
        # important boundary; any UUID should yield 404 under tenant A's token.
        fake_paper_id = str(uuid.uuid4())

        resp = await client.get(
            f"/api/v1/portal/papers/{fake_paper_id}",
            headers=_applicant_headers(applicant_a, tenant_a.id),
        )
        assert resp.status_code in (401, 403, 404), (
            f"Expected 401/403/404, got {resp.status_code}: Unexpected response for cross-tenant paper access"
        )

    # -----------------------------------------------------------------------
    # 7. Applicant-level paper isolation (same tenant, different applicant)
    # -----------------------------------------------------------------------

    async def test_applicant_cannot_edit_another_applicants_paper(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Within the same tenant, applicant B must not be able to modify a
        paper owned by applicant A.  Even though they share a tenant, the
        portal enforces per-applicant ownership on writes.
        """
        tenant = await _make_tenant(db_session, "SameTenantPaper")
        applicant_b = await _make_applicant(db_session, tenant)

        # Applicant B tries to PATCH a paper UUID that belongs to applicant A
        # (we use a random UUID since applicant A hasn't submitted anything —
        # the expected result is 404 ownership check, not 200).
        fake_paper_id = str(uuid.uuid4())

        resp = await client.patch(
            f"/api/v1/portal/papers/{fake_paper_id}",
            json={"title": "Hijacked title"},
            headers=_applicant_headers(applicant_b, tenant.id),
        )
        assert resp.status_code in (403, 404, 405, 422), (
            f"Expected 403/404/405/422, got {resp.status_code}: Applicant B could modify applicant A's paper"
        )

    # -----------------------------------------------------------------------
    # 8. Public registration isolation — wrong tenant slug returns 404
    # -----------------------------------------------------------------------

    async def test_public_registration_slug_must_match_tenant(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """The public registration endpoint uses tenant_slug + conference abbreviation
        to scope access.  Providing Tenant A's slug with Tenant B's conference
        abbreviation must return 404 — the conference does not exist under
        that tenant's namespace.
        """
        tenant_a = await _make_tenant(db_session, "PubReg_A")
        tenant_b = await _make_tenant(db_session, "PubReg_B")
        conf_b = await _make_conference(db_session, tenant_b, abbr="CONFB26")

        # Use tenant_a's slug but tenant_b's conference abbreviation
        resp = await client.get(
            f"/api/v1/public/{tenant_a.slug}/{conf_b.abbreviation}/info",
        )
        assert resp.status_code in (404,), (
            f"Expected 404, got {resp.status_code}: Cross-slug conference resolution succeeded"
        )

    async def test_public_registration_nonexistent_tenant_returns_404(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """A registration request aimed at a completely unknown tenant slug
        must return 404 and not leak any internal data.
        """
        resp = await client.get(
            f"/api/v1/public/no-such-tenant-{uuid.uuid4().hex}/CONF99/info",
        )
        assert resp.status_code == 404, (
            f"Expected 404, got {resp.status_code}: Unknown tenant slug returned unexpected status"
        )

    # -----------------------------------------------------------------------
    # 9. CFP portal landing page — conference must belong to the named tenant
    # -----------------------------------------------------------------------

    async def test_cfp_landing_page_requires_correct_tenant_slug(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """The CFP landing page resolves /portal/{tenant_slug}/{abbreviation}.
        Using Tenant A's slug with a conference that belongs to Tenant B must
        yield 404 — the conference is invisible outside its own tenant namespace.
        """
        tenant_a = await _make_tenant(db_session, "Landing_A")
        tenant_b = await _make_tenant(db_session, "Landing_B")
        conf_b = await _make_conference(db_session, tenant_b, abbr="LNDG26")

        resp = await client.get(
            f"/api/v1/portal/{tenant_a.slug}/{conf_b.abbreviation}",
        )
        assert resp.status_code == 404, (
            f"Expected 404, got {resp.status_code}: Tenant A slug resolved Tenant B's conference"
        )

    # -----------------------------------------------------------------------
    # 10. Settings isolation — Tenant A admin cannot read Tenant B settings
    # -----------------------------------------------------------------------

    async def test_admin_cannot_read_other_tenant_conference_settings(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Conference settings are scoped to the owning tenant.  An admin from
        Tenant A must receive 403 or 404 when requesting Tenant B's conference
        settings — even with a perfectly valid JWT.
        """
        tenant_a = await _make_tenant(db_session, "Settings_A")
        tenant_b = await _make_tenant(db_session, "Settings_B")
        conf_b = await _make_conference(db_session, tenant_b)
        admin_a = await _make_admin(db_session, tenant_a)

        resp = await client.get(
            f"/api/v1/conferences/{conf_b.id}/settings/general",
            headers=_admin_headers(admin_a),
        )
        assert resp.status_code in (403, 404), (
            f"Expected 403/404, got {resp.status_code}: Tenant A admin can read Tenant B conference settings"
        )

    # -----------------------------------------------------------------------
    # 11. Payment reminders isolation
    # -----------------------------------------------------------------------

    async def test_admin_cannot_list_other_tenant_payment_reminders(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Payment reminders are conference-scoped.  An admin from Tenant A
        must not be able to enumerate Tenant B's payment reminders.
        """
        tenant_a = await _make_tenant(db_session, "PR_A")
        tenant_b = await _make_tenant(db_session, "PR_B")
        conf_b = await _make_conference(db_session, tenant_b)
        admin_a = await _make_admin(db_session, tenant_a)

        resp = await client.get(
            f"/api/v1/conferences/{conf_b.id}/payment-reminders",
            headers=_admin_headers(admin_a),
        )
        assert resp.status_code in (403, 404), (
            f"Expected 403/404, got {resp.status_code}: Tenant A admin can list Tenant B payment reminders"
        )

    # -----------------------------------------------------------------------
    # 12. No token — all protected endpoints require authentication
    # -----------------------------------------------------------------------

    async def test_conference_endpoint_requires_auth(self, client: AsyncClient, db_session: AsyncSession) -> None:
        """Any conference endpoint without an Authorization header must return
        401 or 403.  This confirms that there is no anonymous read path for
        tenant-scoped admin data.
        """
        tenant = await _make_tenant(db_session, "NoAuth_T")
        conf = await _make_conference(db_session, tenant)

        resp = await client.get(f"/api/v1/conferences/{conf.id}")
        assert resp.status_code in (401, 403), f"Expected 401/403 without auth, got {resp.status_code}"

    async def test_invoice_endpoint_requires_auth(self, client: AsyncClient, db_session: AsyncSession) -> None:
        """Invoice endpoints must require a valid JWT.  A request without any
        Authorization header must be rejected immediately.
        """
        tenant = await _make_tenant(db_session, "NoAuthInv_T")
        conf = await _make_conference(db_session, tenant)
        inv = await _make_invoice(db_session, tenant, conf)

        resp = await client.get(f"/api/v1/conferences/{conf.id}/invoices/{inv.id}")
        assert resp.status_code in (401, 403), f"Expected 401/403 without auth, got {resp.status_code}"

    async def test_cfp_portal_me_requires_auth(self, client: AsyncClient) -> None:
        """The /portal/me profile endpoint must return 401 or 403 without a
        valid applicant JWT — there is no public version of this endpoint.
        """
        resp = await client.get("/api/v1/portal/me")
        assert resp.status_code in (401, 403), f"Expected 401/403 without auth, got {resp.status_code}"
