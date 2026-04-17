"""Registration transfer validation for invoice replacement."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.invoice import Invoice
from app.models.registration import Registration


async def transfer_registrations_to_invoice(
    db: AsyncSession,
    old_invoice: Invoice,
    new_invoice: Invoice,
    tenant_id: UUID,
) -> int:
    """Validate registration transfer from old invoice to new invoice.

    Since registrations link to invoices via BillingProfile (through
    recipient_source_id pointing to billing_profile.id), and we're copying
    the same recipient_source_id to the new invoice, registrations will
    automatically follow the new invoice.

    This function validates that registrations exist and returns the count.
    No database changes are needed for simple billing corrections.

    Args:
        db: Database session
        old_invoice: Original invoice being replaced
        new_invoice: New replacement invoice
        tenant_id: Tenant ID

    Returns:
        Number of registrations linked to this billing profile

    Note:
        The link is: Registration → BillingProfile ← Invoice (via recipient_source_id)
        When we create a new invoice with the same recipient_source_id, it points
        to the same BillingProfile, so registrations automatically follow.
    """
    # Only registration-sourced invoices can have registrations
    if old_invoice.recipient_source_type != "registration" or not old_invoice.recipient_source_id:
        return 0

    # Validate new invoice has same billing profile link
    if (
        new_invoice.recipient_source_type != "registration"
        or new_invoice.recipient_source_id != old_invoice.recipient_source_id
    ):
        # This should never happen if create_replacement_invoice() is called correctly
        # But we validate anyway for safety
        return 0

    # Count registrations linked to this billing profile
    billing_profile_id = old_invoice.recipient_source_id

    from sqlalchemy import func

    result = await db.execute(
        select(func.count(Registration.id)).where(
            Registration.billing_profile_id == billing_profile_id,
            Registration.tenant_id == tenant_id,
        )
    )
    count = result.scalar_one()

    return count
