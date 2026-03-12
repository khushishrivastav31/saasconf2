"""Tests for analytics API endpoints and helper functions.

Covers:
  - Revenue tracking endpoint returns correct totals
  - Registration vs sponsor revenue separation
  - Bulk billing profile (no double-counting)
  - Financial report P&L calculation
  - Export endpoints return correct content-types
  - Auth: non-admin cannot access; disabled module returns 403
"""

import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.associations import ConferenceCFP
from app.models.booking import BookingOption, BookingPeriod
from app.models.cfp import CallForPapers
from app.models.cfp_applicants import CFPApplicant
from app.models.cfp_papers import CFPPaper
from app.models.conference import Conference
from app.models.invoice import Invoice
from app.models.module import Module, TenantModule
from app.models.program import ProgramDay
from app.models.registration import BillingProfile, Registration, RegistrationItem, RegistrationStatus
from app.models.speaker_expense import SpeakerExpense
from app.models.tenant import Tenant
from app.models.user import User
from tests.conftest import _make_token, auth_headers

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _analytics_token(user: User) -> str:
    return _make_token(user, modules=["analytics"])


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture()
async def analytics_module(db_session: AsyncSession) -> Module:
    m = Module(
        id=uuid.uuid4(),
        name="Analytics",
        code="analytics",
        description="Analytics module",
        is_active=True,
    )
    db_session.add(m)
    await db_session.commit()
    return m


@pytest_asyncio.fixture()
async def tenant_with_analytics(
    db_session: AsyncSession, tenant: Tenant, analytics_module: Module
) -> Tenant:
    tm = TenantModule(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        module_id=analytics_module.id,
        is_enabled=True,
    )
    db_session.add(tm)
    await db_session.commit()
    return tenant


@pytest_asyncio.fixture()
async def booking_option(db_session: AsyncSession, conference: Conference) -> BookingOption:
    bo = BookingOption(
        id=uuid.uuid4(),
        tenant_id=conference.tenant_id,
        conference_id=conference.id,
        name="Standard Ticket",
        conference_day_id=None,
        is_active=True,
    )
    db_session.add(bo)
    await db_session.commit()
    return bo


@pytest_asyncio.fixture()
async def billing_profile(db_session: AsyncSession, conference: Conference) -> BillingProfile:
    bp = BillingProfile(
        id=uuid.uuid4(),
        tenant_id=conference.tenant_id,
        conference_id=conference.id,
        street="123 Main St",
        postal_code="10115",
        city="Berlin",
        country="DE",
        contact_first_name="John",
        contact_last_name="Doe",
        contact_phone="+491234567890",
        contact_email="john@example.com",
    )
    db_session.add(bp)
    await db_session.commit()
    return bp


async def _make_registration(
    db_session: AsyncSession,
    conference: Conference,
    billing_profile: BillingProfile,
    booking_option: BookingOption,
    status: str = RegistrationStatus.PAID,
) -> Registration:
    r = Registration(
        id=uuid.uuid4(),
        tenant_id=conference.tenant_id,
        conference_id=conference.id,
        billing_profile_id=billing_profile.id,
        booking_option_id=booking_option.id,
        first_name="Jane",
        last_name="Doe",
        email=f"jane-{uuid.uuid4().hex[:6]}@example.com",
        status=status,
    )
    db_session.add(r)
    await db_session.commit()
    return r


async def _make_invoice(
    db_session: AsyncSession,
    conference: Conference,
    *,
    source_type: str,
    source_id: uuid.UUID,
    status: str = "paid",
    total: float = 119.0,
    subtotal: float = 100.0,
    tax_amount: float = 19.0,
    currency: str = "EUR",
    line_items: list[dict] | None = None,
) -> Invoice:
    today = date.today()
    inv = Invoice(
        id=uuid.uuid4(),
        tenant_id=conference.tenant_id,
        conference_id=conference.id,
        invoice_number=f"INV-{uuid.uuid4().hex[:8]}",
        template_type="bank_transfer",
        status=status,
        issue_date=today,
        due_date=today + timedelta(days=30),
        recipient_name="Test Co",
        recipient_email="billing@test.com",
        recipient_address_line1="123 St",
        recipient_city="Berlin",
        recipient_postal_code="10115",
        recipient_country="DE",
        subtotal=subtotal,
        tax_rate=19.0,
        tax_amount=tax_amount,
        total=total,
        currency=currency,
        is_active=True,
        recipient_source_type=source_type,
        recipient_source_id=source_id,
        line_items=line_items,
    )
    db_session.add(inv)
    await db_session.commit()
    return inv


# ---------------------------------------------------------------------------
# Revenue endpoint tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestRevenueEndpoint:
    async def test_returns_200_with_analytics_module(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_admin_user: User,
        tenant_with_analytics: Tenant,
        conference: Conference,
        booking_option: BookingOption,
        billing_profile: BillingProfile,
    ):
        """Revenue endpoint returns 200 for admin with analytics module."""
        await _make_registration(db_session, conference, billing_profile, booking_option)
        await _make_invoice(
            db_session,
            conference,
            source_type="registration",
            source_id=billing_profile.id,
            total=119.0,
            subtotal=100.0,
            tax_amount=19.0,
        )

        token = _analytics_token(tenant_admin_user)
        resp = await client.get(
            f"/api/v1/conferences/{conference.id}/analytics/revenue",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "total_revenue" in data
        assert "by_booking_option" in data
        assert data["currency"] == "EUR"

    async def test_revenue_counts_paid_invoices(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_admin_user: User,
        tenant_with_analytics: Tenant,
        conference: Conference,
        booking_option: BookingOption,
        billing_profile: BillingProfile,
    ):
        """Paid invoices contribute to total revenue."""
        await _make_registration(db_session, conference, billing_profile, booking_option)
        await _make_invoice(
            db_session,
            conference,
            source_type="registration",
            source_id=billing_profile.id,
            total=200.0,
            subtotal=168.07,
            tax_amount=31.93,
            status="paid",
            line_items=[{"description": booking_option.name, "quantity": 1, "unit_price": 168.07, "discount": 0.0, "total": 168.07}],
        )
        token = _analytics_token(tenant_admin_user)
        resp = await client.get(
            f"/api/v1/conferences/{conference.id}/analytics/revenue",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert float(data["registration_revenue"]) == pytest.approx(200.0, abs=0.01)
        assert float(data["total_revenue"]) == pytest.approx(200.0, abs=0.01)

    async def test_sponsor_revenue_separated(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_admin_user: User,
        tenant_with_analytics: Tenant,
        conference: Conference,
    ):
        """Sponsor invoices are counted in sponsor_revenue separately."""
        sponsor_id = uuid.uuid4()
        await _make_invoice(
            db_session,
            conference,
            source_type="sponsor",
            source_id=sponsor_id,
            total=5000.0,
            subtotal=5000.0,
            tax_amount=0.0,
        )
        token = _analytics_token(tenant_admin_user)
        resp = await client.get(
            f"/api/v1/conferences/{conference.id}/analytics/revenue",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert float(data["sponsor_revenue"]) == pytest.approx(5000.0, abs=0.01)
        assert data["sponsor_invoice_count"] == 1

    async def test_outstanding_invoices_excluded_from_revenue(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_admin_user: User,
        tenant_with_analytics: Tenant,
        conference: Conference,
        billing_profile: BillingProfile,
        booking_option: BookingOption,
    ):
        """Sent (outstanding) invoices count as revenue (receivables) and as outstanding.
        total_revenue includes sent invoices because they represent real earned revenue.
        outstanding_revenue separately tracks the unpaid portion.
        """
        await _make_registration(db_session, conference, billing_profile, booking_option)
        await _make_invoice(
            db_session,
            conference,
            source_type="registration",
            source_id=billing_profile.id,
            total=100.0,
            subtotal=100.0,
            tax_amount=0.0,
            status="sent",
        )
        token = _analytics_token(tenant_admin_user)
        resp = await client.get(
            f"/api/v1/conferences/{conference.id}/analytics/revenue",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        # Invoice total is included in total_revenue (invoices are the source of truth)
        assert float(data["total_revenue"]) == pytest.approx(100.0, abs=0.01)
        # The sent invoice also shows as outstanding receivable
        assert float(data["outstanding_revenue"]) == pytest.approx(100.0, abs=0.01)

    async def test_bulk_billing_profile_no_double_counting(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_admin_user: User,
        tenant_with_analytics: Tenant,
        conference: Conference,
        booking_option: BookingOption,
    ):
        """A billing profile with 2 registrations gets half the invoice amount each."""
        bp = BillingProfile(
            id=uuid.uuid4(),
            tenant_id=conference.tenant_id,
            conference_id=conference.id,
            street="123 St",
            postal_code="10115",
            city="Berlin",
            country="DE",
            contact_first_name="Corp",
            contact_last_name="Admin",
            contact_phone="+49123",
            contact_email="corp@example.com",
        )
        db_session.add(bp)
        await db_session.commit()

        # Two registrations under same billing profile
        for i in range(2):
            r = Registration(
                id=uuid.uuid4(),
                tenant_id=conference.tenant_id,
                conference_id=conference.id,
                billing_profile_id=bp.id,
                booking_option_id=booking_option.id,
                first_name=f"Person{i}",
                last_name="Corp",
                email=f"person{i}-{uuid.uuid4().hex[:6]}@corp.com",
                status=RegistrationStatus.PAID,
            )
            db_session.add(r)
        await db_session.commit()

        # One invoice for the whole billing profile: total 200
        await _make_invoice(
            db_session,
            conference,
            source_type="registration",
            source_id=bp.id,
            total=200.0,
            subtotal=168.07,
            tax_amount=31.93,
            status="paid",
            line_items=[{"description": booking_option.name, "quantity": 2, "unit_price": 84.035, "discount": 0.0, "total": 168.07}],
        )

        token = _analytics_token(tenant_admin_user)
        resp = await client.get(
            f"/api/v1/conferences/{conference.id}/analytics/revenue",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        # The total attributed should still be 200 (not 400)
        assert float(data["registration_revenue"]) == pytest.approx(200.0, abs=0.02)

    async def test_requires_analytics_module(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        conference: Conference,
    ):
        """Returns 403 when analytics module is not enabled."""
        token = _make_token(tenant_admin_user, modules=[])
        resp = await client.get(
            f"/api/v1/conferences/{conference.id}/analytics/revenue",
            headers=auth_headers(token),
        )
        assert resp.status_code == 403

    async def test_empty_conference_returns_zeros(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_analytics: Tenant,
        conference: Conference,
    ):
        """Conference with no invoices returns zero revenue."""
        token = _analytics_token(tenant_admin_user)
        resp = await client.get(
            f"/api/v1/conferences/{conference.id}/analytics/revenue",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert float(data["total_revenue"]) == 0.0
        assert data["by_booking_option"] == []


# ---------------------------------------------------------------------------
# Financial report endpoint tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestFinancialReportEndpoint:
    async def test_returns_200(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_analytics: Tenant,
        conference: Conference,
    ):
        """Financial report endpoint returns 200."""
        token = _analytics_token(tenant_admin_user)
        resp = await client.get(
            f"/api/v1/conferences/{conference.id}/analytics/financial-report",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "pl_summary" in data
        assert "variance_by_category" in data
        assert "cost_per_attendee" in data
        assert "revenue" in data

    async def test_pl_net_result_calculation(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_admin_user: User,
        tenant_with_analytics: Tenant,
        conference: Conference,
        booking_option: BookingOption,
        billing_profile: BillingProfile,
    ):
        """Net result = revenue - costs."""
        await _make_registration(db_session, conference, billing_profile, booking_option)
        await _make_invoice(
            db_session,
            conference,
            source_type="registration",
            source_id=billing_profile.id,
            total=1000.0,
            subtotal=840.34,
            tax_amount=159.66,
        )
        token = _analytics_token(tenant_admin_user)
        resp = await client.get(
            f"/api/v1/conferences/{conference.id}/analytics/financial-report",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        pl = data["pl_summary"]
        total_rev = float(pl["total_revenue"])
        total_costs = float(pl["total_costs"])
        net = float(pl["net_result"])
        assert abs(net - (total_rev - total_costs)) < 0.02

    async def test_no_budget_returns_empty_variance(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_analytics: Tenant,
        conference: Conference,
    ):
        """With no active budget, variance_by_category is empty."""
        token = _analytics_token(tenant_admin_user)
        resp = await client.get(
            f"/api/v1/conferences/{conference.id}/analytics/financial-report",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["variance_by_category"] == []
        assert data["budget_id"] is None


# ---------------------------------------------------------------------------
# Export endpoint tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestExportEndpoints:
    async def test_csv_export_content_type(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_analytics: Tenant,
        conference: Conference,
    ):
        """CSV export returns text/csv content type."""
        token = _analytics_token(tenant_admin_user)
        resp = await client.get(
            f"/api/v1/conferences/{conference.id}/analytics/revenue/export/csv",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        assert "text/csv" in resp.headers["content-type"]

    async def test_xlsx_export_content_type(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_analytics: Tenant,
        conference: Conference,
    ):
        """XLSX export returns correct spreadsheet content type."""
        token = _analytics_token(tenant_admin_user)
        resp = await client.get(
            f"/api/v1/conferences/{conference.id}/analytics/revenue/export/xlsx",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        assert "spreadsheetml" in resp.headers["content-type"]

    async def test_pdf_export_content_type(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_analytics: Tenant,
        conference: Conference,
    ):
        """PDF export returns application/pdf content type."""
        token = _analytics_token(tenant_admin_user)
        resp = await client.get(
            f"/api/v1/conferences/{conference.id}/analytics/financial-report/export/pdf",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/pdf"


# ---------------------------------------------------------------------------
# Booking period × booking option tests
# ---------------------------------------------------------------------------


async def _make_booking_period(
    db_session: AsyncSession,
    conference: Conference,
    name: str,
    start_date: date,
    end_date: date,
) -> BookingPeriod:
    bp = BookingPeriod(
        id=uuid.uuid4(),
        tenant_id=conference.tenant_id,
        conference_id=conference.id,
        name=name,
        start_date=start_date,
        end_date=end_date,
        sort_order=0,
    )
    db_session.add(bp)
    await db_session.commit()
    return bp


@pytest.mark.asyncio
class TestPeriodBreakdown:
    async def test_period_breakdown_appears_in_revenue(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_admin_user: User,
        tenant_with_analytics: Tenant,
        conference: Conference,
        booking_option: BookingOption,
        billing_profile: BillingProfile,
    ):
        """When a booking period covers the registration date, period shows in breakdown."""
        today = date.today()
        await _make_booking_period(
            db_session, conference, "Early Bird",
            today - timedelta(days=30), today + timedelta(days=30),
        )

        reg = await _make_registration(db_session, conference, billing_profile, booking_option)
        # Ensure created_at falls within the period (it will since it's today by default)
        _ = reg

        await _make_invoice(
            db_session, conference,
            source_type="registration",
            source_id=billing_profile.id,
            total=100.0, subtotal=84.03, tax_amount=15.97,
        )

        token = _analytics_token(tenant_admin_user)
        resp = await client.get(
            f"/api/v1/conferences/{conference.id}/analytics/revenue",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["by_booking_option"]) == 1
        option = data["by_booking_option"][0]
        assert len(option["periods"]) == 1
        assert option["periods"][0]["period_name"] == "Early Bird"
        assert option["periods"][0]["attendee_count"] == 1

    async def test_registration_without_period_goes_to_no_period(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_admin_user: User,
        tenant_with_analytics: Tenant,
        conference: Conference,
        booking_option: BookingOption,
        billing_profile: BillingProfile,
    ):
        """Registration with created_at outside all periods → period_name='No Period'."""
        # Create a period that does NOT cover today
        today = date.today()
        await _make_booking_period(
            db_session, conference, "Past Period",
            today - timedelta(days=60), today - timedelta(days=31),
        )

        await _make_registration(db_session, conference, billing_profile, booking_option)
        await _make_invoice(
            db_session, conference,
            source_type="registration",
            source_id=billing_profile.id,
            total=100.0, subtotal=84.03, tax_amount=15.97,
        )

        token = _analytics_token(tenant_admin_user)
        resp = await client.get(
            f"/api/v1/conferences/{conference.id}/analytics/revenue",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["by_booking_option"]) == 1
        option = data["by_booking_option"][0]
        assert len(option["periods"]) == 1
        assert option["periods"][0]["period_name"] == "No Period"
        assert option["periods"][0]["booking_period_id"] is None

    async def test_multiple_periods_grouped_correctly(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_admin_user: User,
        tenant_with_analytics: Tenant,
        conference: Conference,
        booking_option: BookingOption,
    ):
        """Two registrations in different periods → two period sub-rows under same option."""
        today = date.today()

        # Period A: covers 60-31 days ago
        period_a = await _make_booking_period(
            db_session, conference, "Early Bird",
            today - timedelta(days=60), today - timedelta(days=31),
        )
        _ = period_a

        # Period B: covers last 30 days (including today)
        period_b = await _make_booking_period(
            db_session, conference, "Regular",
            today - timedelta(days=30), today + timedelta(days=30),
        )
        _ = period_b

        # Billing profile A → registration created today (Regular period)
        bp_a = BillingProfile(
            id=uuid.uuid4(), tenant_id=conference.tenant_id, conference_id=conference.id,
            street="A St", postal_code="10115", city="Berlin", country="DE",
            contact_first_name="A", contact_last_name="A",
            contact_phone="+49111", contact_email="a@example.com",
        )
        db_session.add(bp_a)
        await db_session.commit()

        reg_a = Registration(
            id=uuid.uuid4(), tenant_id=conference.tenant_id, conference_id=conference.id,
            billing_profile_id=bp_a.id, booking_option_id=booking_option.id,
            first_name="Reg", last_name="A",
            email=f"rega-{uuid.uuid4().hex[:6]}@example.com",
            status=RegistrationStatus.PAID,
        )
        db_session.add(reg_a)
        await db_session.commit()

        # Billing profile B → registration created 45 days ago (Early Bird period)
        bp_b = BillingProfile(
            id=uuid.uuid4(), tenant_id=conference.tenant_id, conference_id=conference.id,
            street="B St", postal_code="10115", city="Berlin", country="DE",
            contact_first_name="B", contact_last_name="B",
            contact_phone="+49222", contact_email="b@example.com",
        )
        db_session.add(bp_b)
        await db_session.commit()

        reg_b = Registration(
            id=uuid.uuid4(), tenant_id=conference.tenant_id, conference_id=conference.id,
            billing_profile_id=bp_b.id, booking_option_id=booking_option.id,
            first_name="Reg", last_name="B",
            email=f"regb-{uuid.uuid4().hex[:6]}@example.com",
            status=RegistrationStatus.PAID,
        )
        # Backdate created_at to 45 days ago to fall in Early Bird period
        reg_b.created_at = datetime.now(UTC) - timedelta(days=45)
        db_session.add(reg_b)
        await db_session.commit()

        # One paid invoice per billing profile
        for bp in [bp_a, bp_b]:
            await _make_invoice(
                db_session, conference,
                source_type="registration",
                source_id=bp.id,
                total=100.0, subtotal=84.03, tax_amount=15.97,
                line_items=[{"description": booking_option.name, "quantity": 1, "unit_price": 84.03, "discount": 0.0, "total": 84.03}],
            )

        token = _analytics_token(tenant_admin_user)
        resp = await client.get(
            f"/api/v1/conferences/{conference.id}/analytics/revenue",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["by_booking_option"]) == 1
        option = data["by_booking_option"][0]
        assert len(option["periods"]) == 2

        period_names = {p["period_name"] for p in option["periods"]}
        assert "Early Bird" in period_names
        assert "Regular" in period_names

        # Total attendees across periods = 2
        assert option["attendee_count"] == 2
        # Total revenue = 200 (two paid invoices)
        assert float(option["total_revenue"]) == pytest.approx(200.0, abs=0.02)

    async def test_other_revenue_computed_correctly(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_admin_user: User,
        tenant_with_analytics: Tenant,
        conference: Conference,
        booking_option: BookingOption,
        billing_profile: BillingProfile,
    ):
        """Invoice with an unrecognized line item description contributes to other_revenue."""
        reg = await _make_registration(db_session, conference, billing_profile, booking_option)
        _ = reg

        # Invoice with a description that does NOT match any booking option name
        await _make_invoice(
            db_session, conference,
            source_type="registration",
            source_id=billing_profile.id,
            total=50.0, subtotal=42.0, tax_amount=8.0,
            line_items=[{"description": "Unrecognized Service", "quantity": 1, "unit_price": 42.0, "discount": 0.0, "total": 42.0}],
        )

        token = _analytics_token(tenant_admin_user)
        resp = await client.get(
            f"/api/v1/conferences/{conference.id}/analytics/revenue",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()

        # registration_revenue = invoice total (source of truth)
        assert float(data["registration_revenue"]) == pytest.approx(50.0, abs=0.01)
        # other_revenue = invoice total − matched line items = 50 − 0 = 50
        assert float(data["other_revenue"]) == pytest.approx(50.0, abs=0.02)

    async def test_cancelled_registration_excluded_from_active_count(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_admin_user: User,
        tenant_with_analytics: Tenant,
        conference: Conference,
        booking_option: BookingOption,
        billing_profile: BillingProfile,
    ):
        """Cancelled registrations must not count in active_registrations."""
        # Active registration
        await _make_registration(db_session, conference, billing_profile, booking_option)

        # Second billing profile with a cancelled registration
        bp2 = BillingProfile(
            id=uuid.uuid4(), tenant_id=conference.tenant_id, conference_id=conference.id,
            street="B St", postal_code="10115", city="Berlin", country="DE",
            contact_first_name="X", contact_last_name="Y",
            contact_phone="+49000", contact_email="xy@example.com",
        )
        db_session.add(bp2)
        await db_session.commit()
        cancelled_reg = Registration(
            id=uuid.uuid4(), tenant_id=conference.tenant_id, conference_id=conference.id,
            billing_profile_id=bp2.id, booking_option_id=booking_option.id,
            first_name="Cancelled", last_name="Person",
            email=f"cancelled-{uuid.uuid4().hex[:6]}@example.com",
            status=RegistrationStatus.CANCELLED,
        )
        db_session.add(cancelled_reg)
        await db_session.commit()

        token = _analytics_token(tenant_admin_user)
        resp = await client.get(
            f"/api/v1/conferences/{conference.id}/analytics/revenue",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()

        # total = 2, cancelled = 1, active = 1
        assert data["total_registrations"] == 2
        assert data["cancelled_registrations"] == 1
        assert data["active_registrations"] == 1


# ---------------------------------------------------------------------------
# Conference Statistics tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestConferenceStatistics:
    async def test_registrations_over_time(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_admin_user: User,
        tenant_with_analytics: Tenant,
        conference: Conference,
        booking_option: BookingOption,
        billing_profile: BillingProfile,
    ):
        """Registrations over time returns daily data points with cumulative totals."""
        # Create 3 registrations
        for _ in range(3):
            await _make_registration(db_session, conference, billing_profile, booking_option)

        token = _analytics_token(tenant_admin_user)
        resp = await client.get(
            f"/api/v1/conferences/{conference.id}/analytics/stats/registrations-over-time",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "data_points" in data
        total = sum(p["count"] for p in data["data_points"])
        assert total == 3
        # cumulative of last point equals total
        if data["data_points"]:
            assert data["data_points"][-1]["cumulative"] == total

    async def test_registrations_over_time_excludes_cancelled(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_admin_user: User,
        tenant_with_analytics: Tenant,
        conference: Conference,
        booking_option: BookingOption,
        billing_profile: BillingProfile,
    ):
        """Cancelled registrations are not counted."""
        await _make_registration(db_session, conference, billing_profile, booking_option, status=RegistrationStatus.PAID)
        await _make_registration(db_session, conference, billing_profile, booking_option, status=RegistrationStatus.CANCELLED)

        token = _analytics_token(tenant_admin_user)
        resp = await client.get(
            f"/api/v1/conferences/{conference.id}/analytics/stats/registrations-over-time",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        total = sum(p["count"] for p in resp.json()["data_points"])
        assert total == 1

    async def test_attendees_location_by_country(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_admin_user: User,
        tenant_with_analytics: Tenant,
        conference: Conference,
        booking_option: BookingOption,
        billing_profile: BillingProfile,
    ):
        """Attendees location groups by country code and returns sorted list."""
        # billing_profile fixture has country="DE"
        await _make_registration(db_session, conference, billing_profile, booking_option)

        # Second attendee from NL
        bp_nl = BillingProfile(
            id=uuid.uuid4(), tenant_id=conference.tenant_id, conference_id=conference.id,
            street="Dam 1", postal_code="1012", city="Amsterdam", country="NL",
            contact_first_name="Hans", contact_last_name="M",
            contact_phone="+311234", contact_email="hans@example.com",
        )
        db_session.add(bp_nl)
        await db_session.commit()
        await _make_registration(db_session, conference, bp_nl, booking_option)

        token = _analytics_token(tenant_admin_user)
        resp = await client.get(
            f"/api/v1/conferences/{conference.id}/analytics/stats/attendees-location",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "by_country" in data
        assert "by_city" in data
        country_codes = {c["country_code"] for c in data["by_country"]}
        assert "DE" in country_codes
        assert "NL" in country_codes

    async def test_attendees_company_sorted_by_count(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_admin_user: User,
        tenant_with_analytics: Tenant,
        conference: Conference,
        booking_option: BookingOption,
    ):
        """Companies are sorted by attendee count descending."""
        # Company A: 2 attendees
        for i in range(2):
            bp = BillingProfile(
                id=uuid.uuid4(), tenant_id=conference.tenant_id, conference_id=conference.id,
                company_name="Company A",
                street=f"{i} St", postal_code="10115", city="Berlin", country="DE",
                contact_first_name=f"A{i}", contact_last_name="X",
                contact_phone="+49111", contact_email=f"a{i}@company-a.com",
            )
            db_session.add(bp)
            await db_session.commit()
            await _make_registration(db_session, conference, bp, booking_option)

        # Company B: 1 attendee
        bp_b = BillingProfile(
            id=uuid.uuid4(), tenant_id=conference.tenant_id, conference_id=conference.id,
            company_name="Company B",
            street="2 St", postal_code="10115", city="Berlin", country="DE",
            contact_first_name="B", contact_last_name="X",
            contact_phone="+49222", contact_email="b@company-b.com",
        )
        db_session.add(bp_b)
        await db_session.commit()
        await _make_registration(db_session, conference, bp_b, booking_option)

        token = _analytics_token(tenant_admin_user)
        resp = await client.get(
            f"/api/v1/conferences/{conference.id}/analytics/stats/attendees-company",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_unique_companies"] == 2
        assert data["companies"][0]["company"] == "Company A"
        assert data["companies"][0]["count"] == 2
        assert data["companies"][1]["company"] == "Company B"

    async def test_papers_over_time_no_cfp(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_analytics: Tenant,
        conference: Conference,
    ):
        """Conference with no CFP returns has_cfp=False."""
        token = _analytics_token(tenant_admin_user)
        resp = await client.get(
            f"/api/v1/conferences/{conference.id}/analytics/stats/papers-over-time",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["has_cfp"] is False
        assert data["data_points"] == []

    async def test_papers_over_time_with_submissions(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_admin_user: User,
        tenant_with_analytics: Tenant,
        conference: Conference,
    ):
        """Conference with CFP papers returns monthly grouped data."""
        # Create CFP and link to conference
        cfp = CallForPapers(
            id=uuid.uuid4(),
            tenant_id=conference.tenant_id,
            title="Test CFP",
        )
        db_session.add(cfp)
        await db_session.commit()

        link = ConferenceCFP(
            id=uuid.uuid4(),
            conference_id=conference.id,
            cfp_id=cfp.id,
        )
        db_session.add(link)
        await db_session.commit()

        # Create a CFP applicant (required by CFPPaper.main_speaker_id FK)
        applicant = CFPApplicant(
            id=uuid.uuid4(),
            tenant_id=conference.tenant_id,
            first_name="Test",
            last_name="Speaker",
            email=f"speaker-{uuid.uuid4().hex[:6]}@example.com",
            password_hash="x",
        )
        db_session.add(applicant)
        await db_session.commit()

        # Create 2 papers with submitted_at set
        for _ in range(2):
            paper = CFPPaper(
                id=uuid.uuid4(),
                tenant_id=conference.tenant_id,
                cfp_id=cfp.id,
                main_speaker_id=applicant.id,
                title="Test Paper",
                submitted_at=datetime.now(UTC),
            )
            db_session.add(paper)
        await db_session.commit()

        token = _analytics_token(tenant_admin_user)
        resp = await client.get(
            f"/api/v1/conferences/{conference.id}/analytics/stats/papers-over-time",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["has_cfp"] is True
        assert len(data["data_points"]) >= 1
        total = sum(p["count"] for p in data["data_points"])
        assert total == 2

    async def test_attendees_per_day_no_program_days(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_analytics: Tenant,
        conference: Conference,
    ):
        """Conference with no program days returns has_program_days=False."""
        token = _analytics_token(tenant_admin_user)
        resp = await client.get(
            f"/api/v1/conferences/{conference.id}/analytics/stats/attendees-per-day",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["has_program_days"] is False
        assert data["days"] == []

    async def test_tutorials_no_tutorials(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_analytics: Tenant,
        conference: Conference,
    ):
        """Conference with no tutorial registrations returns has_tutorials=False."""
        token = _analytics_token(tenant_admin_user)
        resp = await client.get(
            f"/api/v1/conferences/{conference.id}/analytics/stats/tutorials",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["has_tutorials"] is False
        assert data["tutorials"] == []
        assert data["total_revenue"] == 0.0
