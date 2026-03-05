"""Portal invoice endpoints for applicants to view and download their invoices."""

import io
from uuid import UUID

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.core.applicant_dependencies import CurrentApplicantDep, DbSessionDep
from app.core.exceptions import NotFoundError
from app.core.invoice_pdf import generate_invoice_pdf
from app.models.conference import Conference
from app.models.invoice import Invoice

router = APIRouter()


@router.get("/portal/invoices")
async def list_portal_invoices(
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> dict:
    """List invoices addressed to the current applicant.

    Returns invoices where the applicant is the recipient (as speaker or
    committee member). Only sent/paid/overdue invoices are shown — drafts
    and cancelled invoices are hidden from the portal.
    """
    applicant_id = current_applicant.applicant_id
    tenant_id = current_applicant.tenant_id

    query = (
        select(Invoice, Conference.name)
        .join(Conference, Conference.id == Invoice.conference_id)
        .where(
            Invoice.tenant_id == tenant_id,
            Invoice.recipient_source_id == applicant_id,
            Invoice.recipient_source_type.in_(["speaker", "committee"]),
            Invoice.status.in_(["sent", "paid", "overdue"]),
            Invoice.is_active.is_(True),
        )
        .order_by(Invoice.created_at.desc())
    )

    result = await db.execute(query)
    rows = result.all()

    items = [
        {
            "id": str(inv.id),
            "conference_id": str(inv.conference_id),
            "conference_name": conf_name,
            "invoice_number": inv.invoice_number,
            "template_type": inv.template_type,
            "status": inv.status,
            "issue_date": str(inv.issue_date) if inv.issue_date else None,
            "due_date": str(inv.due_date) if inv.due_date else None,
            "total": float(inv.total) if inv.total is not None else None,
            "currency": inv.currency,
        }
        for inv, conf_name in rows
    ]

    return {"items": items, "total": len(items)}


@router.get("/portal/invoices/{invoice_id}/pdf")
async def download_portal_invoice_pdf(
    invoice_id: UUID,
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> StreamingResponse:
    """Download PDF for an invoice addressed to the current applicant."""
    applicant_id = current_applicant.applicant_id
    tenant_id = current_applicant.tenant_id

    # Fetch invoice and verify it belongs to this applicant
    result = await db.execute(
        select(Invoice).where(
            Invoice.id == invoice_id,
            Invoice.tenant_id == tenant_id,
            Invoice.recipient_source_id == applicant_id,
            Invoice.recipient_source_type.in_(["speaker", "committee"]),
            Invoice.status.in_(["sent", "paid", "overdue"]),
            Invoice.is_active.is_(True),
        )
    )
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise NotFoundError("Invoice not found")

    # Fetch conference with tenant for PDF generation
    conf_result = await db.execute(
        select(Conference).options(joinedload(Conference.tenant)).where(Conference.id == invoice.conference_id)
    )
    conference = conf_result.scalar_one()

    pdf_bytes = await generate_invoice_pdf(invoice, conference, db)

    filename = f"invoice_{invoice.invoice_number or 'draft'}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
