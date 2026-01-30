"""Pronoun Options CRUD endpoints (conference-scoped)."""

from uuid import UUID

from fastapi import APIRouter, Request
from sqlalchemy import select

from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    TenantAdminDep,
    get_client_ip,
)
from app.core.exceptions import NotFoundError, ValidationError
from app.models.audit import AuditLog
from app.models.settings import PronounOption
from app.schemas.settings import (
    PronounOptionCreate,
    PronounOptionListResponse,
    PronounOptionResponse,
    PronounOptionUpdate,
)

from ._shared import _resolve_conference

router = APIRouter()


@router.get("/pronouns", response_model=PronounOptionListResponse)
async def list_pronouns(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> PronounOptionListResponse:
    """List all pronoun options for a conference."""
    conference = await _resolve_conference(conference_id, current_user, db)

    query = (
        select(PronounOption)
        .where(
            PronounOption.conference_id == conference.id,
            PronounOption.tenant_id == conference.tenant_id,
        )
        .order_by(PronounOption.name)
    )
    result = await db.execute(query)
    options = result.scalars().all()

    items = [
        PronounOptionResponse(
            id=o.id,
            tenant_id=o.tenant_id,
            conference_id=o.conference_id,
            name=o.name,
            is_active=o.is_active,
            created_at=o.created_at,
            updated_at=o.updated_at,
        )
        for o in options
    ]

    return PronounOptionListResponse(items=items, total=len(items))


@router.post("/pronouns", response_model=PronounOptionResponse)
async def create_pronoun(
    conference_id: UUID,
    option_data: PronounOptionCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> PronounOptionResponse:
    """Create a new pronoun option for a conference."""
    conference = await _resolve_conference(conference_id, current_user, db)

    # Check unique name within conference
    existing = await db.execute(
        select(PronounOption).where(
            PronounOption.conference_id == conference.id,
            PronounOption.tenant_id == conference.tenant_id,
            PronounOption.name == option_data.name,
        )
    )
    if existing.scalar_one_or_none():
        raise ValidationError(f"A pronoun option named '{option_data.name}' already exists")

    option = PronounOption(
        tenant_id=conference.tenant_id,
        conference_id=conference.id,
        name=option_data.name,
        is_active=option_data.is_active,
    )
    db.add(option)

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="pronoun_option.create",
        resource_type="pronoun_option",
        resource_id=option.id,
        details={"name": option.name, "conference_id": str(conference.id)},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(option)

    return PronounOptionResponse(
        id=option.id,
        tenant_id=option.tenant_id,
        conference_id=option.conference_id,
        name=option.name,
        is_active=option.is_active,
        created_at=option.created_at,
        updated_at=option.updated_at,
    )


@router.put("/pronouns/{option_id}", response_model=PronounOptionResponse)
async def update_pronoun(
    conference_id: UUID,
    option_id: UUID,
    option_data: PronounOptionUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> PronounOptionResponse:
    """Update an existing pronoun option."""
    conference = await _resolve_conference(conference_id, current_user, db)

    result = await db.execute(
        select(PronounOption).where(
            PronounOption.id == option_id,
            PronounOption.conference_id == conference.id,
        )
    )
    option = result.scalar_one_or_none()
    if not option:
        raise NotFoundError(f"Pronoun option with ID '{option_id}' not found")

    # If name is changing, check uniqueness
    if option_data.name is not None and option_data.name != option.name:
        existing = await db.execute(
            select(PronounOption).where(
                PronounOption.conference_id == conference.id,
                PronounOption.tenant_id == conference.tenant_id,
                PronounOption.name == option_data.name,
                PronounOption.id != option_id,
            )
        )
        if existing.scalar_one_or_none():
            raise ValidationError(f"A pronoun option named '{option_data.name}' already exists")

    update_data = option_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(option, field, value)

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="pronoun_option.update",
        resource_type="pronoun_option",
        resource_id=option.id,
        details={"updated_fields": list(update_data.keys())},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(option)

    return PronounOptionResponse(
        id=option.id,
        tenant_id=option.tenant_id,
        conference_id=option.conference_id,
        name=option.name,
        is_active=option.is_active,
        created_at=option.created_at,
        updated_at=option.updated_at,
    )


@router.delete("/pronouns/{option_id}")
async def delete_pronoun(
    conference_id: UUID,
    option_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete a pronoun option."""
    conference = await _resolve_conference(conference_id, current_user, db)

    result = await db.execute(
        select(PronounOption).where(
            PronounOption.id == option_id,
            PronounOption.conference_id == conference.id,
        )
    )
    option = result.scalar_one_or_none()
    if not option:
        raise NotFoundError(f"Pronoun option with ID '{option_id}' not found")

    option_name = option.name

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="pronoun_option.delete",
        resource_type="pronoun_option",
        resource_id=option.id,
        details={"name": option_name},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.delete(option)
    await db.commit()

    return {"message": f"Pronoun option '{option_name}' deleted successfully"}
