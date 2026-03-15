"""Tenant-level system email template management (tenant admin only)."""

from fastapi import APIRouter, Request
from sqlalchemy import select

from app.api.v1.settings.email_templates import DEFAULT_TEMPLATES
from app.core.dependencies import DbSessionDep, TenantAdminDep, get_client_ip
from app.core.exceptions import ValidationError
from app.core.html_sanitize import sanitize_html
from app.models.audit import AuditLog
from app.models.settings import EmailTemplate
from app.schemas.email_template import (
    EmailTemplateResponse,
    EmailTemplateType,
    EmailTemplateUpdate,
)

router = APIRouter()


@router.get("", response_model=list[EmailTemplateResponse])
async def list_system_email_templates(
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> list[EmailTemplateResponse]:
    """List all system-level email templates for the tenant."""
    result = await db.execute(
        select(EmailTemplate)
        .where(
            EmailTemplate.tenant_id == current_user.tenant_id,
            EmailTemplate.conference_id.is_(None),
            EmailTemplate.template_type.in_(EmailTemplateType.SYSTEM_TYPES),
        )
        .order_by(EmailTemplate.template_type)
    )
    templates = list(result.scalars().all())
    existing_types = {t.template_type for t in templates}

    # Add unsaved defaults for any missing system types
    for template_type in EmailTemplateType.SYSTEM_TYPES:
        if template_type not in existing_types:
            default = DEFAULT_TEMPLATES.get(template_type, {})
            templates.append(
                EmailTemplate(
                    id=None,
                    tenant_id=current_user.tenant_id,
                    conference_id=None,
                    template_type=template_type,
                    subject=default.get("subject", f"Default subject for {template_type}"),
                    body_html=default.get("body_html", ""),
                    body_text=default.get("body_text"),
                    is_active=True,
                )
            )

    return [EmailTemplateResponse.model_validate(t) for t in templates]


@router.get("/{template_type}", response_model=EmailTemplateResponse)
async def get_system_email_template(
    template_type: str,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> EmailTemplateResponse:
    """Get a specific system email template."""
    if template_type not in EmailTemplateType.SYSTEM_TYPES:
        raise ValidationError(f"Invalid system template type: {template_type}")

    result = await db.execute(
        select(EmailTemplate).where(
            EmailTemplate.tenant_id == current_user.tenant_id,
            EmailTemplate.conference_id.is_(None),
            EmailTemplate.template_type == template_type,
        )
    )
    template = result.scalar_one_or_none()

    if not template:
        default = DEFAULT_TEMPLATES.get(template_type, {})
        template = EmailTemplate(
            id=None,
            tenant_id=current_user.tenant_id,
            conference_id=None,
            template_type=template_type,
            subject=default.get("subject", f"Default subject for {template_type}"),
            body_html=default.get("body_html", ""),
            body_text=default.get("body_text"),
            is_active=True,
        )

    return EmailTemplateResponse.model_validate(template)


@router.put("/{template_type}", response_model=EmailTemplateResponse)
async def update_system_email_template(
    template_type: str,
    update_data: EmailTemplateUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> EmailTemplateResponse:
    """Update a system email template (creates if not yet customized)."""
    if template_type not in EmailTemplateType.SYSTEM_TYPES:
        raise ValidationError(f"Invalid system template type: {template_type}")

    result = await db.execute(
        select(EmailTemplate).where(
            EmailTemplate.tenant_id == current_user.tenant_id,
            EmailTemplate.conference_id.is_(None),
            EmailTemplate.template_type == template_type,
        )
    )
    template = result.scalar_one_or_none()

    if not template:
        # Create from default
        default = DEFAULT_TEMPLATES.get(template_type, {})
        template = EmailTemplate(
            tenant_id=current_user.tenant_id,
            conference_id=None,
            template_type=template_type,
            subject=default.get("subject", ""),
            body_html=default.get("body_html", ""),
            body_text=default.get("body_text"),
            is_active=True,
        )
        db.add(template)

    # Apply updates
    if update_data.display_name is not None:
        template.display_name = update_data.display_name
    if update_data.subject is not None:
        template.subject = update_data.subject
    if update_data.body_html is not None:
        template.body_html = sanitize_html(update_data.body_html)
    if update_data.body_text is not None:
        template.body_text = update_data.body_text
    if update_data.is_active is not None:
        template.is_active = update_data.is_active

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="system_email_template.update",
        resource_type="email_template",
        resource_id=template.id,
        details={"template_type": template_type},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()
    await db.refresh(template)

    return EmailTemplateResponse.model_validate(template)


@router.delete("/{template_type}")
async def reset_system_email_template(
    template_type: str,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Reset a system email template to its default."""
    if template_type not in EmailTemplateType.SYSTEM_TYPES:
        raise ValidationError(f"Invalid system template type: {template_type}")

    result = await db.execute(
        select(EmailTemplate).where(
            EmailTemplate.tenant_id == current_user.tenant_id,
            EmailTemplate.conference_id.is_(None),
            EmailTemplate.template_type == template_type,
        )
    )
    template = result.scalar_one_or_none()

    if not template:
        return {"message": "Template is already using default"}

    template_id = template.id
    await db.delete(template)

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="system_email_template.reset",
        resource_type="email_template",
        resource_id=template_id,
        details={"template_type": template_type},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()

    return {"message": "Template reset to default"}
