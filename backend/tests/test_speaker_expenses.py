"""Comprehensive tests for Speaker Expense Management API endpoints.

Covers:
- Speaker expense settings (enable/disable)
- Expense tiers CRUD
- Expense categories CRUD
- Speaker allowances + tier assignment
- Admin expense creation on behalf of speakers
- Expense workflow (submit → approve/reject → mark paid)
- Expense stats
- Authorization checks (401, 403)
- Validation errors (422)
"""

import os
import uuid
from datetime import date
from decimal import Decimal

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://saasconf:saasconf@localhost:5432/saasconf_test")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-speaker-expenses")
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "testpassword123")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")
os.environ["RATELIMIT_ENABLED"] = "false"

from app.core.security import hash_password
from app.models.cfp_applicants import CFPApplicant
from app.models.conference import Conference
from app.models.settings import SessionType
from app.models.speaker_expense import (
    ExpenseCategory,
    ExpenseTier,
    SpeakerExpense,
    SpeakerExpenseAllowance,
    SpeakerExpenseAllowanceDefault,
)
from app.models.tenant import Tenant

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _url(conference_id: uuid.UUID, path: str = "") -> str:
    base = f"/api/v1/conferences/{conference_id}/speaker-expenses"
    return f"{base}/{path}" if path else base


def _settings_url(conference_id: uuid.UUID) -> str:
    return f"/api/v1/conferences/{conference_id}/settings/speaker-expense-settings"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture()
async def applicant(db_session: AsyncSession, tenant: Tenant) -> CFPApplicant:
    """A CFP applicant (speaker) for testing."""
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Jane",
        last_name="Speaker",
        email=f"jane.speaker.{uuid.uuid4().hex[:6]}@test.com",
        password_hash=hash_password("Password123!"),
    )
    db_session.add(a)
    await db_session.commit()
    await db_session.refresh(a)
    return a


@pytest_asyncio.fixture()
async def applicant2(db_session: AsyncSession, tenant: Tenant) -> CFPApplicant:
    """A second CFP applicant for multi-speaker tests."""
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="John",
        last_name="Keynote",
        email=f"john.keynote.{uuid.uuid4().hex[:6]}@test.com",
        password_hash=hash_password("Password123!"),
    )
    db_session.add(a)
    await db_session.commit()
    await db_session.refresh(a)
    return a


@pytest_asyncio.fixture()
async def session_type(db_session: AsyncSession, tenant: Tenant, conference: Conference) -> SessionType:
    """A session type for allowance default tests."""
    st = SessionType(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Workshop",
        slug="workshop",
        duration_minutes=90,
    )
    db_session.add(st)
    await db_session.commit()
    await db_session.refresh(st)
    return st


@pytest_asyncio.fixture()
async def tier(db_session: AsyncSession, tenant: Tenant, conference: Conference) -> ExpenseTier:
    """A pre-created expense tier."""
    t = ExpenseTier(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Speaker",
        max_amount=Decimal("700.00"),
        currency="EUR",
    )
    db_session.add(t)
    await db_session.commit()
    await db_session.refresh(t)
    return t


@pytest_asyncio.fixture()
async def category(db_session: AsyncSession, tenant: Tenant, conference: Conference) -> ExpenseCategory:
    """A pre-created expense category."""
    c = ExpenseCategory(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Travel",
    )
    db_session.add(c)
    await db_session.commit()
    await db_session.refresh(c)
    return c


@pytest_asyncio.fixture()
async def allowance(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    applicant: CFPApplicant,
) -> SpeakerExpenseAllowance:
    """A pre-created speaker allowance."""
    a = SpeakerExpenseAllowance(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        cfp_applicant_id=applicant.id,
        max_amount=Decimal("1000.00"),
        currency="EUR",
        source="auto",
    )
    db_session.add(a)
    await db_session.commit()
    await db_session.refresh(a)
    return a


@pytest_asyncio.fixture()
async def expense(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    applicant: CFPApplicant,
) -> SpeakerExpense:
    """A pre-created speaker expense in 'submitted' status."""
    e = SpeakerExpense(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        cfp_applicant_id=applicant.id,
        speaker_name="Jane Speaker",
        title="Hotel Stay",
        expense_date=date.today(),
        original_amount=Decimal("250.00"),
        original_currency="EUR",
        status="submitted",
    )
    db_session.add(e)
    await db_session.commit()
    await db_session.refresh(e)
    return e


# ===================================================================
# 1. Speaker Expense Settings
# ===================================================================


@pytest.mark.asyncio
class TestSpeakerExpenseSettings:
    """GET/PUT speaker-expense-settings."""

    async def test_get_defaults(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        """Default settings should have expenses_enabled=False."""
        resp = await client.get(
            _settings_url(conference.id),
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["expenses_enabled"] is False

    async def test_enable_expenses(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        """Admin can enable speaker expenses."""
        resp = await client.put(
            _settings_url(conference.id),
            json={"expenses_enabled": True},
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["expenses_enabled"] is True

        # Verify persisted
        get_resp = await client.get(
            _settings_url(conference.id),
            headers=auth_headers(tenant_admin_token),
        )
        assert get_resp.json()["expenses_enabled"] is True

    async def test_disable_expenses(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        """Admin can disable speaker expenses after enabling."""
        # Enable first
        await client.put(
            _settings_url(conference.id),
            json={"expenses_enabled": True},
            headers=auth_headers(tenant_admin_token),
        )
        # Disable
        resp = await client.put(
            _settings_url(conference.id),
            json={"expenses_enabled": False},
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["expenses_enabled"] is False

    async def test_regular_user_cannot_update_settings(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        regular_user_token: str,
    ) -> None:
        """Non-admin users cannot change settings."""
        resp = await client.put(
            _settings_url(conference.id),
            json={"expenses_enabled": True},
            headers=auth_headers(regular_user_token),
        )
        assert resp.status_code == 403

    async def test_no_auth_401(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
    ) -> None:
        """Unauthenticated requests are rejected."""
        resp = await client.get(_settings_url(conference.id))
        assert resp.status_code == 401


# ===================================================================
# 2. Expense Tiers CRUD
# ===================================================================


@pytest.mark.asyncio
class TestExpenseTiers:
    """CRUD for expense tiers."""

    async def test_list_empty(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        resp = await client.get(
            _url(conference.id, "tiers"),
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_create_tier(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        resp = await client.post(
            _url(conference.id, "tiers"),
            json={"name": "Keynote", "max_amount": 1500, "currency": "EUR"},
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Keynote"
        assert Decimal(data["max_amount"]) == Decimal("1500")
        assert data["currency"] == "EUR"
        assert data["is_active"] is True
        assert data["conference_id"] == str(conference.id)
        assert "id" in data

    async def test_list_tiers_after_create(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        # Create two tiers
        await client.post(
            _url(conference.id, "tiers"),
            json={"name": "Speaker", "max_amount": 700, "currency": "EUR"},
            headers=auth_headers(tenant_admin_token),
        )
        await client.post(
            _url(conference.id, "tiers"),
            json={"name": "Keynote", "max_amount": 1500, "currency": "EUR"},
            headers=auth_headers(tenant_admin_token),
        )
        resp = await client.get(
            _url(conference.id, "tiers"),
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    async def test_update_tier(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
        tier: ExpenseTier,
    ) -> None:
        resp = await client.put(
            _url(conference.id, f"tiers/{tier.id}"),
            json={"name": "Speaker Plus", "max_amount": 900},
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Speaker Plus"
        assert Decimal(data["max_amount"]) == Decimal("900")

    async def test_delete_tier(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
        tier: ExpenseTier,
    ) -> None:
        resp = await client.delete(
            _url(conference.id, f"tiers/{tier.id}"),
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 204

        # Verify deleted
        list_resp = await client.get(
            _url(conference.id, "tiers"),
            headers=auth_headers(tenant_admin_token),
        )
        assert len(list_resp.json()) == 0

    async def test_create_tier_no_auth_401(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
    ) -> None:
        resp = await client.post(
            _url(conference.id, "tiers"),
            json={"name": "Test", "max_amount": 500, "currency": "EUR"},
        )
        assert resp.status_code == 401

    async def test_create_tier_regular_user_403(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        regular_user_token: str,
    ) -> None:
        resp = await client.post(
            _url(conference.id, "tiers"),
            json={"name": "Test", "max_amount": 500, "currency": "EUR"},
            headers=auth_headers(regular_user_token),
        )
        assert resp.status_code == 403

    async def test_create_tier_missing_name_422(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        resp = await client.post(
            _url(conference.id, "tiers"),
            json={"max_amount": 500, "currency": "EUR"},
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 422

    async def test_update_nonexistent_tier_404(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        fake_id = uuid.uuid4()
        resp = await client.put(
            _url(conference.id, f"tiers/{fake_id}"),
            json={"name": "Updated"},
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 404


# ===================================================================
# 3. Expense Categories CRUD
# ===================================================================


@pytest.mark.asyncio
class TestExpenseCategories:
    """CRUD for expense categories."""

    async def test_list_empty(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        resp = await client.get(
            _url(conference.id, "categories"),
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_create_category(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        resp = await client.post(
            _url(conference.id, "categories"),
            json={"name": "Accommodation", "sort_order": 1},
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Accommodation"
        assert data["sort_order"] == 1
        assert data["is_active"] is True

    async def test_update_category(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
        category: ExpenseCategory,
    ) -> None:
        resp = await client.put(
            _url(conference.id, f"categories/{category.id}"),
            json={"name": "Travel & Transport"},
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Travel & Transport"

    async def test_delete_category(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
        category: ExpenseCategory,
    ) -> None:
        resp = await client.delete(
            _url(conference.id, f"categories/{category.id}"),
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 204

    async def test_delete_category_with_expenses_fails(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
        category: ExpenseCategory,
        applicant: CFPApplicant,
        db_session: AsyncSession,
        tenant: Tenant,
    ) -> None:
        """Cannot delete a category that has expenses referencing it."""
        # Create an expense linked to this category
        exp = SpeakerExpense(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            cfp_applicant_id=applicant.id,
            speaker_name="Jane Speaker",
            category_id=category.id,
            title="Flight",
            expense_date=date.today(),
            original_amount=Decimal("300.00"),
            original_currency="EUR",
            status="draft",
        )
        db_session.add(exp)
        await db_session.commit()

        resp = await client.delete(
            _url(conference.id, f"categories/{category.id}"),
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 400

    async def test_create_category_regular_user_403(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        regular_user_token: str,
    ) -> None:
        resp = await client.post(
            _url(conference.id, "categories"),
            json={"name": "Food"},
            headers=auth_headers(regular_user_token),
        )
        assert resp.status_code == 403


# ===================================================================
# 4. Allowance Defaults (per session type)
# ===================================================================


@pytest.mark.asyncio
class TestAllowanceDefaults:
    """CRUD for per-session-type allowance defaults."""

    async def test_list_empty(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        resp = await client.get(
            _url(conference.id, "allowance-defaults"),
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_create_allowance_default(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
        session_type: SessionType,
    ) -> None:
        resp = await client.post(
            _url(conference.id, "allowance-defaults"),
            json={
                "session_type_id": str(session_type.id),
                "max_amount": 2000,
                "currency": "EUR",
            },
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["session_type_id"] == str(session_type.id)
        assert Decimal(data["max_amount"]) == Decimal("2000")
        assert data["currency"] == "EUR"

    async def test_update_allowance_default(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
        session_type: SessionType,
        db_session: AsyncSession,
        tenant: Tenant,
    ) -> None:
        # Create default first
        default = SpeakerExpenseAllowanceDefault(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            session_type_id=session_type.id,
            max_amount=Decimal("1000.00"),
            currency="EUR",
        )
        db_session.add(default)
        await db_session.commit()

        resp = await client.put(
            _url(conference.id, f"allowance-defaults/{default.id}"),
            json={"max_amount": 1500},
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200
        assert Decimal(resp.json()["max_amount"]) == Decimal("1500")

    async def test_delete_allowance_default(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
        session_type: SessionType,
        db_session: AsyncSession,
        tenant: Tenant,
    ) -> None:
        default = SpeakerExpenseAllowanceDefault(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            session_type_id=session_type.id,
            max_amount=Decimal("500.00"),
            currency="EUR",
        )
        db_session.add(default)
        await db_session.commit()

        resp = await client.delete(
            _url(conference.id, f"allowance-defaults/{default.id}"),
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 204


# ===================================================================
# 5. Speaker Allowances + Tier Assignment
# ===================================================================


@pytest.mark.asyncio
class TestSpeakerAllowances:
    """Speaker allowances and tier assignment."""

    async def test_list_allowances(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
        allowance: SpeakerExpenseAllowance,
    ) -> None:
        resp = await client.get(
            _url(conference.id, "allowances"),
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["cfp_applicant_id"] == str(allowance.cfp_applicant_id)
        assert Decimal(data[0]["max_amount"]) == Decimal("1000")

    async def test_update_allowance_manual(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
        allowance: SpeakerExpenseAllowance,
    ) -> None:
        """Manually updating an allowance sets source='manual' and clears tier."""
        resp = await client.put(
            _url(conference.id, f"allowances/{allowance.id}"),
            json={"max_amount": 1200, "currency": "USD", "notes": "Increased budget"},
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert Decimal(data["max_amount"]) == Decimal("1200")
        assert data["currency"] == "USD"
        assert data["source"] == "manual"
        assert data["expense_tier_id"] is None
        assert data["notes"] == "Increased budget"

    async def test_assign_tier_to_existing_allowance(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
        allowance: SpeakerExpenseAllowance,
        tier: ExpenseTier,
    ) -> None:
        """Assigning a tier updates allowance amount and sets source='tier'."""
        resp = await client.post(
            _url(conference.id, f"allowances/{allowance.id}/assign-tier"),
            json={"expense_tier_id": str(tier.id)},
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["expense_tier_id"] == str(tier.id)
        assert data["expense_tier_name"] == "Speaker"
        assert Decimal(data["max_amount"]) == Decimal("700")
        assert data["source"] == "tier"

    async def test_assign_tier_creates_allowance_if_missing(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
        applicant: CFPApplicant,
        tier: ExpenseTier,
    ) -> None:
        """POST /assign-tier creates a new allowance when none exists."""
        resp = await client.post(
            _url(conference.id, "assign-tier"),
            json={
                "cfp_applicant_id": str(applicant.id),
                "expense_tier_id": str(tier.id),
            },
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["cfp_applicant_id"] == str(applicant.id)
        assert data["expense_tier_id"] == str(tier.id)
        assert Decimal(data["max_amount"]) == Decimal("700")
        assert data["source"] == "tier"

    async def test_assign_tier_updates_existing_allowance(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
        allowance: SpeakerExpenseAllowance,
        applicant: CFPApplicant,
        tier: ExpenseTier,
    ) -> None:
        """POST /assign-tier updates existing allowance when one exists."""
        resp = await client.post(
            _url(conference.id, "assign-tier"),
            json={
                "cfp_applicant_id": str(applicant.id),
                "expense_tier_id": str(tier.id),
            },
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        # Should update the existing one, not create a new one
        assert data["id"] == str(allowance.id)
        assert data["expense_tier_id"] == str(tier.id)
        assert data["source"] == "tier"

    async def test_assign_nonexistent_tier_404(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
        allowance: SpeakerExpenseAllowance,
    ) -> None:
        fake_tier_id = uuid.uuid4()
        resp = await client.post(
            _url(conference.id, f"allowances/{allowance.id}/assign-tier"),
            json={"expense_tier_id": str(fake_tier_id)},
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 404

    async def test_allowance_totals_calculated(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
        allowance: SpeakerExpenseAllowance,
        applicant: CFPApplicant,
        db_session: AsyncSession,
        tenant: Tenant,
    ) -> None:
        """Allowance response includes correct total_claimed, total_approved, remaining."""
        # Create expenses: one approved (200), one submitted (150)
        for status, amount in [("approved", "200.00"), ("submitted", "150.00")]:
            exp = SpeakerExpense(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                conference_id=conference.id,
                cfp_applicant_id=applicant.id,
                speaker_name="Jane Speaker",
                title=f"{status} expense",
                expense_date=date.today(),
                original_amount=Decimal(amount),
                original_currency="EUR",
                status=status,
            )
            db_session.add(exp)
        await db_session.commit()

        resp = await client.get(
            _url(conference.id, "allowances"),
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        a = data[0]
        # claimed = submitted + approved + paid
        assert Decimal(a["total_claimed"]) == Decimal("350.00")
        # approved = approved + paid
        assert Decimal(a["total_approved"]) == Decimal("200.00")
        # remaining = max_amount - approved
        assert Decimal(a["remaining"]) == Decimal("800.00")

    async def test_allowances_regular_user_403(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        regular_user_token: str,
        allowance: SpeakerExpenseAllowance,
    ) -> None:
        """Non-admin cannot update allowances."""
        resp = await client.put(
            _url(conference.id, f"allowances/{allowance.id}"),
            json={"max_amount": 5000, "currency": "EUR"},
            headers=auth_headers(regular_user_token),
        )
        assert resp.status_code == 403


# ===================================================================
# 6. Admin Expense Creation + Workflow
# ===================================================================


@pytest.mark.asyncio
class TestAdminExpenseCreation:
    """Admin creates expenses on behalf of speakers."""

    async def test_create_expense_for_speaker(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
        applicant: CFPApplicant,
    ) -> None:
        resp = await client.post(
            _url(conference.id),
            json={
                "cfp_applicant_id": str(applicant.id),
                "title": "Hotel Room",
                "expense_date": str(date.today()),
                "original_amount": 350,
                "original_currency": "EUR",
                "description": "3 nights at conference hotel",
            },
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["title"] == "Hotel Room"
        assert data["speaker_name"] == "Jane Speaker"
        assert Decimal(data["original_amount"]) == Decimal("350")
        assert data["status"] == "submitted"
        assert data["cfp_applicant_id"] == str(applicant.id)

    async def test_create_expense_with_category(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
        applicant: CFPApplicant,
        category: ExpenseCategory,
    ) -> None:
        resp = await client.post(
            _url(conference.id),
            json={
                "cfp_applicant_id": str(applicant.id),
                "title": "Taxi to venue",
                "expense_date": str(date.today()),
                "original_amount": 45,
                "original_currency": "EUR",
                "category_id": str(category.id),
            },
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 201
        assert resp.json()["category_id"] == str(category.id)

    async def test_create_expense_as_draft(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
        applicant: CFPApplicant,
    ) -> None:
        resp = await client.post(
            _url(conference.id),
            json={
                "cfp_applicant_id": str(applicant.id),
                "title": "Draft expense",
                "expense_date": str(date.today()),
                "original_amount": 100,
                "original_currency": "EUR",
                "status": "draft",
            },
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 201
        assert resp.json()["status"] == "draft"

    async def test_create_expense_nonexistent_applicant_404(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        resp = await client.post(
            _url(conference.id),
            json={
                "cfp_applicant_id": str(uuid.uuid4()),
                "title": "Ghost expense",
                "expense_date": str(date.today()),
                "original_amount": 100,
                "original_currency": "EUR",
            },
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 404

    async def test_create_expense_regular_user_403(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        regular_user_token: str,
        applicant: CFPApplicant,
    ) -> None:
        resp = await client.post(
            _url(conference.id),
            json={
                "cfp_applicant_id": str(applicant.id),
                "title": "Unauthorized expense",
                "expense_date": str(date.today()),
                "original_amount": 100,
                "original_currency": "EUR",
            },
            headers=auth_headers(regular_user_token),
        )
        assert resp.status_code == 403

    async def test_create_expense_missing_required_fields_422(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
        applicant: CFPApplicant,
    ) -> None:
        # Missing title and expense_date
        resp = await client.post(
            _url(conference.id),
            json={
                "cfp_applicant_id": str(applicant.id),
                "original_amount": 100,
                "original_currency": "EUR",
            },
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 422


@pytest.mark.asyncio
class TestExpenseWorkflow:
    """Expense status transitions: submitted → approved/rejected → paid."""

    async def test_approve_submitted_expense(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
        expense: SpeakerExpense,
    ) -> None:
        resp = await client.post(
            _url(conference.id, f"{expense.id}/approve"),
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["success"] is True

        # Verify status changed
        detail = await client.get(
            _url(conference.id, str(expense.id)),
            headers=auth_headers(tenant_admin_token),
        )
        assert detail.json()["status"] == "approved"
        assert detail.json()["approved_at"] is not None

    async def test_reject_submitted_expense(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
        expense: SpeakerExpense,
    ) -> None:
        resp = await client.post(
            _url(conference.id, f"{expense.id}/reject"),
            json={"reason": "Receipt is illegible"},
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["success"] is True

        # Verify status and reason
        detail = await client.get(
            _url(conference.id, str(expense.id)),
            headers=auth_headers(tenant_admin_token),
        )
        assert detail.json()["status"] == "rejected"
        assert detail.json()["rejection_reason"] == "Receipt is illegible"

    async def test_mark_approved_expense_as_paid(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
        expense: SpeakerExpense,
    ) -> None:
        # First approve
        await client.post(
            _url(conference.id, f"{expense.id}/approve"),
            headers=auth_headers(tenant_admin_token),
        )
        # Then mark paid
        resp = await client.post(
            _url(conference.id, f"{expense.id}/mark-paid"),
            json={"payment_reference": "WIRE-2026-0042"},
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["success"] is True

        # Verify
        detail = await client.get(
            _url(conference.id, str(expense.id)),
            headers=auth_headers(tenant_admin_token),
        )
        assert detail.json()["status"] == "paid"
        assert detail.json()["payment_reference"] == "WIRE-2026-0042"
        assert detail.json()["paid_at"] is not None

    async def test_cannot_approve_draft_expense(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
        applicant: CFPApplicant,
        db_session: AsyncSession,
        tenant: Tenant,
    ) -> None:
        """Only submitted expenses can be approved."""
        draft = SpeakerExpense(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            cfp_applicant_id=applicant.id,
            speaker_name="Jane Speaker",
            title="Draft item",
            expense_date=date.today(),
            original_amount=Decimal("100.00"),
            original_currency="EUR",
            status="draft",
        )
        db_session.add(draft)
        await db_session.commit()

        resp = await client.post(
            _url(conference.id, f"{draft.id}/approve"),
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 400

    async def test_cannot_reject_approved_expense(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
        expense: SpeakerExpense,
    ) -> None:
        """Cannot reject an already approved expense."""
        # Approve first
        await client.post(
            _url(conference.id, f"{expense.id}/approve"),
            headers=auth_headers(tenant_admin_token),
        )
        # Try to reject
        resp = await client.post(
            _url(conference.id, f"{expense.id}/reject"),
            json={"reason": "Changed my mind"},
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 400

    async def test_cannot_mark_submitted_as_paid(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
        expense: SpeakerExpense,
    ) -> None:
        """Only approved expenses can be marked as paid."""
        resp = await client.post(
            _url(conference.id, f"{expense.id}/mark-paid"),
            json={"payment_reference": "NOPE"},
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 400

    async def test_reject_requires_reason(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
        expense: SpeakerExpense,
    ) -> None:
        """Reject endpoint requires a non-empty reason."""
        resp = await client.post(
            _url(conference.id, f"{expense.id}/reject"),
            json={"reason": ""},
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 422

    async def test_workflow_regular_user_403(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        regular_user_token: str,
        expense: SpeakerExpense,
    ) -> None:
        """Non-admin cannot approve/reject/mark-paid."""
        for action in ["approve", "reject", "mark-paid"]:
            body = {"reason": "test"} if action == "reject" else {}
            if action == "mark-paid":
                body = {"payment_reference": "REF"}
            resp = await client.post(
                _url(conference.id, f"{expense.id}/{action}"),
                json=body,
                headers=auth_headers(regular_user_token),
            )
            assert resp.status_code == 403, f"Expected 403 for {action}"


# ===================================================================
# 7. Expense List + Detail + Search
# ===================================================================


@pytest.mark.asyncio
class TestExpenseListAndDetail:
    """List, detail, search, and filtering of expenses."""

    async def test_list_empty(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        resp = await client.get(
            _url(conference.id),
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"] == []
        assert data["total"] == 0

    async def test_list_with_expenses(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
        expense: SpeakerExpense,
    ) -> None:
        resp = await client.get(
            _url(conference.id),
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert len(data["items"]) == 1
        assert data["items"][0]["id"] == str(expense.id)

    async def test_list_filter_by_status(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
        applicant: CFPApplicant,
        db_session: AsyncSession,
        tenant: Tenant,
    ) -> None:
        """Status filter returns only matching expenses."""
        for status in ["draft", "submitted", "approved"]:
            exp = SpeakerExpense(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                conference_id=conference.id,
                cfp_applicant_id=applicant.id,
                speaker_name="Jane Speaker",
                title=f"{status} expense",
                expense_date=date.today(),
                original_amount=Decimal("100.00"),
                original_currency="EUR",
                status=status,
            )
            db_session.add(exp)
        await db_session.commit()

        resp = await client.get(
            _url(conference.id),
            params={"status": "submitted"},
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert all(item["status"] == "submitted" for item in data["items"])

    async def test_list_search_by_title(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
        expense: SpeakerExpense,
    ) -> None:
        resp = await client.get(
            _url(conference.id),
            params={"search": "Hotel"},
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["total"] == 1

        # Search for something that doesn't match
        resp2 = await client.get(
            _url(conference.id),
            params={"search": "Nonexistent"},
            headers=auth_headers(tenant_admin_token),
        )
        assert resp2.json()["total"] == 0

    async def test_list_pagination(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
        applicant: CFPApplicant,
        db_session: AsyncSession,
        tenant: Tenant,
    ) -> None:
        """Skip/limit pagination works correctly."""
        for i in range(5):
            exp = SpeakerExpense(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                conference_id=conference.id,
                cfp_applicant_id=applicant.id,
                speaker_name="Jane Speaker",
                title=f"Expense {i}",
                expense_date=date.today(),
                original_amount=Decimal("100.00"),
                original_currency="EUR",
                status="submitted",
            )
            db_session.add(exp)
        await db_session.commit()

        resp = await client.get(
            _url(conference.id),
            params={"skip": 0, "limit": 2},
            headers=auth_headers(tenant_admin_token),
        )
        data = resp.json()
        assert data["total"] == 5
        assert len(data["items"]) == 2

    async def test_get_expense_detail(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
        expense: SpeakerExpense,
    ) -> None:
        resp = await client.get(
            _url(conference.id, str(expense.id)),
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == str(expense.id)
        assert data["title"] == "Hotel Stay"
        assert data["speaker_name"] == "Jane Speaker"

    async def test_get_nonexistent_expense_404(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        resp = await client.get(
            _url(conference.id, str(uuid.uuid4())),
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 404


# ===================================================================
# 8. Expense Stats
# ===================================================================


@pytest.mark.asyncio
class TestExpenseStats:
    """Stats endpoint for expense summaries."""

    async def test_stats_empty(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
    ) -> None:
        resp = await client.get(
            _url(conference.id, "stats"),
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_expenses"] == 0
        assert Decimal(data["total_amount"]) == Decimal("0")

    async def test_stats_with_expenses(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_token: str,
        applicant: CFPApplicant,
        db_session: AsyncSession,
        tenant: Tenant,
    ) -> None:
        """Stats aggregates correctly by status."""
        expenses_data = [
            ("submitted", "200.00"),
            ("submitted", "150.00"),
            ("approved", "300.00"),
            ("paid", "100.00"),
        ]
        for status, amount in expenses_data:
            exp = SpeakerExpense(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                conference_id=conference.id,
                cfp_applicant_id=applicant.id,
                speaker_name="Jane Speaker",
                title=f"{status} expense",
                expense_date=date.today(),
                original_amount=Decimal(amount),
                original_currency="EUR",
                status=status,
            )
            db_session.add(exp)
        await db_session.commit()

        resp = await client.get(
            _url(conference.id, "stats"),
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_expenses"] == 4
        assert Decimal(data["total_amount"]) == Decimal("750.00")

        # Check by_status breakdown
        status_map = {s["status"]: s for s in data["by_status"]}
        assert status_map["submitted"]["count"] == 2
        assert Decimal(status_map["submitted"]["total_amount"]) == Decimal("350.00")
        assert status_map["approved"]["count"] == 1
        assert Decimal(status_map["approved"]["total_amount"]) == Decimal("300.00")
        assert status_map["paid"]["count"] == 1
        assert Decimal(status_map["paid"]["total_amount"]) == Decimal("100.00")

    async def test_stats_no_auth_401(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
    ) -> None:
        resp = await client.get(_url(conference.id, "stats"))
        assert resp.status_code == 401
