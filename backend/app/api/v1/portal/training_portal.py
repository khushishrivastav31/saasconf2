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
from app.models.location import Location
from app.models.syllabus import Syllabus
from app.models.tenant import Tenant
from app.models.training import Training, TrainingLanguage, TrainingTheme
from app.models.training_program import (
    ProgramYearTraining,
    TrainingProgramYear,
)

router = APIRouter()


# ── Default portal texts ─────────────────────────────────────────

DEFAULT_PORTAL_TEXTS: dict[str, dict[str, str]] = {
    "en": {
        "search_title": "Training Catalog",
        "search_subtitle": "Browse available trainings and register",
        "search_placeholder": "Search trainings by name, location, certification...",
        "filter_date": "Date Range",
        "filter_location": "Location",
        "filter_language": "Language",
        "filter_syllabus": "Syllabus",
        "filter_theme": "Theme",
        "filter_type": "Type",
        "filter_clear": "Clear all",
        "btn_register": "Register",
        "btn_add_attendee": "+ Add",
        "btn_bulk_add": "Bulk add",
        "btn_submit": "Register & Pay",
        "section_attendees": "Attendees",
        "section_billing": "Billing Information",
        "section_contact": "Contact Person",
        "section_payment": "Payment Method",
        "section_summary": "Order Summary",
        "section_terms": "I agree to the terms and conditions and acknowledge the privacy policy.",
        "label_first_name": "First name",
        "label_last_name": "Last name",
        "label_email": "Email",
        "label_company": "Company name (optional)",
        "label_street": "Street address",
        "label_postal": "Postal code",
        "label_city": "City",
        "label_country": "Country",
        "label_vat": "VAT number (optional)",
        "label_phone": "Phone",
        "label_bank_transfer": "Bank Transfer",
        "label_credit_card": "Credit Card",
        "per_person": "per person",
        "total": "Total",
        "confirmation_title": "Registration Successful!",
        "confirmation_message": "Thank you for registering. You will receive a confirmation email.",
        "btn_browse_more": "Browse more trainings",
        "no_results": "No trainings found",
        "no_results_hint": "Try adjusting your filters or search terms.",
        "showing_results": "Showing {count} of {total} trainings",
        "filters": "Filters",
        "copy_from_attendee": "Copy from first attendee",
        "processing": "Processing...",
        "days": "days",
        "guaranteed": "Guaranteed",
        "label_certification_exam": "Certification Exam",
        "label_exam_none": "No exam",
        "label_exam_onsite": "On-site",
        "label_exam_online": "Online",
        "label_exam_language": "Exam language",
        "label_extra_time": "Extra time (foreign language)",
        "label_subtotal": "Subtotal",
        "label_vat_amount": "VAT ({rate}%)",
        "label_total": "Total",
        "attendee": "attendee",
        "attendees_plural": "attendees",
    },
    "de": {
        "search_title": "Schulungskatalog",
        "search_subtitle": "Verfügbare Schulungen durchsuchen und anmelden",
        "search_placeholder": "Schulungen suchen nach Name, Ort, Lehrplan...",
        "filter_date": "Zeitraum",
        "filter_location": "Standort",
        "filter_language": "Sprache",
        "filter_syllabus": "Lehrplan",
        "filter_theme": "Thema",
        "filter_type": "Typ",
        "filter_clear": "Alle zurücksetzen",
        "btn_register": "Anmelden",
        "btn_add_attendee": "+ Hinzufügen",
        "btn_bulk_add": "Mehrere hinzufügen",
        "btn_submit": "Anmelden & Bezahlen",
        "section_attendees": "Teilnehmer",
        "section_billing": "Rechnungsinformationen",
        "section_contact": "Ansprechpartner",
        "section_payment": "Zahlungsmethode",
        "section_summary": "Bestellübersicht",
        "section_terms": "Ich stimme den Allgemeinen Geschäftsbedingungen zu und akzeptiere die Datenschutzrichtlinie.",
        "label_first_name": "Vorname",
        "label_last_name": "Nachname",
        "label_email": "E-Mail",
        "label_company": "Firmenname (optional)",
        "label_street": "Straße",
        "label_postal": "PLZ",
        "label_city": "Ort",
        "label_country": "Land",
        "label_vat": "USt-IdNr. (optional)",
        "label_phone": "Telefon",
        "label_bank_transfer": "Banküberweisung",
        "label_credit_card": "Kreditkarte",
        "per_person": "pro Person",
        "total": "Gesamt",
        "confirmation_title": "Anmeldung erfolgreich!",
        "confirmation_message": "Vielen Dank für Ihre Anmeldung. Sie erhalten eine Bestätigungs-E-Mail.",
        "btn_browse_more": "Weitere Schulungen durchsuchen",
        "no_results": "Keine Schulungen gefunden",
        "no_results_hint": "Versuchen Sie, Ihre Filter oder Suchbegriffe anzupassen.",
        "showing_results": "{count} von {total} Schulungen",
        "filters": "Filter",
        "copy_from_attendee": "Vom ersten Teilnehmer übernehmen",
        "processing": "Wird verarbeitet...",
        "days": "Tage",
        "guaranteed": "Garantiert",
        "label_certification_exam": "Zertifizierungsprüfung",
        "label_exam_none": "Keine Prüfung",
        "label_exam_onsite": "Vor Ort",
        "label_exam_online": "Online",
        "label_exam_language": "Prüfungssprache",
        "label_extra_time": "Zusatzzeit (Fremdsprache)",
        "label_subtotal": "Zwischensumme",
        "label_vat_amount": "MwSt. ({rate}%)",
        "label_total": "Gesamt",
        "attendee": "Teilnehmer",
        "attendees_plural": "Teilnehmer",
    },
}

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
            TrainingProgramYear.status == "published",
            Training.is_active.is_(True),
        )
    )


def _get_tenant_country(tenant: Tenant) -> str:
    """Get tenant's country as ISO code — from tenant.country, then finance company_info."""
    from app.core.vat_validation import normalize_country

    raw = tenant.country or ""
    if not raw:
        finance = (tenant.settings or {}).get("training_finance", {})
        company_info = finance.get("company_info", {})
        raw = company_info.get("country", "") or ""
    if not raw:
        return ""
    # normalize_country handles both "Germany" → "DE" and "DE" → "DE"
    return normalize_country(raw) or raw.upper()


def _get_tenant_city(tenant: Tenant) -> str:
    """Get tenant's city for location fallback."""
    return tenant.city or ""


def _resolve_location_display(loc: Location | None, tenant_city: str = "") -> str | None:
    """Resolve the display city for a location: city → 'Online' if virtual → tenant city fallback."""
    if not loc:
        return tenant_city or None
    if loc.city:
        return loc.city
    name_lower = (loc.name or "").lower()
    if "online" in name_lower or "virtual" in name_lower:
        return loc.name
    return tenant_city or None


def _placement_to_dict(p: ProgramYearTraining, tenant_country: str = "", tenant_city: str = "") -> dict:
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
        "training_content": t.content if t else None,
        "start_date": p.start_date.isoformat() if p.start_date else None,
        "duration": t.duration if t else 1,
        "placement_type": p.placement_type or "open",
        "location_name": loc.name if loc else None,
        "location_city": _resolve_location_display(loc, tenant_city),
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
    syllabus_id: UUID | None = Query(None, description="Filter: syllabus ID"),
    theme_id: UUID | None = Query(None, description="Filter: theme ID"),
    guaranteed: bool | None = Query(None, description="Filter: guaranteed only"),
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

    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Paginate and order
    query = query.order_by(ProgramYearTraining.start_date).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    placements = result.scalars().unique().all()
    tc = _get_tenant_country(tenant)
    t_city = _get_tenant_city(tenant)

    return {
        "items": [_placement_to_dict(p, tc, t_city) for p in placements],
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

    # Get matching placement IDs
    sub = base.with_only_columns(ProgramYearTraining.id).subquery()

    # Location counts — resolve display label per location
    tenant_city = _get_tenant_city(tenant)
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
        label = _resolve_location_display(
            type("L", (), {"city": city, "name": name})(),
            tenant_city,  # type: ignore[arg-type]
        )
        if label:
            loc_counts[label] = loc_counts.get(label, 0) + cnt
    locations = sorted(
        [{"value": k, "count": v} for k, v in loc_counts.items()],
        key=lambda x: x["count"],
        reverse=True,
    )

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

    # Syllabus counts
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

    # Guaranteed count
    guaranteed_q = select(func.count(ProgramYearTraining.id)).where(
        ProgramYearTraining.id.in_(select(sub.c.id)), ProgramYearTraining.is_guaranteed.is_(True)
    )
    guaranteed_count = (await db.execute(guaranteed_q)).scalar() or 0

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
    tenant = await _resolve_tenant(db, tenant_slug)
    portal = (tenant.settings or {}).get("training_portal", {})

    # Merge custom texts with defaults so new keys are always present
    import copy

    custom_texts = portal.get("portal_texts", {})
    merged_texts = copy.deepcopy(DEFAULT_PORTAL_TEXTS)
    for lang, texts in custom_texts.items():
        if lang not in merged_texts:
            merged_texts[lang] = {}
        merged_texts[lang].update(texts)

    # Fetch exam languages (training languages for this tenant)
    lang_result = await db.execute(
        select(TrainingLanguage.id, TrainingLanguage.name)
        .where(TrainingLanguage.tenant_id == tenant.id)
        .order_by(TrainingLanguage.name)
    )
    exam_languages = [{"id": str(lid), "name": name} for lid, name in lang_result.all()]

    # Expose VAT config for client-side price calculation
    finance = (tenant.settings or {}).get("training_finance", {})

    return {
        "exam_languages": exam_languages,
        "default_language": portal.get("default_language", "en"),
        "available_languages": portal.get("available_languages", ["en", "de"]),
        "portal_texts": merged_texts,
        "vat_rates": finance.get("vat_rates", {}),
        "vat_rules": finance.get("vat_rules", []),
        "eu_countries": finance.get("eu_countries", []),
        "tenant_country": _get_tenant_country(tenant),
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

    return _placement_to_dict(placement, _get_tenant_country(tenant), _get_tenant_city(tenant))


# ── Registration ─────────────────────────────────────────────────


class TrainingAttendeeInput(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    exam_mode: str = "none"  # "none" | "onsite" | "online"
    exam_language: str | None = None
    extra_time: bool = False


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
    po_number: str | None = None


class TrainingRegistrationRequest(BaseModel):
    placement_id: UUID
    billing: TrainingBillingInput
    attendees: list[TrainingAttendeeInput]
    language: str = "en"
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
        .options(
            joinedload(ProgramYearTraining.training).joinedload(Training.syllabus),
            joinedload(ProgramYearTraining.location),
        )
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
    await db.execute(text("SELECT set_config('app.current_tenant_id', :tid, true)"), {"tid": str(tenant.id)})

    # Calculate pricing
    training = placement.training
    price_per_person = float(training.regular_price or 0) if training else 0
    num_attendees = len(data.attendees)

    # Exam fee — per attendee who opts in
    exam_unit_price = (
        float(training.syllabus.price) if training and training.syllabus and training.syllabus.price else 0
    )
    exam_attendees = sum(1 for a in data.attendees if a.exam_mode != "none") if exam_unit_price else 0
    training_subtotal = price_per_person * num_attendees
    exam_subtotal = exam_unit_price * exam_attendees
    subtotal = training_subtotal + exam_subtotal
    currency = training.currency or "EUR" if training else "EUR"

    # VAT calculation — apply VAT Decision Table rules
    finance_settings = (tenant.settings or {}).get("training_finance", {})
    vat_rates = finance_settings.get("vat_rates", {})
    vat_rules: list[dict] = finance_settings.get("vat_rules", [])
    eu_countries: list[str] = finance_settings.get("eu_countries", [])
    company_info = finance_settings.get("company_info", {})
    tenant_country = (company_info.get("country", "") or "").upper()

    # Location country — fall back to tenant country if not set on location
    location_country = ""
    if placement.location and placement.location.country:
        location_country = placement.location.country.upper()
    if not location_country:
        location_country = tenant_country

    billing_country = (data.billing.country or "").upper()

    # Determine attendance type — check resolved city (includes tenant city fallback)
    resolved_city = _resolve_location_display(placement.location, _get_tenant_city(tenant)) or ""
    is_virtual = "online" in resolved_city.lower() or "virtual" in resolved_city.lower()
    attendance_type = "virtual" if is_virtual else "in_person"

    # Determine customer type: B2B if company + VAT number, else B2C
    customer_type = "b2b" if data.billing.company_name and data.billing.vat_number else "b2c"

    # Determine customer location relative to tenant
    if billing_country == tenant_country:
        customer_location = "domestic"
    elif billing_country.upper() in [c.upper() for c in eu_countries]:
        customer_location = "eu"
    else:
        customer_location = "non_eu"

    # Find matching VAT rule
    vat_rate = 0.0
    charge_vat = False
    for rule in vat_rules:
        if (
            rule.get("attendance_type", "") == attendance_type
            and rule.get("customer_type", "") == customer_type
            and rule.get("customer_location", "") == customer_location
        ):
            charge_vat = rule.get("charge_vat", False)
            if charge_vat:
                source = rule.get("vat_rate_source", "")
                if source in ("training_country", "conference"):
                    vat_rate = float(vat_rates.get(location_country, 0))
                elif source in ("customer_country", "customer"):
                    vat_rate = float(vat_rates.get(billing_country, 0))
            break

    # Fallback: if no rules configured, use training location country rate
    if not vat_rules and location_country:
        vat_rate = float(vat_rates.get(location_country, 0))

    vat_amount = 0.0
    if vat_rate:
        vat_amount = round(subtotal * vat_rate / 100, 2)
    total = round(subtotal + vat_amount, 2)

    # Create registration
    registration = TrainingRegistration(
        id=_uuid.uuid4(),
        tenant_id=tenant.id,
        placement_id=data.placement_id,
        status="paid"
        if data.billing.payment_method == "credit_card" and data.billing.payment_intent_id
        else "registered",
        language=data.language,
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
        po_number=data.billing.po_number,
        discount_code=data.discount_code,
        subtotal=subtotal,
        vat_amount=vat_amount,
        total=total,
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
            language=data.language,
            include_exam=att.exam_mode != "none",
            exam_language=att.exam_language if att.exam_mode != "none" else None,
            exam_mode=att.exam_mode if att.exam_mode != "none" else None,
            extra_time=att.extra_time,
        )
        db.add(attendee)
        attendee_records.append(attendee)

    await db.commit()
    await db.refresh(registration)

    # Auto-guarantee: check if attendee count meets threshold
    auto_threshold = portal_settings.get("auto_guarantee_threshold")
    if auto_threshold and not placement.is_guaranteed:
        from app.models.training_registration import TrainingRegistrationAttendee as TRAModel

        count_q = (
            select(func.count(TRAModel.id))
            .join(
                TrainingRegistration,
                TRAModel.registration_id == TrainingRegistration.id,
            )
            .where(
                TrainingRegistration.placement_id == placement.id,
                TrainingRegistration.tenant_id == tenant.id,
            )
        )
        total_attendees = (await db.execute(count_q)).scalar() or 0
        if total_attendees >= int(auto_threshold):
            placement.is_guaranteed = True
            await db.commit()

    # Create invoice
    from app.core.training_invoice_generation import create_invoice_for_training_registration

    invoice = await create_invoice_for_training_registration(db, registration, tenant)
    await db.commit()

    # Send emails as background tasks
    from app.core.email import send_email_background
    from app.core.training_registration_emails import (
        send_training_confirmation_email,
        send_training_invoice_email,
    )

    if invoice:
        send_email_background(
            send_training_invoice_email,
            invoice=invoice,
            registration=registration,
            tenant=tenant,
        )

    send_email_background(
        send_training_confirmation_email,
        registration=registration,
        tenant=tenant,
    )

    return {
        "registration_id": str(registration.id),
        "status": registration.status,
        "training_name": training.name if training else "Unknown",
        "attendee_count": len(attendee_records),
        "total": str(registration.total),
        "currency": registration.currency,
        "payment_method": registration.payment_method,
        "invoice_number": invoice.invoice_number if invoice else None,
    }


# ── Stripe Payment ──────────────────────────────────────────────────


class _PaymentIntentRequest(BaseModel):
    total: float
    currency: str = "EUR"


@router.post("/{tenant_slug}/trainings/create-payment-intent")
async def create_training_payment_intent(
    tenant_slug: str,
    data: _PaymentIntentRequest,
    db: DbSessionDep,
) -> dict:
    """Create Stripe PaymentIntent for training registration (no auth)."""
    import stripe as stripe_lib

    tenant = await _resolve_tenant(db, tenant_slug)
    finance = (tenant.settings or {}).get("training_finance", {})
    stripe_cfg = finance.get("stripe", {})

    if not stripe_cfg.get("is_enabled"):
        raise HTTPException(status_code=400, detail="Stripe is not enabled")

    secret_key = stripe_cfg.get("secret_key")
    publishable_key = stripe_cfg.get("publishable_key")
    if not secret_key or not publishable_key:
        raise HTTPException(status_code=400, detail="Stripe keys not configured")

    if data.total <= 0:
        raise HTTPException(status_code=400, detail="Total must be greater than 0")

    try:
        stripe_lib.api_key = secret_key
        pi = stripe_lib.PaymentIntent.create(
            amount=int(data.total * 100),
            currency=data.currency.lower(),
            metadata={
                "system": "saasconf",
                "tenant_id": str(tenant.id),
                "context": "training",
                "preview": "true",
            },
        )
        return {
            "payment_intent_id": pi.id,
            "client_secret": pi.client_secret,
            "publishable_key": publishable_key,
        }
    except stripe_lib.error.StripeError as e:
        raise HTTPException(status_code=500, detail=f"Stripe error: {e!s}") from e


@router.put("/{tenant_slug}/trainings/update-payment-intent/{payment_intent_id}")
async def update_training_payment_intent(
    tenant_slug: str,
    payment_intent_id: str,
    data: _PaymentIntentRequest,
    db: DbSessionDep,
) -> dict:
    """Update Stripe PaymentIntent amount (no auth)."""
    import stripe as stripe_lib

    tenant = await _resolve_tenant(db, tenant_slug)
    finance = (tenant.settings or {}).get("training_finance", {})
    stripe_cfg = finance.get("stripe", {})

    if not stripe_cfg.get("is_enabled"):
        raise HTTPException(status_code=400, detail="Stripe is not enabled")

    secret_key = stripe_cfg.get("secret_key")
    if not secret_key:
        raise HTTPException(status_code=400, detail="Stripe secret key not configured")

    if data.total <= 0:
        raise HTTPException(status_code=400, detail="Total must be greater than 0")

    try:
        stripe_lib.api_key = secret_key
        pi = stripe_lib.PaymentIntent.modify(
            payment_intent_id,
            amount=int(data.total * 100),
        )
        return {"success": True, "payment_intent_id": pi.id, "amount": data.total}
    except stripe_lib.error.StripeError as e:
        raise HTTPException(status_code=500, detail=f"Stripe error: {e!s}") from e
