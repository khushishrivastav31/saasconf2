"""Invoice query helpers to reduce duplication."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import NotFoundError
from app.models.invoice import Invoice


async def get_invoice_with_events(
    db: AsyncSession,
    invoice_id: UUID,
    conference_id: UUID,
    tenant_id: UUID,
) -> Invoice:
    """Fetch invoice with events loaded, raise 404 if not found.

    Args:
        db: Database session
        invoice_id: Invoice ID
        conference_id: Conference ID (for scoping)
        tenant_id: Tenant ID (for multi-tenancy isolation)

    Returns:
        Invoice model with events relationship loaded

    Raises:
        NotFoundError: If invoice not found
    """
    result = await db.execute(
        select(Invoice)
        .where(
            Invoice.id == invoice_id,
            Invoice.conference_id == conference_id,
            Invoice.tenant_id == tenant_id,
            Invoice.is_active.is_(True),
        )
        .options(selectinload(Invoice.events))
    )
    invoice = result.scalar_one_or_none()

    if not invoice:
        raise NotFoundError(f"Invoice with ID '{invoice_id}' not found")

    return invoice


async def get_invoice_basic(
    db: AsyncSession,
    invoice_id: UUID,
    conference_id: UUID,
    tenant_id: UUID,
) -> Invoice:
    """Fetch invoice without relationships (for simple operations).

    Use this when you only need basic invoice fields and don't need events or other relationships.
    More efficient than get_invoice_with_events() when relationships aren't needed.

    Args:
        db: Database session
        invoice_id: Invoice ID
        conference_id: Conference ID (for scoping)
        tenant_id: Tenant ID (for multi-tenancy isolation)

    Returns:
        Invoice model without relationships loaded

    Raises:
        NotFoundError: If invoice not found
    """
    result = await db.execute(
        select(Invoice).where(
            Invoice.id == invoice_id,
            Invoice.conference_id == conference_id,
            Invoice.tenant_id == tenant_id,
            Invoice.is_active.is_(True),
        )
    )
    invoice = result.scalar_one_or_none()

    if not invoice:
        raise NotFoundError(f"Invoice with ID '{invoice_id}' not found")

    return invoice


async def refresh_invoice_with_events(
    db: AsyncSession,
    invoice_id: UUID,
) -> Invoice:
    """Re-query invoice with events after commit.

    Use this after db.commit() to get fresh data with relationships loaded.
    Safer than db.refresh() which can cause MissingGreenlet errors.

    Args:
        db: Database session
        invoice_id: Invoice ID

    Returns:
        Invoice model with events relationship loaded
    """
    result = await db.execute(select(Invoice).where(Invoice.id == invoice_id).options(selectinload(Invoice.events)))
    return result.scalar_one()
