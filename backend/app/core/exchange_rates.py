"""Tenant exchange rate lookups.

The ``exchange_rates`` table is history-preserving — every edit is a new
row. "Current rate" = most recent ``effective_at`` for the triple
``(tenant_id, from_ccy, to_ccy)``. Invoices freeze the current rate at
issue time into ``Invoice.exchange_rate_used``.
"""

from __future__ import annotations

import logging
from decimal import Decimal, InvalidOperation
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.exchange_rate import ExchangeRate

logger = logging.getLogger(__name__)


async def get_current_rate(
    db: AsyncSession,
    tenant_id: UUID,
    from_ccy: str,
    to_ccy: str,
) -> Decimal | None:
    """Return the most recent rate for ``(tenant, from_ccy, to_ccy)`` or None."""
    if not from_ccy or not to_ccy or from_ccy == to_ccy:
        return None

    stmt = (
        select(ExchangeRate.rate)
        .where(
            ExchangeRate.tenant_id == tenant_id,
            ExchangeRate.from_ccy == from_ccy.upper(),
            ExchangeRate.to_ccy == to_ccy.upper(),
        )
        .order_by(ExchangeRate.effective_at.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


def coerce_rate(value: Any) -> Decimal | None:
    """Best-effort Decimal parse; returns None for empty/invalid input."""
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        logger.warning("ignoring unparseable exchange rate value: %r", value)
        return None


async def resolve_rate_for_freeze(
    db: AsyncSession,
    tenant_id: UUID,
    from_ccy: str | None,
    to_ccy: str | None,
    settings_fallback: Any = None,
) -> Decimal | None:
    """Resolve the rate to freeze on an invoice at issue time.

    Preference order:
    1. Most recent ``ExchangeRate`` row for the tenant + currency pair.
    2. Legacy settings fallback (``invoice_company_info.exchange_rate``
       or ``settings.invoice_exchange_rate``) — kept so tenants that
       never populated the new table continue to work unchanged.
    """
    if not from_ccy or not to_ccy:
        return coerce_rate(settings_fallback)

    current = await get_current_rate(db, tenant_id, from_ccy, to_ccy)
    if current is not None:
        return current
    return coerce_rate(settings_fallback)
