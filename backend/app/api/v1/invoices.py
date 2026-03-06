"""Invoice management endpoints (conference-scoped)."""

import asyncio
import contextlib
import io
import logging
from datetime import date as date_type
from decimal import Decimal
from uuid import UUID

import stripe
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import delete as sa_delete
from sqlalchemy import func as sa_func
from sqlalchemy import inspect as sa_inspect
from sqlalchemy import or_, select
from sqlalchemy.orm import selectinload

from app.core.conference_helpers import get_conference_for_tenant
from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    check_conference_admin_access,
    get_client_ip,
    require_module,
)
from app.core.exceptions import AuthorizationError, NotFoundError
from app.core.invoice_audit import create_invoice_audit_log
from app.core.invoice_email import send_invoice_email
from app.core.invoice_events import InvoiceEventType, log_invoice_event
from app.core.invoice_number import generate_cancellation_number, generate_invoice_number
from app.core.invoice_operations import create_credit_note_for_invoice
from app.core.invoice_pdf import generate_invoice_pdf
from app.core.invoice_queries import get_invoice_with_events, refresh_invoice_with_events
from app.core.invoice_validation import validate_recipient_fields
from app.core.pagination import calculate_pages, paginate
from app.core.search import unaccent_ilike
from app.core.stripe_helper import (
    create_payment_link,
    deactivate_payment_link_for_invoice,
    find_payment_intent_for_invoice,
    refund_payment,
)
from app.core.vat_calculation import calculate_vat_for_invoice
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
    ConvertToCreditCardResponse,
    InvoiceCreate,
    InvoiceEventResponse,
    InvoiceListResponse,
    InvoiceResponse,
    InvoiceUpdate,
    MarkPaidRequest,
    RecipientSearchResponse,
    RecipientSearchResult,
    ReopenInvoiceRequest,
)
from app.schemas.vat_rate import VatPreviewRequest, VatPreviewResponse

router = APIRouter()

MODULE_CODE = "invoices"
logger = logging.getLogger(__name__)


def build_invoice_response(
    invoice: Invoice,
    related_invoice_number: str | None = None,
) -> InvoiceResponse:
    """Build an InvoiceResponse from an Invoice model."""
    # Explicitly convert events to avoid lazy loading
    events_data = []
    # Check if events relationship has been loaded using SQLAlchemy inspection
    insp = sa_inspect(invoice)
    if "events" in insp.unloaded:
        # Events not loaded, skip them
        pass
    else:
        # Events were loaded (either eagerly or previously accessed)
        for event in invoice.events or []:
            events_data.append(
                InvoiceEventResponse(
                    id=event.id,
                    invoice_id=event.invoice_id,
                    event_type=event.event_type,
                    stripe_object_id=event.stripe_object_id,
                    stripe_object_type=event.stripe_object_type,
                    stripe_idempotency_key=event.stripe_idempotency_key,
                    amount=float(event.amount) if event.amount else None,
                    currency=event.currency,
                    status=event.status,
                    event_metadata=event.event_metadata,
                    error_message=event.error_message,
                    user_id=event.user_id,
                    user_email=event.user_email,
                    created_at=event.created_at,
                )
            )

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
        vat_auto_calculated=invoice.vat_auto_calculated,
        events=events_data,
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

    query = (
        select(Invoice)
        .where(
            Invoice.conference_id == conference_id,
            Invoice.tenant_id == current_user.tenant_id,
        )
        .options(selectinload(Invoice.events))
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

    # Validate required recipient fields
    validate_recipient_fields(invoice_data)

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

    # Auto-calculate VAT based on recipient country, customer type, and attendance type
    rate, tax_amount, notes_text = await calculate_vat_for_invoice(invoice, conference, db)
    invoice.tax_rate = rate
    invoice.tax_amount = tax_amount
    subtotal_decimal = Decimal(str(invoice.subtotal)) if invoice.subtotal is not None else Decimal("0.00")
    invoice.total = subtotal_decimal + tax_amount
    invoice.vat_auto_calculated = True

    # Append reverse charge/OSS notes if applicable
    if notes_text:
        if invoice.notes:
            invoice.notes = f"{invoice.notes}\n\n{notes_text}"
        else:
            invoice.notes = notes_text

    db.add(invoice)

    audit_log = create_invoice_audit_log(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="invoice.create",
        invoice=invoice,
        details={"conference_id": str(conference.id)},
        request=request,
    )
    db.add(audit_log)

    # Audit log for VAT auto-calculation
    vat_audit_log = create_invoice_audit_log(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="invoice.vat_calculated",
        invoice=invoice,
        details={
            "tax_rate": str(rate),
            "tax_amount": str(tax_amount),
            "auto_calculated": True,
        },
        request=request,
    )
    db.add(vat_audit_log)

    await db.commit()

    # Re-query invoice with events to avoid lazy loading issues after commit
    invoice = await refresh_invoice_with_events(db, invoice.id)

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


@router.post(
    "/preview-vat",
    response_model=VatPreviewResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def preview_vat_calculation(
    conference_id: UUID,
    request_data: VatPreviewRequest,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> VatPreviewResponse:
    """
    Preview VAT calculation without persisting.

    Returns calculated VAT rate, amount, total, and the applied rule based on:
    - Recipient country (domestic/EU/non-EU)
    - Customer type (B2B if VAT number provided, B2C otherwise)
    - Attendance type (inferred or overridden)

    Used by invoice form for live VAT calculation preview.
    """
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    # Create temporary invoice object (not persisted)
    temp_invoice = Invoice(
        tenant_id=current_user.tenant_id,
        conference_id=conference.id,
        recipient_country=request_data.recipient_country,
        recipient_vat_number=request_data.recipient_vat_number,
        subtotal=request_data.subtotal,
        issue_date=(date_type.fromisoformat(request_data.issue_date) if request_data.issue_date else date_type.today()),
        recipient_source_type=None,  # No registration linkage in preview
    )

    # If attendance_type_override provided, use it directly
    # Otherwise, calculate_vat_for_invoice will default to "in_person"
    if request_data.attendance_type_override:
        # Manually calculate for the override scenario
        from app.core.default_settings import DEFAULT_EU_COUNTRIES, DEFAULT_VAT_RULES
        from app.core.vat_calculation import classify_customer_location, classify_customer_type
        from app.core.vat_rules import get_vat_rule

        customer_type = classify_customer_type(request_data.recipient_vat_number)
        eu_countries = conference.settings.get("eu_countries", DEFAULT_EU_COUNTRIES)
        customer_location = classify_customer_location(
            request_data.recipient_country,
            conference.country or "",
            eu_countries,
        )
        vat_rules = conference.settings.get("vat_rules", DEFAULT_VAT_RULES)
        rule = get_vat_rule(
            vat_rules,
            request_data.attendance_type_override,
            customer_type,
            customer_location,
        )

        if not rule:
            raise HTTPException(
                status_code=400,
                detail=f"No VAT rule found for {request_data.attendance_type_override}/{customer_type}/{customer_location}",
            )

        # Calculate rate based on rule (simplified version of calculate_vat_for_invoice logic)
        rate = Decimal("0.00")
        if rule.get("charge_vat"):
            if rule.get("vat_rate_source") == "conference":
                from app.models.vat_rate_by_country import VatRateByCountry

                conference_country_iso = (conference.country or "").strip().upper()
                stmt = select(VatRateByCountry.standard_rate).where(
                    or_(
                        VatRateByCountry.tenant_id == current_user.tenant_id,
                        VatRateByCountry.tenant_id.is_(None),  # Global rates fallback
                    ),
                    VatRateByCountry.country_code == conference_country_iso,
                )
                result = await db.execute(stmt)
                fetched_rate = result.scalar_one_or_none()
                rate = fetched_rate if fetched_rate is not None else Decimal("0.00")
            elif rule.get("vat_rate_source") == "customer":
                from app.models.vat_rate_by_country import VatRateByCountry

                recipient_iso = request_data.recipient_country.strip().upper()
                stmt = select(VatRateByCountry.standard_rate).where(
                    or_(
                        VatRateByCountry.tenant_id == current_user.tenant_id,
                        VatRateByCountry.tenant_id.is_(None),  # Global rates fallback
                    ),
                    VatRateByCountry.country_code == recipient_iso,
                )
                result = await db.execute(stmt)
                fetched_rate = result.scalar_one_or_none()
                rate = fetched_rate if fetched_rate is not None else Decimal("0.00")

        tax_amount = (request_data.subtotal * rate / Decimal("100")).quantize(Decimal("0.01"))

        notes_text = None
        if rule.get("reverse_charge"):
            notes_text = (
                "VAT Reverse Charge: In accordance with Article 196 of the VAT Directive 2006/112/EC, "
                "the customer is liable for VAT in their country of establishment."
            )
        elif rule.get("oss_applicable"):
            notes_text = (
                f"VAT charged under the EU One-Stop Shop (OSS) scheme at the rate applicable in your country ({rate}%)."
            )
    else:
        # Use standard calculation
        rate, tax_amount, notes_text = await calculate_vat_for_invoice(temp_invoice, conference, db)

        # Re-lookup rule for response
        from app.core.default_settings import DEFAULT_EU_COUNTRIES, DEFAULT_VAT_RULES
        from app.core.vat_calculation import classify_customer_location, classify_customer_type
        from app.core.vat_rules import get_vat_rule

        customer_type = classify_customer_type(request_data.recipient_vat_number)
        eu_countries = conference.settings.get("eu_countries", DEFAULT_EU_COUNTRIES)
        customer_location = classify_customer_location(
            request_data.recipient_country,
            conference.country or "",
            eu_countries,
        )
        vat_rules = conference.settings.get("vat_rules", DEFAULT_VAT_RULES)
        rule = get_vat_rule(vat_rules, "in_person", customer_type, customer_location)

        if not rule:
            raise HTTPException(
                status_code=400,
                detail=f"No VAT rule found for in_person/{customer_type}/{customer_location}",
            )

    return VatPreviewResponse(
        tax_rate=rate,
        tax_amount=tax_amount,
        total=request_data.subtotal + tax_amount,
        rule_applied=rule,
        notes_text=notes_text,
    )


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
    invoice = await get_invoice_with_events(db, invoice_id, conference_id, current_user.tenant_id)

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

    invoice = await get_invoice_with_events(db, invoice_id, conference_id, current_user.tenant_id)

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

    # --- VAT manual override handling ---
    # If manual tax changes are made on a draft invoice, mark as not auto-calculated
    if current_status == "draft":
        if "tax_rate" in update_data or "tax_amount" in update_data:
            update_data["vat_auto_calculated"] = False

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

    # Validate required fields only when transitioning from draft to sent
    if new_status == "sent" and current_status == "draft":
        validate_recipient_fields(invoice)

    audit_action = "invoice.update"
    audit_details: dict[str, object] = {"updated_fields": list(update_data.keys())}
    if new_status == "sent" and current_status == "draft":
        audit_action = "invoice.sent"
        audit_details["invoice_number"] = update_data["invoice_number"]

    audit_log = create_invoice_audit_log(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action=audit_action,
        invoice=invoice,
        details=audit_details,
        request=request,
    )
    db.add(audit_log)

    await db.commit()

    # Re-query invoice with events to avoid lazy loading issues after commit
    invoice = await refresh_invoice_with_events(db, invoice.id)

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
        select(Invoice)
        .where(
            Invoice.id == invoice_id,
            Invoice.conference_id == conference_id,
            Invoice.tenant_id == tenant_id,
        )
        .options(selectinload(Invoice.events))
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
        select(Invoice)
        .where(
            Invoice.id == invoice_id,
            Invoice.conference_id == conference_id,
            Invoice.tenant_id == tenant_id,
        )
        .options(selectinload(Invoice.events))
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

    invoice = await get_invoice_with_events(db, invoice_id, conference_id, current_user.tenant_id)

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

    audit_log = create_invoice_audit_log(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="invoice.delete",
        invoice=invoice,
        details={"conference_id": str(conference_id)},
        request=request,
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

    invoice = await get_invoice_with_events(db, invoice_id, conference_id, current_user.tenant_id)

    # Only sent, overdue, or paid invoices can be cancelled
    if invoice.status not in ("sent", "overdue", "paid"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel an invoice with status '{invoice.status}'. "
            "Only sent, overdue, or paid invoices can be cancelled.",
        )

    # Cannot cancel a credit note
    if invoice.template_type == "credit_note":
        raise HTTPException(status_code=400, detail="Cannot cancel a credit note.")

    # Deactivate Stripe payment link if this is a credit card invoice
    await deactivate_payment_link_for_invoice(invoice, conference)

    # If invoice is paid and has Stripe payment, issue a refund first
    refund_result = None
    if invoice.status == "paid" and invoice.template_type == "credit_card" and invoice.stripe_payment_intent_id:
        try:
            refund_result = await refund_payment(
                db=db,
                conference=conference,
                invoice=invoice,
                current_user=current_user,
                amount=None,  # Full refund
                reason="requested_by_customer",
            )
            logger.info(
                f"Issued Stripe refund {refund_result['refund_id']} for cancelled invoice {invoice.invoice_number}"
            )
        except Exception as e:
            logger.error(f"Failed to issue Stripe refund for invoice {invoice.invoice_number}: {e}")
            raise HTTPException(
                status_code=500, detail=f"Failed to issue Stripe refund: {e!s}. Invoice not cancelled."
            ) from e

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

    # 2. Generate cancellation number and create credit note
    cancellation_number = await generate_cancellation_number(db, conference_id, current_user.tenant_id)
    credit_note = create_credit_note_for_invoice(
        invoice=invoice,
        credit_note_number=cancellation_number,
        tenant_id=current_user.tenant_id,
        conference_id=conference_id,
    )
    db.add(credit_note)

    # 3. Audit logs
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

    # Re-query both invoices with events to avoid lazy loading issues after commit
    invoice = await refresh_invoice_with_events(db, invoice.id)
    credit_note = await refresh_invoice_with_events(db, credit_note.id)

    # 4. Send credit note PDF to recipient (best-effort)
    if credit_note.recipient_email:
        with contextlib.suppress(Exception):
            await send_invoice_email(
                db=db,
                invoice=credit_note,
                conference=conference,
                custom_message=(
                    f"Please find attached the credit note {credit_note.invoice_number} "
                    f"for invoice {invoice.invoice_number}."
                ),
            )

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

    invoice = await get_invoice_with_events(db, invoice_id, conference_id, current_user.tenant_id)

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

    # Create Stripe payment link for credit card invoices (before sending email)
    payment_link_url = None
    if invoice.template_type == "credit_card":
        if is_first_send:
            # First send: create new payment link
            try:
                # Add 10 second timeout for Stripe API call
                payment_intent_id, payment_link_url = await asyncio.wait_for(
                    create_payment_link(db, conference, invoice, current_user), timeout=10.0
                )
                invoice.stripe_payment_intent_id = payment_intent_id
                invoice.stripe_payment_link_url = payment_link_url
            except TimeoutError:
                logger.warning(f"Stripe payment link creation timed out for invoice {invoice.id}")
                # Continue with email send even if payment link creation fails
            except Exception as e:
                logger.warning(f"Failed to create Stripe payment link for invoice {invoice.id}: {e}")
                # Continue with email send even if payment link creation fails
        else:
            # Resend: use existing payment link if available
            payment_link_url = invoice.stripe_payment_link_url

    # Generate PDF and send email
    email_sent = await send_invoice_email(
        db=db,
        invoice=invoice,
        conference=conference,
        payment_link_url=payment_link_url,
    )

    if not email_sent:
        raise HTTPException(status_code=500, detail="Failed to send email. Please try again.")

    # Log invoice sent event
    await log_invoice_event(
        db=db,
        invoice_id=invoice.id,
        tenant_id=invoice.tenant_id,
        event_type=InvoiceEventType.INVOICE_SENT,
        status="succeeded",
        user=current_user,
        amount=invoice.total,
        currency=invoice.currency,
        metadata={
            "invoice_number": invoice.invoice_number,
            "recipient_email": invoice.recipient_email,
            "is_resend": not is_first_send,
            "has_payment_link": payment_link_url is not None,
        },
    )

    # Audit log
    audit_log = create_invoice_audit_log(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="invoice.sent" if is_first_send else "invoice.resent",
        invoice=invoice,
        details={
            "recipient_email": invoice.recipient_email,
            "is_resend": not is_first_send,
        },
        request=request,
    )
    db.add(audit_log)

    await db.commit()

    # Refresh with events eagerly loaded
    invoice = await refresh_invoice_with_events(db, invoice_id)

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

    # Re-query invoice with events to avoid lazy loading issues after commit
    invoice = await refresh_invoice_with_events(db, invoice.id)

    return build_invoice_response(invoice)


@router.post("/sync-stripe-payments", response_model=dict)
async def sync_all_stripe_payments(
    conference_id: UUID,
    db: DbSessionDep,
    current_user: CurrentUserDep,
) -> dict:
    """
    Bulk sync payment status for all pending credit card invoices.

    Checks all credit card invoices with payment intents that are sent/overdue,
    fetches their status from Stripe, and updates accordingly.

    Returns summary of sync operation with counts.
    """
    # Get conference
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    # Check Stripe is enabled
    stripe_settings = conference.settings.get("stripe", {})
    if not stripe_settings.get("is_enabled"):
        raise HTTPException(status_code=400, detail="Stripe is not enabled for this conference")

    secret_key = stripe_settings.get("secret_key")
    if not secret_key:
        raise HTTPException(status_code=400, detail="Stripe secret key not configured")

    # Find all credit card invoices that need syncing
    # Include invoices with or without payment_intent_id (payment links create intent on payment)
    result = await db.execute(
        select(Invoice)
        .where(
            Invoice.conference_id == conference_id,
            Invoice.template_type == "credit_card",
            Invoice.status.in_(["sent", "overdue"]),  # Only sync pending invoices
        )
        .options(selectinload(Invoice.events))
    )
    invoices = result.scalars().all()

    logger.info(f"[SYNC] Found {len(invoices)} credit card invoices to sync for conference {conference_id}")
    for inv in invoices:
        logger.info(
            f"[SYNC] Invoice {inv.invoice_number} (ID: {inv.id}) - "
            f"Status: {inv.status}, Payment Intent: {inv.stripe_payment_intent_id or 'None (payment link)'}"
        )

    if not invoices:
        return {
            "message": "No pending credit card invoices to sync",
            "total_checked": 0,
            "updated_to_paid": 0,
            "payment_failures_logged": 0,
            "errors": [],
        }

    # Initialize Stripe
    stripe.api_key = secret_key

    # Track results
    total_checked = len(invoices)
    updated_to_paid = 0
    payment_failures_logged = 0
    errors = []

    # Sync each invoice
    for invoice in invoices:
        try:
            logger.info(f"[SYNC] Processing invoice {invoice.invoice_number} (ID: {invoice.id})")

            # Find payment intent using 3-tier discovery strategy
            payment_intent = await find_payment_intent_for_invoice(
                invoice=invoice,
                stripe_client=stripe,
                logger_prefix="[SYNC] ",
            )

            # Skip if no payment intent found (customer hasn't paid yet)
            if not payment_intent:
                logger.info(f"[SYNC] No payment intent found for invoice {invoice.invoice_number} - skipping")
                continue

            old_status = invoice.status

            if payment_intent.status == "succeeded" and invoice.status != "paid":
                logger.info(
                    f"[SYNC] Updating invoice {invoice.invoice_number} status from {old_status} to paid "
                    f"(payment intent {payment_intent.id} succeeded)"
                )
                invoice.status = "paid"
                updated_to_paid += 1

                # Capture charge_id if available
                if payment_intent.latest_charge and not invoice.stripe_charge_id:
                    invoice.stripe_charge_id = payment_intent.latest_charge
                    logger.info(f"[SYNC] Captured charge_id: {payment_intent.latest_charge}")

                # Log payment succeeded event
                await log_invoice_event(
                    db=db,
                    invoice_id=invoice.id,
                    tenant_id=invoice.tenant_id,
                    event_type=InvoiceEventType.PAYMENT_SUCCEEDED,
                    status="succeeded",
                    user=current_user,
                    stripe_object_id=payment_intent.id,
                    stripe_object_type="payment_intent",
                    amount=float(payment_intent.amount) / 100,
                    currency=payment_intent.currency.upper(),
                    metadata={
                        "payment_method": payment_intent.payment_method,
                        "sync_source": "bulk",
                        "previous_invoice_status": old_status,
                    },
                )

                # Log audit
                audit = AuditLog(
                    tenant_id=current_user.tenant_id,
                    user_id=current_user.user_id,
                    action="invoice.payment_synced",
                    resource_type="invoice",
                    resource_id=invoice.id,
                    details={
                        "invoice_number": invoice.invoice_number,
                        "old_status": old_status,
                        "new_status": "paid",
                        "stripe_payment_intent_id": invoice.stripe_payment_intent_id,
                        "sync_type": "bulk",
                    },
                    ip_address=None,
                )
                db.add(audit)

            elif payment_intent.status in ("canceled", "failed"):
                logger.info(
                    f"[SYNC] Payment intent {payment_intent.id} for invoice {invoice.invoice_number} "
                    f"has status: {payment_intent.status}"
                )
                # Log failure if not already logged
                existing_failure = any(
                    e.event_type == InvoiceEventType.PAYMENT_FAILED and e.stripe_object_id == payment_intent.id
                    for e in invoice.events
                )

                if not existing_failure:
                    logger.info(f"[SYNC] Logging payment failure for invoice {invoice.invoice_number}")
                    payment_failures_logged += 1
                    await log_invoice_event(
                        db=db,
                        invoice_id=invoice.id,
                        tenant_id=invoice.tenant_id,
                        event_type=InvoiceEventType.PAYMENT_FAILED,
                        status="failed",
                        user=current_user,
                        stripe_object_id=payment_intent.id,
                        stripe_object_type="payment_intent",
                        amount=float(payment_intent.amount) / 100,
                        currency=payment_intent.currency.upper(),
                        error_message=payment_intent.last_payment_error.get("message")
                        if payment_intent.last_payment_error
                        else f"Payment {payment_intent.status}",
                        metadata={
                            "sync_source": "bulk",
                            "payment_intent_status": payment_intent.status,
                        },
                    )
            else:
                logger.info(
                    f"[SYNC] Invoice {invoice.invoice_number} payment intent {payment_intent.id} "
                    f"has status {payment_intent.status} - no action needed"
                )

        except stripe.error.StripeError as e:
            logger.error(f"[SYNC] Failed to sync invoice {invoice.id}: {e}")
            errors.append({"invoice_id": str(invoice.id), "invoice_number": invoice.invoice_number, "error": str(e)})

    logger.info(
        f"[SYNC] Committing changes: {updated_to_paid} invoices updated to paid, "
        f"{payment_failures_logged} failures logged, {len(errors)} errors"
    )
    await db.commit()
    logger.info("[SYNC] Database commit successful")

    return {
        "message": f"Synced {total_checked} invoice(s)",
        "total_checked": total_checked,
        "updated_to_paid": updated_to_paid,
        "payment_failures_logged": payment_failures_logged,
        "errors": errors,
    }


@router.get("/{invoice_id}/debug-stripe-search")
async def debug_stripe_search(
    conference_id: UUID,
    invoice_id: UUID,
    db: DbSessionDep,
    current_user: CurrentUserDep,
) -> dict:
    """Debug endpoint to see what Stripe search returns for an invoice."""
    # Get conference
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    # Get invoice
    result = await db.execute(select(Invoice).where(Invoice.id == invoice_id, Invoice.conference_id == conference_id))
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise NotFoundError("Invoice not found")

    # Check Stripe is enabled
    stripe_settings = conference.settings.get("stripe", {})
    if not stripe_settings.get("is_enabled"):
        raise HTTPException(status_code=400, detail="Stripe is not enabled")

    secret_key = stripe_settings.get("secret_key")
    if not secret_key:
        raise HTTPException(status_code=400, detail="Stripe secret key not configured")

    stripe.api_key = secret_key

    # Search for payment intents
    search_query = f'metadata["invoice_id"]:"{invoice.id}"'
    search_results = stripe.PaymentIntent.search(query=search_query, limit=10)

    return {
        "invoice_id": str(invoice.id),
        "invoice_number": invoice.invoice_number,
        "stored_payment_intent_id": invoice.stripe_payment_intent_id,
        "search_query": search_query,
        "results_found": len(search_results.data),
        "payment_intents": [
            {
                "id": pi.id,
                "status": pi.status,
                "amount": pi.amount / 100,
                "currency": pi.currency,
                "metadata": dict(pi.metadata),
                "created": pi.created,
            }
            for pi in search_results.data
        ],
    }


@router.post("/{invoice_id}/sync-stripe-payment", response_model=InvoiceResponse)
async def sync_stripe_payment(
    conference_id: UUID,
    invoice_id: UUID,
    db: DbSessionDep,
    current_user: CurrentUserDep,
) -> InvoiceResponse:
    """
    Manually sync payment status from Stripe for a single invoice.

    Fetches the current PaymentIntent status from Stripe and updates
    the invoice accordingly. Useful when webhooks aren't configured or fail.

    Returns updated invoice with new events.
    """
    # Get conference
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    # Get invoice with events
    result = await db.execute(
        select(Invoice)
        .where(Invoice.id == invoice_id, Invoice.conference_id == conference_id)
        .options(selectinload(Invoice.events))
    )
    invoice = result.scalar_one_or_none()

    if not invoice:
        raise NotFoundError("Invoice not found")

    # Check Stripe is enabled
    stripe_settings = conference.settings.get("stripe", {})
    if not stripe_settings.get("is_enabled"):
        raise HTTPException(status_code=400, detail="Stripe is not enabled for this conference")

    secret_key = stripe_settings.get("secret_key")
    if not secret_key:
        raise HTTPException(status_code=400, detail="Stripe secret key not configured")

    # Fetch PaymentIntent from Stripe
    stripe.api_key = secret_key

    # Find payment intent using 3-tier discovery strategy
    payment_intent = await find_payment_intent_for_invoice(
        invoice=invoice,
        stripe_client=stripe,
        logger_prefix="",
    )

    # If still no payment intent found, return error
    if not payment_intent:
        raise HTTPException(
            status_code=404,
            detail="No payment intent found for this invoice. Customer may not have paid yet.",
        )

    # Update invoice based on PaymentIntent status
    old_status = invoice.status

    if payment_intent.status == "succeeded" and invoice.status != "paid":
        invoice.status = "paid"

        # Capture charge_id if available
        if payment_intent.latest_charge and not invoice.stripe_charge_id:
            invoice.stripe_charge_id = payment_intent.latest_charge

        # Log payment succeeded event
        await log_invoice_event(
            db=db,
            invoice_id=invoice.id,
            tenant_id=invoice.tenant_id,
            event_type=InvoiceEventType.PAYMENT_SUCCEEDED,
            status="succeeded",
            user=current_user,
            stripe_object_id=payment_intent.id,
            stripe_object_type="payment_intent",
            amount=float(payment_intent.amount) / 100,
            currency=payment_intent.currency.upper(),
            metadata={
                "payment_method": payment_intent.payment_method,
                "sync_source": "manual",
                "previous_invoice_status": old_status,
            },
        )

        # Log audit
        audit = AuditLog(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action="invoice.payment_synced",
            resource_type="invoice",
            resource_id=invoice.id,
            details={
                "invoice_number": invoice.invoice_number,
                "old_status": old_status,
                "new_status": "paid",
                "stripe_payment_intent_id": invoice.stripe_payment_intent_id,
            },
            ip_address=None,
        )
        db.add(audit)

    elif payment_intent.status in ("requires_payment_method", "requires_confirmation", "requires_action"):
        # Payment still pending - no update needed
        pass

    elif payment_intent.status in ("canceled", "failed"):
        # Log failure if not already logged
        existing_failure = any(
            e.event_type == InvoiceEventType.PAYMENT_FAILED and e.stripe_object_id == payment_intent.id
            for e in invoice.events
        )

        if not existing_failure:
            await log_invoice_event(
                db=db,
                invoice_id=invoice.id,
                tenant_id=invoice.tenant_id,
                event_type=InvoiceEventType.PAYMENT_FAILED,
                status="failed",
                user=current_user,
                stripe_object_id=payment_intent.id,
                stripe_object_type="payment_intent",
                amount=float(payment_intent.amount) / 100,
                currency=payment_intent.currency.upper(),
                error_message=payment_intent.last_payment_error.get("message")
                if payment_intent.last_payment_error
                else f"Payment {payment_intent.status}",
                metadata={
                    "sync_source": "manual",
                    "payment_intent_status": payment_intent.status,
                },
            )

    await db.commit()

    # Re-query invoice with events to avoid lazy loading issues after commit
    invoice = await refresh_invoice_with_events(db, invoice.id)

    return build_invoice_response(invoice)


@router.post("/{invoice_id}/convert-to-credit-card", response_model=ConvertToCreditCardResponse)
async def convert_to_credit_card(
    conference_id: UUID,
    invoice_id: UUID,
    db: DbSessionDep,
    current_user: CurrentUserDep,
) -> dict:
    """
    Convert a bank transfer invoice to credit card and generate Stripe payment link.

    Only allowed for bank_transfer invoices with status sent/overdue.
    Updates template_type to credit_card and creates a Stripe payment link.
    """
    # Get conference and check admin access
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)
    await check_conference_admin_access(db, current_user.user_id, conference_id)

    # Get invoice
    result = await db.execute(
        select(Invoice)
        .where(Invoice.id == invoice_id, Invoice.conference_id == conference_id)
        .options(selectinload(Invoice.events))
    )
    invoice = result.scalar_one_or_none()

    if not invoice:
        raise NotFoundError("Invoice not found")

    # Validate
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
            db=db,
            conference=conference,
            invoice=invoice,
            current_user=current_user,
        )

        # Payment intent will be created when customer pays, not upfront
        # The sync will find it via metadata search
        invoice.stripe_payment_intent_id = payment_intent_id  # Will be None
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
    audit = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="invoice.converted_to_credit_card",
        resource_type="invoice",
        resource_id=invoice.id,
        details={
            "invoice_number": invoice.invoice_number,
            "old_template_type": old_template_type,
            "payment_link_url": payment_link_url,
        },
        ip_address=None,
    )
    db.add(audit)

    await db.commit()

    # Re-query invoice with events to avoid lazy loading issues after commit
    invoice = await refresh_invoice_with_events(db, invoice.id)

    # Send email to customer with payment link (best-effort)
    if invoice.recipient_email and payment_link_url:
        try:
            email_sent = await send_invoice_email(
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
            if email_sent:
                logger.info(
                    f"Sent payment link email to {invoice.recipient_email} for invoice {invoice.invoice_number}"
                )
        except Exception as e:
            # Log but don't fail - conversion already succeeded
            logger.warning(f"Failed to send payment link email for invoice {invoice.invoice_number}: {e}")

    return {
        "invoice": build_invoice_response(invoice),
        "payment_link_url": payment_link_url,
    }


@router.post("/{invoice_id}/mark-paid", response_model=InvoiceResponse)
async def mark_invoice_paid(
    conference_id: UUID,
    invoice_id: UUID,
    request_data: MarkPaidRequest,
    db: DbSessionDep,
    current_user: CurrentUserDep,
) -> InvoiceResponse:
    """
    Manually mark a bank transfer invoice as paid with payment date and comment.

    Only allowed for bank_transfer invoices with status sent/overdue.
    Changes status to paid and logs the manual payment event.
    """
    # Get conference and check admin access
    _ = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)
    await check_conference_admin_access(db, current_user.user_id, conference_id)

    # Get invoice
    result = await db.execute(
        select(Invoice)
        .where(Invoice.id == invoice_id, Invoice.conference_id == conference_id)
        .options(selectinload(Invoice.events))
    )
    invoice = result.scalar_one_or_none()

    if not invoice:
        raise NotFoundError("Invoice not found")

    # Validate
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
    audit = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="invoice.marked_paid",
        resource_type="invoice",
        resource_id=invoice.id,
        details={
            "invoice_number": invoice.invoice_number,
            "payment_date": request_data.payment_date.isoformat(),
            "comment": request_data.comment,
            "old_status": old_status,
        },
        ip_address=None,
    )
    db.add(audit)

    await db.commit()

    # Re-query invoice with events to avoid lazy loading issues after commit
    invoice = await refresh_invoice_with_events(db, invoice.id)

    return build_invoice_response(invoice)


@router.post("/{invoice_id}/reopen", response_model=InvoiceResponse)
async def reopen_invoice(
    conference_id: UUID,
    invoice_id: UUID,
    request_data: ReopenInvoiceRequest,
    db: DbSessionDep,
    current_user: CurrentUserDep,
) -> InvoiceResponse:
    """
    Reopen a paid, cancelled, or overdue invoice back to 'sent' status.

    Requires a comment explaining the reason for reopening.
    Logs the reopen event for audit trail.
    """
    # Get conference and check admin access
    _ = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)
    await check_conference_admin_access(db, current_user.user_id, conference_id)

    # Get invoice
    result = await db.execute(
        select(Invoice)
        .where(Invoice.id == invoice_id, Invoice.conference_id == conference_id)
        .options(selectinload(Invoice.events))
    )
    invoice = result.scalar_one_or_none()

    if not invoice:
        raise NotFoundError("Invoice not found")

    # Validate - can reopen from any non-draft status
    if invoice.status == "draft":
        raise HTTPException(status_code=400, detail="Cannot reopen a draft invoice")

    if invoice.status == "sent":
        raise HTTPException(status_code=400, detail="Invoice is already in 'sent' status")

    # Update status
    old_status = invoice.status
    invoice.status = "sent"

    # Note: If reopening a cancelled credit card invoice, the old payment link was deactivated.
    # The admin should convert it to credit card again if a new payment link is needed,
    # or manually mark it as paid when payment is received.

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
    audit = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="invoice.reopened",
        resource_type="invoice",
        resource_id=invoice.id,
        details={
            "invoice_number": invoice.invoice_number,
            "old_status": old_status,
            "comment": request_data.comment,
        },
        ip_address=None,
    )
    db.add(audit)

    await db.commit()

    # Re-query invoice with events to avoid lazy loading issues after commit
    invoice = await refresh_invoice_with_events(db, invoice.id)

    return build_invoice_response(invoice)
