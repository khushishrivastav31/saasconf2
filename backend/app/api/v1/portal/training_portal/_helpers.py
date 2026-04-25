"""Shared helpers for the training portal API.

Kept private (leading ``_`` module name) so downstream code pulls these
through ``training_portal.<submodule>`` rather than the internals.
"""

from __future__ import annotations

from datetime import date
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import joinedload

from app.core.dependencies import DbSessionDep
from app.models.location import Location
from app.models.syllabus import Syllabus
from app.models.tenant import Tenant
from app.models.training import Training, TrainingLanguage, TrainingTheme
from app.models.training_program import ProgramYearTraining, TrainingProgramYear


async def resolve_tenant(db: DbSessionDep, tenant_slug: str) -> Tenant:
    """Resolve tenant from slug; 404 if not found, 403 if portal disabled."""
    result = await db.execute(select(Tenant).where(func.lower(Tenant.slug) == tenant_slug.lower()))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail=f"Tenant '{tenant_slug}' not found")

    training_settings = tenant.settings.get("training_portal", {}) if tenant.settings else {}
    if not training_settings.get("enabled", False):
        raise HTTPException(
            status_code=403,
            detail="Training registration portal is not enabled",
        )

    return tenant


def build_placement_query(tenant_id: UUID):
    """Base query for public placements: open/hybrid, future, published year, active training."""
    return (
        select(ProgramYearTraining)
        .join(Training, ProgramYearTraining.training_id == Training.id)
        .join(TrainingProgramYear, ProgramYearTraining.program_year_id == TrainingProgramYear.id)
        .outerjoin(Location, ProgramYearTraining.location_id == Location.id)
        .outerjoin(TrainingLanguage, Training.language_id == TrainingLanguage.id)
        .outerjoin(Syllabus, Training.syllabus_id == Syllabus.id)
        .outerjoin(TrainingTheme, Training.theme_id == TrainingTheme.id)
        .options(
            joinedload(ProgramYearTraining.training).joinedload(Training.language),
            joinedload(ProgramYearTraining.training).joinedload(Training.theme),
            joinedload(ProgramYearTraining.training).joinedload(Training.syllabus),
            joinedload(ProgramYearTraining.location),
        )
        .where(
            ProgramYearTraining.tenant_id == tenant_id,
            ProgramYearTraining.placement_type.in_(["open", "hybrid"]),
            ProgramYearTraining.start_date >= date.today(),
            ProgramYearTraining.is_active.is_(True),
            TrainingProgramYear.status == "published",
            Training.is_active.is_(True),
        )
    )


def get_tenant_country(tenant: Tenant) -> str:
    """Tenant's country as ISO code — prefers ``tenant.country``, falls back to training-finance company_info."""
    from app.core.vat_validation import normalize_country

    raw = tenant.country or ""
    if not raw:
        finance = (tenant.settings or {}).get("training_finance", {})
        company_info = finance.get("company_info", {})
        raw = company_info.get("country", "") or ""
    if not raw:
        return ""
    return normalize_country(raw) or raw.upper()


def get_tenant_city(tenant: Tenant) -> str:
    """Tenant's city for location fallback."""
    return tenant.city or ""


def resolve_location_display(loc: Location | None, tenant_city: str = "") -> str | None:
    """Display city for a location: city → 'Online' if virtual → tenant city fallback."""
    if not loc:
        return tenant_city or None
    if loc.city:
        return loc.city
    name_lower = (loc.name or "").lower()
    if "online" in name_lower or "virtual" in name_lower:
        return loc.name
    return tenant_city or None


def placement_to_dict(p: ProgramYearTraining, tenant_country: str = "", tenant_city: str = "") -> dict:
    """Convert a placement to a public-facing dict."""
    t = p.training
    loc = p.location

    trainer_names: list[str] = []
    if hasattr(p, "trainer_assignments") and p.trainer_assignments:
        for ta in p.trainer_assignments:
            if hasattr(ta, "trainer") and ta.trainer:
                trainer_names.append(f"{ta.trainer.first_name} {ta.trainer.last_name}")

    return {
        "placement_id": str(p.id),
        "training_id": str(t.id) if t else None,
        "training_name": t.name if t else "Unknown",
        "training_slug": t.slug if t else None,
        "training_description": t.description if t else None,
        "training_content": t.content if t else None,
        "start_date": p.start_date.isoformat() if p.start_date else None,
        "duration": t.duration if t else 1,
        "placement_type": p.placement_type or "open",
        "location_name": loc.name if loc else None,
        "location_city": resolve_location_display(loc, tenant_city),
        "language_name": t.language.name if t and t.language else None,
        "language_id": str(t.language_id) if t and t.language_id else None,
        "syllabus_name": t.syllabus.name if t and t.syllabus else None,
        "syllabus_id": str(t.syllabus_id) if t and t.syllabus_id else None,
        "theme_name": t.theme.name if t and t.theme else None,
        "theme_id": str(t.theme_id) if t and t.theme_id else None,
        "regular_price": str(t.regular_price) if t and t.regular_price else None,
        "early_bird_price": str(t.early_bird_price) if t and t.early_bird_price else None,
        "currency": t.currency or "EUR" if t else "EUR",
        "trainers": trainer_names,
        "logo_url": t.logo_url if t else None,
        "is_guaranteed": p.is_guaranteed or False,
        "exam_price": str(t.syllabus.price) if t and t.syllabus and t.syllabus.price else None,
        "location_country": (loc.country if loc and loc.country else tenant_country) or None,
    }
