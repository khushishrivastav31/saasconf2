"""Public Training Portal API — no authentication required.

Allows attendees to browse available trainings and register.
"""

from __future__ import annotations

from datetime import date
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, EmailStr
from sqlalchemy import func, select, text
from sqlalchemy.orm import joinedload

from app.core.dependencies import DbSessionDep
from app.models.certification_body import CertificationBody
from app.models.location import Location
from app.models.tenant import Tenant
from app.models.training import Training, TrainingLanguage, TrainingTheme
from app.models.training_program import (
    ProgramYearTraining,
    TrainingProgramYear,
)

router = APIRouter()


# ── Helpers ──────────────────────────────────────────────────────


async def _resolve_tenant(db: DbSessionDep, tenant_slug: str) -> Tenant:
    """Resolve tenant from slug, verify training portal is enabled."""
    result = await db.execute(select(Tenant).where(func.lower(Tenant.slug) == tenant_slug.lower()))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail=f"Tenant '{tenant_slug}' not found")

    # Check if training portal is enabled in tenant settings
    training_settings = tenant.settings.get("training_portal", {}) if tenant.settings else {}
    if not training_settings.get("enabled", False):
        raise HTTPException(
            status_code=403,
            detail="Training registration portal is not enabled",
        )

    return tenant


def _build_placement_query(tenant_id: UUID):
    """Base query for public placements: open/hybrid, future, published year, active training."""
    return (
        select(ProgramYearTraining)
        .join(Training, ProgramYearTraining.training_id == Training.id)
        .join(TrainingProgramYear, ProgramYearTraining.program_year_id == TrainingProgramYear.id)
        .outerjoin(Location, ProgramYearTraining.location_id == Location.id)
        .outerjoin(TrainingLanguage, Training.language_id == TrainingLanguage.id)
        .outerjoin(CertificationBody, Training.certification_body_id == CertificationBody.id)
        .outerjoin(TrainingTheme, Training.theme_id == TrainingTheme.id)
        .options(
            joinedload(ProgramYearTraining.training).joinedload(Training.language),
            joinedload(ProgramYearTraining.training).joinedload(Training.theme),
            joinedload(ProgramYearTraining.location),
        )
        .where(
            ProgramYearTraining.tenant_id == tenant_id,
            ProgramYearTraining.placement_type.in_(["open", "hybrid"]),
            ProgramYearTraining.start_date >= date.today(),
            TrainingProgramYear.status == "published",
            Training.is_active.is_(True),
        )
    )


def _placement_to_dict(p: ProgramYearTraining) -> dict:
    """Convert a placement to a public-facing dict."""
    t = p.training
    loc = p.location

    # Get trainer names from assignments
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
        "start_date": p.start_date.isoformat() if p.start_date else None,
        "duration": t.duration if t else 1,
        "placement_type": p.placement_type or "open",
        "location_name": loc.name if loc else None,
        "location_city": loc.city if loc else None,
        "language_name": t.language.name if t and t.language else None,
        "language_id": str(t.language_id) if t and t.language_id else None,
        "certification_body_name": (
            t.certification_body.name if t and hasattr(t, "certification_body") and t.certification_body else None
        ),
        "certification_body_id": str(t.certification_body_id) if t and t.certification_body_id else None,
        "theme_name": t.theme.name if t and t.theme else None,
        "theme_id": str(t.theme_id) if t and t.theme_id else None,
        "regular_price": str(t.regular_price) if t and t.regular_price else None,
        "early_bird_price": str(t.early_bird_price) if t and t.early_bird_price else None,
        "currency": t.currency or "EUR" if t else "EUR",
        "trainers": trainer_names,
        "logo_url": t.logo_url if t else None,
    }


# ── Endpoints ────────────────────────────────────────────────────


@router.get("/{tenant_slug}/trainings")
async def list_public_trainings(
    tenant_slug: str,
    db: DbSessionDep,
    search: str | None = Query(None, description="Search by training name, description, or location"),
    date_from: date | None = Query(None, description="Filter: start date from"),
    date_to: date | None = Query(None, description="Filter: start date to"),
    location: str | None = Query(None, description="Filter: location city (comma-separated)"),
    language_id: UUID | None = Query(None, description="Filter: language ID"),
    certification_body_id: UUID | None = Query(None, description="Filter: certification body ID"),
    theme_id: UUID | None = Query(None, description="Filter: theme ID"),
    placement_type: str | None = Query(None, description="Filter: open or hybrid"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
) -> dict:
    """List available trainings for public registration."""
    tenant = await _resolve_tenant(db, tenant_slug)

    query = _build_placement_query(tenant.id)

    # Apply filters
    if search:
        query = query.where(
            func.lower(Training.name).contains(search.lower())
            | func.lower(Training.description).contains(search.lower())
            | func.lower(Location.name).contains(search.lower())
            | func.lower(Location.city).contains(search.lower())
            | func.lower(CertificationBody.name).contains(search.lower())
            | func.lower(TrainingTheme.name).contains(search.lower())
        )

    if date_from:
        query = query.where(ProgramYearTraining.start_date >= date_from)
    if date_to:
        query = query.where(ProgramYearTraining.start_date <= date_to)

    if location:
        cities = [c.strip().lower() for c in location.split(",") if c.strip()]
        if cities:
            query = query.where(func.lower(Location.city).in_(cities))

    if language_id:
        query = query.where(Training.language_id == language_id)
    if certification_body_id:
        query = query.where(Training.certification_body_id == certification_body_id)
    if theme_id:
        query = query.where(Training.theme_id == theme_id)
    if placement_type and placement_type in ("open", "hybrid"):
        query = query.where(ProgramYearTraining.placement_type == placement_type)

    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Paginate and order
    query = query.order_by(ProgramYearTraining.start_date).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    placements = result.scalars().unique().all()

    return {
        "items": [_placement_to_dict(p) for p in placements],
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
    certification_body_id: UUID | None = Query(None),
    theme_id: UUID | None = Query(None),
    placement_type: str | None = Query(None),
) -> dict:
    """Get available filter values with counts, considering current active filters."""
    tenant = await _resolve_tenant(db, tenant_slug)

    # Base query for all matching placements (with current filters applied)
    base = _build_placement_query(tenant.id)

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
        cities = [c.strip().lower() for c in location.split(",") if c.strip()]
        if cities:
            base = base.where(func.lower(Location.city).in_(cities))
    if language_id:
        base = base.where(Training.language_id == language_id)
    if certification_body_id:
        base = base.where(Training.certification_body_id == certification_body_id)
    if theme_id:
        base = base.where(Training.theme_id == theme_id)
    if placement_type and placement_type in ("open", "hybrid"):
        base = base.where(ProgramYearTraining.placement_type == placement_type)

    # Get matching placement IDs
    sub = base.with_only_columns(ProgramYearTraining.id).subquery()

    # Location counts
    loc_q = (
        select(Location.city, func.count(ProgramYearTraining.id))
        .select_from(ProgramYearTraining)
        .join(Location, ProgramYearTraining.location_id == Location.id)
        .where(ProgramYearTraining.id.in_(select(sub.c.id)))
        .where(Location.city.isnot(None))
        .group_by(Location.city)
        .order_by(func.count(ProgramYearTraining.id).desc())
    )
    loc_result = await db.execute(loc_q)
    locations = [{"value": city, "count": cnt} for city, cnt in loc_result.all()]

    # Language counts
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

    # Certification body counts
    cert_q = (
        select(CertificationBody.id, CertificationBody.name, func.count(ProgramYearTraining.id))
        .select_from(ProgramYearTraining)
        .join(Training, ProgramYearTraining.training_id == Training.id)
        .join(CertificationBody, Training.certification_body_id == CertificationBody.id)
        .where(ProgramYearTraining.id.in_(select(sub.c.id)))
        .group_by(CertificationBody.id, CertificationBody.name)
        .order_by(func.count(ProgramYearTraining.id).desc())
    )
    cert_result = await db.execute(cert_q)
    certification_bodies = [{"id": str(cid), "name": name, "count": cnt} for cid, name, cnt in cert_result.all()]

    # Theme counts
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

    # Placement type counts
    type_q = (
        select(ProgramYearTraining.placement_type, func.count(ProgramYearTraining.id))
        .where(ProgramYearTraining.id.in_(select(sub.c.id)))
        .group_by(ProgramYearTraining.placement_type)
    )
    type_result = await db.execute(type_q)
    types = [{"value": pt, "count": cnt} for pt, cnt in type_result.all()]

    # Date range
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
        "certification_bodies": certification_bodies,
        "themes": themes,
        "types": types,
        "date_range": date_range,
    }


@router.get("/{tenant_slug}/trainings/{placement_id}")
async def get_public_training_detail(
    tenant_slug: str,
    placement_id: UUID,
    db: DbSessionDep,
) -> dict:
    """Get detail for a specific training placement (for registration form header)."""
    tenant = await _resolve_tenant(db, tenant_slug)

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
            TrainingProgramYear.status == "published",
            Training.is_active.is_(True),
        )
    )

    result = await db.execute(query)
    placement = result.scalars().unique().first()

    if not placement:
        raise HTTPException(status_code=404, detail="Training not found or not available")

    return _placement_to_dict(placement)


# ── Registration ─────────────────────────────────────────────────


class TrainingAttendeeInput(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr


class TrainingBillingInput(BaseModel):
    company_name: str | None = None
    street: str
    postal_code: str
    city: str
    country: str
    vat_number: str | None = None
    contact_first_name: str
    contact_last_name: str
    contact_email: EmailStr
    contact_phone: str | None = None
    payment_method: str = "bank_transfer"
    payment_intent_id: str | None = None


class TrainingRegistrationRequest(BaseModel):
    placement_id: UUID
    billing: TrainingBillingInput
    attendees: list[TrainingAttendeeInput]
    discount_code: str | None = None
    recaptcha_token: str | None = None
    honeypot_field: str | None = None
    form_start_timestamp: float | None = None


@router.post("/{tenant_slug}/trainings/register")
async def register_for_training(
    request: Request,
    tenant_slug: str,
    data: TrainingRegistrationRequest,
    db: DbSessionDep,
) -> dict:
    """Submit a public training registration.

    Creates a TrainingRegistration with attendees. Validates that the
    placement exists, is public (open/hybrid), and is in the future.
    """
    import uuid as _uuid

    from app.models.training_registration import TrainingRegistration, TrainingRegistrationAttendee

    tenant = await _resolve_tenant(db, tenant_slug)

    # Check registration period
    portal_settings = (tenant.settings or {}).get("training_portal", {})
    today = date.today()
    reg_start = portal_settings.get("registration_start_date")
    reg_end = portal_settings.get("registration_end_date")

    if reg_start:
        try:
            if today < date.fromisoformat(reg_start):
                raise HTTPException(status_code=403, detail=f"Registration opens on {reg_start}")
        except (ValueError, TypeError):
            pass

    if reg_end:
        try:
            if today > date.fromisoformat(reg_end):
                raise HTTPException(status_code=403, detail=f"Registration closed on {reg_end}")
        except (ValueError, TypeError):
            pass

    # Validate placement
    placement_query = (
        select(ProgramYearTraining)
        .join(Training, ProgramYearTraining.training_id == Training.id)
        .join(TrainingProgramYear, ProgramYearTraining.program_year_id == TrainingProgramYear.id)
        .options(joinedload(ProgramYearTraining.training))
        .where(
            ProgramYearTraining.id == data.placement_id,
            ProgramYearTraining.tenant_id == tenant.id,
            ProgramYearTraining.placement_type.in_(["open", "hybrid"]),
            ProgramYearTraining.start_date >= today,
            TrainingProgramYear.status == "published",
            Training.is_active.is_(True),
        )
    )
    result = await db.execute(placement_query)
    placement = result.scalars().unique().first()

    if not placement:
        raise HTTPException(status_code=404, detail="Training not found or not available for registration")

    # Validate attendees
    if not data.attendees:
        raise HTTPException(status_code=422, detail="At least one attendee is required")

    if len(data.attendees) > 100:
        raise HTTPException(status_code=422, detail="Maximum 100 attendees per registration")

    # Honeypot check
    if data.honeypot_field:
        raise HTTPException(status_code=422, detail="Invalid submission")

    # Set RLS context
    await db.execute(text("SET app.current_tenant_id = :tid"), {"tid": str(tenant.id)})

    # Calculate pricing
    training = placement.training
    price_per_person = float(training.regular_price or 0) if training else 0
    num_attendees = len(data.attendees)
    subtotal = price_per_person * num_attendees
    currency = training.currency or "EUR" if training else "EUR"

    # Create registration
    registration = TrainingRegistration(
        id=_uuid.uuid4(),
        tenant_id=tenant.id,
        placement_id=data.placement_id,
        status="registered",
        company_name=data.billing.company_name,
        street=data.billing.street,
        postal_code=data.billing.postal_code,
        city=data.billing.city,
        country=data.billing.country,
        vat_number=data.billing.vat_number,
        contact_first_name=data.billing.contact_first_name,
        contact_last_name=data.billing.contact_last_name,
        contact_email=data.billing.contact_email,
        contact_phone=data.billing.contact_phone,
        payment_method=data.billing.payment_method,
        payment_intent_id=data.billing.payment_intent_id,
        discount_code=data.discount_code,
        subtotal=subtotal,
        vat_amount=0,
        total=subtotal,
        currency=currency,
    )
    db.add(registration)

    # Create attendees
    attendee_records = []
    for att in data.attendees:
        attendee = TrainingRegistrationAttendee(
            id=_uuid.uuid4(),
            tenant_id=tenant.id,
            registration_id=registration.id,
            first_name=att.first_name,
            last_name=att.last_name,
            email=att.email,
        )
        db.add(attendee)
        attendee_records.append(attendee)

    await db.commit()
    await db.refresh(registration)

    return {
        "registration_id": str(registration.id),
        "status": registration.status,
        "training_name": training.name if training else "Unknown",
        "attendee_count": len(attendee_records),
        "total": str(registration.total),
        "currency": registration.currency,
        "payment_method": registration.payment_method,
    }
