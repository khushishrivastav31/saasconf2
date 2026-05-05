"""End-to-end tests for the conference bulk-cancel-with-credit-note flow.

Conference-side counterpart to ``tests/trainings/test_bulk_cancel.py``.

Covers:

* Preview filters by ``originating_ip`` and excludes already-cancelled rows.
* Confirm cancels each matched invoice exactly once (with the per-row
  deduplication by ``billing_profile_id`` — a multi-attendee submission
  produces one credit note, not N).
* Confirm refuses with 400 if ``billing_email_pattern`` is set
  (the email column is PII-encrypted on the conference surface).
* Tenant-admin gate (regular user → 403).

Stripe + Resend side-effects are mocked at module level so the test does
not reach the network.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.models.booking import BookingOption
from app.models.conference import Conference
from app.models.invoice import Invoice
from app.models.registration import (
    BillingProfile,
    Registration,
    RegistrationMode,
    RegistrationStatus,
)
from app.models.tenant import Tenant
from app.models.user import User
from tests.conftest import _make_token, auth_headers

MIN_REASON = "bot burst from 2026-05-04 morning"  # >= 10 chars


def _url(conference_id: uuid.UUID, suffix: str) -> str:
    return f"/api/v1/conferences/{conference_id}/registrations/bulk-cancel/{suffix}"


def _admin_headers(user: User) -> dict[str, str]:
    return auth_headers(_make_token(user, modules=["registration", "conferences", "invoices"]))


# ─────────────────────────────────────────────────────────────────────────
# Seed helpers
# ─────────────────────────────────────────────────────────────────────────


async def _seed_booking_option(db: AsyncSession, conference: Conference) -> BookingOption:
    bo = BookingOption(
        id=uuid.uuid4(),
        tenant_id=conference.tenant_id,
        conference_id=conference.id,
        name="Day Pass",
        sort_order=1,
        is_active=True,
        attendance_type="in_person",
    )
    db.add(bo)
    await db.flush()
    return bo


async def _seed_registration_with_invoice(
    db: AsyncSession,
    conference: Conference,
    booking_option: BookingOption,
    *,
    contact_email: str,
    originating_ip: str | None,
    invoice_status: str = "sent",
    invoice_template: str = "bank_transfer",
) -> tuple[BillingProfile, Registration, Invoice]:
    bp = BillingProfile(
        id=uuid.uuid4(),
        tenant_id=conference.tenant_id,
        conference_id=conference.id,
        company_name="Test GmbH",
        street="1 Test St",
        postal_code="10115",
        city="Berlin",
        country="DE",
        contact_first_name="T",
        contact_last_name="U",
        contact_phone="+49301234567",
    )
    bp.contact_email = contact_email
    db.add(bp)
    await db.flush()

    reg = Registration(
        id=uuid.uuid4(),
        tenant_id=conference.tenant_id,
        conference_id=conference.id,
        billing_profile_id=bp.id,
        first_name="T",
        last_name="U",
        email=contact_email,
        phone="+49301234567",
        booking_option_id=booking_option.id,
        registration_mode=RegistrationMode.PORTAL.value,
        status=RegistrationStatus.INVOICED.value,
        originating_ip=originating_ip,
    )
    db.add(reg)
    await db.flush()

    invoice = Invoice(
        id=uuid.uuid4(),
        tenant_id=conference.tenant_id,
        conference_id=conference.id,
        invoice_number=f"INV-{uuid.uuid4().hex[:6]}",
        recipient_name="T U",
        recipient_address_line1="1 Test St",
        recipient_postal_code="10115",
        recipient_city="Berlin",
        recipient_country="DE",
        recipient_source_type="registration",
        recipient_source_id=bp.id,
        template_type=invoice_template,
        status=invoice_status,
        issue_date=date(2026, 5, 1),
        due_date=date(2026, 6, 1),
        line_items=[{"description": "Day Pass", "quantity": 1, "unit_price": "100.00", "total": "100.00"}],
        subtotal=Decimal("100.00"),
        tax_rate=Decimal("19.00"),
        tax_amount=Decimal("19.00"),
        total=Decimal("119.00"),
        currency="EUR",
    )
    invoice.recipient_email = contact_email
    db.add(invoice)
    await db.flush()
    return bp, reg, invoice


@pytest_asyncio.fixture
async def seeded_conf_regs(
    db_session: AsyncSession,
    conference: Conference,
) -> dict:
    """2 bot regs (same IP) + 1 real reg (different IP). Each has its own
    billing profile + invoice, so confirm should produce 2 credit notes
    when filtering by the bot IP.
    """
    booking_option = await _seed_booking_option(db_session, conference)
    bot1 = await _seed_registration_with_invoice(
        db_session,
        conference,
        booking_option,
        contact_email="bot1@spam.com",
        originating_ip="10.0.0.1",
    )
    bot2 = await _seed_registration_with_invoice(
        db_session,
        conference,
        booking_option,
        contact_email="bot2@spam.com",
        originating_ip="10.0.0.1",
    )
    real = await _seed_registration_with_invoice(
        db_session,
        conference,
        booking_option,
        contact_email="real@user.com",
        originating_ip="192.168.1.50",
    )
    await db_session.commit()
    return {"booking_option": booking_option, "bots": [bot1, bot2], "real": real}


@pytest_asyncio.fixture
async def conference_module_enabled(db_session: AsyncSession, conference: Conference, tenant: Tenant) -> Conference:
    """Ensure the ``registration`` and ``conferences`` modules are
    enabled for this tenant. The test admin token requests both."""
    from app.models.module import Module, TenantModule

    for code in ("registration", "conferences", "invoices"):
        existing = (await db_session.execute(select(Module).where(Module.code == code))).scalar_one_or_none()
        if existing is None:
            existing = Module(id=uuid.uuid4(), name=code.title(), code=code, description=code, is_active=True)
            db_session.add(existing)
            await db_session.flush()
        link = (
            await db_session.execute(
                select(TenantModule).where(
                    TenantModule.tenant_id == tenant.id,
                    TenantModule.module_id == existing.id,
                )
            )
        ).scalar_one_or_none()
        if link is None:
            db_session.add(
                TenantModule(
                    id=uuid.uuid4(),
                    tenant_id=tenant.id,
                    module_id=existing.id,
                    is_enabled=True,
                )
            )
    # Make sure portal is "enabled" enough that our path lookups work.
    conference.settings = {"public_registration_portal": {"enabled": True}}
    flag_modified(conference, "settings")
    await db_session.commit()
    await db_session.refresh(conference)
    return conference


@pytest.fixture(autouse=True)
def _mock_side_effects() -> Iterable[None]:
    """Stripe + email mocks. Each is patched at the call-site module."""
    with (
        patch(
            "app.api.v1.registrations.bulk_cancel.send_invoice_email",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "app.api.v1.registrations.bulk_cancel.deactivate_payment_link_for_invoice",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "app.api.v1.registrations.bulk_cancel.refund_payment",
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
    tenant_admin_user: User,
    conference_module_enabled: Conference,
    seeded_conf_regs: dict,
) -> None:
    res = await client.post(
        _url(conference_module_enabled.id, "preview"),
        headers=_admin_headers(tenant_admin_user),
        json={"originating_ip": "10.0.0.1", "reason": MIN_REASON},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total"] == 2
    assert body["truncated"] is False
    assert {it["billing_email"] for it in body["items"]} == {"bot1@spam.com", "bot2@spam.com"}


@pytest.mark.asyncio
async def test_billing_email_pattern_rejected_with_400(
    client: AsyncClient,
    tenant_admin_user: User,
    conference_module_enabled: Conference,
) -> None:
    """The conference filter cannot ILIKE-match the email column because
    it's PII-encrypted at rest. The endpoint refuses cleanly."""
    res = await client.post(
        _url(conference_module_enabled.id, "preview"),
        headers=_admin_headers(tenant_admin_user),
        json={"billing_email_pattern": "%@spam.com", "reason": MIN_REASON},
    )
    assert res.status_code == 400
    assert "PII-encrypted" in res.json()["detail"]


@pytest.mark.asyncio
async def test_confirm_flips_invoices_and_creates_credit_notes(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant_admin_user: User,
    conference_module_enabled: Conference,
    seeded_conf_regs: dict,
) -> None:
    # Capture IDs BEFORE the API call — afterwards the test session's
    # in-memory copies need a fresh load, and we want to query by the
    # stable UUIDs we know.
    bot_billing_profile_ids = [bot[0].id for bot in seeded_conf_regs["bots"]]
    real_billing_profile_id = seeded_conf_regs["real"][0].id

    res = await client.post(
        _url(conference_module_enabled.id, "confirm"),
        headers=_admin_headers(tenant_admin_user),
        json={"originating_ip": "10.0.0.1", "reason": MIN_REASON},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["cancelled"] == 2
    assert body["credit_notes_created"] == 2
    assert body["emails_sent"] == 2  # mocked send returns successfully

    # Verify DB state — originals are cancelled and credit notes exist.
    db_session.expire_all()
    invoices = (
        (
            await db_session.execute(
                select(Invoice).where(
                    Invoice.recipient_source_id.in_(bot_billing_profile_ids),
                )
            )
        )
        .unique()
        .scalars()
        .all()
    )

    cancelled_originals = [inv for inv in invoices if inv.template_type != "credit_note" and inv.status == "cancelled"]
    credit_notes = [inv for inv in invoices if inv.template_type == "credit_note"]
    assert len(cancelled_originals) == 2
    assert len(credit_notes) == 2

    # Real-user reg is untouched.
    real_invoices = (
        (await db_session.execute(select(Invoice).where(Invoice.recipient_source_id == real_billing_profile_id)))
        .unique()
        .scalars()
        .all()
    )
    assert all(inv.status != "cancelled" for inv in real_invoices)


@pytest.mark.asyncio
async def test_confirm_idempotent_on_rerun(
    client: AsyncClient,
    tenant_admin_user: User,
    conference_module_enabled: Conference,
    seeded_conf_regs: dict,
) -> None:
    body = {"originating_ip": "10.0.0.1", "reason": MIN_REASON}
    headers = _admin_headers(tenant_admin_user)

    first = await client.post(_url(conference_module_enabled.id, "confirm"), headers=headers, json=body)
    assert first.status_code == 200
    assert first.json()["cancelled"] == 2

    second = await client.post(_url(conference_module_enabled.id, "confirm"), headers=headers, json=body)
    assert second.status_code == 200
    assert second.json()["cancelled"] == 0
    assert second.json()["credit_notes_created"] == 0


@pytest.mark.asyncio
async def test_confirm_requires_tenant_admin(
    client: AsyncClient,
    regular_user: User,
    conference_module_enabled: Conference,
    seeded_conf_regs: dict,
) -> None:
    res = await client.post(
        _url(conference_module_enabled.id, "confirm"),
        headers=auth_headers(_make_token(regular_user, modules=["registration", "conferences", "invoices"])),
        json={"originating_ip": "10.0.0.1", "reason": MIN_REASON},
    )
    assert res.status_code == 403


# ─────────────────────────────────────────────────────────────────────────
# Parity tests: mirror the training-side coverage for the conference flow
# ─────────────────────────────────────────────────────────────────────────


async def _seed_attendee_on_billing_profile(
    db: AsyncSession,
    conference: Conference,
    booking_option: BookingOption,
    billing_profile: BillingProfile,
    *,
    contact_email: str,
    originating_ip: str | None = None,
) -> Registration:
    """Add a second/third attendee row sharing one BillingProfile (and
    therefore one Invoice) — the multi-attendee submission shape that the
    conference bulk-cancel orchestrator must dedupe."""
    reg = Registration(
        id=uuid.uuid4(),
        tenant_id=conference.tenant_id,
        conference_id=conference.id,
        billing_profile_id=billing_profile.id,
        first_name="Co",
        last_name="Attendee",
        email=contact_email,
        phone="+49301234567",
        booking_option_id=booking_option.id,
        registration_mode=RegistrationMode.PORTAL.value,
        status=RegistrationStatus.INVOICED.value,
        originating_ip=originating_ip,
    )
    db.add(reg)
    await db.flush()
    return reg


@pytest.mark.asyncio
async def test_confirm_dedupes_multi_attendee_by_billing_profile(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant_admin_user: User,
    conference_module_enabled: Conference,
) -> None:
    """3 registrations sharing one billing profile + one invoice produce
    exactly **one** credit note when bulk-cancelled — not three. This is
    the conference-specific wrinkle vs training's 1:1 invoice flow."""
    booking_option = await _seed_booking_option(db_session, conference_module_enabled)
    bp, _, _ = await _seed_registration_with_invoice(
        db_session,
        conference_module_enabled,
        booking_option,
        contact_email="primary@spam.com",
        originating_ip="10.0.0.42",
    )
    await _seed_attendee_on_billing_profile(
        db_session,
        conference_module_enabled,
        booking_option,
        bp,
        contact_email="coattendee1@spam.com",
        originating_ip="10.0.0.42",
    )
    await _seed_attendee_on_billing_profile(
        db_session,
        conference_module_enabled,
        booking_option,
        bp,
        contact_email="coattendee2@spam.com",
        originating_ip="10.0.0.42",
    )
    await db_session.commit()

    res = await client.post(
        _url(conference_module_enabled.id, "confirm"),
        headers=_admin_headers(tenant_admin_user),
        json={"originating_ip": "10.0.0.42", "reason": MIN_REASON},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["cancelled"] == 3
    # KEY ASSERTION: 3 attendees, 1 billing profile → 1 credit note (not 3).
    assert body["credit_notes_created"] == 1
    assert body["emails_sent"] == 1


@pytest.mark.asyncio
async def test_confirm_caps_at_max_bulk_cancel(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant_admin_user: User,
    conference_module_enabled: Conference,
) -> None:
    """Confirm refuses with 400 when the filter matches more than the
    cap. Patches MAX_BULK_CANCEL down to 2 so we can seed 3 rows instead
    of 501; the schema constant + endpoint logic both read the same module
    attribute, so a single patch covers both paths."""
    booking_option = await _seed_booking_option(db_session, conference_module_enabled)
    for i in range(3):
        await _seed_registration_with_invoice(
            db_session,
            conference_module_enabled,
            booking_option,
            contact_email=f"capped{i}@spam.com",
            originating_ip="10.99.99.99",
        )
    await db_session.commit()

    with patch("app.api.v1.registrations.bulk_cancel.MAX_BULK_CANCEL", 2):
        res = await client.post(
            _url(conference_module_enabled.id, "confirm"),
            headers=_admin_headers(tenant_admin_user),
            json={"originating_ip": "10.99.99.99", "reason": MIN_REASON},
        )
    assert res.status_code == 400
    assert "Narrow the filter" in res.json()["detail"]


@pytest.mark.asyncio
async def test_confirm_with_registration_ids_only_cancels_subset(
    client: AsyncClient,
    tenant_admin_user: User,
    conference_module_enabled: Conference,
    seeded_conf_regs: dict,
) -> None:
    """An explicit ``registration_ids`` list narrows the cancellation to
    those rows only. This is the API behind the per-row checkboxes in the
    preview UI — the filter still bounds reachability, but the admin can
    untick rows they want to spare."""
    bot1_reg_id = seeded_conf_regs["bots"][0][1].id

    res = await client.post(
        _url(conference_module_enabled.id, "confirm"),
        headers=_admin_headers(tenant_admin_user),
        json={
            "originating_ip": "10.0.0.1",
            "registration_ids": [str(bot1_reg_id)],
            "reason": MIN_REASON,
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["cancelled"] == 1
    assert body["credit_notes_created"] == 1


@pytest.mark.asyncio
async def test_originating_ip_cleared_on_paid_transition(
    db_session: AsyncSession,
    conference: Conference,
) -> None:
    """GDPR data minimization: the IP captured at registration time is
    nulled the moment the row's status flips to ``paid`` — same listener
    as the training side. Mirrors the training-bulk-cancel test."""
    booking_option = await _seed_booking_option(db_session, conference)
    _, reg, _ = await _seed_registration_with_invoice(
        db_session,
        conference,
        booking_option,
        contact_email="paid@user.com",
        originating_ip="10.0.0.5",
    )
    await db_session.commit()
    assert reg.originating_ip == "10.0.0.5"

    reg.status = RegistrationStatus.PAID.value
    await db_session.commit()
    await db_session.refresh(reg)
    assert reg.originating_ip is None


@pytest.mark.asyncio
async def test_originating_ip_cleared_on_cancelled_transition(
    db_session: AsyncSession,
    conference: Conference,
) -> None:
    """Same retention rule on the cancellation transition. Covers the
    bulk-cancel orchestrator (which flips status to ``cancelled``)."""
    booking_option = await _seed_booking_option(db_session, conference)
    _, reg, _ = await _seed_registration_with_invoice(
        db_session,
        conference,
        booking_option,
        contact_email="cx@user.com",
        originating_ip="10.0.0.6",
    )
    await db_session.commit()
    assert reg.originating_ip == "10.0.0.6"

    reg.status = RegistrationStatus.CANCELLED.value
    await db_session.commit()
    await db_session.refresh(reg)
    assert reg.originating_ip is None


@pytest.mark.asyncio
async def test_originating_ip_preserved_on_non_terminal_status(
    db_session: AsyncSession,
    conference: Conference,
) -> None:
    """Sanity: only ``paid`` and ``cancelled`` are terminal. Edits to
    other fields on a still-pending registration must NOT clear the IP."""
    booking_option = await _seed_booking_option(db_session, conference)
    _, reg, _ = await _seed_registration_with_invoice(
        db_session,
        conference,
        booking_option,
        contact_email="pending@user.com",
        originating_ip="10.0.0.7",
    )
    # Flip from INVOICED → REGISTERED_PENDING_INVOICE — non-terminal both ways.
    reg.status = RegistrationStatus.REGISTERED_PENDING_INVOICE.value
    await db_session.commit()
    await db_session.refresh(reg)
    assert reg.originating_ip == "10.0.0.7"
