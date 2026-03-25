"""Tenant-scoped pronoun options CRUD endpoints."""

from uuid import UUID

from fastapi import APIRouter, Request
from sqlalchemy import literal, select

from app.core.dependencies import CurrentUserDep, DbSessionDep, TenantAdminDep, get_client_ip
from app.core.exceptions import NotFoundError, ValidationError
from app.models.audit import AuditLog
from app.models.settings import PronounOption
from app.schemas.settings import (
    PronounOptionCreate,
    PronounOptionListResponse,
    PronounOptionResponse,
    PronounOptionUpdate,
)

router = APIRouter()


def _tenant_filter(current_user: CurrentUserDep):
    if current_user.is_super_admin:
        return literal(True)
    return PronounOption.tenant_id == current_user.tenant_id


@router.get("", response_model=PronounOptionListResponse)
async def list_pronoun_options(
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> dict:
    """List pronoun options for the tenant."""
    result = await db.execute(select(PronounOption).where(_tenant_filter(current_user)).order_by(PronounOption.name))
    items = result.scalars().all()
    return {"items": items, "total": len(items)}


@router.post("", response_model=PronounOptionResponse, status_code=201)
async def create_pronoun_option(
    payload: PronounOptionCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> PronounOptionResponse:
    """Create a pronoun option."""
    existing = await db.execute(
        select(PronounOption).where(
            PronounOption.tenant_id == current_user.tenant_id,
            PronounOption.name == payload.name,
        )
    )
    if existing.scalar_one_or_none():
        raise ValidationError(f"Pronoun option '{payload.name}' already exists")

    opt = PronounOption(
        tenant_id=current_user.tenant_id,
        name=payload.name,
        is_active=payload.is_active,
    )
    db.add(opt)
    await db.flush()

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="pronoun_option.create",
        resource_type="pronoun_option",
        resource_id=opt.id,
        details={"name": opt.name},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()
    await db.refresh(opt)
    return PronounOptionResponse.model_validate(opt)


@router.put("/{option_id}", response_model=PronounOptionResponse)
async def update_pronoun_option(
    option_id: UUID,
    payload: PronounOptionUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> PronounOptionResponse:
    """Update a pronoun option."""
    result = await db.execute(
        select(PronounOption).where(
            PronounOption.id == option_id,
            _tenant_filter(current_user),
        )
    )
    opt = result.scalar_one_or_none()
    if not opt:
        raise NotFoundError("Pronoun option not found")

    if payload.name is not None and payload.name != opt.name:
        dup = await db.execute(
            select(PronounOption).where(
                PronounOption.tenant_id == current_user.tenant_id,
                PronounOption.name == payload.name,
                PronounOption.id != option_id,
            )
        )
        if dup.scalar_one_or_none():
            raise ValidationError(f"Pronoun option '{payload.name}' already exists")
        opt.name = payload.name

    if payload.is_active is not None:
        opt.is_active = payload.is_active

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="pronoun_option.update",
        resource_type="pronoun_option",
        resource_id=opt.id,
        details={"name": opt.name},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()
    await db.refresh(opt)
    return PronounOptionResponse.model_validate(opt)


@router.delete("/{option_id}")
async def delete_pronoun_option(
    option_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete a pronoun option."""
    result = await db.execute(
        select(PronounOption).where(
            PronounOption.id == option_id,
            _tenant_filter(current_user),
        )
    )
    opt = result.scalar_one_or_none()
    if not opt:
        raise NotFoundError("Pronoun option not found")

    details = {"name": opt.name}
    await db.delete(opt)

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="pronoun_option.delete",
        resource_type="pronoun_option",
        resource_id=option_id,
        details=details,
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()
    return {"message": "Pronoun option deleted"}
