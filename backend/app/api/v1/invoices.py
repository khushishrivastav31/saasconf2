"""Invoice management endpoints (conference-scoped)."""

import io
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
from app.core.exceptions import AuthorizationError, NotFoundError
from app.core.invoice_number import generate_invoice_number
from app.core.invoice_pdf import generate_invoice_pdf
from app.core.pagination import calculate_pages, paginate
from app.core.search import unaccent_ilike
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
    InvoiceCreate,
    InvoiceListResponse,
    InvoiceResponse,
    InvoiceUpdate,
    RecipientSearchResponse,
    RecipientSearchResult,
)

router = APIRouter()

MODULE_CODE = "invoices"


def build_invoice_response(invoice: Invoice) -> InvoiceResponse:
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
        is_active=invoice.is_active,
        created_at=invoice.created_at,
        updated_at=invoice.updated_at,
    )


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

    query = query.order_by(Invoice.created_at.desc())

    result = await paginate(db, query, page, page_size)

    items = [build_invoice_response(inv) for inv in result.items]

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

    return build_invoice_response(invoice)


# Valid status transitions — draft can only become sent (which assigns a number);
# after that only status changes are allowed.
VALID_STATUS_TRANSITIONS: dict[str, set[str]] = {
    "draft": {"sent"},
    "sent": {"paid", "overdue", "cancelled"},
    "overdue": {"paid", "cancelled"},
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

    # Return as download
    filename = f"invoice_{invoice.invoice_number or 'draft'}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
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
