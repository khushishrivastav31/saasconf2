"""Tests for ExchangeRate model, rate lookup, and invoice rate freeze."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exchange_rates import (
    coerce_rate,
    get_current_rate,
    resolve_rate_for_freeze,
)
from app.models.conference import Conference
from app.models.exchange_rate import ExchangeRate
from app.models.invoice import Invoice
from app.models.tenant import Tenant
from app.services.invoice_service import assign_invoice_number_and_mark_sent

# ─── helpers ────────────────────────────────────────────────────────────


async def _make_rate(
    db: AsyncSession,
    tenant_id,
    *,
    from_ccy: str,
    to_ccy: str,
    rate: str,
    effective_at: datetime | None = None,
) -> ExchangeRate:
    row = ExchangeRate(
        tenant_id=tenant_id,
        from_ccy=from_ccy,
        to_ccy=to_ccy,
        rate=Decimal(rate),
        effective_at=effective_at or datetime.now(UTC),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def _make_invoice(
    db: AsyncSession,
    *,
    tenant: Tenant,
    conference: Conference,
    currency: str = "EUR",
) -> Invoice:
    inv = Invoice(
        id=uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        template_type="bank_transfer",
        status="draft",
        recipient_name="Acme Ltd",
        currency=currency,
        subtotal=Decimal("100.00"),
        tax_amount=Decimal("19.00"),
        total=Decimal("119.00"),
    )
    db.add(inv)
    await db.commit()
    await db.refresh(inv)
    return inv


# ─── coerce_rate ────────────────────────────────────────────────────────


class TestCoerceRate:
    def test_none_returns_none(self) -> None:
        assert coerce_rate(None) is None

    def test_empty_string_returns_none(self) -> None:
        assert coerce_rate("") is None

    def test_numeric_string(self) -> None:
        assert coerce_rate("1.2345") == Decimal("1.2345")

    def test_float(self) -> None:
        assert coerce_rate(1.5) == Decimal("1.5")

    def test_unparseable_returns_none(self) -> None:
        assert coerce_rate("not-a-number") is None


# ─── get_current_rate ───────────────────────────────────────────────────


class TestGetCurrentRate:
    @pytest.mark.asyncio
    async def test_returns_none_when_no_rows(self, db_session: AsyncSession, tenant: Tenant) -> None:
        assert await get_current_rate(db_session, tenant.id, "EUR", "USD") is None

    @pytest.mark.asyncio
    async def test_returns_rate_for_pair(self, db_session: AsyncSession, tenant: Tenant) -> None:
        await _make_rate(db_session, tenant.id, from_ccy="EUR", to_ccy="USD", rate="1.10")
        result = await get_current_rate(db_session, tenant.id, "EUR", "USD")
        assert result == Decimal("1.10")

    @pytest.mark.asyncio
    async def test_picks_most_recent(self, db_session: AsyncSession, tenant: Tenant) -> None:
        now = datetime.now(UTC)
        await _make_rate(
            db_session,
            tenant.id,
            from_ccy="EUR",
            to_ccy="USD",
            rate="1.00",
            effective_at=now - timedelta(days=10),
        )
        await _make_rate(
            db_session,
            tenant.id,
            from_ccy="EUR",
            to_ccy="USD",
            rate="1.15",
            effective_at=now - timedelta(days=1),
        )
        await _make_rate(
            db_session,
            tenant.id,
            from_ccy="EUR",
            to_ccy="USD",
            rate="1.10",
            effective_at=now - timedelta(days=5),
        )
        result = await get_current_rate(db_session, tenant.id, "EUR", "USD")
        assert result == Decimal("1.15")

    @pytest.mark.asyncio
    async def test_other_pair_isolated(self, db_session: AsyncSession, tenant: Tenant) -> None:
        await _make_rate(db_session, tenant.id, from_ccy="EUR", to_ccy="USD", rate="1.10")
        await _make_rate(db_session, tenant.id, from_ccy="EUR", to_ccy="GBP", rate="0.85")
        assert await get_current_rate(db_session, tenant.id, "EUR", "USD") == Decimal("1.10")
        assert await get_current_rate(db_session, tenant.id, "EUR", "GBP") == Decimal("0.85")

    @pytest.mark.asyncio
    async def test_same_currency_returns_none(self, db_session: AsyncSession, tenant: Tenant) -> None:
        assert await get_current_rate(db_session, tenant.id, "EUR", "EUR") is None


# ─── resolve_rate_for_freeze ────────────────────────────────────────────


class TestResolveRateForFreeze:
    @pytest.mark.asyncio
    async def test_prefers_exchange_rate_over_settings(self, db_session: AsyncSession, tenant: Tenant) -> None:
        await _make_rate(db_session, tenant.id, from_ccy="EUR", to_ccy="USD", rate="1.20")
        result = await resolve_rate_for_freeze(
            db_session,
            tenant_id=tenant.id,
            from_ccy="EUR",
            to_ccy="USD",
            settings_fallback="9.99",
        )
        assert result == Decimal("1.20")

    @pytest.mark.asyncio
    async def test_falls_back_to_settings(self, db_session: AsyncSession, tenant: Tenant) -> None:
        result = await resolve_rate_for_freeze(
            db_session,
            tenant_id=tenant.id,
            from_ccy="EUR",
            to_ccy="USD",
            settings_fallback="1.08",
        )
        assert result == Decimal("1.08")

    @pytest.mark.asyncio
    async def test_no_rate_and_no_fallback_returns_none(self, db_session: AsyncSession, tenant: Tenant) -> None:
        result = await resolve_rate_for_freeze(
            db_session,
            tenant_id=tenant.id,
            from_ccy="EUR",
            to_ccy="USD",
            settings_fallback=None,
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_missing_currency_uses_fallback(self, db_session: AsyncSession, tenant: Tenant) -> None:
        assert await resolve_rate_for_freeze(
            db_session,
            tenant_id=tenant.id,
            from_ccy=None,
            to_ccy="USD",
            settings_fallback="1.07",
        ) == Decimal("1.07")


# ─── assign_invoice_number_and_mark_sent — freeze behaviour ──────────────


class TestAssignInvoiceNumberFreezesRate:
    @pytest.mark.asyncio
    async def test_freezes_current_rate_at_issue(
        self,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
    ) -> None:
        conference.currency = "EUR"
        conference.settings = {"invoice_company_info": {"second_currency": "USD"}}
        db_session.add(conference)
        await _make_rate(db_session, tenant.id, from_ccy="EUR", to_ccy="USD", rate="1.12")
        await db_session.commit()

        invoice = await _make_invoice(db_session, tenant=tenant, conference=conference)
        user_id = uuid4()

        await assign_invoice_number_and_mark_sent(db_session, invoice, conference, tenant.id, user_id)

        assert invoice.status == "sent"
        assert invoice.exchange_rate_used == Decimal("1.120000")

    @pytest.mark.asyncio
    async def test_falls_back_to_settings_rate(
        self,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
    ) -> None:
        conference.currency = "EUR"
        conference.settings = {"invoice_company_info": {"second_currency": "USD", "exchange_rate": "1.05"}}
        db_session.add(conference)
        await db_session.commit()

        invoice = await _make_invoice(db_session, tenant=tenant, conference=conference)

        await assign_invoice_number_and_mark_sent(db_session, invoice, conference, tenant.id, uuid4())
        assert invoice.exchange_rate_used == Decimal("1.050000")

    @pytest.mark.asyncio
    async def test_no_second_currency_leaves_rate_none(
        self,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
    ) -> None:
        conference.currency = "EUR"
        conference.settings = {}
        db_session.add(conference)
        await db_session.commit()

        invoice = await _make_invoice(db_session, tenant=tenant, conference=conference)

        await assign_invoice_number_and_mark_sent(db_session, invoice, conference, tenant.id, uuid4())
        assert invoice.exchange_rate_used is None

    @pytest.mark.asyncio
    async def test_preserves_preset_rate(
        self,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
    ) -> None:
        """If an invoice already has a rate, don't overwrite it at send time."""
        conference.currency = "EUR"
        conference.settings = {"invoice_company_info": {"second_currency": "USD"}}
        db_session.add(conference)
        await _make_rate(db_session, tenant.id, from_ccy="EUR", to_ccy="USD", rate="1.50")
        await db_session.commit()

        invoice = await _make_invoice(db_session, tenant=tenant, conference=conference)
        invoice.exchange_rate_used = Decimal("0.99")
        db_session.add(invoice)
        await db_session.commit()

        await assign_invoice_number_and_mark_sent(db_session, invoice, conference, tenant.id, uuid4())
        assert invoice.exchange_rate_used == Decimal("0.99")
