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
    # Fresh offer has no linked invoices — frontend uses this to enable Delete.
    assert data["invoice_count"] == 0


@pytest.mark.asyncio
async def test_offer_invoice_count_reflects_linked_invoices(
    client: AsyncClient,
    db_session: "AsyncSession",
    admin_o: User,
    tenant_o: "Tenant",
    customer_o: Customer,
    inhouse_placement: ProgramYearTraining,
) -> None:
    """invoice_count is populated from training_invoices.offer_id — drives the
    Delete Offer button's disabled state in the UI."""
    from decimal import Decimal

    from app.models.training_invoice import TrainingInvoice

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

    # Attach an invoice to the offer
    import uuid as _uuid
    from datetime import date as _date

    db_session.add(
        TrainingInvoice(
            id=_uuid.uuid4(),
            tenant_id=tenant_o.id,
            offer_id=_uuid.UUID(offer_id),
            invoice_number="TR-OFF-1",
            template_type="bank_transfer",
            status="sent",
            issue_date=_date.today(),
            recipient_name="Acme",
            recipient_email="billing@acme.test",
            line_items=[{"description": "Course", "quantity": 1, "unit_price": "100", "total": "100"}],
            subtotal=Decimal("100"),
            total=Decimal("100"),
            currency="EUR",
        )
    )
    await db_session.commit()

    # Both list + single-get report invoice_count >= 1
    list_resp = await client.get(BASE, headers=auth_headers(token))
    assert list_resp.status_code == 200
    assert list_resp.json()["items"][0]["invoice_count"] == 1

    get_resp = await client.get(f"{BASE}/{offer_id}", headers=auth_headers(token))
    assert get_resp.status_code == 200
    assert get_resp.json()["invoice_count"] == 1


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
    """List available placements — all types when no filter."""
    token = _make_token(admin_o)
    resp = await client.get(f"{BASE}/available-placements", headers=auth_headers(token))
    assert resp.status_code == 200
    data = resp.json()
    ids = {p["id"] for p in data}
    # All types should be included (inhouse unassigned, hybrid, open)
    assert str(inhouse_placement.id) in ids
    assert str(hybrid_placement.id) in ids
    assert str(open_placement.id) in ids


@pytest.mark.asyncio
async def test_available_placements_filtered_by_type(
    client: AsyncClient,
    admin_o: User,
    inhouse_placement: ProgramYearTraining,
    hybrid_placement: ProgramYearTraining,
    open_placement: ProgramYearTraining,
) -> None:
    """Filter available placements by type."""
    token = _make_token(admin_o)
    # Inhouse filter: only inhouse (not hybrid, not open)
    resp = await client.get(f"{BASE}/available-placements?type=inhouse", headers=auth_headers(token))
    assert resp.status_code == 200
    ids = {p["id"] for p in resp.json()}
    assert str(inhouse_placement.id) in ids
    assert str(open_placement.id) not in ids

    # Open filter: open + hybrid
    resp = await client.get(f"{BASE}/available-placements?type=open", headers=auth_headers(token))
    assert resp.status_code == 200
    ids = {p["id"] for p in resp.json()}
    assert str(open_placement.id) in ids
    assert str(hybrid_placement.id) in ids
    assert str(inhouse_placement.id) not in ids


@pytest.mark.asyncio
async def test_can_assign_open_placement(
    client: AsyncClient,
    admin_o: User,
    customer_o: Customer,
    open_placement: ProgramYearTraining,
) -> None:
    """Open placements can be assigned to offers (shared)."""
    token = _make_token(admin_o)
    resp = await client.post(
        BASE,
        json={
            "customer_id": str(customer_o.id),
            "offer_type": "open",
            "placement_ids": [str(open_placement.id)],
        },
        headers=auth_headers(token),
    )
    assert resp.status_code == 201


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


# ── Invoiced amount + numbers (Offer Management dashboard) ────────────────


def _make_invoice(
    *,
    tenant_id: uuid.UUID,
    offer_id: uuid.UUID,
    number: str,
    total: str,
    template_type: str = "bank_transfer",
    status: str = "sent",
):
    """Construct a TrainingInvoice with the minimum required NOT NULL fields."""
    from decimal import Decimal as _Decimal

    from app.models.training_invoice import TrainingInvoice

    return TrainingInvoice(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        offer_id=offer_id,
        invoice_number=number,
        template_type=template_type,
        status=status,
        issue_date=date.today(),
        recipient_name="Acme",
        recipient_email="billing@acme.test",
        line_items=[{"description": "Course", "quantity": 1, "unit_price": total, "total": total}],
        subtotal=_Decimal(total),
        total=_Decimal(total),
        currency="EUR",
    )


@pytest.mark.asyncio
async def test_offer_response_carries_invoice_numbers_and_total(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_o: User,
    tenant_o: Tenant,
    customer_o: Customer,
    inhouse_placement: ProgramYearTraining,
) -> None:
    """List + single-get expose invoice_numbers + invoiced_total for accounting visibility."""
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
    offer_id = uuid.UUID(create_resp.json()["id"])

    db_session.add(_make_invoice(tenant_id=tenant_o.id, offer_id=offer_id, number="TR-OFF-100", total="1500"))
    db_session.add(_make_invoice(tenant_id=tenant_o.id, offer_id=offer_id, number="TR-OFF-101", total="500"))
    await db_session.commit()

    list_resp = await client.get(BASE, headers=auth_headers(token))
    assert list_resp.status_code == 200
    item = list_resp.json()["items"][0]
    assert item["invoice_count"] == 2
    assert sorted(item["invoice_numbers"]) == ["TR-OFF-100", "TR-OFF-101"]
    assert len(item["invoice_ids"]) == 2
    assert float(item["invoiced_total"]) == 2000.0

    get_resp = await client.get(f"{BASE}/{offer_id}", headers=auth_headers(token))
    assert get_resp.status_code == 200
    detail = get_resp.json()
    assert detail["invoice_count"] == 2
    assert sorted(detail["invoice_numbers"]) == ["TR-OFF-100", "TR-OFF-101"]
    assert float(detail["invoiced_total"]) == 2000.0


@pytest.mark.asyncio
async def test_offer_invoiced_excludes_cancelled_and_credit_notes(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_o: User,
    tenant_o: Tenant,
    customer_o: Customer,
    inhouse_placement: ProgramYearTraining,
) -> None:
    """Cancelled invoices and credit notes do not contribute to invoiced_total."""
    token = _make_token(admin_o)
    create_resp = await client.post(
        BASE,
        json={
            "customer_id": str(customer_o.id),
            "placement_ids": [str(inhouse_placement.id)],
        },
        headers=auth_headers(token),
    )
    offer_id = uuid.UUID(create_resp.json()["id"])

    db_session.add(_make_invoice(tenant_id=tenant_o.id, offer_id=offer_id, number="TR-A", total="1000"))
    db_session.add(
        _make_invoice(tenant_id=tenant_o.id, offer_id=offer_id, number="TR-B-CANCELLED", total="800", status="cancelled")
    )
    db_session.add(
        _make_invoice(
            tenant_id=tenant_o.id, offer_id=offer_id, number="TR-C-CREDIT", total="-500", template_type="credit_note"
        )
    )
    await db_session.commit()

    list_resp = await client.get(BASE, headers=auth_headers(token))
    item = list_resp.json()["items"][0]
    assert item["invoice_numbers"] == ["TR-A"]
    assert float(item["invoiced_total"]) == 1000.0
    # invoice_count on the response counts only active invoices (matches the totals)
    assert item["invoice_count"] == 1


@pytest.mark.asyncio
async def test_offer_stats_invoiced_per_status_and_total(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_o: User,
    tenant_o: Tenant,
    customer_o: Customer,
    inhouse_placement: ProgramYearTraining,
    hybrid_placement: ProgramYearTraining,
) -> None:
    """The /offers/stats endpoint reports invoiced totals per offer status + grand total."""
    token = _make_token(admin_o)

    # Offer 1 (will be accepted, 1 invoice for 5000)
    o1 = await client.post(
        BASE,
        json={
            "customer_id": str(customer_o.id),
            "placement_ids": [str(inhouse_placement.id)],
            "training_price": "5000",
        },
        headers=auth_headers(token),
    )
    o1_id = uuid.UUID(o1.json()["id"])
    await client.put(
        f"{BASE}/{o1_id}",
        json={"status": "accepted"},
        headers=auth_headers(token),
    )

    # Offer 2 (draft, no invoice) — uses hybrid_placement so it doesn't collide with inhouse
    await client.post(
        BASE,
        json={
            "customer_id": str(customer_o.id),
            "placement_ids": [str(hybrid_placement.id)],
            "training_price": "2000",
        },
        headers=auth_headers(token),
    )

    db_session.add(_make_invoice(tenant_id=tenant_o.id, offer_id=o1_id, number="TR-S-1", total="5000"))
    # Cancelled invoice on the same accepted offer — must NOT count
    db_session.add(
        _make_invoice(
            tenant_id=tenant_o.id, offer_id=o1_id, number="TR-S-2-CANCELLED", total="999", status="cancelled"
        )
    )
    await db_session.commit()

    resp = await client.get(f"{BASE}/stats", headers=auth_headers(admin_o.id and _make_token(admin_o)))
    assert resp.status_code == 200
    data = resp.json()

    assert data["by_status"]["accepted"]["invoiced"] == 5000.0
    assert data["by_status"]["draft"]["invoiced"] == 0.0
    assert data["total_invoiced"] == 5000.0
