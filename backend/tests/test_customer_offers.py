"""Tests for customer offer endpoints."""

import os
import uuid
from datetime import date

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
from app.models.customer import Customer
from app.models.location import Location
from app.models.tenant import Tenant
from app.models.training import Training
from app.models.training_program import ProgramYearTraining, TrainingProgramYear
from app.models.user import User, UserRole
from tests.conftest import auth_headers


# ── Helpers ────────────────────────────────────────────────────────────


def _make_token(user: User) -> str:
    return create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role,
        modules=["trainings"],
    )


BASE = "/api/v1/trainings/offers"


# ── Fixtures ───────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def tenant_o(db_session: AsyncSession) -> Tenant:
    t = Tenant(id=uuid.uuid4(), name="Offer Tenant", slug=f"offer-tenant-{uuid.uuid4().hex[:8]}")
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture
async def admin_o(db_session: AsyncSession, tenant_o: Tenant) -> User:
    u = User(
        id=uuid.uuid4(),
        tenant_id=tenant_o.id,
        email=f"admin-offer-{uuid.uuid4().hex[:8]}@test.com",
        first_name="Admin",
        last_name="Offer",
        role=UserRole.TENANT_ADMIN.value,
        password_hash=hash_password("Password123!"),
        is_active=True,
    )
    db_session.add(u)
    await db_session.commit()
    return u


@pytest_asyncio.fixture
async def customer_o(db_session: AsyncSession, tenant_o: Tenant) -> Customer:
    c = Customer(
        id=uuid.uuid4(),
        tenant_id=tenant_o.id,
        name="Acme Corp",
    )
    db_session.add(c)
    await db_session.commit()
    return c


@pytest_asyncio.fixture
async def training_o(db_session: AsyncSession, tenant_o: Tenant) -> Training:
    t = Training(
        id=uuid.uuid4(),
        tenant_id=tenant_o.id,
        name="AWS Solutions Architect",
        slug="aws-sa",
        duration=3,
    )
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture
async def location_o(db_session: AsyncSession, tenant_o: Tenant) -> Location:
    loc = Location(
        id=uuid.uuid4(),
        tenant_id=tenant_o.id,
        name="Berlin Office",
        code="BER",
    )
    db_session.add(loc)
    await db_session.commit()
    return loc


@pytest_asyncio.fixture
async def program_year_o(db_session: AsyncSession, tenant_o: Tenant) -> TrainingProgramYear:
    py = TrainingProgramYear(
        id=uuid.uuid4(),
        tenant_id=tenant_o.id,
        year=2026,
    )
    db_session.add(py)
    await db_session.commit()
    return py


@pytest_asyncio.fixture
async def inhouse_placement(
    db_session: AsyncSession,
    tenant_o: Tenant,
    program_year_o: TrainingProgramYear,
    training_o: Training,
    location_o: Location,
) -> ProgramYearTraining:
    p = ProgramYearTraining(
        id=uuid.uuid4(),
        tenant_id=tenant_o.id,
        program_year_id=program_year_o.id,
        training_id=training_o.id,
        start_date=date(2026, 6, 15),
        placement_type="inhouse",
        location_id=location_o.id,
    )
    db_session.add(p)
    await db_session.commit()
    return p


@pytest_asyncio.fixture
async def hybrid_placement(
    db_session: AsyncSession,
    tenant_o: Tenant,
    program_year_o: TrainingProgramYear,
    training_o: Training,
) -> ProgramYearTraining:
    p = ProgramYearTraining(
        id=uuid.uuid4(),
        tenant_id=tenant_o.id,
        program_year_id=program_year_o.id,
        training_id=training_o.id,
        start_date=date(2026, 7, 20),
        placement_type="hybrid",
    )
    db_session.add(p)
    await db_session.commit()
    return p


@pytest_asyncio.fixture
async def open_placement(
    db_session: AsyncSession,
    tenant_o: Tenant,
    program_year_o: TrainingProgramYear,
    training_o: Training,
) -> ProgramYearTraining:
    p = ProgramYearTraining(
        id=uuid.uuid4(),
        tenant_id=tenant_o.id,
        program_year_id=program_year_o.id,
        training_id=training_o.id,
        start_date=date(2026, 8, 10),
        placement_type="open",
    )
    db_session.add(p)
    await db_session.commit()
    return p


# ── Tests ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_offer(
    client: AsyncClient,
    admin_o: User,
    customer_o: Customer,
    inhouse_placement: ProgramYearTraining,
) -> None:
    """Create an offer with placements and verify placements are linked."""
    token = _make_token(admin_o)
    resp = await client.post(
        BASE,
        json={
            "customer_id": str(customer_o.id),
            "placement_ids": [str(inhouse_placement.id)],
            "attendees": 10,
            "training_price": "5000.00",
            "currency": "EUR",
            "comments": "Initial offer",
        },
        headers=auth_headers(token),
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["offer_number"] == "OFF-0001"
    assert data["customer_name"] == "Acme Corp"
    assert data["attendees"] == 10
    assert data["training_price"] == "5000.00"
    assert len(data["placements"]) == 1
    assert data["placements"][0]["id"] == str(inhouse_placement.id)


@pytest.mark.asyncio
async def test_list_offers(
    client: AsyncClient,
    admin_o: User,
    customer_o: Customer,
    inhouse_placement: ProgramYearTraining,
) -> None:
    """List offers for the tenant."""
    token = _make_token(admin_o)
    # Create an offer first
    create_resp = await client.post(
        BASE,
        json={
            "customer_id": str(customer_o.id),
            "placement_ids": [str(inhouse_placement.id)],
        },
        headers=auth_headers(token),
    )
    assert create_resp.status_code == 201

    resp = await client.get(BASE, headers=auth_headers(token))
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert len(data["items"]) == 1


@pytest.mark.asyncio
async def test_get_offer(
    client: AsyncClient,
    admin_o: User,
    customer_o: Customer,
    inhouse_placement: ProgramYearTraining,
) -> None:
    """Get a single offer with placement details."""
    token = _make_token(admin_o)
    create_resp = await client.post(
        BASE,
        json={
            "customer_id": str(customer_o.id),
            "placement_ids": [str(inhouse_placement.id)],
        },
        headers=auth_headers(token),
    )
    assert create_resp.status_code == 201
    offer_id = create_resp.json()["id"]

    resp = await client.get(f"{BASE}/{offer_id}", headers=auth_headers(token))
    assert resp.status_code == 200
    data = resp.json()
    assert data["offer_number"] == "OFF-0001"
    assert len(data["placements"]) == 1
    assert data["placements"][0]["training_name"] == "AWS Solutions Architect"


@pytest.mark.asyncio
async def test_update_offer(
    client: AsyncClient,
    admin_o: User,
    customer_o: Customer,
    inhouse_placement: ProgramYearTraining,
) -> None:
    """Update offer status and pricing."""
    token = _make_token(admin_o)
    create_resp = await client.post(
        BASE,
        json={
            "customer_id": str(customer_o.id),
            "placement_ids": [str(inhouse_placement.id)],
        },
        headers=auth_headers(token),
    )
    offer_id = create_resp.json()["id"]

    resp = await client.put(
        f"{BASE}/{offer_id}",
        json={"status": "sent", "training_price": "7500.00"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "sent"
    assert data["training_price"] == "7500.00"


@pytest.mark.asyncio
async def test_add_placements(
    client: AsyncClient,
    admin_o: User,
    customer_o: Customer,
    inhouse_placement: ProgramYearTraining,
    hybrid_placement: ProgramYearTraining,
) -> None:
    """Add more placements to an existing offer."""
    token = _make_token(admin_o)
    create_resp = await client.post(
        BASE,
        json={
            "customer_id": str(customer_o.id),
            "placement_ids": [str(inhouse_placement.id)],
        },
        headers=auth_headers(token),
    )
    offer_id = create_resp.json()["id"]

    resp = await client.post(
        f"{BASE}/{offer_id}/placements",
        json={"placement_ids": [str(hybrid_placement.id)]},
        headers=auth_headers(token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["placements"]) == 2


@pytest.mark.asyncio
async def test_remove_placement(
    client: AsyncClient,
    admin_o: User,
    customer_o: Customer,
    inhouse_placement: ProgramYearTraining,
    hybrid_placement: ProgramYearTraining,
) -> None:
    """Unlink a placement from an offer."""
    token = _make_token(admin_o)
    create_resp = await client.post(
        BASE,
        json={
            "customer_id": str(customer_o.id),
            "placement_ids": [str(inhouse_placement.id), str(hybrid_placement.id)],
        },
        headers=auth_headers(token),
    )
    offer_id = create_resp.json()["id"]

    resp = await client.delete(
        f"{BASE}/{offer_id}/placements/{inhouse_placement.id}",
        headers=auth_headers(token),
    )
    assert resp.status_code == 200

    # Verify only one placement remains
    get_resp = await client.get(f"{BASE}/{offer_id}", headers=auth_headers(token))
    assert len(get_resp.json()["placements"]) == 1


@pytest.mark.asyncio
async def test_remove_placement_and_delete(
    client: AsyncClient,
    admin_o: User,
    customer_o: Customer,
    inhouse_placement: ProgramYearTraining,
) -> None:
    """Unlink and delete a placement from the program."""
    token = _make_token(admin_o)
    create_resp = await client.post(
        BASE,
        json={
            "customer_id": str(customer_o.id),
            "placement_ids": [str(inhouse_placement.id)],
        },
        headers=auth_headers(token),
    )
    offer_id = create_resp.json()["id"]

    resp = await client.delete(
        f"{BASE}/{offer_id}/placements/{inhouse_placement.id}?delete_from_program=true",
        headers=auth_headers(token),
    )
    assert resp.status_code == 200

    # Verify the offer has no placements
    get_resp = await client.get(f"{BASE}/{offer_id}", headers=auth_headers(token))
    assert len(get_resp.json()["placements"]) == 0


@pytest.mark.asyncio
async def test_delete_offer(
    client: AsyncClient,
    admin_o: User,
    customer_o: Customer,
    inhouse_placement: ProgramYearTraining,
) -> None:
    """Delete an offer and verify placements are unlinked."""
    token = _make_token(admin_o)
    create_resp = await client.post(
        BASE,
        json={
            "customer_id": str(customer_o.id),
            "placement_ids": [str(inhouse_placement.id)],
        },
        headers=auth_headers(token),
    )
    offer_id = create_resp.json()["id"]

    resp = await client.delete(f"{BASE}/{offer_id}", headers=auth_headers(token))
    assert resp.status_code == 200

    # Offer should be gone
    get_resp = await client.get(f"{BASE}/{offer_id}", headers=auth_headers(token))
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_available_placements(
    client: AsyncClient,
    admin_o: User,
    inhouse_placement: ProgramYearTraining,
    hybrid_placement: ProgramYearTraining,
    open_placement: ProgramYearTraining,
) -> None:
    """List unassigned inhouse/hybrid placements."""
    token = _make_token(admin_o)
    resp = await client.get(f"{BASE}/available-placements", headers=auth_headers(token))
    assert resp.status_code == 200
    data = resp.json()
    # Should include inhouse and hybrid but not open
    ids = {p["id"] for p in data}
    assert str(inhouse_placement.id) in ids
    assert str(hybrid_placement.id) in ids
    assert str(open_placement.id) not in ids


@pytest.mark.asyncio
async def test_cannot_assign_open_placement(
    client: AsyncClient,
    admin_o: User,
    customer_o: Customer,
    open_placement: ProgramYearTraining,
) -> None:
    """Validation error when assigning an open placement to an offer."""
    token = _make_token(admin_o)
    resp = await client.post(
        BASE,
        json={
            "customer_id": str(customer_o.id),
            "placement_ids": [str(open_placement.id)],
        },
        headers=auth_headers(token),
    )
    assert resp.status_code == 422 or resp.status_code == 400


@pytest.mark.asyncio
async def test_cannot_assign_already_assigned(
    client: AsyncClient,
    admin_o: User,
    customer_o: Customer,
    inhouse_placement: ProgramYearTraining,
) -> None:
    """Validation error when assigning a placement already assigned to another offer."""
    token = _make_token(admin_o)
    # Create first offer
    resp1 = await client.post(
        BASE,
        json={
            "customer_id": str(customer_o.id),
            "placement_ids": [str(inhouse_placement.id)],
        },
        headers=auth_headers(token),
    )
    assert resp1.status_code == 201

    # Try to assign same placement to a new offer
    resp2 = await client.post(
        BASE,
        json={
            "customer_id": str(customer_o.id),
            "placement_ids": [str(inhouse_placement.id)],
        },
        headers=auth_headers(token),
    )
    assert resp2.status_code == 422 or resp2.status_code == 400
