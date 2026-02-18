"""Admin messaging template CRUD endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import func, select

from app.core.dependencies import CurrentUserDep, DbSessionDep, require_module
from app.core.exceptions import NotFoundError, ValidationError
from app.models.messaging import MessageTemplate
from app.schemas.messaging import (
    MessageTemplateCreate,
    MessageTemplateListResponse,
    MessageTemplateResponse,
    MessageTemplateUpdate,
)

from ._shared import MODULE_CODE, _check_messaging_access

router = APIRouter(prefix="/templates")


@router.get(
    "",
    response_model=MessageTemplateListResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def list_templates(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> MessageTemplateListResponse:
    """List message templates for the tenant."""
    tenant_id = current_user.tenant_id

    query = select(MessageTemplate).where(MessageTemplate.tenant_id == tenant_id).order_by(MessageTemplate.name)

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    result = await db.execute(query)
    templates = result.scalars().all()

    return MessageTemplateListResponse(
        items=[
            MessageTemplateResponse(
                id=t.id,
                name=t.name,
                subject=t.subject,
                body_html=t.body_html,
                created_at=t.created_at,
                updated_at=t.updated_at,
            )
            for t in templates
        ],
        total=total,
    )


@router.post(
    "",
    response_model=MessageTemplateResponse,
    status_code=201,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def create_template(
    conference_id: UUID,
    data: MessageTemplateCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> MessageTemplateResponse:
    """Create a new message template."""
    tenant_id = current_user.tenant_id
    await _check_messaging_access(db, current_user, conference_id)

    # Check for duplicate name
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
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)

    return MessageTemplateResponse(
        id=template.id,
        name=template.name,
        subject=template.subject,
        body_html=template.body_html,
        created_at=template.created_at,
        updated_at=template.updated_at,
    )


@router.put(
    "/{template_id}",
    response_model=MessageTemplateResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def update_template(
    conference_id: UUID,
    template_id: UUID,
    data: MessageTemplateUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> MessageTemplateResponse:
    """Update a message template."""
    tenant_id = current_user.tenant_id
    await _check_messaging_access(db, current_user, conference_id)

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
        # Check for duplicate name
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

    await db.commit()
    await db.refresh(template)

    return MessageTemplateResponse(
        id=template.id,
        name=template.name,
        subject=template.subject,
        body_html=template.body_html,
        created_at=template.created_at,
        updated_at=template.updated_at,
    )


@router.delete(
    "/{template_id}",
    status_code=204,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def delete_template(
    conference_id: UUID,
    template_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> None:
    """Delete a message template."""
    tenant_id = current_user.tenant_id
    await _check_messaging_access(db, current_user, conference_id)

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
