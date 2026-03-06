"""Invoice management endpoints (conference-scoped)."""

import base64
import io
import logging
from datetime import date as date_type
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import delete as sa_delete
from sqlalchemy import func as sa_func
from sqlalchemy import or_, select

from app.core.conference_helpers import get_conference_for_tenant
from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    check_conference_admin_access,
    get_client_ip,
    require_module,
)
from app.core.email import send_email
from app.core.exceptions import AuthorizationError, NotFoundError
from app.core.invoice_events import InvoiceEventType, log_invoice_event
from app.core.invoice_number import generate_cancellation_number, generate_invoice_number
from app.core.invoice_pdf import generate_invoice_pdf
from app.core.pagination import calculate_pages, paginate
from app.core.search import unaccent_ilike
from app.core.stripe_helper import refund_payment
from app.models.associations import ConferenceCFP, ConferenceVolunteer
from app.models.attachment import Attachment
from app.models.audit import AuditLog
from app.models.cfp import CallForPapers, CFPCommitteeMember
from app.models.cfp_applicants import CFPApplicant
from app.models.cfp_papers import CFPPaper
from app.models.invoice import Invoice
from app.models.sponsor import Sponsor
from app.models.volunteer import Volunteer
from app.schemas.invoice import (
    CancelInvoiceRequest,
    CancelInvoiceResponse,
    InvoiceCreate,
    InvoiceListResponse,
    InvoiceResponse,
    InvoiceUpdate,
    RecipientSearchResponse,
    RecipientSearchResult,
)

router = APIRouter()

MODULE_CODE = "invoices"
logger = logging.getLogger(__name__)


def build_invoice_response(
    invoice: Invoice,
    related_invoice_number: str | None = None,
) -> InvoiceResponse:
    """Build an InvoiceResponse from an Invoice model."""
    return InvoiceResponse(
        id=invoice.id,
        tenant_id=invoice.tenant_id,
        conference_id=invoice.conference_id,
        invoice_number=invoice.invoice_number,
        template_type=invoice.template_type,
        status=invoice.status,
        issue_date=invoice.issue_date,
        due_date=invoice.due_date,
        recipient_source_type=invoice.recipient_source_type,
        recipient_source_id=invoice.recipient_source_id,
        recipient_name=invoice.recipient_name,
        recipient_email=invoice.recipient_email,
        recipient_address_line1=invoice.recipient_address_line1,
        recipient_address_line2=invoice.recipient_address_line2,
        recipient_city=invoice.recipient_city,
        recipient_state=invoice.recipient_state,
        recipient_postal_code=invoice.recipient_postal_code,
        recipient_country=invoice.recipient_country,
        recipient_vat_number=invoice.recipient_vat_number,
        line_items=invoice.line_items or [],
        subtotal=invoice.subtotal,
        tax_rate=invoice.tax_rate,
        tax_amount=invoice.tax_amount,
        total=invoice.total,
        currency=invoice.currency,
        notes=invoice.notes,
        internal_comment=invoice.internal_comment,
        contact_persons=invoice.contact_persons or [],
        related_invoice_id=invoice.related_invoice_id,
        related_invoice_number=related_invoice_number,
        stripe_payment_intent_id=invoice.stripe_payment_intent_id,
        stripe_charge_id=invoice.stripe_charge_id,
        stripe_payment_link_url=invoice.stripe_payment_link_url,
        events=invoice.events if hasattr(invoice, "events") else [],
        is_active=invoice.is_active,
        created_at=invoice.created_at,
        updated_at=invoice.updated_at,
    )


async def _enrich_related_numbers(db: DbSessionDep, invoices: list[InvoiceResponse]) -> list[InvoiceResponse]:
    """Batch-fetch related invoice numbers to avoid N+1."""
    related_ids = {inv.related_invoice_id for inv in invoices if inv.related_invoice_id}
    if not related_ids:
        return invoices
    result = await db.execute(select(Invoice.id, Invoice.invoice_number).where(Invoice.id.in_(related_ids)))
    number_map = {row.id: row.invoice_number for row in result.all()}
    for inv in invoices:
        if inv.related_invoice_id:
            inv.related_invoice_number = number_map.get(inv.related_invoice_id)
    return invoices


async def _require_invoice_admin(
    db: "DbSessionDep",
    current_user: "CurrentUserDep",
    conference_id: UUID,
) -> None:
    """Check admin access: tenant admin OR conference-specific admin."""
    if not current_user.is_super_admin and not current_user.is_tenant_admin:
        has_access = await check_conference_admin_access(db, current_user.user_id, conference_id)
        if not has_access:
            raise AuthorizationError("Admin access to this conference required")


@router.get(
    "",
    response_model=InvoiceListResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def list_invoices(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    search: str | None = None,
    status: str | None = None,
    is_active: bool | None = None,
    template_type: str | None = None,
    date_from: date_type | None = None,
    date_to: date_type | None = None,
    recipient_source_type: str | None = None,
    recipient_source_id: UUID | None = None,
) -> InvoiceListResponse:
    """List invoices for a conference with pagination and filtering."""
    await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    query = select(Invoice).where(
        Invoice.conference_id == conference_id,
        Invoice.tenant_id == current_user.tenant_id,
    )

    if search:
        query = query.where(
            or_(
                unaccent_ilike(sa_func.coalesce(Invoice.invoice_number, ""), search),
                unaccent_ilike(Invoice.recipient_name, search),
            )
        )

    if status is not None:
        query = query.where(Invoice.status == status)

    if is_active is not None:
        query = query.where(Invoice.is_active == is_active)

    if template_type is not None:
        query = query.where(Invoice.template_type == template_type)

    if date_from is not None:
        query = query.where(Invoice.issue_date >= date_from)

    if date_to is not None:
        query = query.where(Invoice.issue_date <= date_to)

    if recipient_source_type is not None:
        query = query.where(Invoice.recipient_source_type == recipient_source_type)

    if recipient_source_id is not None:
        query = query.where(Invoice.recipient_source_id == recipient_source_id)

    query = query.order_by(Invoice.created_at.desc())

    result = await paginate(db, query, page, page_size)

    items = [build_invoice_response(inv) for inv in result.items]
    items = await _enrich_related_numbers(db, items)

    return InvoiceListResponse(
        items=items,
        total=result.total,
        page=page,
        page_size=page_size,
        pages=calculate_pages(result.total, page_size),
    )


@router.post(
    "",
    response_model=InvoiceResponse,
    status_code=201,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def create_invoice(
    conference_id: UUID,
    invoice_data: InvoiceCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> InvoiceResponse:
    """Create a new invoice for a conference.

    Invoices are created as drafts without an invoice number.
    Use POST /{invoice_id}/generate to assign a number.
    """
    await _require_invoice_admin(db, current_user, conference_id)
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    invoice = Invoice(
        tenant_id=current_user.tenant_id,
        conference_id=conference.id,
        invoice_number=invoice_data.invoice_number or None,
        template_type=invoice_data.template_type,
        status=invoice_data.status,
        issue_date=invoice_data.issue_date,
        due_date=invoice_data.due_date,
        recipient_source_type=invoice_data.recipient_source_type,
        recipient_source_id=invoice_data.recipient_source_id,
        recipient_name=invoice_data.recipient_name,
        recipient_email=invoice_data.recipient_email,
        recipient_address_line1=invoice_data.recipient_address_line1,
        recipient_address_line2=invoice_data.recipient_address_line2,
        recipient_city=invoice_data.recipient_city,
        recipient_state=invoice_data.recipient_state,
        recipient_postal_code=invoice_data.recipient_postal_code,
        recipient_country=invoice_data.recipient_country,
        recipient_vat_number=invoice_data.recipient_vat_number,
        line_items=([li.model_dump(mode="json") for li in invoice_data.line_items] if invoice_data.line_items else []),
        subtotal=invoice_data.subtotal,
        tax_rate=invoice_data.tax_rate,
        tax_amount=invoice_data.tax_amount,
        total=invoice_data.total,
        currency=invoice_data.currency,
        notes=invoice_data.notes,
        internal_comment=invoice_data.internal_comment,
        contact_persons=(
            [cp.model_dump(mode="json") for cp in invoice_data.contact_persons] if invoice_data.contact_persons else []
        ),
        is_active=invoice_data.is_active,
    )
    db.add(invoice)

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="invoice.create",
        resource_type="invoice",
        resource_id=invoice.id,
        details={
            "invoice_number": invoice.invoice_number or "DRAFT",
            "conference_id": str(conference.id),
        },
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(invoice)

    return build_invoice_response(invoice)


# --- Static path routes (must come before /{invoice_id} routes) ---


@router.get(
    "/recipient-search",
    response_model=RecipientSearchResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def search_recipients(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    q: str = Query(..., min_length=1, max_length=200),
) -> RecipientSearchResponse:
    """Search across sponsors, speakers, committee members, and volunteers for invoice recipients."""
    tenant_id = current_user.tenant_id
    await get_conference_for_tenant(db, conference_id, tenant_id)

    results: list[RecipientSearchResult] = []
    per_source_limit = 10

    # 1. Sponsors (conference-scoped)
    sponsor_query = (
        select(Sponsor)
        .where(
            Sponsor.conference_id == conference_id,
            Sponsor.tenant_id == tenant_id,
            unaccent_ilike(Sponsor.company_name, q),
        )
        .limit(per_source_limit)
    )
    sponsor_result = await db.execute(sponsor_query)
    for s in sponsor_result.scalars().all():
        contact_persons_raw = s.contact_persons or []
        first_email = None
        for cp in contact_persons_raw:
            if isinstance(cp, dict) and cp.get("email"):
                first_email = cp["email"]
                break
        results.append(
            RecipientSearchResult(
                id=s.id,
                source_type="sponsor",
                display_name=s.company_name,
                email=first_email,
                company=s.company_name,
                address_line1=s.address_line1,
                address_line2=s.address_line2,
                city=s.city,
                state=s.state,
                postal_code=s.postal_code,
                country=s.country,
                vat_number=s.vat_number,
                phone=s.phone,
                contact_persons=contact_persons_raw,
            )
        )

    # 2. Speakers (CFP applicants who submitted papers to this conference)
    speaker_query = (
        select(CFPApplicant)
        .join(CFPPaper, CFPPaper.main_speaker_id == CFPApplicant.id)
        .join(CallForPapers, CallForPapers.id == CFPPaper.cfp_id)
        .join(ConferenceCFP, ConferenceCFP.cfp_id == CallForPapers.id)
        .where(
            ConferenceCFP.conference_id == conference_id,
            CFPApplicant.tenant_id == tenant_id,
            or_(
                unaccent_ilike(sa_func.concat(CFPApplicant.first_name, " ", CFPApplicant.last_name), q),
                unaccent_ilike(CFPApplicant.email, q),
                unaccent_ilike(sa_func.coalesce(CFPApplicant.company, ""), q),
            ),
        )
        .distinct()
        .limit(per_source_limit)
    )
    speaker_result = await db.execute(speaker_query)
    speaker_ids = set()
    for a in speaker_result.scalars().all():
        speaker_ids.add(a.id)
        results.append(
            RecipientSearchResult(
                id=a.id,
                source_type="speaker",
                display_name=f"{a.first_name} {a.last_name}",
                email=a.email,
                company=a.company,
                phone=a.phone,
            )
        )

    # 3. Committee members (conference-scoped, avoid duplicating speakers)
    committee_query = (
        select(CFPApplicant)
        .join(CFPCommitteeMember, CFPCommitteeMember.applicant_id == CFPApplicant.id)
        .where(
            CFPCommitteeMember.conference_id == conference_id,
            CFPApplicant.tenant_id == tenant_id,
            or_(
                unaccent_ilike(sa_func.concat(CFPApplicant.first_name, " ", CFPApplicant.last_name), q),
                unaccent_ilike(CFPApplicant.email, q),
                unaccent_ilike(sa_func.coalesce(CFPApplicant.company, ""), q),
            ),
        )
        .distinct()
        .limit(per_source_limit)
    )
    committee_result = await db.execute(committee_query)
    for a in committee_result.scalars().all():
        if a.id in speaker_ids:
            continue  # Already included as speaker
        results.append(
            RecipientSearchResult(
                id=a.id,
                source_type="committee",
                display_name=f"{a.first_name} {a.last_name}",
                email=a.email,
                company=a.company,
                phone=a.phone,
            )
        )

    # 4. Volunteers (tenant-scoped, linked to conference via ConferenceVolunteer)
    volunteer_query = (
        select(Volunteer)
        .join(ConferenceVolunteer, ConferenceVolunteer.volunteer_id == Volunteer.id)
        .where(
            ConferenceVolunteer.conference_id == conference_id,
            Volunteer.tenant_id == tenant_id,
            or_(
                unaccent_ilike(sa_func.concat(Volunteer.first_name, " ", Volunteer.last_name), q),
                unaccent_ilike(Volunteer.email, q),
            ),
        )
        .distinct()
        .limit(per_source_limit)
    )
    volunteer_result = await db.execute(volunteer_query)
    for v in volunteer_result.scalars().all():
        results.append(
            RecipientSearchResult(
                id=v.id,
                source_type="volunteer",
                display_name=f"{v.first_name} {v.last_name}",
                email=v.email,
                phone=v.phone,
            )
        )

    # Sort by source_type then display_name
    source_order = {"sponsor": 0, "speaker": 1, "committee": 2, "volunteer": 3}
    results.sort(key=lambda r: (source_order.get(r.source_type, 99), r.display_name))

    return RecipientSearchResponse(results=results[:50])


# --- Dynamic path routes (/{invoice_id}) ---


@router.get(
    "/{invoice_id}",
    response_model=InvoiceResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def get_invoice(
    conference_id: UUID,
    invoice_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> InvoiceResponse:
    """Get a single invoice."""
    result = await db.execute(
        select(Invoice).where(
            Invoice.id == invoice_id,
            Invoice.conference_id == conference_id,
            Invoice.tenant_id == current_user.tenant_id,
        )
    )
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise NotFoundError(f"Invoice with ID '{invoice_id}' not found")

    # Resolve related invoice number if present
    related_number: str | None = None
    if invoice.related_invoice_id:
        rel_result = await db.execute(select(Invoice.invoice_number).where(Invoice.id == invoice.related_invoice_id))
        related_number = rel_result.scalar_one_or_none()

    return build_invoice_response(invoice, related_invoice_number=related_number)


# Valid status transitions — draft can only become sent (which assigns a number);
# after that only status changes are allowed.
VALID_STATUS_TRANSITIONS: dict[str, set[str]] = {
    "draft": {"sent"},
    "sent": {"paid", "overdue"},  # cancelled only via POST /{id}/cancel
    "overdue": {"paid"},  # cancelled only via POST /{id}/cancel
    "paid": set(),  # terminal
    "cancelled": set(),  # terminal
}


@router.put(
    "/{invoice_id}",
    response_model=InvoiceResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def update_invoice(
    conference_id: UUID,
    invoice_id: UUID,
    invoice_data: InvoiceUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> InvoiceResponse:
    """Update an invoice.

    Draft invoices are fully editable.
    Non-draft invoices only allow status changes (with valid transitions).
    Changing status from draft→sent auto-assigns an invoice number.
    """
    await _require_invoice_admin(db, current_user, conference_id)

    result = await db.execute(
        select(Invoice).where(
            Invoice.id == invoice_id,
            Invoice.conference_id == conference_id,
            Invoice.tenant_id == current_user.tenant_id,
        )
    )
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise NotFoundError(f"Invoice with ID '{invoice_id}' not found")

    update_data = invoice_data.model_dump(exclude_unset=True)
    current_status = invoice.status
    new_status = update_data.get("status")

    # --- Status transition validation ---
    if new_status and new_status != current_status:
        allowed = VALID_STATUS_TRANSITIONS.get(current_status, set())
        if new_status not in allowed:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot change status from '{current_status}' to '{new_status}'. "
                f"Allowed transitions: {', '.join(sorted(allowed)) or 'none (terminal state)'}",
            )

    # --- Field locking: non-draft invoices only allow status changes ---
    if current_status != "draft":
        non_status_fields = {k for k in update_data if k != "status"}
        if non_status_fields:
            raise HTTPException(
                status_code=400,
                detail="Only status changes are allowed on sent/finalized invoices.",
            )

    # Prevent changing invoice_number directly
    update_data.pop("invoice_number", None)

    # Serialize line items if present
    if "line_items" in update_data and update_data["line_items"] is not None:
        serialized_items = []
        for li in update_data["line_items"]:
            if hasattr(li, "model_dump"):
                serialized_items.append(li.model_dump(mode="json"))
            elif isinstance(li, dict):
                serialized_items.append({k: float(v) if isinstance(v, Decimal) else v for k, v in li.items()})
            else:
                serialized_items.append(li)
        update_data["line_items"] = serialized_items

    # Serialize contact persons if present
    if "contact_persons" in update_data and update_data["contact_persons"] is not None:
        update_data["contact_persons"] = [
            cp.model_dump(mode="json") if hasattr(cp, "model_dump") else cp for cp in update_data["contact_persons"]
        ]

    # --- Auto-assign invoice number on draft → sent ---
    if new_status == "sent" and current_status == "draft":
        number = await generate_invoice_number(db, conference_id, current_user.tenant_id)
        update_data["invoice_number"] = number
        if invoice.issue_date is None:
            update_data["issue_date"] = date_type.today()

    for field, value in update_data.items():
        setattr(invoice, field, value)

    audit_action = "invoice.update"
    audit_details: dict[str, object] = {"updated_fields": list(update_data.keys())}
    if new_status == "sent" and current_status == "draft":
        audit_action = "invoice.sent"
        audit_details["invoice_number"] = update_data["invoice_number"]

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action=audit_action,
        resource_type="invoice",
        resource_id=invoice_id,
        details=audit_details,
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(invoice)

    return build_invoice_response(invoice)


@router.get(
    "/{invoice_id}/pdf",
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def download_invoice_pdf(
    conference_id: UUID,
    invoice_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    inline: bool = False,
) -> StreamingResponse:
    """Generate and download invoice as PDF."""
    tenant_id = current_user.tenant_id

    # Get invoice
    result = await db.execute(
        select(Invoice).where(
            Invoice.id == invoice_id,
            Invoice.conference_id == conference_id,
            Invoice.tenant_id == tenant_id,
        )
    )
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise NotFoundError(f"Invoice with ID '{invoice_id}' not found")

    # Get conference for template
    conference = await get_conference_for_tenant(db, conference_id, tenant_id)

    # Generate PDF
    pdf_bytes = await generate_invoice_pdf(invoice, conference, db)

    filename = f"invoice_{invoice.invoice_number or 'draft'}.pdf"
    disposition = "inline" if inline else "attachment"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'{disposition}; filename="{filename}"'},
    )


@router.post(
    "/{invoice_id}/preview-pdf",
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def preview_invoice_pdf(
    conference_id: UUID,
    invoice_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> StreamingResponse:
    """Preview invoice PDF in browser (inline display)."""
    tenant_id = current_user.tenant_id

    # Get invoice
    result = await db.execute(
        select(Invoice).where(
            Invoice.id == invoice_id,
            Invoice.conference_id == conference_id,
            Invoice.tenant_id == tenant_id,
        )
    )
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise NotFoundError(f"Invoice with ID '{invoice_id}' not found")

    # Get conference for template
    conference = await get_conference_for_tenant(db, conference_id, tenant_id)

    # Generate PDF
    pdf_bytes = await generate_invoice_pdf(invoice, conference, db)

    # Return as inline
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": "inline"},
    )


@router.delete(
    "/{invoice_id}",
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def delete_invoice(
    conference_id: UUID,
    invoice_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete an invoice and its attachments."""
    await _require_invoice_admin(db, current_user, conference_id)

    result = await db.execute(
        select(Invoice).where(
            Invoice.id == invoice_id,
            Invoice.conference_id == conference_id,
            Invoice.tenant_id == current_user.tenant_id,
        )
    )
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise NotFoundError(f"Invoice with ID '{invoice_id}' not found")

    # Credit notes can never be deleted
    if invoice.template_type == "credit_note":
        raise HTTPException(
            status_code=400,
            detail="Credit notes cannot be deleted.",
        )

    # Only draft invoices can be deleted
    if invoice.status != "draft":
        raise HTTPException(
            status_code=400,
            detail="Only draft invoices can be deleted. Use the cancel endpoint for sent/overdue invoices.",
        )

    invoice_number = invoice.invoice_number or "DRAFT"

    # Delete associated attachments
    await db.execute(
        sa_delete(Attachment).where(
            Attachment.entity_type == "invoice",
            Attachment.entity_id == invoice_id,
            Attachment.tenant_id == current_user.tenant_id,
        )
    )

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="invoice.delete",
        resource_type="invoice",
        resource_id=invoice_id,
        details={
            "invoice_number": invoice_number,
            "conference_id": str(conference_id),
        },
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.delete(invoice)
    await db.commit()

    return {"message": f"Invoice '{invoice_number}' deleted successfully"}


@router.post(
    "/{invoice_id}/cancel",
    response_model=CancelInvoiceResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def cancel_invoice(
    conference_id: UUID,
    invoice_id: UUID,
    body: CancelInvoiceRequest,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> CancelInvoiceResponse:
    """Cancel an invoice and create a linked credit note.

    Only sent or overdue invoices can be cancelled. Creates a credit note
    with negated line items and sends it to the recipient.
    """
    await _require_invoice_admin(db, current_user, conference_id)
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    result = await db.execute(
        select(Invoice).where(
            Invoice.id == invoice_id,
            Invoice.conference_id == conference_id,
            Invoice.tenant_id == current_user.tenant_id,
        )
    )
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise NotFoundError(f"Invoice with ID '{invoice_id}' not found")

    # Only sent or overdue invoices can be cancelled
    if invoice.status not in ("sent", "overdue"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel an invoice with status '{invoice.status}'. "
            "Only sent or overdue invoices can be cancelled.",
        )

    # Cannot cancel a credit note
    if invoice.template_type == "credit_note":
        raise HTTPException(status_code=400, detail="Cannot cancel a credit note.")

    # 1. Cancel the original invoice
    original_status = invoice.status
    invoice.status = "cancelled"
    invoice.internal_comment = body.reason

    # 1a. Log cancellation event
    await log_invoice_event(
        db=db,
        invoice_id=invoice.id,
        tenant_id=invoice.tenant_id,
        event_type=InvoiceEventType.INVOICE_CANCELLED,
        status="succeeded",
        user=current_user,
        amount=invoice.total,
        currency=invoice.currency,
        metadata={
            "invoice_number": invoice.invoice_number,
            "cancellation_reason": body.reason,
            "previous_status": original_status,
        },
    )

    # 2. Generate cancellation number
    cancellation_number = await generate_cancellation_number(db, conference_id, current_user.tenant_id)

    # 3. Build negated line items
    credit_line_items = []
    for li in invoice.line_items or []:
        credit_li = dict(li)
        credit_li["total"] = -abs(float(li.get("total", 0)))
        credit_line_items.append(credit_li)

    # 4. Create credit note
    credit_note = Invoice(
        tenant_id=current_user.tenant_id,
        conference_id=conference_id,
        invoice_number=cancellation_number,
        template_type="credit_note",
        status="sent",
        issue_date=date_type.today(),
        due_date=None,
        related_invoice_id=invoice.id,
        recipient_source_type=invoice.recipient_source_type,
        recipient_source_id=invoice.recipient_source_id,
        recipient_name=invoice.recipient_name,
        recipient_email=invoice.recipient_email,
        recipient_address_line1=invoice.recipient_address_line1,
        recipient_address_line2=invoice.recipient_address_line2,
        recipient_city=invoice.recipient_city,
        recipient_state=invoice.recipient_state,
        recipient_postal_code=invoice.recipient_postal_code,
        recipient_country=invoice.recipient_country,
        recipient_vat_number=invoice.recipient_vat_number,
        line_items=credit_line_items,
        subtotal=-abs(float(invoice.subtotal)) if invoice.subtotal else None,
        tax_rate=invoice.tax_rate,
        tax_amount=-abs(float(invoice.tax_amount)) if invoice.tax_amount else None,
        total=-abs(float(invoice.total)) if invoice.total else None,
        currency=invoice.currency,
        notes=f"Credit note for invoice {invoice.invoice_number}",
        contact_persons=invoice.contact_persons,
    )
    db.add(credit_note)

    # 5. Audit logs
    cancel_audit = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="invoice.cancelled",
        resource_type="invoice",
        resource_id=invoice.id,
        details={
            "invoice_number": invoice.invoice_number,
            "credit_note_number": cancellation_number,
            "reason": body.reason,
        },
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    credit_audit = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="invoice.credit_note_created",
        resource_type="invoice",
        resource_id=credit_note.id,
        details={
            "credit_note_number": cancellation_number,
            "original_invoice_number": invoice.invoice_number,
            "original_invoice_id": str(invoice.id),
        },
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(cancel_audit)
    db.add(credit_audit)

    await db.commit()
    await db.refresh(invoice)
    await db.refresh(credit_note)

    # 6. Send credit note PDF to recipient (best-effort)
    if credit_note.recipient_email:
        try:
            pdf_bytes = await generate_invoice_pdf(credit_note, conference, db)
            attachment = {
                "filename": f"credit_note_{credit_note.invoice_number}.pdf",
                "content": base64.b64encode(pdf_bytes).decode("ascii"),
            }
            await send_email(
                to=credit_note.recipient_email,
                subject=f"Credit Note {credit_note.invoice_number}",
                html=(
                    f"<p>Please find attached the credit note {credit_note.invoice_number} "
                    f"for invoice {invoice.invoice_number}.</p>"
                ),
                attachments=[attachment],
            )
        except Exception:
            pass  # Best-effort — credit note is saved regardless

    return CancelInvoiceResponse(
        cancelled_invoice=build_invoice_response(invoice, related_invoice_number=None),
        credit_note=build_invoice_response(credit_note, related_invoice_number=invoice.invoice_number),
    )


@router.post(
    "/{invoice_id}/send",
    response_model=InvoiceResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def send_invoice(
    conference_id: UUID,
    invoice_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> InvoiceResponse:
    """Send (or resend) an invoice PDF via email.

    For draft invoices: assigns number, sets status to 'sent', emails PDF.
    For sent/overdue invoices: re-emails the PDF.
    """
    await _require_invoice_admin(db, current_user, conference_id)
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    result = await db.execute(
        select(Invoice).where(
            Invoice.id == invoice_id,
            Invoice.conference_id == conference_id,
            Invoice.tenant_id == current_user.tenant_id,
        )
    )
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise NotFoundError(f"Invoice with ID '{invoice_id}' not found")

    # Only draft, sent, or overdue can be sent/resent
    if invoice.status not in ("draft", "sent", "overdue"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot send an invoice with status '{invoice.status}'.",
        )

    if not invoice.recipient_email:
        raise HTTPException(status_code=400, detail="Invoice has no recipient email address.")

    # Validate required fields for draft
    is_first_send = invoice.status == "draft"
    if is_first_send:
        if not invoice.recipient_name:
            raise HTTPException(status_code=400, detail="Recipient name is required.")
        if not (invoice.line_items and len(invoice.line_items) > 0):
            raise HTTPException(status_code=400, detail="At least one line item is required.")
        # Assign number and transition
        invoice.invoice_number = await generate_invoice_number(db, conference_id, current_user.tenant_id)
        invoice.status = "sent"
        if invoice.issue_date is None:
            invoice.issue_date = date_type.today()

    # Generate PDF and send email
    pdf_bytes = await generate_invoice_pdf(invoice, conference, db)
    is_credit_note = invoice.template_type == "credit_note"
    doc_label = "Credit Note" if is_credit_note else "Invoice"
    attachment = {
        "filename": f"{'credit_note' if is_credit_note else 'invoice'}_{invoice.invoice_number}.pdf",
        "content": base64.b64encode(pdf_bytes).decode("ascii"),
    }
    email_sent = await send_email(
        to=invoice.recipient_email,
        subject=f"{doc_label} {invoice.invoice_number}",
        html=f"<p>Please find attached {doc_label.lower()} {invoice.invoice_number}.</p>",
        attachments=[attachment],
    )

    if not email_sent:
        raise HTTPException(status_code=500, detail="Failed to send email. Please try again.")

    # Audit log
    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="invoice.sent" if is_first_send else "invoice.resent",
        resource_type="invoice",
        resource_id=invoice.id,
        details={
            "invoice_number": invoice.invoice_number,
            "recipient_email": invoice.recipient_email,
            "is_resend": not is_first_send,
        },
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(invoice)

    return build_invoice_response(invoice)


@router.post(
    "/{invoice_id}/refund",
    response_model=InvoiceResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def refund_stripe_payment(
    conference_id: UUID,
    invoice_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> InvoiceResponse:
    """Trigger Stripe refund for a cancelled credit card invoice.

    Only works for:
    - Cancelled invoices
    - credit_card template type
    - Has stripe_payment_intent_id
    - Not already refunded
    """
    from sqlalchemy.orm import selectinload

    await _require_invoice_admin(db, current_user, conference_id)
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    # Fetch invoice with events relationship
    result = await db.execute(
        select(Invoice)
        .options(selectinload(Invoice.events))
        .where(
            Invoice.id == invoice_id,
            Invoice.conference_id == conference_id,
            Invoice.tenant_id == current_user.tenant_id,
        )
    )
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise NotFoundError(f"Invoice with ID '{invoice_id}' not found")

    # Validation: only cancelled invoices
    if invoice.status != "cancelled":
        raise HTTPException(
            status_code=400,
            detail="Only cancelled invoices can be refunded. Cancel the invoice first.",
        )

    # Validation: only credit card invoices
    if invoice.template_type != "credit_card":
        raise HTTPException(
            status_code=400,
            detail="Only credit card invoices can be refunded via Stripe.",
        )

    # Validation: must have Stripe payment intent
    if not invoice.stripe_payment_intent_id:
        raise HTTPException(
            status_code=400,
            detail="No Stripe payment to refund. This invoice was not paid via Stripe.",
        )

    # Validation: check if already refunded
    refund_succeeded_events = [e for e in invoice.events if e.event_type == InvoiceEventType.REFUND_SUCCEEDED]
    if refund_succeeded_events:
        raise HTTPException(
            status_code=400,
            detail=f"Invoice already refunded on {refund_succeeded_events[0].created_at}.",
        )

    # Trigger Stripe refund
    refund_result = await refund_payment(
        db=db,
        conference=conference,
        invoice=invoice,
        current_user=current_user,
        amount=None,  # Full refund
        reason="requested_by_customer",
    )

    # Audit log
    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="invoice.refunded",
        resource_type="invoice",
        resource_id=invoice.id,
        details={
            "invoice_number": invoice.invoice_number,
            "refund_id": refund_result["refund_id"],
            "amount": float(refund_result["amount"]),
            "currency": refund_result["currency"],
        },
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(invoice)

    return build_invoice_response(invoice)
