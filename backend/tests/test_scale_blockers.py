"""Regression tests for the PR 1 scale blockers.

Covers:

* ``GET /api/v1/cfp/applicants`` — skip/limit pagination + ``total`` reports
  the full filtered count (not page length).
* ``GET /api/v1/trainings/offers/stats`` — aggregated counts + sums per
  status, so the dashboard no longer has to materialise every offer row.
* ``GET /api/v1/trainings/offers`` — ``status`` query param filters server
  side, so the paginated list doesn't hide late statuses behind page 2+.
* ``POST /.../messaging/bulk-send`` — many-applicant bulk send creates N
  threads, one bulk_id, and still succeeds; the per-thread flush has been
  collapsed into a single flush at the end of the loop.
"""

import os
import uuid
from decimal import Decimal

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://saasconf:saasconf_dev_password@localhost:5432/saasconf_test",
)
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-unit-tests-minimum-32-chars")
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "testpassword123")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.cfp_applicants import CFPApplicant
from app.models.conference import Conference
from app.models.customer import Customer
from app.models.customer_offer import CustomerOffer
from app.models.messaging import MessageParticipant, MessageThread
from app.models.module import Module, TenantModule
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from tests.conftest import auth_headers

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _token(user: User, modules: list[str]) -> str:
    return create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role,
        modules=modules,
    )


# ---------------------------------------------------------------------------
# Fixtures — isolated per-test tenant + admin so counts are deterministic
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def scale_tenant(db_session: AsyncSession) -> Tenant:
    t = Tenant(id=uuid.uuid4(), name="Scale Tenant", slug=f"scale-{uuid.uuid4().hex[:8]}")
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture
async def scale_admin(db_session: AsyncSession, scale_tenant: Tenant) -> User:
    u = User(
        id=uuid.uuid4(),
        tenant_id=scale_tenant.id,
        email=f"scale-admin-{uuid.uuid4().hex[:8]}@example.com",
        first_name="Scale",
        last_name="Admin",
        role=UserRole.TENANT_ADMIN.value,
        password_hash=hash_password("Password123!"),
        is_active=True,
    )
    db_session.add(u)
    await db_session.commit()
    return u


@pytest_asyncio.fixture
async def _enable_modules(db_session: AsyncSession, scale_tenant: Tenant) -> None:
    """Enable the cfp / conferences / trainings modules for the scale tenant.

    ``TenantAdminDep`` gates the endpoints behind module access, so tests
    need the tenant linked to the relevant modules.
    """
    for code, name in (
        ("cfp", "Call for Papers"),
        ("conferences", "Conferences"),
        ("trainings", "Trainings"),
    ):
        mod = Module(id=uuid.uuid4(), name=name, code=code, description=name, is_active=True)
        db_session.add(mod)
        await db_session.flush()
        db_session.add(
            TenantModule(
                id=uuid.uuid4(),
                tenant_id=scale_tenant.id,
                module_id=mod.id,
                is_enabled=True,
            )
        )
    await db_session.commit()


# ---------------------------------------------------------------------------
# Applicants — pagination
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_applicants_defaults_to_page_size_100(
    client: AsyncClient,
    db_session: AsyncSession,
    scale_tenant: Tenant,
    scale_admin: User,
    _enable_modules: None,
) -> None:
    """When more than 100 applicants exist, the default page returns 100 rows
    and ``total`` is the full filtered count."""
    for i in range(105):
        db_session.add(
            CFPApplicant(
                id=uuid.uuid4(),
                tenant_id=scale_tenant.id,
                first_name=f"Page{i:03d}",
                last_name="User",
                email=f"page-{i}-{uuid.uuid4().hex[:6]}@example.com",
                password_hash=hash_password("Password123!"),
            )
        )
    await db_session.commit()

    token = _token(scale_admin, modules=["cfp", "conferences"])
    resp = await client.get("/api/v1/cfp/applicants", headers=auth_headers(token))
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["total"] == 105
    assert len(data["items"]) == 100


@pytest.mark.asyncio
async def test_list_applicants_skip_limit(
    client: AsyncClient,
    db_session: AsyncSession,
    scale_tenant: Tenant,
    scale_admin: User,
    _enable_modules: None,
) -> None:
    """skip + limit query params slice the result window and ``total`` stays
    fixed at the full tenant-filtered count."""
    for i in range(10):
        db_session.add(
            CFPApplicant(
                id=uuid.uuid4(),
                tenant_id=scale_tenant.id,
                first_name=f"Slice{i:03d}",
                last_name="User",
                email=f"slice-{i}-{uuid.uuid4().hex[:6]}@example.com",
                password_hash=hash_password("Password123!"),
            )
        )
    await db_session.commit()

    token = _token(scale_admin, modules=["cfp", "conferences"])
    resp = await client.get(
        "/api/v1/cfp/applicants",
        headers=auth_headers(token),
        params={"skip": 3, "limit": 4},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["total"] == 10
    assert len(data["items"]) == 4


@pytest.mark.asyncio
async def test_list_applicants_limit_capped_at_500(
    client: AsyncClient,
    scale_admin: User,
    _enable_modules: None,
) -> None:
    """Per CLAUDE.md perf rules, ``limit`` is hard-capped at 500."""
    token = _token(scale_admin, modules=["cfp", "conferences"])
    resp = await client.get(
        "/api/v1/cfp/applicants",
        headers=auth_headers(token),
        params={"limit": 5000},
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Offers — stats endpoint + status filter
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def scale_customer(db_session: AsyncSession, scale_tenant: Tenant) -> Customer:
    c = Customer(id=uuid.uuid4(), tenant_id=scale_tenant.id, name="Stats Corp")
    db_session.add(c)
    await db_session.commit()
    return c


async def _make_offer(
    db_session: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    customer_id: uuid.UUID,
    number: str,
    status: str,
    training_price: Decimal,
    cert_price: Decimal,
) -> CustomerOffer:
    offer = CustomerOffer(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        customer_id=customer_id,
        offer_number=number,
        status=status,
        training_price=training_price,
        certification_price=cert_price,
    )
    db_session.add(offer)
    return offer


@pytest.mark.asyncio
async def test_offer_stats_aggregates_per_status(
    client: AsyncClient,
    db_session: AsyncSession,
    scale_tenant: Tenant,
    scale_admin: User,
    scale_customer: Customer,
    _enable_modules: None,
) -> None:
    """``GET /trainings/offers/stats`` groups by status and sums training + cert
    totals, so the dashboard can render without materialising every row."""
    await _make_offer(
        db_session,
        tenant_id=scale_tenant.id,
        customer_id=scale_customer.id,
        number="OFF-0001",
        status="draft",
        training_price=Decimal("1000"),
        cert_price=Decimal("100"),
    )
    await _make_offer(
        db_session,
        tenant_id=scale_tenant.id,
        customer_id=scale_customer.id,
        number="OFF-0002",
        status="draft",
        training_price=Decimal("500"),
        cert_price=Decimal("50"),
    )
    await _make_offer(
        db_session,
        tenant_id=scale_tenant.id,
        customer_id=scale_customer.id,
        number="OFF-0003",
        status="accepted",
        training_price=Decimal("2500"),
        cert_price=Decimal("250"),
    )
    await db_session.commit()

    token = _token(scale_admin, modules=["trainings"])
    resp = await client.get("/api/v1/trainings/offers/stats", headers=auth_headers(token))
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert body["total_offers"] == 3
    assert body["total_training"] == pytest.approx(4000.0)
    assert body["total_cert"] == pytest.approx(400.0)

    by_status = body["by_status"]
    assert by_status["draft"]["count"] == 2
    assert by_status["draft"]["training"] == pytest.approx(1500.0)
    assert by_status["draft"]["cert"] == pytest.approx(150.0)
    assert by_status["accepted"]["count"] == 1
    assert by_status["accepted"]["training"] == pytest.approx(2500.0)


@pytest.mark.asyncio
async def test_offer_list_status_filter(
    client: AsyncClient,
    db_session: AsyncSession,
    scale_tenant: Tenant,
    scale_admin: User,
    scale_customer: Customer,
    _enable_modules: None,
) -> None:
    """``status`` query param filters server-side, so pagination doesn't hide
    late-status rows behind page 2+."""
    await _make_offer(
        db_session,
        tenant_id=scale_tenant.id,
        customer_id=scale_customer.id,
        number="OFF-0010",
        status="draft",
        training_price=Decimal("0"),
        cert_price=Decimal("0"),
    )
    await _make_offer(
        db_session,
        tenant_id=scale_tenant.id,
        customer_id=scale_customer.id,
        number="OFF-0011",
        status="accepted",
        training_price=Decimal("0"),
        cert_price=Decimal("0"),
    )
    await db_session.commit()

    token = _token(scale_admin, modules=["trainings"])
    resp = await client.get(
        "/api/v1/trainings/offers",
        headers=auth_headers(token),
        params={"status": "accepted"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["total"] == 1
    assert len(data["items"]) == 1
    assert data["items"][0]["offer_number"] == "OFF-0011"


# ---------------------------------------------------------------------------
# Bulk messaging — batched flush + fanout
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def scale_conference(db_session: AsyncSession, scale_tenant: Tenant) -> Conference:
    conf = Conference(
        id=uuid.uuid4(),
        tenant_id=scale_tenant.id,
        name="Scale Conf",
    )
    db_session.add(conf)
    await db_session.commit()
    return conf


@pytest.mark.asyncio
async def test_bulk_send_many_applicants_creates_N_threads(
    client: AsyncClient,
    db_session: AsyncSession,
    scale_tenant: Tenant,
    scale_admin: User,
    scale_conference: Conference,
    _enable_modules: None,
) -> None:
    """A 60-applicant bulk send creates 60 threads + 120 participants + 60
    messages in a single commit. Regression guard for the flush-per-thread
    bottleneck and the ``asyncio.gather`` fan-out — any reintroduction of a
    per-iteration flush still needs to end with the correct row counts."""
    applicant_ids: list[uuid.UUID] = []
    for i in range(60):
        a = CFPApplicant(
            id=uuid.uuid4(),
            tenant_id=scale_tenant.id,
            first_name=f"Bulk{i:03d}",
            last_name="User",
            email=f"bulk-{i}-{uuid.uuid4().hex[:6]}@example.com",
            password_hash=hash_password("Password123!"),
        )
        db_session.add(a)
        applicant_ids.append(a.id)
    await db_session.commit()

    token = _token(scale_admin, modules=["conferences", "cfp"])
    resp = await client.post(
        f"/api/v1/conferences/{scale_conference.id}/messaging/bulk-send",
        json={
            "subject": "Scale bulk",
            "body_html": "<p>Hi {{first_name}}</p>",
            "recipients": {"applicant_ids": [str(i) for i in applicant_ids]},
        },
        headers=auth_headers(token),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["threads_created"] == 60
    bulk_id = uuid.UUID(body["bulk_id"])

    # Verify thread + participant counts rather than trusting only the response.
    from sqlalchemy import func, select

    thread_count = await db_session.scalar(
        select(func.count()).select_from(MessageThread).where(MessageThread.bulk_id == bulk_id)
    )
    assert thread_count == 60

    participant_count = await db_session.scalar(
        select(func.count())
        .select_from(MessageParticipant)
        .join(MessageThread, MessageThread.id == MessageParticipant.thread_id)
        .where(MessageThread.bulk_id == bulk_id)
    )
    # Two participants per thread (admin + applicant) → 120 rows.
    assert participant_count == 120
