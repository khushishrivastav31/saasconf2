"""Offer template CRUD + file management endpoints."""

from io import BytesIO
from uuid import UUID

from fastapi import APIRouter, File, Query, Request, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import func, literal, select

from app.core.dependencies import DbSessionDep, TenantAdminDep, get_client_ip
from app.core.exceptions import NotFoundError
from app.models.attachment import Attachment
from app.models.audit import AuditLog
from app.models.offer_template import OfferTemplate
from app.schemas.offer_template import (
    OfferTemplateCreate,
    OfferTemplateResponse,
    OfferTemplateUpdate,
)

router = APIRouter(prefix="/offer-templates", tags=["offer-templates"])

ENTITY_TYPE = "offer_template"


def _tenant_filter(current_user: TenantAdminDep):
    if current_user.is_super_admin:
        return literal(True)
    return OfferTemplate.tenant_id == current_user.tenant_id


async def _get_or_404(template_id: UUID, current_user: TenantAdminDep, db: DbSessionDep) -> OfferTemplate:
    result = await db.execute(
        select(OfferTemplate).where(OfferTemplate.id == template_id, _tenant_filter(current_user))
    )
    template = result.scalar_one_or_none()
    if not template:
        raise NotFoundError("Offer template not found")
    return template


async def _get_file(template_id: UUID, db: DbSessionDep) -> Attachment | None:
    result = await db.execute(
        select(Attachment).where(
            Attachment.entity_type == ENTITY_TYPE,
            Attachment.entity_id == template_id,
        )
    )
    return result.scalar_one_or_none()


def _to_response(template: OfferTemplate, attachment: Attachment | None = None) -> OfferTemplateResponse:
    resp = OfferTemplateResponse.model_validate(template)
    if attachment:
        resp.has_file = True
        resp.filename = attachment.filename
        resp.file_size = attachment.file_size
    return resp


@router.get("", response_model=dict)
async def list_offer_templates(
    current_user: TenantAdminDep,
    db: DbSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    search: str | None = Query(None),
) -> dict:
    """List offer templates with file info."""
    base = select(OfferTemplate).where(_tenant_filter(current_user))
    if search:
        base = base.where(OfferTemplate.name.ilike(f"%{search}%"))

    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    items_q = base.order_by(OfferTemplate.name).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(items_q)
    templates = result.scalars().all()

    # Batch fetch attachments
    template_ids = [t.id for t in templates]
    attachments_map: dict[UUID, Attachment] = {}
    if template_ids:
        att_result = await db.execute(
            select(Attachment).where(
                Attachment.entity_type == ENTITY_TYPE,
                Attachment.entity_id.in_(template_ids),
            )
        )
        for att in att_result.scalars().all():
            attachments_map[att.entity_id] = att

    items = [_to_response(t, attachments_map.get(t.id)) for t in templates]
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.post("", response_model=OfferTemplateResponse, status_code=201)
async def create_offer_template(
    data: OfferTemplateCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> OfferTemplateResponse:
    """Create a new offer template (metadata only, upload file separately)."""
    template = OfferTemplate(tenant_id=current_user.tenant_id, **data.model_dump())
    db.add(template)
    db.add(
        AuditLog(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action="offer_template.create",
            resource_type="offer_template",
            details={"name": data.name, "language": data.language},
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent"),
        )
    )
    await db.commit()
    await db.refresh(template)
    return _to_response(template)


@router.put("/{template_id}", response_model=OfferTemplateResponse)
async def update_offer_template(
    template_id: UUID,
    data: OfferTemplateUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> OfferTemplateResponse:
    """Update offer template metadata."""
    template = await _get_or_404(template_id, current_user, db)
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(template, key, value)
    db.add(
        AuditLog(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action="offer_template.update",
            resource_type="offer_template",
            resource_id=template_id,
            details=update_data,
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent"),
        )
    )
    await db.commit()
    await db.refresh(template)
    attachment = await _get_file(template_id, db)
    return _to_response(template, attachment)


@router.delete("/{template_id}")
async def delete_offer_template(
    template_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete offer template and its file."""
    template = await _get_or_404(template_id, current_user, db)
    # Delete attachment if exists
    attachment = await _get_file(template_id, db)
    if attachment:
        await db.delete(attachment)
    await db.delete(template)
    db.add(
        AuditLog(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action="offer_template.delete",
            resource_type="offer_template",
            resource_id=template_id,
            details={"name": template.name},
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent"),
        )
    )
    await db.commit()
    return {"message": "Offer template deleted"}


@router.post("/{template_id}/upload", response_model=OfferTemplateResponse)
async def upload_offer_template_file(
    template_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    file: UploadFile = File(...),
) -> OfferTemplateResponse:
    """Upload or replace the template file."""
    template = await _get_or_404(template_id, current_user, db)
    file_data = await file.read()

    if not file_data:
        from app.core.exceptions import ValidationError

        raise ValidationError("Empty file upload is not allowed")

    # Max 10MB
    if len(file_data) > 10 * 1024 * 1024:
        from app.core.exceptions import ValidationError

        raise ValidationError("File size exceeds 10MB limit")

    # Replace existing attachment if any
    existing = await _get_file(template_id, db)
    if existing:
        existing.filename = file.filename or "template"
        existing.content_type = file.content_type or "application/octet-stream"
        existing.file_size = len(file_data)
        existing.file_data = file_data
    else:
        attachment = Attachment(
            tenant_id=current_user.tenant_id,
            entity_type=ENTITY_TYPE,
            entity_id=template_id,
            filename=file.filename or "template",
            content_type=file.content_type or "application/octet-stream",
            file_size=len(file_data),
            file_data=file_data,
            uploaded_by=current_user.user_id,
        )
        db.add(attachment)

    await db.commit()
    await db.refresh(template)
    attachment = await _get_file(template_id, db)
    return _to_response(template, attachment)


@router.get("/{template_id}/download")
async def download_offer_template_file(
    template_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> StreamingResponse:
    """Download the template file."""
    await _get_or_404(template_id, current_user, db)
    attachment = await _get_file(template_id, db)
    if not attachment:
        raise NotFoundError("No file uploaded for this template")
    return StreamingResponse(
        BytesIO(attachment.file_data),
        media_type=attachment.content_type,
        headers={"Content-Disposition": f'attachment; filename="{attachment.filename}"'},
    )


@router.delete("/{template_id}/file")
async def delete_offer_template_file(
    template_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> OfferTemplateResponse:
    """Remove the file from the template (keep metadata)."""
    template = await _get_or_404(template_id, current_user, db)
    attachment = await _get_file(template_id, db)
    if attachment:
        await db.delete(attachment)
        await db.commit()
    return _to_response(template)
