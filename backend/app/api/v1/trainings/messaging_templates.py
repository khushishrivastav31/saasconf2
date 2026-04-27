"""Admin training-broadcast template CRUD.

Templates are tenant-scoped (the existing ``MessageTemplate`` model already
fits — it carries no conference reference), so the conference admin's
templates and the training admin's templates share the same pool. PR 4a
exposes the pool through a training-scoped endpoint so the
``TrainingBroadcastDialog`` can pick / save / edit templates without
having to fake a conference context.

The conference path lives in ``app/api/v1/messaging/templates.py`` and
keeps its conference-id-keyed shape for back-compat. Long-term, both
sides could collapse to a single ``/admin/messaging/templates`` route;
for now, we keep them parallel so neither has to bend the other's
contract.
"""

from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import func, select

from app.core.dependencies import DbSessionDep, TenantAdminDep
from app.core.exceptions import NotFoundError, ValidationError
from app.models.messaging import MessageTemplate
from app.schemas.messaging import (
    MessageTemplateCreate,
    MessageTemplateListResponse,
    MessageTemplateResponse,
    MessageTemplateUpdate,
)

router = APIRouter(prefix="/messaging/templates", tags=["training-messaging"])


def _to_response(template: MessageTemplate) -> MessageTemplateResponse:
    return MessageTemplateResponse(
        id=template.id,
        name=template.name,
        subject=template.subject,
        body_html=template.body_html,
        screen_overlay_id=template.screen_overlay_id,
        created_at=template.created_at,
        updated_at=template.updated_at,
    )


@router.get("", response_model=MessageTemplateListResponse)
async def list_training_templates(
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> MessageTemplateListResponse:
    """List message templates for the tenant.

    The pool is shared with the conference-side admin templates — same
    tenant, same rows, same ``MessageTemplate`` table. A name uniqueness
    constraint at the DB layer (``uq_message_templates_tenant_name``)
    keeps the namespace clean.
    """
    tenant_id = current_user.require_tenant_id()
    query = select(MessageTemplate).where(MessageTemplate.tenant_id == tenant_id).order_by(MessageTemplate.name)
    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar() or 0
    rows = (await db.execute(query)).scalars().all()
    return MessageTemplateListResponse(items=[_to_response(t) for t in rows], total=total)


@router.post("", response_model=MessageTemplateResponse, status_code=201)
async def create_training_template(
    data: MessageTemplateCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> MessageTemplateResponse:
    """Create a new message template (tenant-scoped, name-unique)."""
    tenant_id = current_user.require_tenant_id()
    existing = await db.execute(
        select(MessageTemplate).where(
            MessageTemplate.tenant_id == tenant_id,
            MessageTemplate.name == data.name,
        )
    )
    if existing.scalar_one_or_none():
        raise ValidationError(f"Template with name '{data.name}' already exists")

    template = MessageTemplate(
        tenant_id=tenant_id,
        name=data.name,
        subject=data.subject,
        body_html=data.body_html,
        screen_overlay_id=data.screen_overlay_id,
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return _to_response(template)


@router.put("/{template_id}", response_model=MessageTemplateResponse)
async def update_training_template(
    template_id: UUID,
    data: MessageTemplateUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> MessageTemplateResponse:
    """Update a message template (rename, change subject/body/overlay)."""
    tenant_id = current_user.require_tenant_id()

    result = await db.execute(
        select(MessageTemplate).where(
            MessageTemplate.id == template_id,
            MessageTemplate.tenant_id == tenant_id,
        )
    )
    template = result.scalar_one_or_none()
    if not template:
        raise NotFoundError("Template not found")

    if data.name is not None and data.name != template.name:
        dup = await db.execute(
            select(MessageTemplate).where(
                MessageTemplate.tenant_id == tenant_id,
                MessageTemplate.name == data.name,
                MessageTemplate.id != template_id,
            )
        )
        if dup.scalar_one_or_none():
            raise ValidationError(f"Template with name '{data.name}' already exists")
        template.name = data.name

    if data.subject is not None:
        template.subject = data.subject
    if data.body_html is not None:
        template.body_html = data.body_html
    if data.screen_overlay_id is not None:
        template.screen_overlay_id = data.screen_overlay_id

    await db.commit()
    await db.refresh(template)
    return _to_response(template)


@router.delete("/{template_id}", status_code=204)
async def delete_training_template(
    template_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> None:
    """Delete a message template."""
    tenant_id = current_user.require_tenant_id()

    result = await db.execute(
        select(MessageTemplate).where(
            MessageTemplate.id == template_id,
            MessageTemplate.tenant_id == tenant_id,
        )
    )
    template = result.scalar_one_or_none()
    if not template:
        raise NotFoundError("Template not found")

    await db.delete(template)
    await db.commit()
