"""Conference CSV export endpoints (invoices, papers)."""

import csv
import io
from uuid import UUID

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    check_conference_admin_access,
    require_module,
)
from app.core.exceptions import AuthorizationError, NotFoundError
from app.core.file_validation import safe_content_disposition
from app.models.associations import ConferenceCFP
from app.models.cfp import CFPPaper
from app.models.conference import Conference
from app.models.invoice import Invoice

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

    # Create CSV
    output = io.StringIO()
    writer = csv.writer(output)

    # Header row
    writer.writerow(
        [
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
        ]
    )

    # Data rows
    for inv in invoices:
        writer.writerow(
            [
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
            ]
        )

    output.seek(0)
    filename = f"{conference.abbreviation or conference.name}_invoices.csv".replace(" ", "_")
    csv_bytes = b"\xef\xbb\xbf" + output.getvalue().encode("utf-8")

    return StreamingResponse(
        iter([csv_bytes]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": safe_content_disposition(filename)},
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

    if not cfp_ids:
        # No CFPs, return empty CSV
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["No papers found for this conference"])
        output.seek(0)
        filename = f"{conference.abbreviation or conference.name}_papers.csv".replace(" ", "_")
        csv_bytes = b"\xef\xbb\xbf" + output.getvalue().encode("utf-8")
        return StreamingResponse(
            iter([csv_bytes]),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": safe_content_disposition(filename)},
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

    # Create CSV
    output = io.StringIO()
    writer = csv.writer(output)

    # Header row
    writer.writerow(
        [
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
    )

    # Data rows
    for paper in papers:
        speaker = paper.main_speaker
        writer.writerow(
            [
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
        )

    output.seek(0)
    filename = f"{conference.abbreviation or conference.name}_papers.csv".replace(" ", "_")
    csv_bytes = b"\xef\xbb\xbf" + output.getvalue().encode("utf-8")

    return StreamingResponse(
        iter([csv_bytes]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": safe_content_disposition(filename)},
    )
