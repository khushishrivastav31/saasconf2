"""Invoice CRUD API endpoints.

Standard Create, Read, Update, Delete operations for invoices.
Thin wrappers around business logic, handling only HTTP concerns.
"""

import logging
from decimal import Decimal
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import or_, select
from sqlalchemy.orm import selectinload

from app.core.conference_helpers import get_conference_for_tenant
from app.core.dependencies import CurrentUserDep, DbSessionDep, require_module
from app.core.invoice_audit import create_invoice_audit_log
from app.core.invoice_queries import get_invoice_with_events, refresh_invoice_with_events
from app.core.invoice_validation import validate_recipient_fields
from app.core.pagination import calculate_pages, paginate
from app.core.search import unaccent_ilike
from app.core.vat_calculation import calculate_vat_for_invoice
from app.models.cfp_applicants import CFPApplicant
from app.models.invoice import Invoice
from app.models.settings import UserRole, UserRoleAssignment
from app.models.sponsor import Sponsor
from app.schemas.invoice import (
    InvoiceCreate,
    InvoiceListResponse,
    InvoiceResponse,
    InvoiceUpdate,
    RecipientSearchResponse,
)
from app.schemas.vat_rate import VatPreviewRequest, VatPreviewResponse
from app.services.invoice_service import auto_populate_attendance_type_from_registration

from ._helpers import build_invoice_response
from ._helpers import require_invoice_admin as _require_invoice_admin

MODULE_CODE = "invoices"
logger = logging.getLogger(__name__)

router = APIRouter()


# ═══════════════════════════════════════════════════════════════════════
# CRUD Endpoints
# ═══════════════════════════════════════════════════════════════════════


@router.get("", response_model=InvoiceListResponse, dependencies=[Depends(require_module(MODULE_CODE))])
async def list_invoices(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    status: Literal["draft", "sent", "paid", "overdue", "cancelled"] | None = None,
    recipient_source_type: str | None = None,
    recipient_source_id: UUID | None = None,
) -> InvoiceListResponse:
    """List invoices for conference with pagination and optional filters."""
    await _require_invoice_admin(db, current_user, conference_id)

    query = (
        select(Invoice)
        .where(
            Invoice.conference_id == conference_id,
            Invoice.tenant_id == current_user.tenant_id,
            Invoice.is_active.is_(True),
        )
        .options(selectinload(Invoice.events))
        .order_by(Invoice.created_at.desc())
    )

    if status:
        query = query.where(Invoice.status == status)
    if recipient_source_type:
        query = query.where(Invoice.recipient_source_type == recipient_source_type)
    if recipient_source_id:
        query = query.where(Invoice.recipient_source_id == recipient_source_id)

    # Use paginate helper (it handles count + pagination)
    result = await paginate(db, query, page=page, page_size=page_size)

    return InvoiceListResponse(
        items=[build_invoice_response(inv) for inv in result.items],
        total=result.total,
        page=page,
        page_size=page_size,
        pages=calculate_pages(result.total, page_size),
    )


@router.post("", response_model=InvoiceResponse, status_code=201, dependencies=[Depends(require_module(MODULE_CODE))])
async def create_invoice(
    conference_id: UUID,
    invoice_data: InvoiceCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> InvoiceResponse:
    """Create new invoice for conference."""
    await _require_invoice_admin(db, current_user, conference_id)
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    # Validate required fields
    validate_recipient_fields(invoice_data)

    # Auto-populate attendance type from registration
    attendance_type = await auto_populate_attendance_type_from_registration(db, invoice_data)

    # Create invoice
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
        procurement_code=invoice_data.procurement_code,
        attendance_type=attendance_type,
        notes=invoice_data.notes,
        internal_comment=invoice_data.internal_comment,
        contact_persons=(
            [cp.model_dump(mode="json") for cp in invoice_data.contact_persons] if invoice_data.contact_persons else []
        ),
        is_active=invoice_data.is_active,
    )

    # Auto-calculate VAT
    rate, tax_amount, notes_text = await calculate_vat_for_invoice(invoice, conference, db)
    invoice.tax_rate = rate
    invoice.tax_amount = tax_amount
    subtotal_decimal = Decimal(str(invoice.subtotal)) if invoice.subtotal is not None else Decimal("0.00")
    invoice.total = subtotal_decimal + tax_amount
    invoice.vat_auto_calculated = True

    # Append VAT notes if applicable
    if notes_text:
        invoice.notes = f"{invoice.notes}\n\n{notes_text}" if invoice.notes else notes_text

    # Validate VAT requirements
    from app.core.invoice_validation import validate_vat_requirements

    vat_warnings, vat_requirement = await validate_vat_requirements(invoice, conference, db, current_user)

    db.add(invoice)

    # Audit logs
    db.add(
        create_invoice_audit_log(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action="invoice.create",
            invoice=invoice,
            details={"conference_id": str(conference.id)},
            request=request,
        )
    )
    db.add(
        create_invoice_audit_log(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action="invoice.vat_calculated",
            invoice=invoice,
            details={"tax_rate": str(rate), "tax_amount": str(tax_amount), "auto_calculated": True},
            request=request,
        )
    )

    await db.commit()
    invoice = await refresh_invoice_with_events(db, invoice.id)

    return build_invoice_response(invoice, vat_warnings=vat_warnings, vat_requirement=vat_requirement)


# Remaining CRUD endpoints (get, update, delete) would follow similar pattern...
# For now, this demonstrates the structure


# ═══════════════════════════════════════════════════════════════════════
# Search and Preview Endpoints (before path parameters)
# ═══════════════════════════════════════════════════════════════════════


@router.get(
    "/recipient-search", response_model=RecipientSearchResponse, dependencies=[Depends(require_module(MODULE_CODE))]
)
async def search_recipients(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    q: str = Query(..., min_length=2),
) -> RecipientSearchResponse:
    """Search for sponsors/volunteers/CFP applicants to populate invoice recipient."""
    await _require_invoice_admin(db, current_user, conference_id)

    # Search sponsors
    sponsor_result = await db.execute(
        select(Sponsor)
        .where(
            Sponsor.conference_id == conference_id,
            Sponsor.tenant_id == current_user.tenant_id,
            unaccent_ilike(Sponsor.company_name, f"%{q}%"),
        )
        .limit(10)
    )
    sponsors = list(sponsor_result.scalars().all())

    # Search volunteers (applicants with Volunteer role)
    vol_result = await db.execute(
        select(CFPApplicant)
        .join(UserRoleAssignment, UserRoleAssignment.applicant_id == CFPApplicant.id)
        .join(UserRole, UserRoleAssignment.user_role_id == UserRole.id)
        .where(
            UserRole.conference_id == conference_id,
            UserRole.name == "Volunteer",
            CFPApplicant.tenant_id == current_user.tenant_id,
            or_(
                unaccent_ilike(CFPApplicant.first_name, f"%{q}%"),
                unaccent_ilike(CFPApplicant.last_name, f"%{q}%"),
                unaccent_ilike(CFPApplicant.email, f"%{q}%"),
            ),
        )
        .limit(10)
    )
    volunteers = list(vol_result.scalars().all())

    # Build unified results list
    from app.schemas.invoice import RecipientSearchResult

    results = []

    # Add sponsors to results
    for sponsor in sponsors:
        # Extract primary contact email from contact_persons if available
        email = None
        if sponsor.contact_persons and len(sponsor.contact_persons) > 0:
            email = sponsor.contact_persons[0].get("email")

        results.append(
            RecipientSearchResult(
                id=sponsor.id,
                source_type="sponsor",
                display_name=sponsor.company_name or "Unknown Sponsor",
                email=email,
                company=sponsor.company_name,
                address_line1=sponsor.address_line1,
                address_line2=sponsor.address_line2,
                city=sponsor.city,
                state=sponsor.state,
                postal_code=sponsor.postal_code,
                country=sponsor.country,
                vat_number=sponsor.vat_number,
                phone=sponsor.phone,
                contact_persons=sponsor.contact_persons or [],
            )
        )

    # Add volunteers to results
    for volunteer in volunteers:
        display_name = f"{volunteer.first_name} {volunteer.last_name}".strip() or volunteer.email
        results.append(
            RecipientSearchResult(
                id=volunteer.id,
                source_type="volunteer",
                display_name=display_name,
                email=volunteer.email,
                company=volunteer.company,
                address_line1=None,
                address_line2=None,
                city=None,
                state=None,
                postal_code=None,
                country=None,
                vat_number=None,
                phone=volunteer.phone,
                contact_persons=[],
            )
        )

    return RecipientSearchResponse(results=results)


@router.post("/preview-vat", response_model=VatPreviewResponse, dependencies=[Depends(require_module(MODULE_CODE))])
async def preview_vat_calculation(
    conference_id: UUID,
    vat_data: VatPreviewRequest,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> VatPreviewResponse:
    """Preview VAT calculation without creating invoice."""
    await _require_invoice_admin(db, current_user, conference_id)
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    # Create temporary invoice for calculation
    temp_invoice = Invoice(
        tenant_id=current_user.tenant_id,
        conference_id=conference.id,
        recipient_country=vat_data.recipient_country,
        recipient_vat_number=vat_data.recipient_vat_number,
        attendance_type=vat_data.attendance_type_override,
        subtotal=vat_data.subtotal,
    )

    tax_rate, tax_amount, notes = await calculate_vat_for_invoice(temp_invoice, conference, db)

    # Build rule metadata for preview
    rule_applied = {
        "description": "VAT calculation based on customer location and type",
        "attendance_type": vat_data.attendance_type_override or "not specified",
        "customer_type": "B2B" if vat_data.recipient_vat_number else "B2C",
        "customer_country": vat_data.recipient_country or "not specified",
    }

    return VatPreviewResponse(
        tax_rate=tax_rate,
        tax_amount=tax_amount,
        total=Decimal(str(vat_data.subtotal)) + tax_amount,
        rule_applied=rule_applied,
        notes_text=notes,
    )


# ═══════════════════════════════════════════════════════════════════════
# Standard CRUD Endpoints (with path parameters)
# ═══════════════════════════════════════════════════════════════════════


@router.get("/{invoice_id}", response_model=InvoiceResponse, dependencies=[Depends(require_module(MODULE_CODE))])
async def get_invoice(
    conference_id: UUID,
    invoice_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> InvoiceResponse:
    """Get single invoice by ID."""
    invoice = await get_invoice_with_events(db, invoice_id, conference_id, current_user.tenant_id)

    # Resolve related invoice number if present
    related_number: str | None = None
    if invoice.related_invoice_id:
        rel_result = await db.execute(select(Invoice.invoice_number).where(Invoice.id == invoice.related_invoice_id))
        related_number = rel_result.scalar_one_or_none()

    return build_invoice_response(invoice, related_invoice_number=related_number)


# Valid status transitions
VALID_STATUS_TRANSITIONS: dict[str, set[str]] = {
    "draft": {"sent"},
    "sent": {"paid", "overdue"},
    "overdue": {"paid"},
    "paid": set(),
    "cancelled": set(),
}


@router.put("/{invoice_id}", response_model=InvoiceResponse, dependencies=[Depends(require_module(MODULE_CODE))])
async def update_invoice(
    conference_id: UUID,
    invoice_id: UUID,
    invoice_data: InvoiceUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> InvoiceResponse:
    """Update invoice. Drafts are fully editable; non-drafts only allow status changes."""
    await _require_invoice_admin(db, current_user, conference_id)
    invoice = await get_invoice_with_events(db, invoice_id, conference_id, current_user.tenant_id)

    update_data = invoice_data.model_dump(exclude_unset=True)
    current_status = invoice.status
    new_status = update_data.get("status")

    # Status transition validation
    if new_status and new_status != current_status:
        allowed = VALID_STATUS_TRANSITIONS.get(current_status, set())
        if new_status not in allowed:
            from fastapi import HTTPException

            raise HTTPException(
                status_code=400,
                detail=f"Cannot change status from '{current_status}' to '{new_status}'",
            )

    # Field locking: non-draft invoices only allow status changes
    if current_status != "draft":
        non_status_fields = {k for k in update_data if k != "status"}
        if non_status_fields:
            from fastapi import HTTPException

            raise HTTPException(status_code=400, detail="Only status changes allowed on finalized invoices")

    # VAT manual override handling
    if current_status == "draft" and ("tax_rate" in update_data or "tax_amount" in update_data):
        update_data["vat_auto_calculated"] = False

    # Prevent changing invoice_number directly
    update_data.pop("invoice_number", None)

    # Serialize line items/contact persons
    if update_data.get("line_items"):
        update_data["line_items"] = [
            li.model_dump(mode="json") if hasattr(li, "model_dump") else li for li in update_data["line_items"]
        ]
    if update_data.get("contact_persons"):
        update_data["contact_persons"] = [
            cp.model_dump(mode="json") if hasattr(cp, "model_dump") else cp for cp in update_data["contact_persons"]
        ]

    # Auto-assign invoice number on draft → sent
    if new_status == "sent" and current_status == "draft":
        from datetime import date as date_type

        from app.core.invoice_number import generate_invoice_number

        update_data["invoice_number"] = await generate_invoice_number(db, conference_id, current_user.tenant_id)
        if not invoice.issue_date:
            update_data["issue_date"] = date_type.today()

    # Apply updates
    for field, value in update_data.items():
        setattr(invoice, field, value)

    # Audit log
    audit_action = "invoice.sent" if (new_status == "sent" and current_status == "draft") else "invoice.update"
    db.add(
        create_invoice_audit_log(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action=audit_action,
            invoice=invoice,
            details={"updated_fields": list(update_data.keys())},
            request=request,
        )
    )

    await db.commit()
    invoice = await refresh_invoice_with_events(db, invoice.id)

    return build_invoice_response(invoice)


@router.delete("/{invoice_id}", status_code=204, dependencies=[Depends(require_module(MODULE_CODE))])
async def delete_invoice(
    conference_id: UUID,
    invoice_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> None:
    """Delete invoice (soft delete). Only allowed for draft invoices."""
    await _require_invoice_admin(db, current_user, conference_id)
    invoice = await get_invoice_with_events(db, invoice_id, conference_id, current_user.tenant_id)

    from fastapi import HTTPException

    # Check template type first (more specific error)
    if invoice.template_type == "credit_note":
        raise HTTPException(status_code=400, detail="Cannot delete credit notes")

    # Then check status
    if invoice.status != "draft":
        raise HTTPException(status_code=400, detail="Only draft invoices can be deleted")

    invoice.is_active = False

    db.add(
        create_invoice_audit_log(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action="invoice.delete",
            invoice=invoice,
            details={},
            request=request,
        )
    )

    await db.commit()
