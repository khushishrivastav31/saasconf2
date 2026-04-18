"""Invoice operations API endpoints - send, cancel, replace, mark paid, reopen."""

import contextlib
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request

from app.core.conference_helpers import get_conference_for_tenant
from app.core.dependencies import CurrentUserDep, DbSessionDep, get_client_ip, require_module
from app.core.invoice_audit import create_invoice_audit_log
from app.core.invoice_email import (
    send_invoice_email,
    send_registration_cancellation_email,
    send_replacement_invoice_emails,
)
from app.core.invoice_events import InvoiceEventType, log_invoice_event
from app.core.invoice_operations import create_credit_note_for_invoice
from app.core.invoice_queries import get_invoice_with_events, refresh_invoice_with_events
from app.core.invoice_registration_cancellation import cancel_registrations_for_invoice
from app.core.invoice_replacement import create_replacement_invoice
from app.core.security.pii_crypto import read_pii
from app.core.stripe_helper import create_payment_link, deactivate_payment_link_for_invoice, refund_payment
from app.models.audit import AuditLog
from app.schemas.invoice import (
    CancelInvoiceRequest,
    CancelInvoiceResponse,
    ConvertToCreditCardResponse,
    InvoiceResponse,
    MarkPaidRequest,
    ReopenInvoiceRequest,
    ReplaceInvoiceRequest,
    ReplaceInvoiceResponse,
)
from app.services.invoice_service import prepare_invoice_for_sending

from ._helpers import build_invoice_response
from ._helpers import require_invoice_admin as _require_invoice_admin

MODULE_CODE = "invoices"
logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/{invoice_id}/send", response_model=InvoiceResponse, dependencies=[Depends(require_module(MODULE_CODE))])
async def send_invoice(
    conference_id: UUID,
    invoice_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> InvoiceResponse:
    """Send or resend invoice PDF via email."""
    await _require_invoice_admin(db, current_user, conference_id)
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)
    invoice = await get_invoice_with_events(db, invoice_id, conference_id, current_user.tenant_id)

    # Prepare invoice (assign number, create payment link)
    is_first_send, payment_link_url = await prepare_invoice_for_sending(db, invoice, conference, current_user.user_id)

    # Send email
    email_sent = await send_invoice_email(
        db=db, invoice=invoice, conference=conference, payment_link_url=payment_link_url
    )
    if not email_sent:
        raise HTTPException(status_code=500, detail="Failed to send email")

    # Audit log
    db.add(
        create_invoice_audit_log(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action="invoice.sent" if is_first_send else "invoice.resent",
            invoice=invoice,
            details={"recipient_email": read_pii(invoice, "recipient_email")},
            request=request,
        )
    )

    await db.commit()
    invoice = await refresh_invoice_with_events(db, invoice_id)
    return build_invoice_response(invoice)


@router.post(
    "/{invoice_id}/cancel", response_model=CancelInvoiceResponse, dependencies=[Depends(require_module(MODULE_CODE))]
)
async def cancel_invoice(
    conference_id: UUID,
    invoice_id: UUID,
    body: CancelInvoiceRequest,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> CancelInvoiceResponse:
    """Cancel invoice and create credit note."""
    await _require_invoice_admin(db, current_user, conference_id)
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)
    invoice = await get_invoice_with_events(db, invoice_id, conference_id, current_user.tenant_id)

    if invoice.status not in ("sent", "overdue", "paid"):
        raise HTTPException(
            status_code=400,
            detail="Cannot cancel draft invoices. Only sent, overdue, or paid invoices can be cancelled.",
        )
    if invoice.template_type == "credit_note":
        raise HTTPException(status_code=400, detail="Cannot cancel a credit note")

    # Deactivate Stripe link
    await deactivate_payment_link_for_invoice(invoice, conference)

    # Refund if paid via Stripe
    if invoice.status == "paid" and invoice.template_type == "credit_card" and invoice.stripe_payment_intent_id:
        await refund_payment(db, conference, invoice, current_user, None, "requested_by_customer")

    # Cancel invoice
    invoice.status = "cancelled"
    invoice.internal_comment = body.reason

    # Create credit note
    from app.core.invoice_number import generate_cancellation_number

    cancellation_number = await generate_cancellation_number(db, conference_id, current_user.tenant_id)
    credit_note = create_credit_note_for_invoice(invoice, cancellation_number, current_user.tenant_id, conference_id)
    db.add(credit_note)

    # Audit logs
    db.add_all(
        [
            AuditLog(
                tenant_id=current_user.tenant_id,
                user_id=current_user.user_id,
                action="invoice.cancelled",
                resource_type="invoice",
                resource_id=invoice.id,
                details={"invoice_number": invoice.invoice_number, "reason": body.reason},
                ip_address=get_client_ip(request),
                user_agent=request.headers.get("User-Agent"),
            ),
            AuditLog(
                tenant_id=current_user.tenant_id,
                user_id=current_user.user_id,
                action="invoice.credit_note_created",
                resource_type="invoice",
                resource_id=credit_note.id,
                details={"credit_note_number": cancellation_number},
                ip_address=get_client_ip(request),
                user_agent=request.headers.get("User-Agent"),
            ),
        ]
    )

    await db.commit()

    # Cancel registrations if requested
    registrations_cancelled = access_removed_count = 0
    email_data: list[dict[str, str]] = []
    if body.cancel_registrations:
        registrations_cancelled, access_removed_count, email_data = await cancel_registrations_for_invoice(
            db, invoice, conference, current_user.tenant_id, current_user.user_id, body.cancellation_email_message
        )
        # Validate that registrations were found to cancel
        if registrations_cancelled == 0:
            raise HTTPException(
                status_code=400,
                detail="This invoice is not linked to any registrations. Cannot cancel registrations.",
            )
        await db.commit()

    # Send credit note email
    invoice = await refresh_invoice_with_events(db, invoice.id)
    credit_note = await refresh_invoice_with_events(db, credit_note.id)

    with contextlib.suppress(Exception):
        await send_invoice_email(db, credit_note, conference)

    # Send cancellation emails to registrations (best-effort, after transaction)
    if email_data:
        for reg_data in email_data:
            with contextlib.suppress(Exception):
                await send_registration_cancellation_email(
                    db=db,
                    registration_email=reg_data["email"],
                    registration_name=reg_data["name"],
                    conference_name=conference.name,
                    invoice_number=invoice.invoice_number or "DRAFT",
                    conference_id=conference.id,
                    tenant_id=current_user.tenant_id,
                    cancellation_message=body.cancellation_email_message,
                )

    return CancelInvoiceResponse(
        cancelled_invoice=build_invoice_response(invoice),
        credit_note=build_invoice_response(credit_note),
        registrations_cancelled=registrations_cancelled,
        access_removed_count=access_removed_count,
    )


@router.post(
    "/{invoice_id}/replace", response_model=ReplaceInvoiceResponse, dependencies=[Depends(require_module(MODULE_CODE))]
)
async def replace_invoice(
    conference_id: UUID,
    invoice_id: UUID,
    body: ReplaceInvoiceRequest,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> ReplaceInvoiceResponse:
    """Replace invoice with corrected billing information.

    Creates a new invoice with corrected billing details while keeping all
    registrations linked. The original invoice is cancelled with a credit note.

    Only sent, overdue, or paid invoices can be replaced (not drafts or credit notes).
    """
    await _require_invoice_admin(db, current_user, conference_id)
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)
    old_invoice = await get_invoice_with_events(db, invoice_id, conference_id, current_user.tenant_id)

    # Validation
    if old_invoice.template_type == "credit_note":
        raise HTTPException(status_code=400, detail="Cannot replace a credit note")

    if old_invoice.replaced_by_invoice_id is not None:
        raise HTTPException(status_code=400, detail="This invoice has already been replaced")

    if old_invoice.status not in ("sent", "overdue", "paid"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot replace an invoice with status '{old_invoice.status}'. Only sent, overdue, or paid invoices can be replaced.",
        )

    # Build corrected fields dict
    corrected_fields = {
        k: v
        for k, v in {
            "recipient_name": body.recipient_name,
            "recipient_email": body.recipient_email,
            "recipient_address_line1": body.recipient_address_line1,
            "recipient_address_line2": body.recipient_address_line2,
            "recipient_city": body.recipient_city,
            "recipient_state": body.recipient_state,
            "recipient_postal_code": body.recipient_postal_code,
            "recipient_country": body.recipient_country,
            "recipient_vat_number": body.recipient_vat_number,
            "procurement_code": body.procurement_code,
        }.items()
        if v is not None
    }

    # Create replacement invoice
    new_invoice = await create_replacement_invoice(
        db=db,
        old_invoice=old_invoice,
        conference=conference,
        corrected_fields=corrected_fields,
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        current_user=current_user,
        replacement_reason=body.reason,
    )
    db.add(new_invoice)
    await db.flush()

    # Validate registration transfer
    from app.core.invoice_registration_transfer import transfer_registrations_to_invoice

    registrations_transferred = await transfer_registrations_to_invoice(
        db=db, old_invoice=old_invoice, new_invoice=new_invoice, tenant_id=current_user.tenant_id
    )

    # Deactivate old Stripe payment link if credit_card
    if old_invoice.status in ("sent", "overdue") and old_invoice.template_type == "credit_card":
        await deactivate_payment_link_for_invoice(old_invoice, conference)

    # Cancel old invoice
    old_invoice.status = "cancelled"
    old_invoice.internal_comment = f"Replaced by {new_invoice.invoice_number}. Reason: {body.reason}"
    old_invoice.replaced_by_invoice_id = new_invoice.id

    # Create credit note
    from app.core.invoice_number import generate_cancellation_number

    cancellation_number = await generate_cancellation_number(db, conference_id, current_user.tenant_id)
    credit_note = create_credit_note_for_invoice(
        invoice=old_invoice,
        credit_note_number=cancellation_number,
        tenant_id=current_user.tenant_id,
        conference_id=conference_id,
    )
    db.add(credit_note)

    # Audit logs
    from app.models.audit import AuditLog

    db.add_all(
        [
            AuditLog(
                tenant_id=current_user.tenant_id,
                user_id=current_user.user_id,
                action="invoice.replaced",
                resource_type="invoice",
                resource_id=old_invoice.id,
                details={
                    "old_invoice_number": old_invoice.invoice_number,
                    "new_invoice_number": new_invoice.invoice_number,
                    "credit_note_number": cancellation_number,
                    "reason": body.reason,
                    "corrected_fields": list(corrected_fields.keys()),
                },
                ip_address=get_client_ip(request),
                user_agent=request.headers.get("User-Agent"),
            ),
            AuditLog(
                tenant_id=current_user.tenant_id,
                user_id=current_user.user_id,
                action="invoice.replacement_created",
                resource_type="invoice",
                resource_id=new_invoice.id,
                details={
                    "new_invoice_number": new_invoice.invoice_number,
                    "replaces_invoice_number": old_invoice.invoice_number,
                    "registrations_transferred": registrations_transferred,
                },
                ip_address=get_client_ip(request),
                user_agent=request.headers.get("User-Agent"),
            ),
            AuditLog(
                tenant_id=current_user.tenant_id,
                user_id=current_user.user_id,
                action="invoice.credit_note_created",
                resource_type="invoice",
                resource_id=credit_note.id,
                details={
                    "credit_note_number": cancellation_number,
                    "original_invoice_number": old_invoice.invoice_number,
                    "original_invoice_id": str(old_invoice.id),
                },
                ip_address=get_client_ip(request),
                user_agent=request.headers.get("User-Agent"),
            ),
        ]
    )

    # Log invoice events
    await log_invoice_event(
        db=db,
        invoice_id=old_invoice.id,
        tenant_id=old_invoice.tenant_id,
        event_type=InvoiceEventType.INVOICE_CANCELLED,
        status="succeeded",
        user=current_user,
        metadata={
            "invoice_number": old_invoice.invoice_number,
            "replaced_by": new_invoice.invoice_number,
            "reason": body.reason,
        },
    )

    await db.commit()

    # Re-query invoices
    old_invoice = await refresh_invoice_with_events(db, old_invoice.id)
    credit_note = await refresh_invoice_with_events(db, credit_note.id)
    new_invoice = await refresh_invoice_with_events(db, new_invoice.id)

    # Send emails (best-effort)
    payment_link_url = new_invoice.stripe_payment_link_url if new_invoice.template_type == "credit_card" else None

    with contextlib.suppress(Exception):
        await send_replacement_invoice_emails(
            db=db,
            credit_note=credit_note,
            new_invoice=new_invoice,
            conference=conference,
            payment_link_url=payment_link_url,
            custom_message=body.custom_email_message,
        )

    return ReplaceInvoiceResponse(
        old_invoice=build_invoice_response(old_invoice),
        credit_note=build_invoice_response(credit_note, related_invoice_number=old_invoice.invoice_number),
        new_invoice=build_invoice_response(new_invoice),
        registrations_transferred=registrations_transferred,
    )


@router.post(
    "/{invoice_id}/mark-paid", response_model=InvoiceResponse, dependencies=[Depends(require_module(MODULE_CODE))]
)
async def mark_invoice_paid(
    conference_id: UUID,
    invoice_id: UUID,
    request_data: MarkPaidRequest,
    db: DbSessionDep,
    current_user: CurrentUserDep,
    request: Request,
) -> InvoiceResponse:
    """Manually mark bank transfer invoice as paid."""
    await _require_invoice_admin(db, current_user, conference_id)
    invoice = await get_invoice_with_events(db, invoice_id, conference_id, current_user.tenant_id)

    # Validation
    if invoice.template_type != "bank_transfer":
        raise HTTPException(status_code=400, detail="Only bank transfer invoices can be marked as paid manually")

    if invoice.status not in ("sent", "overdue"):
        raise HTTPException(status_code=400, detail="Can only mark sent or overdue invoices as paid")

    # Update status
    old_status = invoice.status
    invoice.status = "paid"

    # Log manual payment event
    await log_invoice_event(
        db=db,
        invoice_id=invoice.id,
        tenant_id=invoice.tenant_id,
        event_type=InvoiceEventType.MANUAL_PAYMENT_RECORDED,
        status="succeeded",
        user=current_user,
        amount=invoice.total,
        currency=invoice.currency,
        metadata={
            "payment_date": request_data.payment_date.isoformat(),
            "comment": request_data.comment,
            "old_status": old_status,
        },
    )

    # Audit log
    db.add(
        create_invoice_audit_log(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action="invoice.marked_paid",
            invoice=invoice,
            details={
                "payment_date": request_data.payment_date.isoformat(),
                "comment": request_data.comment,
                "old_status": old_status,
            },
            request=request,
        )
    )

    await db.commit()
    invoice = await refresh_invoice_with_events(db, invoice.id)
    return build_invoice_response(invoice)


@router.post(
    "/{invoice_id}/reopen", response_model=InvoiceResponse, dependencies=[Depends(require_module(MODULE_CODE))]
)
async def reopen_invoice(
    conference_id: UUID,
    invoice_id: UUID,
    request_data: ReopenInvoiceRequest,
    db: DbSessionDep,
    current_user: CurrentUserDep,
    request: Request,
) -> InvoiceResponse:
    """Reopen paid/cancelled/overdue invoice back to 'sent' status."""
    await _require_invoice_admin(db, current_user, conference_id)
    invoice = await get_invoice_with_events(db, invoice_id, conference_id, current_user.tenant_id)

    # Validation
    if invoice.status == "draft":
        raise HTTPException(status_code=400, detail="Cannot reopen a draft invoice")

    if invoice.status == "sent":
        raise HTTPException(status_code=400, detail="Invoice is already in 'sent' status")

    # Update status
    old_status = invoice.status
    invoice.status = "sent"

    # Log reopen event
    await log_invoice_event(
        db=db,
        invoice_id=invoice.id,
        tenant_id=invoice.tenant_id,
        event_type=InvoiceEventType.INVOICE_REOPENED,
        status="succeeded",
        user=current_user,
        metadata={
            "old_status": old_status,
            "new_status": "sent",
            "comment": request_data.comment,
        },
    )

    # Audit log
    db.add(
        create_invoice_audit_log(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action="invoice.reopened",
            invoice=invoice,
            details={
                "old_status": old_status,
                "comment": request_data.comment,
            },
            request=request,
        )
    )

    await db.commit()
    invoice = await refresh_invoice_with_events(db, invoice.id)
    return build_invoice_response(invoice)


@router.post(
    "/{invoice_id}/convert-to-credit-card",
    response_model=ConvertToCreditCardResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def convert_to_credit_card(
    conference_id: UUID,
    invoice_id: UUID,
    db: DbSessionDep,
    current_user: CurrentUserDep,
    request: Request,
) -> dict:
    """Convert bank transfer invoice to credit card and generate Stripe payment link."""
    await _require_invoice_admin(db, current_user, conference_id)
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)
    invoice = await get_invoice_with_events(db, invoice_id, conference_id, current_user.tenant_id)

    # Validation
    if invoice.template_type != "bank_transfer":
        raise HTTPException(status_code=400, detail="Only bank transfer invoices can be converted to credit card")

    if invoice.status not in ("sent", "overdue"):
        raise HTTPException(
            status_code=400, detail="Can only convert sent or overdue invoices (not draft, paid, or cancelled)"
        )

    # Convert to credit card
    old_template_type = invoice.template_type
    invoice.template_type = "credit_card"

    # Create Stripe payment link
    try:
        payment_intent_id, payment_link_url = await create_payment_link(
            db=db, conference=conference, invoice=invoice, current_user=current_user
        )

        invoice.stripe_payment_intent_id = payment_intent_id
        invoice.stripe_payment_link_url = payment_link_url

    except Exception as e:
        logger.error(f"Failed to create Stripe payment link for invoice {invoice_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create payment link: {e!s}") from e

    # Log conversion event
    await log_invoice_event(
        db=db,
        invoice_id=invoice.id,
        tenant_id=invoice.tenant_id,
        event_type=InvoiceEventType.CONVERTED_TO_CREDIT_CARD,
        status="succeeded",
        user=current_user,
        metadata={
            "old_template_type": old_template_type,
            "new_template_type": "credit_card",
            "payment_link_url": payment_link_url,
        },
    )

    # Audit log
    db.add(
        create_invoice_audit_log(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action="invoice.converted_to_credit_card",
            invoice=invoice,
            details={
                "old_template_type": old_template_type,
                "payment_link_url": payment_link_url,
            },
            request=request,
        )
    )

    await db.commit()
    invoice = await refresh_invoice_with_events(db, invoice.id)

    # Send email with payment link (best-effort)
    if read_pii(invoice, "recipient_email") and payment_link_url:
        with contextlib.suppress(Exception):
            await send_invoice_email(
                db=db,
                invoice=invoice,
                conference=conference,
                payment_link_url=payment_link_url,
                custom_subject=f"Payment Link for Invoice {invoice.invoice_number}",
                custom_message=(
                    f"<p>Your invoice {invoice.invoice_number} can now be paid online.</p>"
                    f"<p>Please find the invoice attached, or use the button below to pay by credit card:</p>"
                ),
            )

    return {"invoice": build_invoice_response(invoice), "payment_link_url": payment_link_url}
