"""Helper functions for invoice event logging."""

from decimal import Decimal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentUser
from app.core.security.pii_crypto import read_pii
from app.models.invoice_event import InvoiceEvent, InvoiceEventType  # noqa: F401
from app.models.user import User


async def log_invoice_event(
    db: AsyncSession,
    invoice_id: UUID,
    tenant_id: UUID,
    event_type: str,
    status: str,
    user: User | CurrentUser | None = None,
    stripe_object_id: str | None = None,
    stripe_object_type: str | None = None,
    stripe_idempotency_key: str | None = None,
    amount: Decimal | None = None,
    currency: str | None = None,
    metadata: dict | None = None,
    error_message: str | None = None,
) -> InvoiceEvent:
    """Create an invoice event log entry.

    Args:
        db: Database session
        invoice_id: Invoice UUID
        tenant_id: Tenant UUID
        event_type: Event type (payment_link_created, refund_succeeded, etc.)
        status: Event status (succeeded, failed, pending, cancelled)
        user: User or CurrentUser who triggered the event (None for webhooks)
        stripe_object_id: Stripe object ID (pi_xxx, re_xxx, ch_xxx)
        stripe_object_type: Stripe object type (payment_intent, refund, charge)
        stripe_idempotency_key: Idempotency key used for Stripe call
        amount: Amount involved in the event
        currency: Currency code
        metadata: Additional structured data
        error_message: Error details if status is failed

    Returns:
        Created InvoiceEvent
    """
    # Extract user_id and email from either User or CurrentUser object
    if user:
        if isinstance(user, CurrentUser):
            user_id = user.user_id
            # CurrentUser doesn't have email, fetch from DB
            from sqlalchemy import select

            result = await db.execute(select(User.email).where(User.id == user.user_id))
            user_email = result.scalar_one_or_none()
        else:  # User object
            user_id = user.id
            user_email = read_pii(user, "email")
    else:
        user_id = None
        user_email = None

    event = InvoiceEvent(
        tenant_id=tenant_id,
        invoice_id=invoice_id,
        event_type=event_type,
        stripe_object_id=stripe_object_id,
        stripe_object_type=stripe_object_type,
        stripe_idempotency_key=stripe_idempotency_key,
        amount=amount,
        currency=currency,
        status=status,
        event_metadata=metadata or {},
        error_message=error_message,
        user_id=user_id,
        user_email=user_email,
    )

    db.add(event)
    await db.flush()  # Don't commit — let caller handle transaction
    return event
