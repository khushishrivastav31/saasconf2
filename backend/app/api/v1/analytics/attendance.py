"""Attendance and registration statistics endpoints."""

import asyncio
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import Date, func, select, text

from app.constants import ModuleCode
from app.core.conference_helpers import check_conference_admin
from app.core.dependencies import CurrentUserDep, DbSessionDep, require_module
from app.core.geocoding import geocode_city, get_country_name
from app.models.associations import ConferenceCFP
from app.models.cfp_papers import CFPPaper
from app.models.program import ProgramDay
from app.models.registration import BillingProfile, Registration, RegistrationStatus
from app.schemas.analytics import (
    AttendeesCompanyResponse,
    AttendeesLocationResponse,
    AttendeesPerDayResponse,
    CityLocation,
    CompanyCount,
    CountryCount,
    DayAttendance,
    PapersOverTimeResponse,
    PaperTimePoint,
    RegistrationsOverTimeResponse,
    RegistrationTimePoint,
)

MODULE_CODE = ModuleCode.ANALYTICS

router = APIRouter()


def _country_name(code: str) -> str:
    return get_country_name(code) or code


# ---------------------------------------------------------------------------
# Statistics: Registrations Over Time
# ---------------------------------------------------------------------------


@router.get(
    "/stats/registrations-over-time",
    response_model=RegistrationsOverTimeResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def get_registrations_over_time(
    conference_id: UUID,
    db: DbSessionDep,
    current_user: CurrentUserDep,
) -> RegistrationsOverTimeResponse:
    """Daily registration counts with running cumulative total."""
    await check_conference_admin(conference_id, current_user, db)

    stmt = (
        select(
            func.cast(Registration.created_at, Date).label("reg_date"),
            func.count(Registration.id).label("cnt"),
        )
        .where(
            Registration.conference_id == conference_id,
            Registration.tenant_id == current_user.tenant_id,
            Registration.status != RegistrationStatus.CANCELLED,
        )
        .group_by(func.cast(Registration.created_at, Date))
        .order_by(func.cast(Registration.created_at, Date))
    )
    result = await db.execute(stmt)
    rows = result.all()

    data_points: list[RegistrationTimePoint] = []
    cumulative = 0
    for row in rows:
        cumulative += int(row.cnt)
        data_points.append(
            RegistrationTimePoint(
                date=str(row.reg_date),
                count=int(row.cnt),
                cumulative=cumulative,
            )
        )
    return RegistrationsOverTimeResponse(data_points=data_points)


# ---------------------------------------------------------------------------
# Statistics: Attendees Location
# ---------------------------------------------------------------------------


@router.get(
    "/stats/attendees-location",
    response_model=AttendeesLocationResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def get_attendees_location(
    conference_id: UUID,
    db: DbSessionDep,
    current_user: CurrentUserDep,
) -> AttendeesLocationResponse:
    """Attendee counts grouped by country and city (from billing profiles)."""
    await check_conference_admin(conference_id, current_user, db)

    country_stmt = (
        select(
            BillingProfile.country.label("country_code"),
            func.count(Registration.id).label("cnt"),
        )
        .join(BillingProfile, Registration.billing_profile_id == BillingProfile.id)
        .where(
            Registration.conference_id == conference_id,
            Registration.tenant_id == current_user.tenant_id,
            Registration.status != RegistrationStatus.CANCELLED,
            BillingProfile.country.is_not(None),
            BillingProfile.country != "",
        )
        .group_by(BillingProfile.country)
        .order_by(func.count(Registration.id).desc())
    )

    city_stmt = (
        select(
            BillingProfile.city.label("city"),
            BillingProfile.country.label("country_code"),
            func.count(Registration.id).label("cnt"),
        )
        .join(BillingProfile, Registration.billing_profile_id == BillingProfile.id)
        .where(
            Registration.conference_id == conference_id,
            Registration.tenant_id == current_user.tenant_id,
            Registration.status != RegistrationStatus.CANCELLED,
            BillingProfile.city.is_not(None),
            BillingProfile.city != "",
        )
        .group_by(BillingProfile.city, BillingProfile.country)
        .order_by(func.count(Registration.id).desc())
    )

    country_result, city_result = await asyncio.gather(
        db.execute(country_stmt),
        db.execute(city_stmt),
    )

    by_country: list[CountryCount] = [
        CountryCount(
            country=_country_name(row.country_code),
            country_code=row.country_code.upper(),
            count=int(row.cnt),
        )
        for row in country_result.all()
    ]

    by_city: list[CityLocation] = []
    for row in city_result.all():
        coords = geocode_city(row.city, row.country_code)
        by_city.append(
            CityLocation(
                city=row.city,
                country=_country_name(row.country_code),
                country_code=row.country_code.upper(),
                count=int(row.cnt),
                lat=coords[0] if coords else None,
                lng=coords[1] if coords else None,
            )
        )

    return AttendeesLocationResponse(by_country=by_country, by_city=by_city)


# ---------------------------------------------------------------------------
# Statistics: Attendees Company
# ---------------------------------------------------------------------------


@router.get(
    "/stats/attendees-company",
    response_model=AttendeesCompanyResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def get_attendees_company(
    conference_id: UUID,
    db: DbSessionDep,
    current_user: CurrentUserDep,
) -> AttendeesCompanyResponse:
    """Companies sorted by number of attendees (from billing profiles)."""
    await check_conference_admin(conference_id, current_user, db)

    stmt = (
        select(
            BillingProfile.company_name.label("company"),
            func.count(Registration.id).label("cnt"),
        )
        .join(BillingProfile, Registration.billing_profile_id == BillingProfile.id)
        .where(
            Registration.conference_id == conference_id,
            Registration.tenant_id == current_user.tenant_id,
            Registration.status != RegistrationStatus.CANCELLED,
            BillingProfile.company_name.is_not(None),
            BillingProfile.company_name != "",
        )
        .group_by(BillingProfile.company_name)
        .order_by(func.count(Registration.id).desc())
        .limit(50)
    )
    result = await db.execute(stmt)
    rows = result.all()

    companies = [CompanyCount(company=row.company, count=int(row.cnt)) for row in rows]
    return AttendeesCompanyResponse(
        companies=companies,
        total_unique_companies=len(companies),
    )


# ---------------------------------------------------------------------------
# Statistics: Papers Over Time
# ---------------------------------------------------------------------------


@router.get(
    "/stats/papers-over-time",
    response_model=PapersOverTimeResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def get_papers_over_time(
    conference_id: UUID,
    db: DbSessionDep,
    current_user: CurrentUserDep,
) -> PapersOverTimeResponse:
    """Monthly CFP paper submission counts with running cumulative total."""
    await check_conference_admin(conference_id, current_user, db)

    cfp_ids_stmt = select(ConferenceCFP.cfp_id).where(
        ConferenceCFP.conference_id == conference_id,
    )
    cfp_ids_result = await db.execute(cfp_ids_stmt)
    cfp_ids = [row[0] for row in cfp_ids_result.all()]

    if not cfp_ids:
        return PapersOverTimeResponse(data_points=[], has_cfp=False)

    month_expr = func.to_char(
        func.coalesce(CFPPaper.submitted_at, CFPPaper.created_at),
        "YYYY-MM",
    )
    stmt = (
        select(
            month_expr.label("month"),
            func.count(CFPPaper.id).label("cnt"),
        )
        .where(
            CFPPaper.cfp_id.in_(cfp_ids),
            CFPPaper.tenant_id == current_user.tenant_id,
        )
        .group_by(month_expr)
        .order_by(month_expr)
    )
    result = await db.execute(stmt)
    rows = result.all()

    if not rows:
        return PapersOverTimeResponse(data_points=[], has_cfp=True)

    data_points: list[PaperTimePoint] = []
    cumulative = 0
    for row in rows:
        cumulative += int(row.cnt)
        data_points.append(PaperTimePoint(month=row.month, count=int(row.cnt), cumulative=cumulative))
    return PapersOverTimeResponse(data_points=data_points, has_cfp=True)


# ---------------------------------------------------------------------------
# Statistics: Attendees per Day
# ---------------------------------------------------------------------------


@router.get(
    "/stats/attendees-per-day",
    response_model=AttendeesPerDayResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def get_attendees_per_day(
    conference_id: UUID,
    db: DbSessionDep,
    current_user: CurrentUserDep,
) -> AttendeesPerDayResponse:
    """Number of attendees per conference day, sourced from invoice line items."""
    await check_conference_admin(conference_id, current_user, db)

    tenant_id = current_user.tenant_id

    days_check_stmt = select(ProgramDay.id).where(
        ProgramDay.conference_id == conference_id,
        ProgramDay.tenant_id == tenant_id,
    )
    days_check_result = await db.execute(days_check_stmt)
    if not days_check_result.first():
        return AttendeesPerDayResponse(days=[], has_program_days=False)

    all_days_stmt = (
        select(ProgramDay.id, ProgramDay.date, ProgramDay.name, ProgramDay.sort_order)
        .where(
            ProgramDay.conference_id == conference_id,
            ProgramDay.tenant_id == tenant_id,
        )
        .order_by(ProgramDay.sort_order, ProgramDay.date)
    )
    all_days_result = await db.execute(all_days_stmt)
    all_days = all_days_result.all()

    count_stmt = text("""
        SELECT bo.id AS booking_option_id,
               bo.conference_day_id,
               bo.name AS option_name,
               COUNT(*) AS cnt
        FROM invoices i
        CROSS JOIN jsonb_array_elements(
            CASE WHEN jsonb_typeof(i.line_items) = 'array' THEN i.line_items ELSE jsonb_build_array() END
        ) AS li
        JOIN booking_options bo ON (
            li->>'description' = bo.name
            OR li->>'description' LIKE bo.name || ' - %'
        )
        WHERE i.conference_id = :conference_id
          AND i.tenant_id = :tenant_id
          AND i.is_active = true
          AND i.status IN ('paid', 'overdue', 'sent')
          AND i.recipient_source_type IN ('registration', 'billing_profile')
          AND i.template_type != 'credit_note'
          AND bo.conference_id = :conference_id
          AND bo.tenant_id = :tenant_id
        GROUP BY bo.id, bo.conference_day_id, bo.name
    """)
    count_result = await db.execute(
        count_stmt,
        {"conference_id": str(conference_id), "tenant_id": str(tenant_id)},
    )

    day_counts: dict[str, int] = {}
    day_name_to_id: dict[str, str] = {}
    for day in all_days:
        day_counts[str(day.id)] = 0
        if day.name:
            day_name_to_id[day.name.lower()] = str(day.id)

    for row in count_result.mappings().all():
        day_id_str = str(row["conference_day_id"]) if row["conference_day_id"] else None
        cnt = int(row["cnt"])

        if day_id_str and day_id_str in day_counts:
            day_counts[day_id_str] += cnt
        elif row["option_name"]:
            matched_day_id = day_name_to_id.get(row["option_name"].lower())
            if matched_day_id:
                day_counts[matched_day_id] += cnt

    days = [
        DayAttendance(
            day_label=f"{day.name or f'Day {i + 1}'} – {day.date}",
            date=str(day.date),
            count=day_counts.get(str(day.id), 0),
        )
        for i, day in enumerate(all_days)
    ]
    return AttendeesPerDayResponse(days=days, has_program_days=True)
