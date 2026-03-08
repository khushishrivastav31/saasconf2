"""Conference CSV export endpoints (invoices, papers)."""

from uuid import UUID

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.csv_export import csv_response
from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    check_conference_admin_access,
    require_module,
)
from app.core.exceptions import AuthorizationError, NotFoundError
from app.models.associations import ConferenceCFP
from app.models.booking import BookingOption
from app.models.cfp import CFPPaper
from app.models.conference import Conference
from app.models.invoice import Invoice
from app.models.registration import Registration

from ._shared import MODULE_CODE, _tenant_filter

router = APIRouter()


@router.get("/{conference_id}/export/invoices", dependencies=[Depends(require_module(MODULE_CODE))])
async def export_conference_invoices(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> StreamingResponse:
    """
    Export all invoices for a conference as CSV.

    This endpoint should be used before deleting a conference to preserve invoice data.
    Requires admin access to the conference.
    """
    # Check access
    if not current_user.is_super_admin and not current_user.is_tenant_admin:
        has_access = await check_conference_admin_access(db, current_user.user_id, conference_id)
        if not has_access:
            raise AuthorizationError("Admin access to this conference required")

    # Verify conference exists
    result = await db.execute(
        select(Conference).where(Conference.id == conference_id).where(_tenant_filter(current_user))
    )
    conference = result.scalar_one_or_none()
    if not conference:
        raise NotFoundError("Conference not found")

    # Get all invoices for this conference (capped at 50k for memory safety)
    invoices_result = await db.execute(
        select(Invoice).where(Invoice.conference_id == conference_id).order_by(Invoice.invoice_number).limit(50000)
    )
    invoices = invoices_result.scalars().all()

    filename = f"{conference.abbreviation or conference.name}_invoices.csv".replace(" ", "_")

    return csv_response(
        headers=[
            "Invoice Number",
            "Status",
            "Issue Date",
            "Due Date",
            "Recipient Name",
            "Recipient Email",
            "Recipient Address Line 1",
            "Recipient Address Line 2",
            "Recipient City",
            "Recipient State",
            "Recipient Postal Code",
            "Recipient Country",
            "Recipient VAT Number",
            "Subtotal",
            "Tax Rate (%)",
            "Tax Amount",
            "Total",
            "Currency",
            "Notes",
            "Created At",
        ],
        rows=invoices,
        row_mapper=lambda inv: [
            inv.invoice_number,
            inv.status,
            inv.issue_date.isoformat() if inv.issue_date else "",
            inv.due_date.isoformat() if inv.due_date else "",
            inv.recipient_name,
            inv.recipient_email or "",
            inv.recipient_address_line1 or "",
            inv.recipient_address_line2 or "",
            inv.recipient_city or "",
            inv.recipient_state or "",
            inv.recipient_postal_code or "",
            inv.recipient_country or "",
            inv.recipient_vat_number or "",
            str(inv.subtotal) if inv.subtotal else "",
            str(inv.tax_rate) if inv.tax_rate else "",
            str(inv.tax_amount) if inv.tax_amount else "",
            str(inv.total) if inv.total else "",
            inv.currency or "",
            inv.notes or "",
            inv.created_at.isoformat() if inv.created_at else "",
        ],
        filename=filename,
    )


@router.get("/{conference_id}/export/papers", dependencies=[Depends(require_module(MODULE_CODE))])
async def export_conference_papers(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> StreamingResponse:
    """
    Export all paper submissions for a conference as CSV.

    This endpoint should be used before deleting a conference to preserve submission data.
    Requires admin access to the conference.
    """
    # Check access
    if not current_user.is_super_admin and not current_user.is_tenant_admin:
        has_access = await check_conference_admin_access(db, current_user.user_id, conference_id)
        if not has_access:
            raise AuthorizationError("Admin access to this conference required")

    # Verify conference exists
    result = await db.execute(
        select(Conference).where(Conference.id == conference_id).where(_tenant_filter(current_user))
    )
    conference = result.scalar_one_or_none()
    if not conference:
        raise NotFoundError("Conference not found")

    # Get CFP IDs for this conference
    cfp_ids_result = await db.execute(select(ConferenceCFP.cfp_id).where(ConferenceCFP.conference_id == conference_id))
    cfp_ids = list(cfp_ids_result.scalars().all())

    paper_headers = [
        "Paper ID",
        "Title",
        "Status",
        "CFP Title",
        "Speaker First Name",
        "Speaker Last Name",
        "Speaker Email",
        "Speaker Company",
        "Speaker Title",
        "Abstract (Short)",
        "Level",
        "Learning Objectives",
        "Submitted At",
        "Created At",
    ]
    filename = f"{conference.abbreviation or conference.name}_papers.csv".replace(" ", "_")

    if not cfp_ids:
        # No CFPs, return empty CSV with headers only
        return csv_response(
            headers=["No papers found for this conference"],
            rows=[],
            row_mapper=lambda _: [],
            filename=filename,
        )

    # Get all papers with speaker info (capped at 50k for memory safety)
    papers_result = await db.execute(
        select(CFPPaper)
        .options(selectinload(CFPPaper.main_speaker))
        .options(selectinload(CFPPaper.cfp))
        .where(CFPPaper.cfp_id.in_(cfp_ids))
        .order_by(CFPPaper.created_at)
        .limit(50000)
    )
    papers = papers_result.scalars().all()

    def _map_paper_row(paper: CFPPaper) -> list[str]:
        speaker = paper.main_speaker
        return [
            str(paper.id),
            paper.title,
            paper.status,
            paper.cfp.title if paper.cfp else "",
            speaker.first_name if speaker else "",
            speaker.last_name if speaker else "",
            speaker.email if speaker else "",
            speaker.company or "" if speaker else "",
            speaker.title or "" if speaker else "",
            paper.abstract_short or "",
            paper.level or "",
            paper.learning_objectives or "",
            paper.submitted_at.isoformat() if paper.submitted_at else "",
            paper.created_at.isoformat() if paper.created_at else "",
        ]

    return csv_response(
        headers=paper_headers,
        rows=papers,
        row_mapper=_map_paper_row,
        filename=filename,
    )


@router.get("/{conference_id}/export/attendees", dependencies=[Depends(require_module("registration"))])
async def export_conference_attendees(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> StreamingResponse:
    """
    Export all conference attendees as CSV.

    Requires admin access to the conference.
    """
    # Check access
    if not current_user.is_super_admin and not current_user.is_tenant_admin:
        has_access = await check_conference_admin_access(db, current_user.user_id, conference_id)
        if not has_access:
            raise AuthorizationError("Admin access to this conference required")

    # Verify conference exists
    result = await db.execute(
        select(Conference).where(Conference.id == conference_id).where(_tenant_filter(current_user))
    )
    conference = result.scalar_one_or_none()
    if not conference:
        raise NotFoundError("Conference not found")

    # Fetch registrations with eager loading (prevent N+1)
    stmt = (
        select(Registration)
        .where(
            Registration.conference_id == conference_id,
            Registration.tenant_id == current_user.tenant_id,
        )
        .options(
            selectinload(Registration.billing_profile),
            selectinload(Registration.items),
            selectinload(Registration.main_session),
        )
        .order_by(Registration.created_at.desc())
        .limit(50000)  # Safety cap
    )
    registrations_result = await db.execute(stmt)
    registrations = registrations_result.scalars().all()

    # Batch-fetch booking option names (single query)
    option_ids = {r.booking_option_id for r in registrations}
    if option_ids:
        option_stmt = select(BookingOption).where(BookingOption.id.in_(option_ids))
        option_result = await db.execute(option_stmt)
        options_map = {opt.id: opt.name for opt in option_result.scalars()}
    else:
        options_map = {}

    # Batch-fetch invoice numbers (single query by billing_profile_id)
    billing_ids = {r.billing_profile_id for r in registrations if r.billing_profile_id}
    if billing_ids:
        invoice_stmt = select(Invoice.recipient_source_id, Invoice.invoice_number).where(
            Invoice.recipient_source_type == "registration",
            Invoice.recipient_source_id.in_(billing_ids),
            Invoice.is_active == True,
        )
        invoice_result = await db.execute(invoice_stmt)
        invoices_map = {row[0]: row[1] for row in invoice_result}
    else:
        invoices_map = {}

    # CSV headers
    headers = [
        "First Name",
        "Last Name",
        "Email",
        "Phone",
        "Job Title",
        "Department",
        "Pronouns",
        "Company Name",
        "Booking Option Name",
        "Main Session Name",
        "Add-on Items",
        "Registration Mode",
        "Status",
        "Invoice Number",
        "Created At",
        "Updated At",
        "Notes",
        "Billing Contact Email",
    ]

    # Row mapper
    def row_mapper(reg: Registration) -> list[str]:
        # Get add-on items (skip duplicates of main booking)
        addon_names = [item.item_name for item in reg.items if item.booking_option_id != reg.booking_option_id]

        return [
            reg.first_name,
            reg.last_name,
            reg.email,
            reg.phone or "",
            reg.job_title or "",
            reg.department or "",
            reg.pronouns or "",
            reg.billing_profile.company_name or "" if reg.billing_profile else "",
            options_map.get(reg.booking_option_id, "(deleted)"),
            reg.main_session.title if reg.main_session else "",
            ", ".join(addon_names),
            reg.registration_mode,
            reg.status,
            invoices_map.get(reg.billing_profile_id, ""),
            reg.created_at.isoformat(),
            reg.updated_at.isoformat(),
            reg.notes or "",
            reg.billing_profile.contact_email if reg.billing_profile else "",
        ]

    # Return CSV response
    filename = f"{conference.abbreviation or conference.name.replace(' ', '_')}_attendees.csv"
    return csv_response(headers=headers, rows=registrations, row_mapper=row_mapper, filename=filename)
