"""Trainer CRUD endpoints."""

from uuid import UUID

from fastapi import APIRouter, Query, Request
from sqlalchemy import literal, select

from app.core.dependencies import DbSessionDep, TenantAdminDep, get_client_ip
from app.core.pagination import calculate_pages, paginate
from app.core.search import unaccent_ilike
from app.models.audit import AuditLog
from app.models.trainer import Trainer, TrainerUnavailability, trainer_languages, trainer_trainings
from app.schemas.trainer import (
    TrainerCreate,
    TrainerNameRef,
    TrainerResponse,
    TrainerUnavailabilityCreate,
    TrainerUnavailabilityResponse,
    TrainerUnavailabilityUpdate,
    TrainerUpdate,
)

router = APIRouter(prefix="/trainers", tags=["trainers"])


def _tenant_filter(current_user: TenantAdminDep):
    if current_user.is_super_admin:
        return literal(True)
    return Trainer.tenant_id == current_user.tenant_id


def _build_response(trainer: Trainer) -> TrainerResponse:
    return TrainerResponse(
        id=trainer.id,
        tenant_id=trainer.tenant_id,
        first_name=trainer.first_name,
        last_name=trainer.last_name,
        email=trainer.email,
        phone=trainer.phone,
        vita=trainer.vita,
        is_active=trainer.is_active,
        is_internal=trainer.is_internal,
        training_ids=[t.id for t in trainer.trainings],
        language_ids=[lang.id for lang in trainer.languages],
        trainings=[TrainerNameRef(id=t.id, name=t.name) for t in trainer.trainings],
        languages=[TrainerNameRef(id=lang.id, name=lang.name) for lang in trainer.languages],
        unavailability=[TrainerUnavailabilityResponse.model_validate(u) for u in trainer.unavailability],
        created_at=trainer.created_at,
        updated_at=trainer.updated_at,
    )


async def _sync_trainings(db: DbSessionDep, trainer_id: UUID, training_ids: list[UUID]) -> None:
    await db.execute(trainer_trainings.delete().where(trainer_trainings.c.trainer_id == trainer_id))
    for tid in training_ids:
        await db.execute(trainer_trainings.insert().values(trainer_id=trainer_id, training_id=tid))


async def _sync_languages(db: DbSessionDep, trainer_id: UUID, language_ids: list[UUID]) -> None:
    await db.execute(trainer_languages.delete().where(trainer_languages.c.trainer_id == trainer_id))
    for lid in language_ids:
        await db.execute(trainer_languages.insert().values(trainer_id=trainer_id, language_id=lid))


@router.get("", response_model=dict)
async def list_trainers(
    current_user: TenantAdminDep,
    db: DbSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    search: str | None = None,
    is_active: bool | None = None,
) -> dict:
    """List trainers with pagination and optional search/filter."""
    query = select(Trainer).where(_tenant_filter(current_user))

    if is_active is not None:
        query = query.where(Trainer.is_active == is_active)

    if search:
        search_filter = unaccent_ilike(Trainer.first_name, search) | unaccent_ilike(Trainer.last_name, search)
        if "@" in search:
            search_filter = search_filter | unaccent_ilike(Trainer.email, search)
        query = query.where(search_filter)

    query = query.order_by(Trainer.last_name, Trainer.first_name)
    result = await paginate(db, query, page, page_size)
    pages = calculate_pages(result.total, page_size)

    return {
        "items": [_build_response(t) for t in result.items],
        "total": result.total,
        "pages": pages,
    }


@router.get("/{trainer_id}", response_model=TrainerResponse)
async def get_trainer(
    trainer_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> TrainerResponse:
    """Get a single trainer by ID."""
    result = await db.execute(select(Trainer).where(Trainer.id == trainer_id, _tenant_filter(current_user)))
    trainer = result.scalar_one_or_none()
    if not trainer:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Trainer not found")
    return _build_response(trainer)


@router.post("", response_model=TrainerResponse, status_code=201)
async def create_trainer(
    payload: TrainerCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> TrainerResponse:
    """Create a new trainer."""
    trainer = Trainer(
        tenant_id=current_user.tenant_id,
        first_name=payload.first_name,
        last_name=payload.last_name,
        email=payload.email,
        phone=payload.phone,
        vita=payload.vita,
        is_active=payload.is_active,
        is_internal=payload.is_internal,
    )
    db.add(trainer)
    await db.flush()

    # Sync M2M relationships
    if payload.training_ids:
        await _sync_trainings(db, trainer.id, payload.training_ids)
    if payload.language_ids:
        await _sync_languages(db, trainer.id, payload.language_ids)

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="trainer.create",
        resource_type="trainer",
        resource_id=trainer.id,
        details={"name": f"{trainer.first_name} {trainer.last_name}"},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()

    # Re-fetch with relationships loaded
    await db.refresh(trainer)
    return _build_response(trainer)


@router.put("/{trainer_id}", response_model=TrainerResponse)
async def update_trainer(
    trainer_id: UUID,
    payload: TrainerUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> TrainerResponse:
    """Update a trainer."""
    result = await db.execute(select(Trainer).where(Trainer.id == trainer_id, _tenant_filter(current_user)))
    trainer = result.scalar_one_or_none()
    if not trainer:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Trainer not found")

    # Apply scalar updates
    if payload.first_name is not None:
        trainer.first_name = payload.first_name
    if payload.last_name is not None:
        trainer.last_name = payload.last_name
    if payload.email is not None:
        trainer.email = payload.email or None
    if payload.phone is not None:
        trainer.phone = payload.phone or None
    if payload.vita is not None:
        trainer.vita = payload.vita or None
    if payload.is_active is not None:
        trainer.is_active = payload.is_active
    if payload.is_internal is not None:
        trainer.is_internal = payload.is_internal

    # Sync M2M relationships
    if payload.training_ids is not None:
        await _sync_trainings(db, trainer.id, payload.training_ids)
    if payload.language_ids is not None:
        await _sync_languages(db, trainer.id, payload.language_ids)

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="trainer.update",
        resource_type="trainer",
        resource_id=trainer.id,
        details={"name": f"{trainer.first_name} {trainer.last_name}"},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()

    await db.refresh(trainer)
    return _build_response(trainer)


@router.delete("/{trainer_id}")
async def delete_trainer(
    trainer_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete a trainer."""
    result = await db.execute(select(Trainer).where(Trainer.id == trainer_id, _tenant_filter(current_user)))
    trainer = result.scalar_one_or_none()
    if not trainer:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Trainer not found")

    trainer_name = f"{trainer.first_name} {trainer.last_name}"
    await db.delete(trainer)

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="trainer.delete",
        resource_type="trainer",
        resource_id=trainer_id,
        details={"name": trainer_name},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()

    return {"message": "Trainer deleted"}


# ---------------------------------------------------------------------------
# Trainer Unavailability CRUD
# ---------------------------------------------------------------------------


async def _get_trainer_or_404(trainer_id: UUID, current_user: TenantAdminDep, db: DbSessionDep) -> Trainer:
    result = await db.execute(select(Trainer).where(Trainer.id == trainer_id, _tenant_filter(current_user)))
    trainer = result.scalar_one_or_none()
    if not trainer:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Trainer not found")
    return trainer


@router.get("/{trainer_id}/unavailability", response_model=list[TrainerUnavailabilityResponse])
async def list_unavailability(
    trainer_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> list[TrainerUnavailabilityResponse]:
    """List unavailability entries for a trainer."""
    await _get_trainer_or_404(trainer_id, current_user, db)
    result = await db.execute(
        select(TrainerUnavailability)
        .where(TrainerUnavailability.trainer_id == trainer_id)
        .order_by(TrainerUnavailability.start_date)
    )
    entries = list(result.scalars().all())
    return [TrainerUnavailabilityResponse.model_validate(e) for e in entries]


@router.post("/{trainer_id}/unavailability", response_model=TrainerUnavailabilityResponse, status_code=201)
async def create_unavailability(
    trainer_id: UUID,
    payload: TrainerUnavailabilityCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> TrainerUnavailabilityResponse:
    """Create an unavailability entry for a trainer."""
    trainer = await _get_trainer_or_404(trainer_id, current_user, db)
    entry = TrainerUnavailability(
        tenant_id=current_user.tenant_id,
        trainer_id=trainer_id,
        start_date=payload.start_date,
        end_date=payload.end_date,
        description=payload.description,
    )
    db.add(entry)
    await db.flush()

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="trainer_unavailability.create",
        resource_type="trainer_unavailability",
        resource_id=entry.id,
        details={
            "trainer": f"{trainer.first_name} {trainer.last_name}",
            "start_date": str(payload.start_date),
            "end_date": str(payload.end_date),
        },
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()
    await db.refresh(entry)
    return TrainerUnavailabilityResponse.model_validate(entry)


@router.put("/{trainer_id}/unavailability/{entry_id}", response_model=TrainerUnavailabilityResponse)
async def update_unavailability(
    trainer_id: UUID,
    entry_id: UUID,
    payload: TrainerUnavailabilityUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> TrainerUnavailabilityResponse:
    """Update an unavailability entry."""
    await _get_trainer_or_404(trainer_id, current_user, db)
    result = await db.execute(
        select(TrainerUnavailability).where(
            TrainerUnavailability.id == entry_id,
            TrainerUnavailability.trainer_id == trainer_id,
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Unavailability entry not found")

    if payload.start_date is not None:
        entry.start_date = payload.start_date
    if payload.end_date is not None:
        entry.end_date = payload.end_date
    if payload.description is not None:
        entry.description = payload.description or None

    # Cross-validate final dates
    if entry.end_date < entry.start_date:
        from app.core.exceptions import ValidationError

        raise ValidationError("end_date must be >= start_date")

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="trainer_unavailability.update",
        resource_type="trainer_unavailability",
        resource_id=entry.id,
        details={"start_date": str(entry.start_date), "end_date": str(entry.end_date)},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()
    await db.refresh(entry)
    return TrainerUnavailabilityResponse.model_validate(entry)


@router.delete("/{trainer_id}/unavailability/{entry_id}")
async def delete_unavailability(
    trainer_id: UUID,
    entry_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete an unavailability entry."""
    await _get_trainer_or_404(trainer_id, current_user, db)
    result = await db.execute(
        select(TrainerUnavailability).where(
            TrainerUnavailability.id == entry_id,
            TrainerUnavailability.trainer_id == trainer_id,
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Unavailability entry not found")

    details = {"start_date": str(entry.start_date), "end_date": str(entry.end_date)}
    await db.delete(entry)

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="trainer_unavailability.delete",
        resource_type="trainer_unavailability",
        resource_id=entry_id,
        details=details,
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()
    return {"message": "Unavailability entry deleted"}
