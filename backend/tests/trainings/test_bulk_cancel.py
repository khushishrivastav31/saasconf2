"""End-to-end tests for the training bulk-cancel-with-credit-note flow.

Covers:

- preview returns only the rows that match the filter, excludes
  already-cancelled, and is read-only (does not mutate state).
- confirm flips status on every matching registration + builds one credit
  note per (with ``related_invoice_id`` linking back), runs idempotently
  when re-issued against the same filter, and refuses when the filter
  matches more than ``MAX_BULK_CANCEL``.
- only tenant admins can call confirm.

Fixtures seed via direct ORM inserts (training fixtures are tenant +
admin + non-admin; we set up the placement/training/invoice/registration
inline in each test). Stripe + email side-effects are mocked at module
level so tests don't reach the network.
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from typing import Iterable
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
from app.models.training_invoice import TrainingInvoice
from app.models.training_program import ProgramYearTraining, TrainingProgramYear
from app.models.training_registration import TrainingRegistration, TrainingRegistrationAttendee
from app.models.user import User
from tests.conftest import auth_headers
from tests.trainings.conftest import training_admin_token

BASE = "/api/v1/trainings/registrations"
MIN_REASON = "bot burst from 2026-05-01 morning"  # >= 10 chars


# ─────────────────────────────────────────────────────────────────────────
# Seed helpers
# ─────────────────────────────────────────────────────────────────────────


async def _seed_placement(
    db: AsyncSession, tenant: Tenant
) -> ProgramYearTraining:
    """Minimal placement so registrations have a valid foreign key target."""
    # Tenant.accounting_email is required by send_training_invoice_email,
    # but the email is mocked out in these tests — leave default.
    training = Training(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="Bulk Test Training",
        slug=f"bulk-{uuid.uuid4().hex[:6]}",
        regular_price=Decimal("100.00"),
        currency="EUR",
        is_active=True,
    )
    year = TrainingProgramYear(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        year=2026,
        status="published",
    )
    db.add_all([training, year])
    await db.flush()
    placement = ProgramYearTraining(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        program_year_id=year.id,
        training_id=training.id,
        start_date=date(2026, 6, 1),
        placement_type="open",
    )
    db.add(placement)
    await db.flush()
    return placement


async def _seed_registration(
    db: AsyncSession,
    tenant: Tenant,
    placement: ProgramYearTraining,
    *,
    contact_email: str,
    originating_ip: str | None,
    status: str = "registered",
    invoice_status: str = "sent",
    invoice_template: str = "bank_transfer",
) -> tuple[TrainingRegistration, TrainingInvoice, TrainingAttendee]:
    """Insert a registration + its invoice + a single attendee with the
    bridge row. Returns the three objects for the caller to inspect."""
    reg = TrainingRegistration(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        placement_id=placement.id,
        status=status,
        contact_first_name="Test",
        contact_last_name="User",
        contact_email=contact_email,
        street="1 Test St",
        postal_code="10115",
        city="Berlin",
        country="DE",
        payment_method=invoice_template,
        subtotal=Decimal("100.00"),
        vat_amount=Decimal("19.00"),
        total=Decimal("119.00"),
        currency="EUR",
        originating_ip=originating_ip,
    )
    db.add(reg)
    await db.flush()

    invoice = TrainingInvoice(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        training_registration_id=reg.id,
        invoice_number=f"TR-{uuid.uuid4().hex[:6]}",
        template_type=invoice_template,
        status=invoice_status,
        issue_date=date(2026, 5, 1),
        due_date=date(2026, 6, 1),
        recipient_name="Test User",
        recipient_email=contact_email,
        payment_method=invoice_template,
        line_items=[
            {"description": "Test", "quantity": 1, "unit_price": "100.00", "total": "100.00"}
        ],
        subtotal=Decimal("100.00"),
        tax_rate=Decimal("19.00"),
        tax_amount=Decimal("19.00"),
        total=Decimal("119.00"),
        currency="EUR",
    )
    db.add(invoice)
    await db.flush()

    att = TrainingAttendee(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Test",
        last_name="User",
        email=contact_email,
        status="active",
    )
    db.add(att)
    await db.flush()

    db.add(
        TrainingRegistrationAttendee(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            registration_id=reg.id,
            attendee_id=att.id,
            first_name="Test",
            last_name="User",
            email=contact_email,
        )
    )
    await db.flush()
    return reg, invoice, att


@pytest_asyncio.fixture
async def seeded_three_regs(
    db_session: AsyncSession,
    training_tenant: Tenant,
) -> dict:
    """Seed: 2 registrations from the bot IP + 1 from a real user."""
    placement = await _seed_placement(db_session, training_tenant)
    bot1 = await _seed_registration(
        db_session, training_tenant, placement,
        contact_email="bot1@spam.com", originating_ip="10.0.0.1",
    )
    bot2 = await _seed_registration(
        db_session, training_tenant, placement,
        contact_email="bot2@spam.com", originating_ip="10.0.0.1",
    )
    real = await _seed_registration(
        db_session, training_tenant, placement,
        contact_email="real@user.com", originating_ip="192.168.1.50",
    )
    await db_session.commit()
    return {"placement": placement, "bots": [bot1, bot2], "real": real}


# Module-level mocks: every test in this file mocks the email + Stripe
# side-effects. The orchestrator runs them after commit, so a mock that
# resolves to ``None`` is enough — we assert call counts where it matters.
@pytest.fixture(autouse=True)
def _mock_side_effects() -> Iterable[None]:
    with (
        patch(
            "app.api.v1.trainings.bulk_cancel.send_training_invoice_email",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "app.api.v1.trainings.bulk_cancel.deactivate_training_payment_link",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "app.api.v1.trainings.bulk_cancel.refund_training_payment",
            new=AsyncMock(return_value={"refund_id": "re_test", "status": "succeeded"}),
        ),
    ):
        yield


# ─────────────────────────────────────────────────────────────────────────
# Tests
# ─────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_preview_filters_by_originating_ip(
    client: AsyncClient,
    training_admin: User,
    seeded_three_regs: dict,
) -> None:
    """Preview narrows to the bot IP and reports the expected groupings."""
    headers = auth_headers(training_admin_token(training_admin))
    res = await client.post(
        f"{BASE}/bulk-cancel/preview",
        headers=headers,
        json={"originating_ip": "10.0.0.1", "reason": MIN_REASON},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total"] == 2
    assert body["truncated"] is False
    assert {item["billing_email"] for item in body["items"]} == {"bot1@spam.com", "bot2@spam.com"}
    assert body["by_originating_ip"] == [{"key": "10.0.0.1", "count": 2}]
    # Total credit-note value: 2 × 119.00
    assert Decimal(body["total_credit_note_value"]) == Decimal("238.00")


@pytest.mark.asyncio
async def test_preview_excludes_already_cancelled_rows(
    client: AsyncClient,
    db_session: AsyncSession,
    training_admin: User,
    training_tenant: Tenant,
) -> None:
    """A previously-cancelled registration must not show up in preview."""
    placement = await _seed_placement(db_session, training_tenant)
    await _seed_registration(
        db_session, training_tenant, placement,
        contact_email="active@spam.com", originating_ip="10.0.0.2",
    )
    cancelled_reg, _, _ = await _seed_registration(
        db_session, training_tenant, placement,
        contact_email="cancelled@spam.com", originating_ip="10.0.0.2",
    )
    cancelled_reg.status = "cancelled"
    await db_session.commit()

    headers = auth_headers(training_admin_token(training_admin))
    res = await client.post(
        f"{BASE}/bulk-cancel/preview",
        headers=headers,
        json={"originating_ip": "10.0.0.2", "reason": MIN_REASON},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 1
    assert body["items"][0]["billing_email"] == "active@spam.com"


@pytest.mark.asyncio
async def test_confirm_flips_status_and_creates_credit_notes(
    client: AsyncClient,
    db_session: AsyncSession,
    training_admin: User,
    seeded_three_regs: dict,
) -> None:
    """Each matching registration → status=cancelled, original invoice
    cancelled, exactly one credit note created with related_invoice_id
    pointing back. The non-matching real-user reg is untouched."""
    bot_reg_ids = [r[0].id for r in seeded_three_regs["bots"]]
    real_reg_id = seeded_three_regs["real"][0].id

    headers = auth_headers(training_admin_token(training_admin))
    res = await client.post(
        f"{BASE}/bulk-cancel/confirm",
        headers=headers,
        json={"originating_ip": "10.0.0.1", "reason": MIN_REASON},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["cancelled"] == 2
    assert body["credit_notes_created"] == 2
    assert body["emails_sent"] == 2  # mocked send returns successfully
    assert body["errors"] == []

    # Verify DB state. The orchestrator commits via a different session;
    # expire the test session's identity-map cache so the next read pulls
    # fresh rows instead of returning the stale in-memory copies.
    db_session.expire_all()
    regs = (
        await db_session.execute(
            select(TrainingRegistration).where(TrainingRegistration.id.in_(bot_reg_ids))
        )
    ).unique().scalars().all()
    assert len(regs) == 2
    assert all(r.status == "cancelled" for r in regs), [r.status for r in regs]

    # Original invoices flipped to cancelled
    orig_invoices = (
        await db_session.execute(
            select(TrainingInvoice).where(
                TrainingInvoice.training_registration_id.in_(bot_reg_ids),
                TrainingInvoice.template_type != "credit_note",
            )
        )
    ).scalars().all()
    assert len(orig_invoices) == 2
    assert all(inv.status == "cancelled" for inv in orig_invoices)

    # Credit notes exist with related_invoice_id linking back
    credit_notes = (
        await db_session.execute(
            select(TrainingInvoice).where(
                TrainingInvoice.training_registration_id.in_(bot_reg_ids),
                TrainingInvoice.template_type == "credit_note",
            )
        )
    ).scalars().all()
    assert len(credit_notes) == 2
    cn_related = {cn.related_invoice_id for cn in credit_notes}
    orig_ids = {inv.id for inv in orig_invoices}
    assert cn_related == orig_ids
    # Negated totals
    assert all(cn.total == Decimal("-119.00") for cn in credit_notes)
    # Reason propagated to credit-note notes
    assert all(MIN_REASON in (cn.notes or "") for cn in credit_notes)

    # Non-matching real-user registration is untouched
    real = await db_session.get(TrainingRegistration, real_reg_id)
    assert real is not None and real.status != "cancelled"


@pytest.mark.asyncio
async def test_confirm_idempotent_on_rerun(
    client: AsyncClient,
    db_session: AsyncSession,
    training_admin: User,
    seeded_three_regs: dict,
) -> None:
    """Re-running the same filter after a successful confirm cancels
    zero rows (the default ``status != cancelled`` guard excludes them)."""
    headers = auth_headers(training_admin_token(training_admin))
    body = {"originating_ip": "10.0.0.1", "reason": MIN_REASON}

    first = await client.post(f"{BASE}/bulk-cancel/confirm", headers=headers, json=body)
    assert first.status_code == 200
    assert first.json()["cancelled"] == 2

    second = await client.post(f"{BASE}/bulk-cancel/confirm", headers=headers, json=body)
    assert second.status_code == 200
    assert second.json()["cancelled"] == 0
    assert second.json()["credit_notes_created"] == 0


@pytest.mark.asyncio
async def test_confirm_caps_at_max_bulk_cancel(
    client: AsyncClient,
    db_session: AsyncSession,
    training_admin: User,
    training_tenant: Tenant,
) -> None:
    """When the filter matches more than the cap, confirm refuses with 400.

    Patches ``MAX_BULK_CANCEL`` down to 2 so the test can seed 3 rows
    instead of 501. Both the schema constant and the value used in the
    endpoint logic come from the same module attribute, so a single patch
    covers both paths.
    """
    placement = await _seed_placement(db_session, training_tenant)
    for i in range(3):
        await _seed_registration(
            db_session, training_tenant, placement,
            contact_email=f"capped{i}@spam.com", originating_ip="10.0.0.99",
        )
    await db_session.commit()

    headers = auth_headers(training_admin_token(training_admin))
    with patch("app.api.v1.trainings.bulk_cancel.MAX_BULK_CANCEL", 2):
        res = await client.post(
            f"{BASE}/bulk-cancel/confirm",
            headers=headers,
            json={"originating_ip": "10.0.0.99", "reason": MIN_REASON},
        )
    assert res.status_code == 400
    assert "Narrow the filter" in res.json()["detail"]


@pytest.mark.asyncio
async def test_confirm_requires_tenant_admin(
    client: AsyncClient,
    training_non_admin: User,
    seeded_three_regs: dict,
) -> None:
    """A regular (non-admin) user cannot bulk-cancel."""
    headers = auth_headers(training_admin_token(training_non_admin))
    res = await client.post(
        f"{BASE}/bulk-cancel/confirm",
        headers=headers,
        json={"originating_ip": "10.0.0.1", "reason": MIN_REASON},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_confirm_with_registration_ids_only_cancels_subset(
    client: AsyncClient,
    db_session: AsyncSession,
    training_admin: User,
    seeded_three_regs: dict,
) -> None:
    """An explicit ``registration_ids`` list narrows the cancellation to
    those rows only — the other matches stay intact.

    This is the API behind the per-row checkboxes in the preview UI: the
    filter still bounds reachability (a forged id outside the filter
    won't be cancelled), but the admin can untick rows they want to spare.
    """
    bot1_id = seeded_three_regs["bots"][0][0].id
    bot2_id = seeded_three_regs["bots"][1][0].id

    headers = auth_headers(training_admin_token(training_admin))
    res = await client.post(
        f"{BASE}/bulk-cancel/confirm",
        headers=headers,
        json={
            "originating_ip": "10.0.0.1",
            "registration_ids": [str(bot1_id)],
            "reason": MIN_REASON,
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["cancelled"] == 1
    assert body["credit_notes_created"] == 1

    db_session.expire_all()
    bot1 = await db_session.get(TrainingRegistration, bot1_id)
    bot2 = await db_session.get(TrainingRegistration, bot2_id)
    assert bot1 is not None and bot1.status == "cancelled"
    assert bot2 is not None and bot2.status != "cancelled"


@pytest.mark.asyncio
async def test_originating_ip_cleared_on_paid_transition(
    db_session: AsyncSession,
    training_tenant: Tenant,
) -> None:
    """GDPR data minimization: the IP captured at registration time is
    nulled the moment the row's status transitions to ``paid`` — no cron,
    no time window. The listener at app/db/listeners/originating_ip_
    retention.py enforces this on every flush.
    """
    placement = await _seed_placement(db_session, training_tenant)
    reg, _, _ = await _seed_registration(
        db_session,
        training_tenant,
        placement,
        contact_email="paid@user.com",
        originating_ip="10.0.0.5",
        status="registered",
    )
    assert reg.originating_ip == "10.0.0.5"

    reg.status = "paid"
    await db_session.commit()
    await db_session.refresh(reg)
    assert reg.originating_ip is None, "IP must be cleared when status flips to paid"


@pytest.mark.asyncio
async def test_originating_ip_cleared_on_cancelled_transition(
    db_session: AsyncSession,
    training_tenant: Tenant,
) -> None:
    """Same retention rule on the cancellation transition. Covers both
    the per-attendee single-cancel path AND the bulk-cancel orchestrator
    in this same PR — they all flow through the listener.
    """
    placement = await _seed_placement(db_session, training_tenant)
    reg, _, _ = await _seed_registration(
        db_session,
        training_tenant,
        placement,
        contact_email="cx@user.com",
        originating_ip="10.0.0.6",
        status="registered",
    )
    assert reg.originating_ip == "10.0.0.6"

    reg.status = "cancelled"
    await db_session.commit()
    await db_session.refresh(reg)
    assert reg.originating_ip is None, "IP must be cleared when status flips to cancelled"


@pytest.mark.asyncio
async def test_originating_ip_preserved_on_non_terminal_status(
    db_session: AsyncSession,
    training_tenant: Tenant,
) -> None:
    """Sanity: only ``paid`` and ``cancelled`` are terminal. Edits to
    other fields on a still-pending registration must NOT touch the IP.
    """
    placement = await _seed_placement(db_session, training_tenant)
    reg, _, _ = await _seed_registration(
        db_session,
        training_tenant,
        placement,
        contact_email="pending@user.com",
        originating_ip="10.0.0.7",
        status="registered",
    )
    reg.notes = "edited a non-status field"
    await db_session.commit()
    await db_session.refresh(reg)
    assert reg.originating_ip == "10.0.0.7"


@pytest.mark.asyncio
async def test_confirm_registration_ids_outside_filter_are_ignored(
    client: AsyncClient,
    db_session: AsyncSession,
    training_admin: User,
    seeded_three_regs: dict,
) -> None:
    """A forged ``registration_ids`` list that names a row OUTSIDE the
    filter must NOT cancel that row. The filter is the safety net.
    """
    real_reg_id = seeded_three_regs["real"][0].id  # different IP

    headers = auth_headers(training_admin_token(training_admin))
    res = await client.post(
        f"{BASE}/bulk-cancel/confirm",
        headers=headers,
        json={
            "originating_ip": "10.0.0.1",  # bot IP
            "registration_ids": [str(real_reg_id)],  # but the real-user reg
            "reason": MIN_REASON,
        },
    )
    assert res.status_code == 200
    assert res.json()["cancelled"] == 0  # filter excludes the real-user IP

    db_session.expire_all()
    real = await db_session.get(TrainingRegistration, real_reg_id)
    assert real is not None and real.status != "cancelled"
