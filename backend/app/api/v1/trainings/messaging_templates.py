"""Admin training-broadcast template CRUD.

Templates carry a ``category`` discriminator (``conference`` vs
``training``) added in migration 215. The training-side endpoints only
ever read or write ``category='training'`` rows so the conference admin's
CFP-applicant templates and the training admin's training-attendee
templates don't leak into each other's pickers.

The conference path lives in ``app/api/v1/messaging/templates.py`` and
keeps its existing shape; back-compat preserved because every template
predating migration 215 was created via the conference admin and
defaulted to ``category='conference'``.
"""

from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import func, select

from app.core.dependencies import DbSessionDep, TenantAdminDep
from app.core.exceptions import NotFoundError, ValidationError
from app.models.messaging import TEMPLATE_CATEGORY_TRAINING, MessageTemplate
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
    """List training templates for the tenant.

    Only returns ``category='training'`` rows. Conference templates
    written via the CFP admin surface stay invisible here.
    """
    tenant_id = current_user.require_tenant_id()
    query = (
        select(MessageTemplate)
        .where(
            MessageTemplate.tenant_id == tenant_id,
            MessageTemplate.category == TEMPLATE_CATEGORY_TRAINING,
        )
        .order_by(MessageTemplate.name)
    )
    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar() or 0
    rows = (await db.execute(query)).scalars().all()
    return MessageTemplateListResponse(items=[_to_response(t) for t in rows], total=total)


@router.post("", response_model=MessageTemplateResponse, status_code=201)
async def create_training_template(
    data: MessageTemplateCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> MessageTemplateResponse:
    """Create a new training template.

    Name is unique within the tenant across BOTH categories — the DB
    constraint ``uq_message_templates_tenant_name`` is global so a
    conference-category and a training-category template can't share a
    name. Surfaces the conflict as a 400 with the offender name so the
    admin can see what they collided with.
    """
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
        category=TEMPLATE_CATEGORY_TRAINING,
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
    """Update a training template (rename, change subject/body/overlay).

    Refuses to touch a conference-category template (404) so a stray
    training-side request can't accidentally rewrite a CFP template.
    """
    tenant_id = current_user.require_tenant_id()

    result = await db.execute(
        select(MessageTemplate).where(
            MessageTemplate.id == template_id,
            MessageTemplate.tenant_id == tenant_id,
            MessageTemplate.category == TEMPLATE_CATEGORY_TRAINING,
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
    """Delete a training template. Conference-category rows return 404."""
    tenant_id = current_user.require_tenant_id()

    result = await db.execute(
        select(MessageTemplate).where(
            MessageTemplate.id == template_id,
            MessageTemplate.tenant_id == tenant_id,
            MessageTemplate.category == TEMPLATE_CATEGORY_TRAINING,
        )
    )
    template = result.scalar_one_or_none()
    if not template:
        raise NotFoundError("Template not found")

    await db.delete(template)
    await db.commit()
