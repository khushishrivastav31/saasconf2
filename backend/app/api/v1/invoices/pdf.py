"""Invoice PDF endpoints - download, preview, validate ZUGFeRD."""

import io
import logging
from uuid import UUID

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.conference_helpers import get_conference_for_tenant
from app.core.dependencies import CurrentUserDep, DbSessionDep, require_module
from app.core.exceptions import AuthorizationError, NotFoundError
from app.core.invoice_pdf import generate_invoice_pdf
from app.models.invoice import Invoice

MODULE_CODE = "invoices"
logger = logging.getLogger(__name__)

router = APIRouter()


async def _require_invoice_admin(db: DbSessionDep, current_user: CurrentUserDep, conference_id: UUID) -> None:
    """Check admin access: super admin, tenant admin, OR conference-specific admin."""
    from app.core.dependencies import check_conference_admin_access

    # Super admins and tenant admins have automatic access
    if current_user.is_super_admin or current_user.is_tenant_admin:
        return

    # For regular users, check conference-specific admin access
    has_access = await check_conference_admin_access(db, current_user.user_id, conference_id)
    if not has_access:
        raise AuthorizationError("Admin access to this conference required")


@router.get("/{invoice_id}/pdf", dependencies=[Depends(require_module(MODULE_CODE))])
async def download_invoice_pdf(
    conference_id: UUID,
    invoice_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    inline: bool = False,
    enable_zugferd: bool | None = None,
) -> StreamingResponse:
    """Download invoice PDF with optional ZUGFeRD embedding."""
    await _require_invoice_admin(db, current_user, conference_id)

    result = await db.execute(
        select(Invoice)
        .where(
            Invoice.id == invoice_id,
            Invoice.conference_id == conference_id,
            Invoice.tenant_id == current_user.tenant_id,
        )
        .options(selectinload(Invoice.events))
    )
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise NotFoundError(f"Invoice with ID '{invoice_id}' not found")

    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)
    pdf_bytes = await generate_invoice_pdf(invoice, conference, db, enable_zugferd=enable_zugferd)

    filename = f"invoice_{invoice.invoice_number or 'draft'}.pdf"
    disposition = "inline" if inline else "attachment"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'{disposition}; filename="{filename}"'},
    )


@router.post("/{invoice_id}/preview-pdf", dependencies=[Depends(require_module(MODULE_CODE))])
async def preview_invoice_pdf(
    conference_id: UUID,
    invoice_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> StreamingResponse:
    """Preview invoice PDF inline."""
    await _require_invoice_admin(db, current_user, conference_id)

    result = await db.execute(
        select(Invoice)
        .where(
            Invoice.id == invoice_id,
            Invoice.conference_id == conference_id,
            Invoice.tenant_id == current_user.tenant_id,
        )
        .options(selectinload(Invoice.events))
    )
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise NotFoundError(f"Invoice with ID '{invoice_id}' not found")

    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)
    pdf_bytes = await generate_invoice_pdf(invoice, conference, db)

    return StreamingResponse(
        io.BytesIO(pdf_bytes), media_type="application/pdf", headers={"Content-Disposition": "inline"}
    )


@router.post("/{invoice_id}/validate-zugferd", dependencies=[Depends(require_module(MODULE_CODE))])
async def validate_invoice_zugferd(
    conference_id: UUID,
    invoice_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> dict:
    """Validate ZUGFeRD requirements."""
    await _require_invoice_admin(db, current_user, conference_id)

    result = await db.execute(
        select(Invoice)
        .where(
            Invoice.id == invoice_id,
            Invoice.conference_id == conference_id,
            Invoice.tenant_id == current_user.tenant_id,
        )
        .options(selectinload(Invoice.conference), selectinload(Invoice.events))
    )
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise NotFoundError(f"Invoice with ID '{invoice_id}' not found")

    from app.core.zugferd_validation import validate_zugferd_requirements

    errors = validate_zugferd_requirements(invoice)

    if errors:
        return {"valid": False, "errors": errors, "warnings": [], "can_generate": False}

    return {"valid": True, "errors": [], "warnings": [], "can_generate": True, "profile": "EN16931"}
