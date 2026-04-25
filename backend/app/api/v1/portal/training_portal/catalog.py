"""Public read endpoints for the training portal.

Browse + filter + per-placement detail + the tenant-scoped config blob
consumed by the public form. All endpoints are unauthenticated but
gated by ``resolve_tenant`` which enforces ``training_portal.enabled``
on the tenant.
"""

from __future__ import annotations

from datetime import date
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import joinedload

from app.core.dependencies import DbSessionDep
from app.models.location import Location
from app.models.syllabus import Syllabus
from app.models.training import Training, TrainingLanguage, TrainingTheme
from app.models.training_program import ProgramYearTraining, TrainingProgramYear

from ._helpers import (
    build_placement_query,
    get_tenant_city,
    get_tenant_country,
    placement_to_dict,
    resolve_location_display,
    resolve_tenant,
)
from ._texts import DEFAULT_PORTAL_TEXTS

router = APIRouter()


@router.get("/{tenant_slug}/trainings")
async def list_public_trainings(
    tenant_slug: str,
    db: DbSessionDep,
    search: str | None = Query(None, description="Search by training name, description, or location"),
    date_from: date | None = Query(None, description="Filter: start date from"),
    date_to: date | None = Query(None, description="Filter: start date to"),
    location: str | None = Query(None, description="Filter: location city (comma-separated)"),
    language_id: UUID | None = Query(None, description="Filter: language ID"),
    syllabus_id: UUID | None = Query(None, description="Filter: syllabus ID"),
    theme_id: UUID | None = Query(None, description="Filter: theme ID"),
    guaranteed: bool | None = Query(None, description="Filter: guaranteed only"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
) -> dict:
    """List available trainings for public registration."""
    tenant = await resolve_tenant(db, tenant_slug)

    query = build_placement_query(tenant.id)

    # Apply filters
    if search:
        query = query.where(
            func.lower(Training.name).contains(search.lower())
            | func.lower(Training.description).contains(search.lower())
            | func.lower(Location.name).contains(search.lower())
            | func.lower(Location.city).contains(search.lower())
            | func.lower(Syllabus.name).contains(search.lower())
            | func.lower(TrainingTheme.name).contains(search.lower())
        )

    if date_from:
        query = query.where(ProgramYearTraining.start_date >= date_from)
    if date_to:
        query = query.where(ProgramYearTraining.start_date <= date_to)

    if location:
        values = [c.strip().lower() for c in location.split(",") if c.strip()]
        if values:
            loc_label = func.coalesce(func.nullif(Location.city, ""), Location.name)
            query = query.where(func.lower(loc_label).in_(values))

    if language_id:
        query = query.where(Training.language_id == language_id)
    if syllabus_id:
        query = query.where(Training.syllabus_id == syllabus_id)
    if theme_id:
        query = query.where(Training.theme_id == theme_id)
    if guaranteed is True:
        query = query.where(ProgramYearTraining.is_guaranteed.is_(True))

    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    query = query.order_by(ProgramYearTraining.start_date).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    placements = result.scalars().unique().all()
    tc = get_tenant_country(tenant)
    t_city = get_tenant_city(tenant)

    return {
        "items": [placement_to_dict(p, tc, t_city) for p in placements],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.get("/{tenant_slug}/trainings/filters")
async def get_training_filters(
    tenant_slug: str,
    db: DbSessionDep,
    # Accept same filters to compute intersection counts
    search: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    location: str | None = Query(None),
    language_id: UUID | None = Query(None),
    syllabus_id: UUID | None = Query(None),
    theme_id: UUID | None = Query(None),
    guaranteed: bool | None = Query(None),
) -> dict:
    """Get available filter values with counts, considering current active filters."""
    tenant = await resolve_tenant(db, tenant_slug)

    base = build_placement_query(tenant.id)

    if search:
        base = base.where(
            func.lower(Training.name).contains(search.lower())
            | func.lower(Training.description).contains(search.lower())
            | func.lower(Location.name).contains(search.lower())
            | func.lower(Location.city).contains(search.lower())
        )
    if date_from:
        base = base.where(ProgramYearTraining.start_date >= date_from)
    if date_to:
        base = base.where(ProgramYearTraining.start_date <= date_to)
    if location:
        values = [c.strip().lower() for c in location.split(",") if c.strip()]
        if values:
            loc_label = func.coalesce(func.nullif(Location.city, ""), Location.name)
            base = base.where(func.lower(loc_label).in_(values))
    if language_id:
        base = base.where(Training.language_id == language_id)
    if syllabus_id:
        base = base.where(Training.syllabus_id == syllabus_id)
    if theme_id:
        base = base.where(Training.theme_id == theme_id)
    if guaranteed is True:
        base = base.where(ProgramYearTraining.is_guaranteed.is_(True))

    sub = base.with_only_columns(ProgramYearTraining.id).subquery()

    tenant_city = get_tenant_city(tenant)
    loc_q = (
        select(Location.city, Location.name, func.count(ProgramYearTraining.id))
        .select_from(ProgramYearTraining)
        .join(Location, ProgramYearTraining.location_id == Location.id)
        .where(ProgramYearTraining.id.in_(select(sub.c.id)))
        .group_by(Location.city, Location.name)
    )
    loc_result = await db.execute(loc_q)
    loc_counts: dict[str, int] = {}
    for city, name, cnt in loc_result.all():
        label = resolve_location_display(
            type("L", (), {"city": city, "name": name})(),
            tenant_city,  # type: ignore[arg-type]
        )
        if label:
            loc_counts[label] = loc_counts.get(label, 0) + cnt
    locations: list[dict[str, str | int]] = sorted(
        [{"value": k, "count": v} for k, v in loc_counts.items()],
        key=lambda x: int(x["count"]) if isinstance(x["count"], int) else 0,
        reverse=True,
    )

    lang_q = (
        select(TrainingLanguage.id, TrainingLanguage.name, func.count(ProgramYearTraining.id))
        .select_from(ProgramYearTraining)
        .join(Training, ProgramYearTraining.training_id == Training.id)
        .join(TrainingLanguage, Training.language_id == TrainingLanguage.id)
        .where(ProgramYearTraining.id.in_(select(sub.c.id)))
        .group_by(TrainingLanguage.id, TrainingLanguage.name)
        .order_by(func.count(ProgramYearTraining.id).desc())
    )
    lang_result = await db.execute(lang_q)
    languages = [{"id": str(lid), "name": name, "count": cnt} for lid, name, cnt in lang_result.all()]

    cert_q = (
        select(Syllabus.id, Syllabus.name, func.count(ProgramYearTraining.id))
        .select_from(ProgramYearTraining)
        .join(Training, ProgramYearTraining.training_id == Training.id)
        .join(Syllabus, Training.syllabus_id == Syllabus.id)
        .where(ProgramYearTraining.id.in_(select(sub.c.id)))
        .group_by(Syllabus.id, Syllabus.name)
        .order_by(func.count(ProgramYearTraining.id).desc())
    )
    cert_result = await db.execute(cert_q)
    syllabi = [{"id": str(cid), "name": name, "count": cnt} for cid, name, cnt in cert_result.all()]

    theme_q = (
        select(TrainingTheme.id, TrainingTheme.name, func.count(ProgramYearTraining.id))
        .select_from(ProgramYearTraining)
        .join(Training, ProgramYearTraining.training_id == Training.id)
        .join(TrainingTheme, Training.theme_id == TrainingTheme.id)
        .where(ProgramYearTraining.id.in_(select(sub.c.id)))
        .group_by(TrainingTheme.id, TrainingTheme.name)
        .order_by(func.count(ProgramYearTraining.id).desc())
    )
    theme_result = await db.execute(theme_q)
    themes = [{"id": str(tid), "name": name, "count": cnt} for tid, name, cnt in theme_result.all()]

    guaranteed_q = select(func.count(ProgramYearTraining.id)).where(
        ProgramYearTraining.id.in_(select(sub.c.id)), ProgramYearTraining.is_guaranteed.is_(True)
    )
    guaranteed_count = (await db.execute(guaranteed_q)).scalar() or 0

    date_q = select(func.min(ProgramYearTraining.start_date), func.max(ProgramYearTraining.start_date)).where(
        ProgramYearTraining.id.in_(select(sub.c.id))
    )
    date_result = await db.execute(date_q)
    date_row = date_result.one_or_none()
    date_range = {
        "min": date_row[0].isoformat() if date_row and date_row[0] else None,
        "max": date_row[1].isoformat() if date_row and date_row[1] else None,
    }

    return {
        "locations": locations,
        "languages": languages,
        "syllabi": syllabi,
        "themes": themes,
        "guaranteed_count": guaranteed_count,
        "date_range": date_range,
    }


@router.get("/{tenant_slug}/trainings/portal-config")
async def get_portal_config(
    tenant_slug: str,
    db: DbSessionDep,
) -> dict:
    """Get portal configuration: available languages, default language, and translated texts."""
    import copy

    tenant = await resolve_tenant(db, tenant_slug)
    portal = (tenant.settings or {}).get("training_portal", {})

    # Merge custom texts with defaults so new keys are always present
    custom_texts = portal.get("portal_texts", {})
    merged_texts = copy.deepcopy(DEFAULT_PORTAL_TEXTS)
    for lang, texts in custom_texts.items():
        if lang not in merged_texts:
            merged_texts[lang] = {}
        merged_texts[lang].update(texts)

    lang_result = await db.execute(
        select(TrainingLanguage.id, TrainingLanguage.name)
        .where(TrainingLanguage.tenant_id == tenant.id)
        .order_by(TrainingLanguage.name)
    )
    exam_languages = [{"id": str(lid), "name": name} for lid, name in lang_result.all()]

    finance = (tenant.settings or {}).get("training_finance", {})

    return {
        "exam_languages": exam_languages,
        "default_language": portal.get("default_language", "en"),
        "available_languages": portal.get("available_languages", ["en", "de"]),
        "portal_texts": merged_texts,
        "vat_rates": finance.get("vat_rates", {}),
        "vat_rules": finance.get("vat_rules", []),
        "eu_countries": finance.get("eu_countries", []),
        "tenant_country": get_tenant_country(tenant),
        "stripe_enabled": finance.get("stripe", {}).get("is_enabled", False),
        "stripe_publishable_key": finance.get("stripe", {}).get("publishable_key", ""),
        "bank_transfer_countries": finance.get("stripe", {}).get("bank_transfer_countries", []),
    }


@router.get("/{tenant_slug}/trainings/{placement_id}")
async def get_public_training_detail(
    tenant_slug: str,
    placement_id: UUID,
    db: DbSessionDep,
) -> dict:
    """Get detail for a specific training placement (for registration form header)."""
    tenant = await resolve_tenant(db, tenant_slug)

    query = (
        select(ProgramYearTraining)
        .join(Training, ProgramYearTraining.training_id == Training.id)
        .join(TrainingProgramYear, ProgramYearTraining.program_year_id == TrainingProgramYear.id)
        .outerjoin(Location, ProgramYearTraining.location_id == Location.id)
        .options(
            joinedload(ProgramYearTraining.training).joinedload(Training.language),
            joinedload(ProgramYearTraining.training).joinedload(Training.theme),
            joinedload(ProgramYearTraining.location),
            joinedload(ProgramYearTraining.trainer_assignments),
        )
        .where(
            ProgramYearTraining.id == placement_id,
            ProgramYearTraining.tenant_id == tenant.id,
            ProgramYearTraining.placement_type.in_(["open", "hybrid"]),
            ProgramYearTraining.start_date >= date.today(),
            ProgramYearTraining.is_active.is_(True),
            TrainingProgramYear.status == "published",
            Training.is_active.is_(True),
        )
    )

    result = await db.execute(query)
    placement = result.scalars().unique().first()

    if not placement:
        raise HTTPException(status_code=404, detail="Training not found or not available")

    return placement_to_dict(placement, get_tenant_country(tenant), get_tenant_city(tenant))
