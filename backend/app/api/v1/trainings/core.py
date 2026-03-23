"""Training CRUD and lifecycle endpoints."""

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.orm.attributes import flag_modified

from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    TenantAdminDep,
    get_client_ip,
    require_module,
)
from app.core.exceptions import AuthorizationError, NotFoundError, ValidationError
from app.core.html_sanitize import sanitize_html
from app.core.pagination import calculate_pages, paginate
from app.core.search import unaccent_ilike
from app.models.audit import AuditAction, AuditLog
from app.models.training import Training
from app.schemas.training import (
    TrainingCreate,
    TrainingListResponse,
    TrainingResponse,
    TrainingUpdate,
)

from ._shared import (
    MODULE_CODE,
    _build_training_response,
    _get_accessible_training_ids,
    _tenant_filter,
)

router = APIRouter()


@router.get("", response_model=TrainingListResponse, dependencies=[Depends(require_module(MODULE_CODE))])
async def list_trainings(
    current_user: CurrentUserDep,
    db: DbSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = None,
    search: str | None = None,
    is_active: bool | None = None,
) -> TrainingListResponse:
    """List trainings for the current tenant."""
    query = select(Training).where(_tenant_filter(current_user))

    accessible_ids = await _get_accessible_training_ids(db, current_user)
    if accessible_ids is not None:
        if not accessible_ids:
            return TrainingListResponse(items=[], total=0, page=page, page_size=page_size, pages=0)
        query = query.where(Training.id.in_(accessible_ids))

    if is_active is not None:
        query = query.where(Training.is_active == is_active)

    if search:
        search_filter = (
            unaccent_ilike(Training.name, search)
            | unaccent_ilike(Training.abbreviation, search)
            | unaccent_ilike(Training.city, search)
        )
        query = query.where(search_filter)

    if status:
        today = date.today()
        if status == "upcoming":
            query = query.where(Training.start_date > today)
        elif status == "ongoing":
            query = query.where(
                (Training.start_date <= today) & ((Training.end_date >= today) | (Training.end_date.is_(None)))
            )
        elif status == "past":
            query = query.where(Training.end_date < today)
        elif status == "draft":
            query = query.where(Training.start_date.is_(None))

    query = query.order_by(Training.start_date.desc().nulls_last(), Training.created_at.desc())
    result = await paginate(db, query, page, page_size)

    items = [_build_training_response(t) for t in result.items]
    pages = calculate_pages(result.total, page_size)

    return TrainingListResponse(
        items=items,
        total=result.total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


@router.post("", response_model=TrainingResponse, status_code=201, dependencies=[Depends(require_module(MODULE_CODE))])
async def create_training(
    training_data: TrainingCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> TrainingResponse:
    """Create a new training."""
    if not current_user.tenant_id:
        raise ValidationError("A tenant context is required to create a training")

    training = Training(
        tenant_id=current_user.tenant_id,
        name=training_data.name,
        abbreviation=training_data.abbreviation,
        description=training_data.description,
        website=training_data.website,
        logo_url=training_data.logo_url,
        start_date=training_data.start_date,
        end_date=training_data.end_date,
        venue_name=training_data.venue_name,
        venue_address=training_data.venue_address,
        city=training_data.city,
        state=training_data.state,
        postal_code=training_data.postal_code,
        country=training_data.country,
        timezone=training_data.timezone,
        locale=training_data.locale,
        venue_type=training_data.venue_type,
        venue_url=training_data.venue_url,
        virtual_platform_url=training_data.virtual_platform_url,
        social_links=training_data.social_links.model_dump(mode="json") if training_data.social_links else {},
        team_members=[tm.model_dump(mode="json") for tm in training_data.team_members]
        if training_data.team_members
        else [],
        settings=training_data.settings,
        currency=training_data.currency,
        invoice_currency=training_data.invoice_currency,
        phone=training_data.phone,
        support_email=training_data.support_email,
        contact_email=training_data.contact_email,
    )
    db.add(training)
    await db.flush()

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action=AuditAction.CONFERENCE_CREATE,
        resource_type="training",
        resource_id=training.id,
        details={"name": training.name, "abbreviation": training.abbreviation},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(training)

    return _build_training_response(training)


@router.get("/{training_id}", response_model=TrainingResponse, dependencies=[Depends(require_module(MODULE_CODE))])
async def get_training(
    training_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> TrainingResponse:
    """Get a training by ID."""
    result = await db.execute(select(Training).where(Training.id == training_id).where(_tenant_filter(current_user)))
    training = result.scalar_one_or_none()

    if not training:
        raise NotFoundError("Training not found")

    accessible_ids = await _get_accessible_training_ids(db, current_user)
    if accessible_ids is not None and training_id not in accessible_ids:
        raise AuthorizationError("You don't have access to this training")

    return _build_training_response(training)


@router.put("/{training_id}", response_model=TrainingResponse, dependencies=[Depends(require_module(MODULE_CODE))])
async def update_training(
    training_id: UUID,
    training_data: TrainingUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> TrainingResponse:
    """Update a training."""
    result = await db.execute(select(Training).where(Training.id == training_id).where(_tenant_filter(current_user)))
    training = result.scalar_one_or_none()

    if not training:
        raise NotFoundError("Training not found")

    update_data = training_data.model_dump(exclude_unset=True)

    # Handle special fields
    if "social_links" in update_data and update_data["social_links"] is not None:
        update_data["social_links"] = (
            update_data["social_links"].model_dump(mode="json")
            if hasattr(update_data["social_links"], "model_dump")
            else update_data["social_links"]
        )

    if "team_members" in update_data and update_data["team_members"] is not None:
        team_members_data = []
        for tm in update_data["team_members"]:
            tm_dict = tm.model_dump(mode="json") if hasattr(tm, "model_dump") else tm
            for key in ("email", "phone", "role"):
                if tm_dict.get(key) == "":
                    tm_dict[key] = None
            team_members_data.append(tm_dict)
        update_data["team_members"] = team_members_data

    # Sanitize HTML fields in settings
    if "settings" in update_data and isinstance(update_data["settings"], dict):
        for html_key in ("email_header_html", "email_footer_html"):
            if html_key in update_data["settings"] and update_data["settings"][html_key]:
                update_data["settings"][html_key] = sanitize_html(update_data["settings"][html_key])

    for field, value in update_data.items():
        setattr(training, field, value)

    # Mark JSONB columns as modified
    if "team_members" in update_data:
        flag_modified(training, "team_members")
    if "social_links" in update_data:
        flag_modified(training, "social_links")
    if "settings" in update_data:
        flag_modified(training, "settings")

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action=AuditAction.CONFERENCE_UPDATE,
        resource_type="training",
        resource_id=training.id,
        details={"updated_fields": list(update_data.keys())},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(training)

    return _build_training_response(training)


@router.delete("/{training_id}", dependencies=[Depends(require_module(MODULE_CODE))])
async def delete_training(
    training_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete a training. Must be deactivated first."""
    if not current_user.is_super_admin and not current_user.is_tenant_super_user:
        raise AuthorizationError("Only the Tenant Super User or SaaS Super Admin can delete trainings")

    result = await db.execute(select(Training).where(Training.id == training_id).where(_tenant_filter(current_user)))
    training = result.scalar_one_or_none()

    if not training:
        raise NotFoundError("Training not found")

    if training.is_active:
        raise ValidationError("Training must be deactivated before deletion. Please deactivate the training first.")

    training_name = training.name

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action=AuditAction.CONFERENCE_DELETE,
        resource_type="training",
        resource_id=training.id,
        details={"name": training_name},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.delete(training)
    await db.commit()

    return {"message": f"Training '{training_name}' deleted successfully"}


@router.get("/stats/summary", dependencies=[Depends(require_module(MODULE_CODE))])
async def get_training_stats(
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> dict:
    """Get training statistics for the current tenant."""
    today = date.today()

    accessible_ids = await _get_accessible_training_ids(db, current_user)
    if accessible_ids is not None and not accessible_ids:
        return {"total": 0, "active": 0, "upcoming": 0, "ongoing": 0, "past": 0}

    def _apply_access_filter(query):
        q = query.where(_tenant_filter(current_user))
        if accessible_ids is not None:
            q = q.where(Training.id.in_(accessible_ids))
        return q

    total = (await db.execute(_apply_access_filter(select(func.count()).select_from(Training)))).scalar() or 0
    active = (
        await db.execute(
            _apply_access_filter(select(func.count()).select_from(Training).where(Training.is_active == True))
        )
    ).scalar() or 0
    upcoming = (
        await db.execute(
            _apply_access_filter(select(func.count()).select_from(Training).where(Training.start_date > today))
        )
    ).scalar() or 0
    ongoing = (
        await db.execute(
            _apply_access_filter(
                select(func.count())
                .select_from(Training)
                .where(Training.start_date <= today)
                .where((Training.end_date >= today) | (Training.end_date.is_(None)))
            )
        )
    ).scalar() or 0
    past = (
        await db.execute(
            _apply_access_filter(select(func.count()).select_from(Training).where(Training.end_date < today))
        )
    ).scalar() or 0

    return {"total": total, "active": active, "upcoming": upcoming, "ongoing": ongoing, "past": past}
