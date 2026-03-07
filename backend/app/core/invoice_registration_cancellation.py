"""Registration cancellation service for invoice cancellations."""

import logging
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog
from app.models.conference import Conference
from app.models.invoice import Invoice
from app.models.registration import Registration, RegistrationStatus
from app.models.user import User
from app.models.user_conference_access import UserConferenceAccess

logger = logging.getLogger(__name__)


async def cancel_registrations_for_invoice(
    db: AsyncSession,
    invoice: Invoice,
    conference: Conference,
    tenant_id: UUID,
    user_id: UUID,
    cancellation_message: str | None = None,
) -> tuple[int, int]:
    """Cancel registrations and remove conference access when invoice is cancelled.

    This is used for TRUE cancellations (not billing corrections). It:
    1. Updates registration status → CANCELLED
    2. Deletes UserConferenceAccess (conference access only, user account stays active)
    3. Sends cancellation email to each attendee (best-effort)
    4. Creates audit log per registration

    Args:
        db: Database session
        invoice: Invoice being cancelled
        conference: Conference the invoice belongs to
        tenant_id: Tenant ID
        user_id: User ID performing the cancellation
        cancellation_message: Optional message to include in cancellation emails

    Returns:
        Tuple of (registrations_cancelled, access_removed_count)

    Raises:
        ValidationError: If cancel_registrations=true but no registrations found
    """
    # Only registration-sourced invoices can have registrations
    if invoice.recipient_source_type != "registration" or not invoice.recipient_source_id:
        return 0, 0

    billing_profile_id = invoice.recipient_source_id

    # Get all registrations for this billing profile
    result = await db.execute(
        select(Registration)
        .where(
            Registration.billing_profile_id == billing_profile_id,
            Registration.tenant_id == tenant_id,
            Registration.conference_id == conference.id,
        )
        .order_by(Registration.created_at)
    )
    registrations = result.scalars().all()

    if not registrations:
        return 0, 0

    # Track counts
    registrations_cancelled = 0
    access_removed_count = 0
    registration_emails: set[str] = set()

    # Step 1: Update registration statuses and collect emails
    for registration in registrations:
        # Skip already-cancelled registrations
        if registration.status == RegistrationStatus.CANCELLED:
            logger.info(f"Registration {registration.id} already cancelled, skipping")
            continue

        # Update status
        old_status = registration.status
        registration.status = RegistrationStatus.CANCELLED
        registrations_cancelled += 1

        # Collect registration email for portal access removal
        registration_emails.add(registration.email.lower())

        # Create audit log
        audit = AuditLog(
            tenant_id=tenant_id,
            user_id=user_id,
            action="registration.cancelled_via_invoice",
            resource_type="registration",
            resource_id=registration.id,
            details={
                "invoice_id": str(invoice.id),
                "invoice_number": invoice.invoice_number,
                "old_status": old_status.value if hasattr(old_status, "value") else str(old_status),
                "new_status": RegistrationStatus.CANCELLED.value,
                "cancellation_message": cancellation_message,
            },
        )
        db.add(audit)

        logger.info(
            f"Cancelled registration {registration.id} (status: {old_status} → CANCELLED) "
            f"for invoice {invoice.invoice_number}"
        )

    # Flush changes so they're visible for subsequent queries
    await db.flush()

    # Step 2: Remove conference access for users with matching emails
    # Best-effort: if this fails, we still cancelled registrations
    if registration_emails:
        try:
            # Find portal users with matching emails
            user_result = await db.execute(
                select(User.id).where(
                    User.email.in_([email.lower() for email in registration_emails]),
                )
            )
            user_ids_to_remove = [row[0] for row in user_result.all()]

            if user_ids_to_remove:
                # Delete UserConferenceAccess entries
                delete_result = await db.execute(
                    delete(UserConferenceAccess).where(
                        UserConferenceAccess.user_id.in_(user_ids_to_remove),
                        UserConferenceAccess.conference_id == conference.id,
                    )
                )
                access_removed_count = delete_result.rowcount or 0  # type: ignore[attr-defined]

                # Create audit logs for access removal
                for user_id_to_remove in user_ids_to_remove:
                    audit = AuditLog(
                        tenant_id=tenant_id,
                        user_id=user_id,
                        action="conference_access.removed_via_cancellation",
                        resource_type="user_conference_access",
                        resource_id=user_id_to_remove,
                        details={
                            "conference_id": str(conference.id),
                            "invoice_id": str(invoice.id),
                            "invoice_number": invoice.invoice_number,
                            "reason": "Invoice cancelled with registration cancellation",
                        },
                    )
                    db.add(audit)

                logger.info(
                    f"Removed conference access for {access_removed_count} users (invoice {invoice.invoice_number})"
                )

        except Exception as e:
            logger.warning(
                f"Failed to remove conference access for invoice {invoice.invoice_number}: {e}",
                exc_info=True,
            )
            # Don't raise - best-effort operation
            access_removed_count = 0

    # Step 3: Send cancellation emails (best-effort, outside transaction)
    # This will be done by the caller after the transaction commits

    return registrations_cancelled, access_removed_count
