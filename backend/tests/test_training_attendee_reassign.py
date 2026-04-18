"""Tests for parking-lot reassignment edge cases.

The happy path (parked → reassigned with full history) is covered in
``test_training_invoice_no_refund.py``. This file focuses on edge cases
that broke in production — e.g. parked attendees whose park history is
missing or unrecoverable (source_id points nowhere), where the old
registration cannot be located.

Historical bug (2026-04-17): when ``find_old_registration`` returned
None, ``create_new_registration`` passed ``None`` for ``street`` /
``postal_code`` / ``city`` / ``country``, which are NOT NULL on
``training_registrations`` — the request 500'd with a
``NotNullViolationError``. The fix makes those fields fall back to the
empty string so the admin can fill them in after reassignment.
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.module import Module, TenantModule
from app.models.tenant import Tenant
from app.models.training import Training
from app.models.training_attendee import TrainingAttendee
from app.models.training_attendee_history import TrainingAttendeeHistory
from app.models.training_invoice import TrainingInvoice
from app.models.training_program import ProgramYearTraining, TrainingProgramYear
from app.models.training_registration import TrainingRegistration, TrainingRegistrationAttendee
from app.models.user import User
from tests.conftest import _make_token, auth_headers

BASE = "/api/v1/trainings"


@pytest_asyncio.fixture()
async def parked_without_history(db_session: AsyncSession, tenant: Tenant, tenant_admin_user: User) -> dict:
    """A parked attendee with no recoverable park history + a target placement."""
    db = db_session

    m = Module(id=uuid.uuid4(), name="Trainings", code="trainings", description="", is_active=True)
    db.add(m)
    await db.flush()
    db.add(TenantModule(id=uuid.uuid4(), tenant_id=tenant.id, module_id=m.id, is_enabled=True))
    await db.flush()

    training = Training(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="Orphan Training",
        slug=f"orphan-training-{uuid.uuid4().hex[:6]}",
        regular_price=Decimal("500.00"),
    )
    db.add(training)
    await db.flush()

    year = TrainingProgramYear(id=uuid.uuid4(), tenant_id=tenant.id, year=2026)
    db.add(year)
    await db.flush()

    placement = ProgramYearTraining(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        program_year_id=year.id,
        training_id=training.id,
        start_date=date(2026, 10, 1),
        placement_type="open",
    )
    db.add(placement)
    await db.flush()

    # Parked central attendee with NO history rows — simulates attendees
    # parked before park-history tracking existed, or corrupted history.
    att = TrainingAttendee(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Orphan",
        last_name="Attendee",
        email="orphan@test.com",
        status="parked",
    )
    db.add(att)
    await db.commit()
    await db.close()

    token = _make_token(tenant_admin_user, modules=["trainings"])
    return {"attendee": att, "placement": placement, "tenant": tenant, "token": token}


@pytest.mark.asyncio
async def test_reassign_parked_attendee_without_park_history(
    client: AsyncClient,
    parked_without_history: dict,
    db_session: AsyncSession,
) -> None:
    """Reassigning a parked attendee with no recoverable park history must not 500.

    Regression guard for the NotNullViolationError on
    ``training_registrations.street`` that occurred when
    ``old_registration`` was None.
    """
    data = parked_without_history

    with patch(
        "app.core.training_registration_emails.send_training_invoice_email",
        new_callable=AsyncMock,
    ):
        response = await client.post(
            f"{BASE}/attendees/{data['attendee'].id}/reassign",
            json={"placement_id": str(data["placement"].id)},
            headers=auth_headers(data["token"]),
        )

    assert response.status_code == 200, response.text
    result = response.json()
    assert result["status"] == "active"

    new_reg_id = uuid.UUID(result["new_registration_id"])
    new_reg = (
        await db_session.execute(select(TrainingRegistration).where(TrainingRegistration.id == new_reg_id))
    ).scalar_one()

    # NOT NULL columns must be populated (empty string is fine — admin fills in later).
    assert new_reg.street is not None
    assert new_reg.postal_code is not None
    assert new_reg.city is not None
    assert new_reg.country is not None
    # Contact info falls back to the attendee's own details.
    assert new_reg.contact_first_name == "Orphan"
    assert new_reg.contact_last_name == "Attendee"
    assert new_reg.contact_email == "orphan@test.com"


# ── keep_invoice flow ────────────────────────────────────────────────────────


@pytest_asyncio.fixture()
async def parked_with_invoice(db_session: AsyncSession, tenant: Tenant, tenant_admin_user: User) -> dict:
    """A parked attendee with a recoverable park history + a live paid invoice + a target placement.

    The registration attendee has been deleted (as happens on park), so the old registration is
    empty — this is the single-attendee scenario where keep_invoice can safely reuse it.
    """
    db = db_session

    m = Module(id=uuid.uuid4(), name="Trainings", code="trainings", description="", is_active=True)
    db.add(m)
    await db.flush()
    db.add(TenantModule(id=uuid.uuid4(), tenant_id=tenant.id, module_id=m.id, is_enabled=True))
    await db.flush()

    training = Training(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="Test Training",
        slug=f"keep-inv-{uuid.uuid4().hex[:6]}",
        regular_price=Decimal("800.00"),
    )
    db.add(training)
    await db.flush()

    year = TrainingProgramYear(id=uuid.uuid4(), tenant_id=tenant.id, year=2026)
    db.add(year)
    await db.flush()

    placement_old = ProgramYearTraining(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        program_year_id=year.id,
        training_id=training.id,
        start_date=date(2026, 6, 1),
        placement_type="open",
    )
    placement_new = ProgramYearTraining(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        program_year_id=year.id,
        training_id=training.id,
        start_date=date(2026, 11, 1),
        placement_type="open",
    )
    db.add_all([placement_old, placement_new])
    await db.flush()

    registration = TrainingRegistration(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        placement_id=placement_old.id,
        status="paid",
        contact_first_name="John",
        contact_last_name="Doe",
        contact_email="john-keep@test.com",
        street="Teststr. 1",
        postal_code="10115",
        city="Berlin",
        country="DE",
        payment_method="bank_transfer",
        subtotal=Decimal("800.00"),
        vat_amount=Decimal("152.00"),
        total=Decimal("952.00"),
        currency="EUR",
    )
    db.add(registration)
    await db.flush()

    invoice = TrainingInvoice(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        training_registration_id=registration.id,
        invoice_number=f"TR-KEEP-{uuid.uuid4().hex[:4]}",
        template_type="bank_transfer",
        status="paid",
        issue_date=date(2026, 5, 1),
        due_date=date(2026, 6, 1),
        recipient_name="John Doe",
        recipient_email="john-keep@test.com",
        payment_method="bank_transfer",
        line_items=[
            {"description": "Test Training (1 attendee)", "quantity": 1, "unit_price": "800.00", "total": "800.00"}
        ],
        subtotal=Decimal("800.00"),
        tax_rate=Decimal("19.00"),
        tax_amount=Decimal("152.00"),
        total=Decimal("952.00"),
        currency="EUR",
    )
    db.add(invoice)
    await db.flush()

    att = TrainingAttendee(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="John",
        last_name="Doe",
        email="john-keep@test.com",
        status="parked",
    )
    db.add(att)
    await db.flush()

    db.add(
        TrainingAttendeeHistory(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            attendee_id=att.id,
            event_type="parked",
            placement_id=placement_old.id,
            source_type="registration",
            source_id=registration.id,
        )
    )
    await db.commit()
    await db.close()

    token = _make_token(tenant_admin_user, modules=["trainings"])
    return {
        "attendee": att,
        "placement_old": placement_old,
        "placement_new": placement_new,
        "registration": registration,
        "invoice": invoice,
        "tenant": tenant,
        "token": token,
    }


@pytest.mark.asyncio
async def test_reassign_keep_invoice_does_not_touch_invoice(
    client: AsyncClient,
    parked_with_invoice: dict,
    db_session: AsyncSession,
) -> None:
    """keep_invoice=True: attendee moves to new placement; old invoice is untouched, no new invoice, no credit note."""
    data = parked_with_invoice

    with patch(
        "app.core.training_registration_emails.send_training_invoice_email",
        new_callable=AsyncMock,
    ) as mock_email:
        response = await client.post(
            f"{BASE}/attendees/{data['attendee'].id}/reassign",
            json={
                "placement_id": str(data["placement_new"].id),
                "keep_invoice": True,
            },
            headers=auth_headers(data["token"]),
        )

    assert response.status_code == 200, response.text
    result = response.json()

    assert result["status"] == "active"
    assert result["cancelled_invoice"] is None
    assert result["credit_note_id"] is None
    assert result["new_invoice_id"] is None
    assert result["kept_invoice_id"] == str(data["invoice"].id)

    # No new-invoice email sent in keep_invoice mode
    mock_email.assert_not_awaited()

    # Invoice row is unchanged: still "paid", same number, still attached to a registration
    invoice = (
        await db_session.execute(select(TrainingInvoice).where(TrainingInvoice.id == data["invoice"].id))
    ).scalar_one()
    assert invoice.status == "paid"
    assert invoice.invoice_number == data["invoice"].invoice_number
    assert invoice.training_registration_id is not None

    # Only one invoice exists for this tenant — no replacement, no credit note
    all_invoices = (
        (await db_session.execute(select(TrainingInvoice).where(TrainingInvoice.tenant_id == data["tenant"].id)))
        .scalars()
        .all()
    )
    assert len(all_invoices) == 1

    # The registration now points to the new placement (single-attendee reg was reused)
    reg = (
        await db_session.execute(
            select(TrainingRegistration).where(TrainingRegistration.id == invoice.training_registration_id)
        )
    ).scalar_one()
    assert reg.placement_id == data["placement_new"].id

    # Attendee is linked to the registration on the new placement
    reg_att = (
        await db_session.execute(
            select(TrainingRegistrationAttendee).where(
                TrainingRegistrationAttendee.registration_id == reg.id,
                TrainingRegistrationAttendee.attendee_id == data["attendee"].id,
            )
        )
    ).scalar_one()
    assert reg_att.email == "john-keep@test.com"


@pytest.mark.asyncio
async def test_reassign_without_keep_invoice_still_cancels_and_reissues(
    client: AsyncClient,
    parked_with_invoice: dict,
    db_session: AsyncSession,
) -> None:
    """Default (keep_invoice omitted/False): old invoice is cancelled, credit note + new invoice created."""
    data = parked_with_invoice

    with patch(
        "app.core.training_registration_emails.send_training_invoice_email",
        new_callable=AsyncMock,
    ):
        response = await client.post(
            f"{BASE}/attendees/{data['attendee'].id}/reassign",
            json={"placement_id": str(data["placement_new"].id)},
            headers=auth_headers(data["token"]),
        )

    assert response.status_code == 200, response.text
    result = response.json()

    assert result["cancelled_invoice"] == str(data["invoice"].id)
    assert result["credit_note_id"] is not None
    assert result["new_invoice_id"] is not None
    assert result["kept_invoice_id"] is None

    old_invoice = (
        await db_session.execute(select(TrainingInvoice).where(TrainingInvoice.id == data["invoice"].id))
    ).scalar_one()
    assert old_invoice.status == "cancelled"


# ── deactivate / reactivate attendee from parking lot ───────────────────────


@pytest_asyncio.fixture()
async def simple_parked_attendee(db_session: AsyncSession, tenant: Tenant, tenant_admin_user: User) -> dict:
    """Minimal fixture: a parked attendee with tenant + admin token. No placement, no history."""
    db = db_session

    m = Module(id=uuid.uuid4(), name="Trainings", code="trainings", description="", is_active=True)
    db.add(m)
    await db.flush()
    db.add(TenantModule(id=uuid.uuid4(), tenant_id=tenant.id, module_id=m.id, is_enabled=True))
    await db.flush()

    att = TrainingAttendee(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Parked",
        last_name="Person",
        email="parked-person@test.com",
        status="parked",
    )
    db.add(att)
    await db.commit()
    await db.close()

    token = _make_token(tenant_admin_user, modules=["trainings"])
    return {"attendee": att, "tenant": tenant, "token": token}


@pytest.mark.asyncio
async def test_deactivate_parked_attendee_marks_inactive_and_records_history(
    client: AsyncClient,
    simple_parked_attendee: dict,
    db_session: AsyncSession,
) -> None:
    """POST /attendees/{id}/deactivate: parked → inactive with 'deactivated' history event."""
    data = simple_parked_attendee

    response = await client.post(
        f"{BASE}/attendees/{data['attendee'].id}/deactivate",
        json={},
        headers=auth_headers(data["token"]),
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "inactive"

    refreshed = (
        await db_session.execute(select(TrainingAttendee).where(TrainingAttendee.id == data["attendee"].id))
    ).scalar_one()
    assert refreshed.status == "inactive"

    events = (
        (
            await db_session.execute(
                select(TrainingAttendeeHistory).where(TrainingAttendeeHistory.attendee_id == data["attendee"].id)
            )
        )
        .scalars()
        .all()
    )
    assert any(e.event_type == "deactivated" for e in events)


@pytest.mark.asyncio
async def test_deactivate_rejects_non_parked_attendee(
    client: AsyncClient,
    simple_parked_attendee: dict,
    db_session: AsyncSession,
) -> None:
    """Only parked attendees can be deactivated — active → 422."""
    data = simple_parked_attendee

    # Flip to active first
    att = (
        await db_session.execute(select(TrainingAttendee).where(TrainingAttendee.id == data["attendee"].id))
    ).scalar_one()
    att.status = "active"
    await db_session.commit()

    response = await client.post(
        f"{BASE}/attendees/{data['attendee'].id}/deactivate",
        json={},
        headers=auth_headers(data["token"]),
    )
    assert response.status_code == 422
    assert "parked" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_reactivate_inactive_attendee_restores_active_status(
    client: AsyncClient,
    simple_parked_attendee: dict,
    db_session: AsyncSession,
) -> None:
    """POST /attendees/{id}/reactivate: inactive → active with 'reactivated' history event."""
    data = simple_parked_attendee

    # Deactivate first via endpoint
    deactivate_res = await client.post(
        f"{BASE}/attendees/{data['attendee'].id}/deactivate",
        json={},
        headers=auth_headers(data["token"]),
    )
    assert deactivate_res.status_code == 200

    # Now reactivate
    response = await client.post(
        f"{BASE}/attendees/{data['attendee'].id}/reactivate",
        headers=auth_headers(data["token"]),
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "active"

    events = (
        (
            await db_session.execute(
                select(TrainingAttendeeHistory).where(TrainingAttendeeHistory.attendee_id == data["attendee"].id)
            )
        )
        .scalars()
        .all()
    )
    assert any(e.event_type == "reactivated" for e in events)


@pytest.mark.asyncio
async def test_reactivate_rejects_parked_attendee(
    client: AsyncClient,
    simple_parked_attendee: dict,
) -> None:
    """Only inactive attendees can be reactivated — parked (without a dead portal) → 422."""
    data = simple_parked_attendee

    response = await client.post(
        f"{BASE}/attendees/{data['attendee'].id}/reactivate",
        headers=auth_headers(data["token"]),
    )
    assert response.status_code == 422
    assert "inactive" in response.json()["detail"].lower()


# ── effective-status: parked attendee + deactivated portal user → "inactive" ─


@pytest_asyncio.fixture()
async def parked_attendee_with_dead_portal(db_session: AsyncSession, tenant: Tenant, tenant_admin_user: User) -> dict:
    """A parked attendee whose portal account has been deactivated (historical pre-cascade state)."""
    from app.models.portal_user import PortalUser

    db = db_session

    m = Module(id=uuid.uuid4(), name="Trainings", code="trainings", description="", is_active=True)
    db.add(m)
    await db.flush()
    db.add(TenantModule(id=uuid.uuid4(), tenant_id=tenant.id, module_id=m.id, is_enabled=True))
    await db.flush()

    pu = PortalUser(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        email=f"dead-portal-{uuid.uuid4().hex[:6]}@test.com",
        first_name="Dead",
        last_name="Portal",
        is_active=False,
    )
    db.add(pu)
    await db.flush()

    att = TrainingAttendee(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name=pu.first_name,
        last_name=pu.last_name,
        email=pu.email,
        status="parked",
        portal_user_id=pu.id,
    )
    db.add(att)
    await db.commit()
    await db.close()

    token = _make_token(tenant_admin_user, modules=["trainings"])
    return {"attendee": att, "portal_user": pu, "tenant": tenant, "token": token}


@pytest.mark.asyncio
async def test_list_reports_parked_with_dead_portal_as_inactive(
    client: AsyncClient,
    parked_attendee_with_dead_portal: dict,
) -> None:
    """GET /attendees?status=inactive must return attendees whose portal was deactivated before the cascade existed."""
    data = parked_attendee_with_dead_portal

    res = await client.get(f"{BASE}/attendees?status=inactive", headers=auth_headers(data["token"]))
    assert res.status_code == 200
    items = res.json()["items"]
    row = next((i for i in items if i["id"] == str(data["attendee"].id)), None)
    assert row is not None, "attendee with deactivated portal should appear under inactive filter"
    assert row["status"] == "inactive"


@pytest.mark.asyncio
async def test_parking_lot_excludes_parked_with_dead_portal(
    client: AsyncClient,
    parked_attendee_with_dead_portal: dict,
) -> None:
    """GET /attendees?status=parked must not leak attendees whose portal user is deactivated."""
    data = parked_attendee_with_dead_portal

    res = await client.get(f"{BASE}/attendees?status=parked", headers=auth_headers(data["token"]))
    assert res.status_code == 200
    items = res.json()["items"]
    assert all(i["id"] != str(data["attendee"].id) for i in items)


@pytest.mark.asyncio
async def test_reactivate_parked_with_dead_portal_activates_both(
    client: AsyncClient,
    parked_attendee_with_dead_portal: dict,
    db_session: AsyncSession,
) -> None:
    """Clicking Reactivate on a parked attendee whose portal was disabled re-enables the portal user AND sets status=active (not parked)."""
    from app.models.portal_user import PortalUser

    data = parked_attendee_with_dead_portal

    res = await client.post(
        f"{BASE}/attendees/{data['attendee'].id}/reactivate",
        headers=auth_headers(data["token"]),
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "active"

    pu = (await db_session.execute(select(PortalUser).where(PortalUser.id == data["portal_user"].id))).scalar_one()
    assert pu.is_active is True

    # Reactivation pulls the user OUT of the parking lot (it does not send them back in).
    lot = await client.get(f"{BASE}/attendees?status=parked", headers=auth_headers(data["token"]))
    items = lot.json()["items"]
    assert all(i["id"] != str(data["attendee"].id) for i in items)
