"""Regression coverage for Cancel Registration.

Shape:
    - Happy path (active attendee → cancel) — invoice cancelled, credit note
      created with negated totals + related_invoice_id, attendee stays active,
      ``cancelled`` history event recorded.
    - Happy path (parked attendee → cancel) — same outcome, driven by the
      ``registration_id`` column added in migration 212.
    - Multi-attendee block (registration has >1 attendee → 400 pointing at
      the Invoices view).
    - Offer-origin block (attendee has an ``OfferAttendee`` row → 400).
    - Draft invoice block (not in CANCELLABLE_STATUSES → 400).
    - No resolvable registration block (parked with no registration_id on
      history → 400).
    - ``cancellable`` flag is exposed on the Attendee list response and
      flips appropriately.
    - Park endpoint persists ``registration_id`` on the history row.
"""

import os
import uuid
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, patch

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
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.core.security.pii_crypto import hash_email
from app.models.customer import Customer
from app.models.customer_offer import CustomerOffer
from app.models.location import Location
from app.models.module import Module, TenantModule
from app.models.offer_attendee import OfferAttendee
from app.models.tenant import Tenant
from app.models.training import Training
from app.models.training_attendee import TrainingAttendee
from app.models.training_attendee_history import TrainingAttendeeHistory
from app.models.training_invoice import TrainingInvoice
from app.models.training_program import ProgramYearTraining, TrainingProgramYear
from app.models.training_registration import TrainingRegistration, TrainingRegistrationAttendee
from app.models.user import User, UserRole
from tests.conftest import auth_headers


def _token(user: User) -> str:
    return create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role,
        modules=["trainings"],
    )


@pytest_asyncio.fixture
async def cx_tenant(db_session: AsyncSession) -> Tenant:
    """Tenant with accounting_email pre-set so the credit-note email path
    doesn't fire the PR #117 guard — we're testing cancellation, not the
    guard (covered elsewhere)."""
    t = Tenant(
        id=uuid.uuid4(),
        name="Cancel Tenant",
        slug=f"cancel-{uuid.uuid4().hex[:8]}",
        accounting_email="finance@test.example.com",
    )
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture
async def cx_admin(db_session: AsyncSession, cx_tenant: Tenant) -> User:
    mod = Module(id=uuid.uuid4(), name="Trainings", code="trainings", description="T", is_active=True)
    db_session.add(mod)
    await db_session.flush()
    db_session.add(TenantModule(id=uuid.uuid4(), tenant_id=cx_tenant.id, module_id=mod.id, is_enabled=True))
    u = User(
        id=uuid.uuid4(),
        tenant_id=cx_tenant.id,
        email=f"cx-admin-{uuid.uuid4().hex[:8]}@example.com",
        first_name="Cx",
        last_name="Admin",
        role=UserRole.TENANT_ADMIN.value,
        password_hash=hash_password("Password123!"),
        is_active=True,
    )
    db_session.add(u)
    await db_session.commit()
    return u


@pytest_asyncio.fixture
async def cx_placement(db_session: AsyncSession, cx_tenant: Tenant) -> ProgramYearTraining:
    tr = Training(id=uuid.uuid4(), tenant_id=cx_tenant.id, name="Cx Training", slug="cx-training", duration=2)
    loc = Location(id=uuid.uuid4(), tenant_id=cx_tenant.id, name="Berlin", code="BER")
    py = TrainingProgramYear(id=uuid.uuid4(), tenant_id=cx_tenant.id, year=2026)
    db_session.add_all([tr, loc, py])
    await db_session.flush()
    p = ProgramYearTraining(
        id=uuid.uuid4(),
        tenant_id=cx_tenant.id,
        program_year_id=py.id,
        training_id=tr.id,
        start_date=date(2026, 11, 10),
        placement_type="open",
        location_id=loc.id,
        is_active=True,
    )
    db_session.add(p)
    await db_session.commit()
    return p


async def _make_portal_booking(
    db: AsyncSession,
    tenant: Tenant,
    placement: ProgramYearTraining,
    *,
    email: str,
    first_name: str = "Alice",
    last_name: str = "Portal",
    invoice_status: str = "sent",
) -> tuple[TrainingAttendee, TrainingRegistration, TrainingInvoice]:
    """Build the public-portal shape: attendee + registration + bridge + invoice."""
    att = TrainingAttendee(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name=first_name,
        last_name=last_name,
        email=email,
        status="active",
    )
    db.add(att)
    reg = TrainingRegistration(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        placement_id=placement.id,
        status="paid",
        language="en",
        street="Main 1",
        postal_code="10117",
        city="Berlin",
        country="DE",
        contact_first_name=first_name,
        contact_last_name=last_name,
        contact_email=email,
        payment_method="bank_transfer",
    )
    db.add(reg)
    await db.flush()
    bridge = TrainingRegistrationAttendee(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        registration_id=reg.id,
        attendee_id=att.id,
        first_name=first_name,
        last_name=last_name,
        email=email,
        language="en",
    )
    db.add(bridge)
    inv = TrainingInvoice(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        training_registration_id=reg.id,
        invoice_number=f"INV-{uuid.uuid4().hex[:6].upper()}",
        template_type="bank_transfer",
        status=invoice_status,
        issue_date=date.today(),
        recipient_name=f"{first_name} {last_name}",
        recipient_email=email,
        line_items=[{"description": "Course", "quantity": 1, "unit_price": "1000.00", "total": "1000.00"}],
        subtotal=Decimal("1000.00"),
        tax_rate=Decimal("19.00"),
        tax_amount=Decimal("190.00"),
        total=Decimal("1190.00"),
        currency="EUR",
    )
    db.add(inv)
    await db.commit()
    await db.refresh(att)
    await db.refresh(reg)
    await db.refresh(inv)
    return att, reg, inv


@pytest.mark.asyncio
async def test_cancel_active_attendee_happy_path(
    client: AsyncClient,
    db_session: AsyncSession,
    cx_tenant: Tenant,
    cx_admin: User,
    cx_placement: ProgramYearTraining,
) -> None:
    att, reg, inv = await _make_portal_booking(db_session, cx_tenant, cx_placement, email="happy@test.com")

    with patch(
        "app.api.v1.trainings.attendees.cancellation.send_training_invoice_email",
        AsyncMock(return_value=True),
    ) as send_mock:
        resp = await client.post(
            f"/api/v1/trainings/attendees/{att.id}/cancel",
            json={"reason": "customer request"},
            headers=auth_headers(_token(cx_admin)),
        )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["attendee_status"] == "active"
    assert body["registration_id"] == str(reg.id)
    assert body["invoice_number"] == inv.invoice_number

    # Invoice flipped to cancelled
    await db_session.refresh(inv)
    assert inv.status == "cancelled"

    # Credit note exists with negated total + related_invoice_id
    cn_result = await db_session.execute(select(TrainingInvoice).where(TrainingInvoice.related_invoice_id == inv.id))
    credit_note = cn_result.scalar_one()
    assert credit_note.template_type == "credit_note"
    assert credit_note.total == -inv.total
    assert credit_note.invoice_number == body["credit_note_number"]

    # Registration flipped
    await db_session.refresh(reg)
    assert reg.status == "cancelled"

    # Bridge row removed
    bridge_count = await db_session.execute(
        select(TrainingRegistrationAttendee).where(TrainingRegistrationAttendee.registration_id == reg.id)
    )
    assert bridge_count.scalars().first() is None

    # Attendee still active
    await db_session.refresh(att)
    assert att.status == "active"

    # History event recorded
    hist = await db_session.execute(
        select(TrainingAttendeeHistory).where(
            TrainingAttendeeHistory.attendee_id == att.id,
            TrainingAttendeeHistory.event_type == "cancelled",
        )
    )
    hist_row = hist.scalar_one()
    assert hist_row.registration_id == reg.id
    assert inv.invoice_number in (hist_row.notes or "")
    assert credit_note.invoice_number in (hist_row.notes or "")

    # Credit-note email attempted
    assert send_mock.await_count == 1


@pytest.mark.asyncio
async def test_cancel_parked_attendee_uses_history_registration_id(
    client: AsyncClient,
    db_session: AsyncSession,
    cx_tenant: Tenant,
    cx_admin: User,
    cx_placement: ProgramYearTraining,
) -> None:
    """For a parked attendee, the bridge row is gone — cancel must resolve
    the registration from the ``parked`` history event's ``registration_id``."""
    att, reg, inv = await _make_portal_booking(db_session, cx_tenant, cx_placement, email="parked-happy@test.com")

    # Park via the endpoint so it populates history.registration_id.
    bridge_id = (
        await db_session.execute(
            select(TrainingRegistrationAttendee.id).where(TrainingRegistrationAttendee.attendee_id == att.id)
        )
    ).scalar_one()

    park_resp = await client.post(
        f"/api/v1/trainings/attendees/{att.id}/park",
        json={"source_type": "registration", "source_id": str(bridge_id), "reason": "pause"},
        headers=auth_headers(_token(cx_admin)),
    )
    assert park_resp.status_code == 200, park_resp.text

    # Confirm the park history row has registration_id
    parked_hist = (
        await db_session.execute(
            select(TrainingAttendeeHistory).where(
                TrainingAttendeeHistory.attendee_id == att.id,
                TrainingAttendeeHistory.event_type == "parked",
            )
        )
    ).scalar_one()
    assert parked_hist.registration_id == reg.id

    with patch(
        "app.api.v1.trainings.attendees.cancellation.send_training_invoice_email",
        AsyncMock(return_value=True),
    ):
        resp = await client.post(
            f"/api/v1/trainings/attendees/{att.id}/cancel",
            json={"reason": "parked-then-cancelled"},
            headers=auth_headers(_token(cx_admin)),
        )
    assert resp.status_code == 200, resp.text

    await db_session.refresh(att)
    assert att.status == "active"
    await db_session.refresh(inv)
    assert inv.status == "cancelled"


@pytest.mark.asyncio
async def test_cancel_blocked_for_multi_attendee_registration(
    client: AsyncClient,
    db_session: AsyncSession,
    cx_tenant: Tenant,
    cx_admin: User,
    cx_placement: ProgramYearTraining,
) -> None:
    att, reg, _ = await _make_portal_booking(db_session, cx_tenant, cx_placement, email="multi@test.com")
    # Add a second attendee to the same registration
    sibling = TrainingAttendee(
        id=uuid.uuid4(),
        tenant_id=cx_tenant.id,
        first_name="Sibling",
        last_name="B",
        email="sibling@test.com",
        status="active",
    )
    db_session.add(sibling)
    db_session.add(
        TrainingRegistrationAttendee(
            id=uuid.uuid4(),
            tenant_id=cx_tenant.id,
            registration_id=reg.id,
            attendee_id=sibling.id,
            first_name="Sibling",
            last_name="B",
            email="sibling@test.com",
            language="en",
        )
    )
    await db_session.commit()

    resp = await client.post(
        f"/api/v1/trainings/attendees/{att.id}/cancel",
        json={},
        headers=auth_headers(_token(cx_admin)),
    )
    assert resp.status_code == 400, resp.text
    assert "Invoices view" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_cancel_blocked_for_offer_origin(
    client: AsyncClient,
    db_session: AsyncSession,
    cx_tenant: Tenant,
    cx_admin: User,
    cx_placement: ProgramYearTraining,
) -> None:
    att, _, _ = await _make_portal_booking(db_session, cx_tenant, cx_placement, email="offer@test.com")
    # Plant an OfferAttendee row — origin is ambiguous; refuse.
    customer = Customer(id=uuid.uuid4(), tenant_id=cx_tenant.id, name="Customer Co")
    offer = CustomerOffer(
        id=uuid.uuid4(),
        tenant_id=cx_tenant.id,
        customer_id=customer.id,
        offer_number="OFF-OA",
        status="accepted",
    )
    db_session.add_all([customer, offer])
    await db_session.flush()
    db_session.add(
        OfferAttendee(
            id=uuid.uuid4(),
            tenant_id=cx_tenant.id,
            offer_id=offer.id,
            attendee_id=att.id,
            first_name=att.first_name,
            last_name=att.last_name,
            email=att.email,
        )
    )
    await db_session.commit()

    resp = await client.post(
        f"/api/v1/trainings/attendees/{att.id}/cancel",
        json={},
        headers=auth_headers(_token(cx_admin)),
    )
    assert resp.status_code == 400, resp.text
    assert "public portal" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_cancel_blocked_for_draft_invoice(
    client: AsyncClient,
    db_session: AsyncSession,
    cx_tenant: Tenant,
    cx_admin: User,
    cx_placement: ProgramYearTraining,
) -> None:
    att, _, _ = await _make_portal_booking(
        db_session, cx_tenant, cx_placement, email="draft@test.com", invoice_status="draft"
    )
    resp = await client.post(
        f"/api/v1/trainings/attendees/{att.id}/cancel",
        json={},
        headers=auth_headers(_token(cx_admin)),
    )
    assert resp.status_code == 400, resp.text
    assert "status 'draft'" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_cancel_blocked_when_no_resolvable_registration(
    client: AsyncClient,
    db_session: AsyncSession,
    cx_tenant: Tenant,
    cx_admin: User,
) -> None:
    """Active attendee with no TrainingRegistrationAttendee row at all → refuse."""
    att = TrainingAttendee(
        id=uuid.uuid4(),
        tenant_id=cx_tenant.id,
        first_name="Ghost",
        last_name="Attendee",
        email="ghost@test.com",
        status="active",
    )
    db_session.add(att)
    await db_session.commit()

    resp = await client.post(
        f"/api/v1/trainings/attendees/{att.id}/cancel",
        json={},
        headers=auth_headers(_token(cx_admin)),
    )
    assert resp.status_code == 400, resp.text
    assert "No public-portal registration" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_attendee_list_exposes_cancellable_flag(
    client: AsyncClient,
    db_session: AsyncSession,
    cx_tenant: Tenant,
    cx_admin: User,
    cx_placement: ProgramYearTraining,
) -> None:
    """cancellable == True for single-attendee sent-invoice portal booking."""
    await _make_portal_booking(db_session, cx_tenant, cx_placement, email="flagged@test.com")
    resp = await client.get("/api/v1/trainings/attendees", headers=auth_headers(_token(cx_admin)))
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 1
    assert items[0]["cancellable"] is True


@pytest.mark.asyncio
async def test_attendee_list_cancellable_false_for_ghost(
    client: AsyncClient,
    db_session: AsyncSession,
    cx_tenant: Tenant,
    cx_admin: User,
) -> None:
    """No portal booking → cancellable == False."""
    att = TrainingAttendee(
        id=uuid.uuid4(),
        tenant_id=cx_tenant.id,
        first_name="Flag",
        last_name="Ghost",
        email="flagghost@test.com",
        email_hash=hash_email("flagghost@test.com"),
        status="active",
    )
    db_session.add(att)
    await db_session.commit()
    resp = await client.get("/api/v1/trainings/attendees", headers=auth_headers(_token(cx_admin)))
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert items[0]["cancellable"] is False


@pytest.mark.asyncio
async def test_park_endpoint_persists_registration_id(
    client: AsyncClient,
    db_session: AsyncSession,
    cx_tenant: Tenant,
    cx_admin: User,
    cx_placement: ProgramYearTraining,
) -> None:
    """New behavior: park history row carries registration_id so Cancel can
    find the invoice later."""
    att, reg, _ = await _make_portal_booking(db_session, cx_tenant, cx_placement, email="park-reg@test.com")
    bridge_id = (
        await db_session.execute(
            select(TrainingRegistrationAttendee.id).where(TrainingRegistrationAttendee.attendee_id == att.id)
        )
    ).scalar_one()

    resp = await client.post(
        f"/api/v1/trainings/attendees/{att.id}/park",
        json={"source_type": "registration", "source_id": str(bridge_id), "reason": "pause"},
        headers=auth_headers(_token(cx_admin)),
    )
    assert resp.status_code == 200, resp.text

    hist = (
        await db_session.execute(
            select(TrainingAttendeeHistory).where(
                TrainingAttendeeHistory.attendee_id == att.id,
                TrainingAttendeeHistory.event_type == "parked",
            )
        )
    ).scalar_one()
    assert hist.registration_id == reg.id
