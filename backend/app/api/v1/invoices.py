"""Invoice management endpoints (conference-scoped)."""

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import delete as sa_delete
from sqlalchemy import select

from app.core.dependencies import CurrentUserDep, DbSessionDep, check_conference_admin_access, get_client_ip, require_module
from app.core.exceptions import AuthorizationError, NotFoundError
from app.core.pagination import paginate
from app.core.search import unaccent_ilike
from app.models.attachment import Attachment
from app.models.audit import AuditLog
from app.models.conference import Conference
from app.models.invoice import Invoice
from app.schemas.invoice import (
    InvoiceCreate,
    InvoiceListResponse,
    InvoiceResponse,
    InvoiceUpdate,
)

router = APIRouter()

MODULE_CODE = "invoices"


async def _get_conference_for_tenant(
    db, conference_id: UUID, tenant_id: UUID
) -> Conference:
    """Fetch conference and raise 404 if not found or not owned by tenant."""
    result = await db.execute(
        select(Conference).where(
            Conference.id == conference_id,
            Conference.tenant_id == tenant_id,
        )
    )
    conference = result.scalar_one_or_none()
    if not conference:
        raise NotFoundError(f"Conference with ID '{conference_id}' not found")
    return conference


def build_invoice_response(invoice: Invoice) -> InvoiceResponse:
    """Build an InvoiceResponse from an Invoice model."""
    return InvoiceResponse(
        id=invoice.id,
        tenant_id=invoice.tenant_id,
        conference_id=invoice.conference_id,
        invoice_number=invoice.invoice_number,
        status=invoice.status,
        issue_date=invoice.issue_date,
        due_date=invoice.due_date,
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
        contact_persons=invoice.contact_persons or [],
        is_active=invoice.is_active,
        created_at=invoice.created_at,
        updated_at=invoice.updated_at,
    )


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
    await _get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    query = select(Invoice).where(
        Invoice.conference_id == conference_id,
        Invoice.tenant_id == current_user.tenant_id,
    )

    if search:
        query = query.where(
            unaccent_ilike(Invoice.invoice_number, search)
            | unaccent_ilike(Invoice.recipient_name, search)
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
        pages=(result.total + page_size - 1) // page_size,
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
    """Create a new invoice for a conference."""
    # Check admin access: tenant admin OR conference-specific admin
    if not current_user.is_super_admin and not current_user.is_tenant_admin:
        has_access = await check_conference_admin_access(db, current_user.user_id, conference_id)
        if not has_access:
            raise AuthorizationError("Admin access to this conference required")

    conference = await _get_conference_for_tenant(
        db, conference_id, current_user.tenant_id
    )

    invoice = Invoice(
        tenant_id=current_user.tenant_id,
        conference_id=conference.id,
        invoice_number=invoice_data.invoice_number,
        status=invoice_data.status,
        issue_date=invoice_data.issue_date,
        due_date=invoice_data.due_date,
        recipient_name=invoice_data.recipient_name,
        recipient_email=invoice_data.recipient_email,
        recipient_address_line1=invoice_data.recipient_address_line1,
        recipient_address_line2=invoice_data.recipient_address_line2,
        recipient_city=invoice_data.recipient_city,
        recipient_state=invoice_data.recipient_state,
        recipient_postal_code=invoice_data.recipient_postal_code,
        recipient_country=invoice_data.recipient_country,
        recipient_vat_number=invoice_data.recipient_vat_number,
        line_items=(
            [li.model_dump() for li in invoice_data.line_items]
            if invoice_data.line_items
            else []
        ),
        subtotal=invoice_data.subtotal,
        tax_rate=invoice_data.tax_rate,
        tax_amount=invoice_data.tax_amount,
        total=invoice_data.total,
        currency=invoice_data.currency,
        notes=invoice_data.notes,
        contact_persons=(
            [cp.model_dump() for cp in invoice_data.contact_persons]
            if invoice_data.contact_persons
            else []
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
            "invoice_number": invoice.invoice_number,
            "conference_id": str(conference.id),
        },
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(invoice)

    return build_invoice_response(invoice)


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
    """Update an invoice."""
    # Check admin access: tenant admin OR conference-specific admin
    if not current_user.is_super_admin and not current_user.is_tenant_admin:
        has_access = await check_conference_admin_access(db, current_user.user_id, conference_id)
        if not has_access:
            raise AuthorizationError("Admin access to this conference required")

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

    # Serialize line items if present
    if "line_items" in update_data and update_data["line_items"] is not None:
        update_data["line_items"] = [
            li.model_dump() if hasattr(li, "model_dump") else li
            for li in update_data["line_items"]
        ]

    # Serialize contact persons if present
    if "contact_persons" in update_data and update_data["contact_persons"] is not None:
        update_data["contact_persons"] = [
            cp.model_dump() if hasattr(cp, "model_dump") else cp
            for cp in update_data["contact_persons"]
        ]

    for field, value in update_data.items():
        setattr(invoice, field, value)

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="invoice.update",
        resource_type="invoice",
        resource_id=invoice_id,
        details={"updated_fields": list(update_data.keys())},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(invoice)

    return build_invoice_response(invoice)


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
    # Check admin access: tenant admin OR conference-specific admin
    if not current_user.is_super_admin and not current_user.is_tenant_admin:
        has_access = await check_conference_admin_access(db, current_user.user_id, conference_id)
        if not has_access:
            raise AuthorizationError("Admin access to this conference required")

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

    invoice_number = invoice.invoice_number

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
