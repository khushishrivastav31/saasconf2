"""Analytics endpoints: revenue tracking and financial reporting."""

import asyncio
import io
from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import Date, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import ModuleCode
from app.core.conference_helpers import check_conference_admin, get_conference_for_tenant
from app.core.csv_export import csv_response
from app.core.dependencies import CurrentUserDep, DbSessionDep, require_module
from app.core.file_validation import safe_content_disposition
from app.models.booking import BookingOption, BookingPeriod
from app.models.budget import Budget, BudgetCategory, BudgetLineItem
from app.models.invoice import Invoice
from app.models.registration import Registration, RegistrationItem, RegistrationStatus
from app.models.speaker_expense import SpeakerExpense
from app.schemas.analytics import (
    BookingOptionRevenue,
    CostPerAttendee,
    FinancialReportResponse,
    PeriodBreakdown,
    PLSummary,
    RevenueTrackingResponse,
    VarianceLine,
)

MODULE_CODE = ModuleCode.ANALYTICS

router = APIRouter()


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


async def _get_revenue_data(db: AsyncSession, conference_id: UUID, tenant_id: UUID) -> RevenueTrackingResponse:
    """Compute revenue tracking data from invoices.

    Uses invoices as the financial source of truth. Registrations provide
    ticket-type classification only. Bulk billing profiles are pro-rated via
    reg_counts CTE. Booking period is inferred from registration.created_at
    matching the period's date range.
    """
    PAID_STATUSES = ("paid", "overdue")
    OUTSTANDING_STATUS = "sent"

    # ── Registration counts ─────────────────────────────────────────────────
    reg_totals_stmt = select(
        func.count().label("total"),
        func.count().filter(Registration.status == RegistrationStatus.PAID).label("paid"),
        func.count().filter(Registration.status == RegistrationStatus.CANCELLED).label("cancelled"),
    ).where(
        Registration.conference_id == conference_id,
        Registration.tenant_id == tenant_id,
    )
    reg_result = await db.execute(reg_totals_stmt)
    reg_row = reg_result.one()
    total_regs = int(reg_row.total)
    paid_regs = int(reg_row.paid)
    cancelled_regs = int(reg_row.cancelled)
    active_regs = total_regs - cancelled_regs

    # ── Check for multiple currencies ───────────────────────────────────────
    currencies_stmt = (
        select(Invoice.currency)
        .where(
            Invoice.conference_id == conference_id,
            Invoice.tenant_id == tenant_id,
            Invoice.is_active.is_(True),
            Invoice.status.in_([*list(PAID_STATUSES), OUTSTANDING_STATUS]),
            Invoice.template_type != "credit_note",
        )
        .distinct()
    )
    currencies_result = await db.execute(currencies_stmt)
    currencies = [r[0] for r in currencies_result.all() if r[0]]
    primary_currency = currencies[0] if currencies else "EUR"
    multiple_currencies = len(currencies) > 1

    # ── Sponsor revenue ─────────────────────────────────────────────────────
    sponsor_stmt = select(
        func.coalesce(func.sum(Invoice.total), Decimal("0")).label("total"),
        func.count(Invoice.id).label("count"),
    ).where(
        Invoice.conference_id == conference_id,
        Invoice.tenant_id == tenant_id,
        Invoice.is_active.is_(True),
        Invoice.recipient_source_type == "sponsor",
        Invoice.status.in_([*list(PAID_STATUSES), OUTSTANDING_STATUS]),
        Invoice.currency == primary_currency,
        Invoice.template_type != "credit_note",
    )
    sponsor_result = await db.execute(sponsor_stmt)
    sponsor_row = sponsor_result.one()
    sponsor_revenue = Decimal(str(sponsor_row.total))
    sponsor_count = int(sponsor_row.count)  # type: ignore[call-overload]

    # ── Outstanding revenue (receivables) ───────────────────────────────────
    # Credit notes are excluded — they are accounting offsets, not receivables.
    outstanding_stmt = select(
        func.coalesce(func.sum(Invoice.total), Decimal("0")).label("total"),
    ).where(
        Invoice.conference_id == conference_id,
        Invoice.tenant_id == tenant_id,
        Invoice.is_active.is_(True),
        Invoice.status == OUTSTANDING_STATUS,
        Invoice.currency == primary_currency,
        Invoice.template_type != "credit_note",
    )
    outstanding_result = await db.execute(outstanding_stmt)
    outstanding_revenue = Decimal(str(outstanding_result.scalar() or 0))

    # ── Total registration invoice revenue (source of truth) ────────────────
    # Sum invoice totals directly — credit notes excluded because the cancelled
    # invoice they offset is already excluded (status = cancelled).
    total_reg_invoice_stmt = select(
        func.coalesce(func.sum(Invoice.total), Decimal("0")).label("total"),
    ).where(
        Invoice.conference_id == conference_id,
        Invoice.tenant_id == tenant_id,
        Invoice.is_active.is_(True),
        Invoice.status.in_([*list(PAID_STATUSES), OUTSTANDING_STATUS]),
        Invoice.currency == primary_currency,
        Invoice.recipient_source_type.in_(["registration", "billing_profile"]),
        Invoice.template_type != "credit_note",
    )
    total_reg_invoice_result = await db.execute(total_reg_invoice_stmt)
    total_reg_invoice_revenue = Decimal(str(total_reg_invoice_result.scalar() or 0))

    # ── Revenue by booking option × booking period ───────────────────────────
    # CTE: assign each registration its best-matching booking period.
    # Period is inferred from created_at date vs period date range.
    # If periods overlap, pick the most recently started one (DESC LIMIT 1).
    booking_period_sq = (
        select(BookingPeriod.id)
        .where(
            BookingPeriod.conference_id == Registration.conference_id,
            BookingPeriod.tenant_id == Registration.tenant_id,
            func.cast(Registration.created_at, Date) >= BookingPeriod.start_date,
            func.cast(Registration.created_at, Date) <= BookingPeriod.end_date,
        )
        .order_by(BookingPeriod.start_date.desc())
        .limit(1)
        .correlate(Registration)
        .scalar_subquery()
    )

    reg_periods_cte = (
        select(
            Registration.id.label("registration_id"),
            Registration.booking_option_id,
            Registration.billing_profile_id,
            booking_period_sq.label("booking_period_id"),
        )
        .where(
            Registration.conference_id == conference_id,
            Registration.tenant_id == tenant_id,
            Registration.status != RegistrationStatus.CANCELLED,
        )
        .cte("reg_periods")
    )

    # Query A: authoritative attendee counts — primary registrations only.
    # No invoice join, no BookingOption join. Immune to data issues.
    attendee_count_stmt = (
        select(
            reg_periods_cte.c.booking_option_id,
            reg_periods_cte.c.booking_period_id,
            func.count(reg_periods_cte.c.registration_id).label("attendee_count"),
        )
        .select_from(reg_periods_cte)
        .group_by(reg_periods_cte.c.booking_option_id, reg_periods_cte.c.booking_period_id)
    )

    # Query A2: attendee counts from RegistrationItems (add-ons: day passes, tutorials).
    # Uses parent registration's period (via reg_periods_cte join) for consistency.
    # Revenue stays with the primary registration; items only contribute to attendee counts.
    items_count_stmt = (
        select(
            RegistrationItem.booking_option_id,
            reg_periods_cte.c.booking_period_id,
            func.count(RegistrationItem.id).label("attendee_count"),
        )
        .select_from(RegistrationItem)
        .join(reg_periods_cte, reg_periods_cte.c.registration_id == RegistrationItem.registration_id)
        .where(RegistrationItem.booking_option_id.is_not(None))
        .group_by(RegistrationItem.booking_option_id, reg_periods_cte.c.booking_period_id)
    )

    # Query B: revenue from invoice line items — invoice is the source of truth.
    # Expands each invoice's line_items JSONB and matches the description to a
    # booking option name. Line item description format (from invoice_line_items.py):
    #   - exact option name:          "Tutorial Day"
    #   - with session suffix:        "Tutorial Day - Back to Testing Basics"
    # Tax is pro-rated per line item proportionally to its share of invoice subtotal.
    revenue_stmt = text("""
        SELECT
            bo.id AS booking_option_id,
            COALESCE(SUM((li->>'total')::numeric), 0) AS subtotal_revenue,
            COALESCE(SUM(
                CASE WHEN i.subtotal > 0
                THEN (li->>'total')::numeric * i.tax_amount / i.subtotal
                ELSE 0 END
            ), 0) AS tax_amount,
            COALESCE(SUM(
                CASE WHEN i.subtotal > 0
                THEN (li->>'total')::numeric * i.total / i.subtotal
                ELSE (li->>'total')::numeric END
            ), 0) AS total_revenue
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
          AND i.currency = :primary_currency
          AND i.recipient_source_type IN ('registration', 'billing_profile')
          AND i.template_type != 'credit_note'
          AND bo.conference_id = :conference_id
          AND bo.tenant_id = :tenant_id
        GROUP BY bo.id
    """)

    # Query C: booking option metadata for name/category/sort_order lookup.
    booking_option_stmt = select(
        BookingOption.id, BookingOption.name, BookingOption.conference_day_id, BookingOption.sort_order
    ).where(
        BookingOption.conference_id == conference_id,
        BookingOption.tenant_id == tenant_id,
    )

    # Query D: booking period metadata for name/dates lookup.
    period_meta_stmt = select(
        BookingPeriod.id,
        BookingPeriod.name,
        BookingPeriod.start_date,
        BookingPeriod.end_date,
    ).where(
        BookingPeriod.conference_id == conference_id,
        BookingPeriod.tenant_id == tenant_id,
    )

    attendee_count_result = await db.execute(attendee_count_stmt)
    items_count_result = await db.execute(items_count_stmt)
    revenue_result = await db.execute(
        revenue_stmt,
        {
            "conference_id": str(conference_id),
            "tenant_id": str(tenant_id),
            "primary_currency": primary_currency,
        },
    )
    booking_option_result = await db.execute(booking_option_stmt)
    period_meta_result = await db.execute(period_meta_stmt)

    # Build lookup dicts
    option_meta = {row.id: row for row in booking_option_result.all()}
    period_meta = {row.id: row for row in period_meta_result.all()}

    # Revenue keyed by booking_option_id — sourced from invoice line items
    option_revenue: dict[UUID, tuple[Decimal, Decimal, Decimal]] = {}
    for row in revenue_result.mappings().all():
        option_revenue[UUID(str(row["booking_option_id"]))] = (
            Decimal(str(row["total_revenue"])).quantize(Decimal("0.01")),
            Decimal(str(row["subtotal_revenue"])).quantize(Decimal("0.01")),
            Decimal(str(row["tax_amount"])).quantize(Decimal("0.01")),
        )

    # Combine primary registration counts + add-on item counts per (option, period)
    all_counts: dict[tuple[UUID, UUID | None], int] = {}
    for row in attendee_count_result.all():
        key = (row.booking_option_id, row.booking_period_id)
        all_counts[key] = all_counts.get(key, 0) + int(row.attendee_count)
    for row in items_count_result.all():
        key = (row.booking_option_id, row.booking_period_id)
        all_counts[key] = all_counts.get(key, 0) + int(row.attendee_count)

    # Total attendees per option — used to distribute option revenue across periods
    option_totals: dict[UUID, int] = {}
    for (opt_id, _), count in all_counts.items():
        option_totals[opt_id] = option_totals.get(opt_id, 0) + count

    # Merge: distribute option-level revenue proportionally across periods
    option_map: dict[UUID, BookingOptionRevenue] = {}
    for (opt_id, period_id), count in all_counts.items():
        opt_meta = option_meta.get(opt_id)
        if opt_meta is None:
            # Booking option no longer exists — skip orphaned registration
            continue
        p_info = period_meta.get(period_id) if period_id else None
        total_opt_rev, subtotal_opt_rev, tax_opt_rev = option_revenue.get(
            opt_id, (Decimal("0"), Decimal("0"), Decimal("0"))
        )
        total_attendees = option_totals.get(opt_id, 1) or 1
        period_fraction = Decimal(str(count)) / Decimal(str(total_attendees))
        period = PeriodBreakdown(
            booking_period_id=period_id,
            period_name=p_info.name if p_info else "No Period",
            period_start=p_info.start_date if p_info else None,
            period_end=p_info.end_date if p_info else None,
            attendee_count=count,
            total_revenue=(total_opt_rev * period_fraction).quantize(Decimal("0.01")),
            subtotal_revenue=(subtotal_opt_rev * period_fraction).quantize(Decimal("0.01")),
            tax_amount=(tax_opt_rev * period_fraction).quantize(Decimal("0.01")),
        )
        if opt_id not in option_map:
            option_map[opt_id] = BookingOptionRevenue(
                booking_option_id=opt_id,
                booking_option_name=opt_meta.name,
                category="day_pass" if opt_meta.conference_day_id else "ticket",
                conference_day_id=opt_meta.conference_day_id,
                attendee_count=0,
                total_revenue=Decimal("0"),
                subtotal_revenue=Decimal("0"),
                tax_amount=Decimal("0"),
                currency=primary_currency,
                periods=[],
            )
        opt = option_map[opt_id]
        opt.periods.append(period)
        opt.attendee_count += period.attendee_count
        opt.total_revenue += period.total_revenue
        opt.subtotal_revenue += period.subtotal_revenue
        opt.tax_amount += period.tax_amount

    by_booking_option = sorted(
        option_map.values(),
        key=lambda opt: (
            option_meta[opt.booking_option_id].sort_order
            if option_meta.get(opt.booking_option_id) is not None
            else 9999
        ),
    )
    # Use invoice totals as ground truth for registration revenue.
    # Line item matching populates the per-option breakdown; any unmatched
    # portion (e.g. line items whose description doesn't match a booking option)
    # surfaces as other_revenue so the Grand Total always equals invoice totals.
    matched_revenue = sum((opt.total_revenue for opt in by_booking_option), Decimal("0"))
    registration_revenue = total_reg_invoice_revenue
    total_revenue = registration_revenue + sponsor_revenue
    other_revenue = max(Decimal("0"), registration_revenue - matched_revenue).quantize(Decimal("0.01"))

    return RevenueTrackingResponse(
        total_revenue=total_revenue.quantize(Decimal("0.01")),
        registration_revenue=registration_revenue.quantize(Decimal("0.01")),
        sponsor_revenue=sponsor_revenue.quantize(Decimal("0.01")),
        outstanding_revenue=outstanding_revenue.quantize(Decimal("0.01")),
        other_revenue=other_revenue,
        currency=primary_currency,
        by_booking_option=by_booking_option,
        sponsor_invoice_count=sponsor_count,
        total_registrations=total_regs,
        paid_registrations=paid_regs,
        active_registrations=active_regs,
        cancelled_registrations=cancelled_regs,
        multiple_currencies=multiple_currencies,
    )


# ---------------------------------------------------------------------------
# Revenue endpoint
# ---------------------------------------------------------------------------


@router.get(
    "/revenue",
    response_model=RevenueTrackingResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def get_revenue_tracking(
    conference_id: UUID,
    db: DbSessionDep,
    current_user: CurrentUserDep,
) -> RevenueTrackingResponse:
    """Revenue tracking data aggregated from invoices."""
    await check_conference_admin(conference_id, current_user, db)
    return await _get_revenue_data(db, conference_id, current_user.tenant_id)


# ---------------------------------------------------------------------------
# Financial report endpoint
# ---------------------------------------------------------------------------


@router.get(
    "/financial-report",
    response_model=FinancialReportResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def get_financial_report(
    conference_id: UUID,
    db: DbSessionDep,
    current_user: CurrentUserDep,
) -> FinancialReportResponse:
    """P&L summary, variance by budget category, cost per attendee."""
    await check_conference_admin(conference_id, current_user, db)
    await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    # Run revenue query and budget/expense queries in parallel
    revenue_task = _get_revenue_data(db, conference_id, current_user.tenant_id)
    budget_task = _get_budget_data(db, conference_id, current_user.tenant_id)
    speaker_expense_task = _get_speaker_expenses_total(db, conference_id, current_user.tenant_id)

    revenue, (budget_id, budget_name, variance_lines), speaker_expenses = await asyncio.gather(
        revenue_task, budget_task, speaker_expense_task
    )

    total_costs = speaker_expenses
    if variance_lines:
        for line in variance_lines:
            # Use actual_amount if entered; fall back to planned_amount as cost estimate
            total_costs += line.actual if line.actual > Decimal("0") else line.planned

    net_result = revenue.total_revenue - total_costs
    paid_attendees = revenue.active_registrations

    pl_summary = PLSummary(
        total_revenue=revenue.total_revenue,
        outstanding_revenue=revenue.outstanding_revenue,
        total_costs=total_costs.quantize(Decimal("0.01")),
        net_result=net_result.quantize(Decimal("0.01")),
        currency=revenue.currency,
        as_of_date=date.today(),
    )

    cost_per_attendee_val = (
        (total_costs / paid_attendees).quantize(Decimal("0.01")) if paid_attendees > 0 else Decimal("0")
    )
    revenue_per_attendee_val = (
        (revenue.total_revenue / paid_attendees).quantize(Decimal("0.01")) if paid_attendees > 0 else Decimal("0")
    )

    cost_per_attendee = CostPerAttendee(
        total_paid_attendees=paid_attendees,
        total_costs=total_costs.quantize(Decimal("0.01")),
        cost_per_attendee=cost_per_attendee_val,
        revenue_per_attendee=revenue_per_attendee_val,
        currency=revenue.currency,
    )

    return FinancialReportResponse(
        pl_summary=pl_summary,
        variance_by_category=variance_lines,
        cost_per_attendee=cost_per_attendee,
        revenue=revenue,
        budget_id=budget_id,
        budget_name=budget_name,
        generated_at=datetime.now(UTC),
    )


async def _get_budget_data(
    db: AsyncSession, conference_id: UUID, tenant_id: UUID
) -> tuple[UUID | None, str | None, list[VarianceLine]]:
    """Fetch active budget and compute variance lines by category."""
    # There is exactly one budget per conference — fetch it regardless of status.
    # (Budget is always the active cost plan; "draft" is a legacy default.)
    budget_stmt = select(Budget).where(
        Budget.conference_id == conference_id,
        Budget.tenant_id == tenant_id,
    )
    budget_result = await db.execute(budget_stmt)
    budget = budget_result.scalar_one_or_none()

    if budget is None:
        return None, None, []

    # Fetch line items with categories
    lines_stmt = (
        select(
            BudgetCategory.name.label("category_name"),
            BudgetCategory.color.label("category_color"),
            func.coalesce(func.sum(BudgetLineItem.planned_amount), Decimal("0")).label("planned"),
            func.coalesce(func.sum(BudgetLineItem.actual_amount), Decimal("0")).label("actual"),
        )
        .join(BudgetCategory, BudgetLineItem.category_id == BudgetCategory.id)
        .where(
            BudgetLineItem.budget_id == budget.id,
            BudgetLineItem.tenant_id == tenant_id,
        )
        .group_by(BudgetCategory.id, BudgetCategory.name, BudgetCategory.color)
        .order_by(BudgetCategory.name)
    )
    lines_result = await db.execute(lines_stmt)

    variance_lines = []
    for row in lines_result.all():
        planned = Decimal(str(row.planned))
        actual = Decimal(str(row.actual))
        variance = planned - actual
        variance_pct = float(variance / planned * 100) if planned != Decimal("0") else 0.0
        variance_lines.append(
            VarianceLine(
                category_name=row.category_name,
                category_color=row.category_color,
                planned=planned.quantize(Decimal("0.01")),
                actual=actual.quantize(Decimal("0.01")),
                variance=variance.quantize(Decimal("0.01")),
                variance_percent=round(variance_pct, 1),
            )
        )

    return budget.id, budget.name, variance_lines


async def _get_speaker_expenses_total(db: AsyncSession, conference_id: UUID, tenant_id: UUID) -> Decimal:
    """Sum approved/paid speaker expenses (converted to conference currency).

    Falls back to original_amount when converted_amount is NULL (no exchange rate entered).
    """
    stmt = select(
        func.coalesce(
            func.sum(func.coalesce(SpeakerExpense.converted_amount, SpeakerExpense.original_amount)),
            Decimal("0"),
        )
    ).where(
        SpeakerExpense.conference_id == conference_id,
        SpeakerExpense.tenant_id == tenant_id,
        SpeakerExpense.status.in_(["approved", "paid"]),
    )
    result = await db.execute(stmt)
    return Decimal(str(result.scalar() or 0))


# ---------------------------------------------------------------------------
# CSV export
# ---------------------------------------------------------------------------


@router.get(
    "/revenue/export/csv",
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def export_revenue_csv(
    conference_id: UUID,
    db: DbSessionDep,
    current_user: CurrentUserDep,
) -> StreamingResponse:
    """Export revenue by booking option x period as CSV."""
    await check_conference_admin(conference_id, current_user, db)
    revenue = await _get_revenue_data(db, conference_id, current_user.tenant_id)

    headers = [
        "Booking Option",
        "Category",
        "Period",
        "Period Start",
        "Period End",
        "Attendee Count",
        "Subtotal",
        "Tax",
        "Total",
        "Currency",
    ]

    # Flatten: one row per (option, period) pair
    flat_rows: list[list[str]] = []
    for item in revenue.by_booking_option:
        for period in item.periods:
            flat_rows.append(
                [
                    item.booking_option_name,
                    item.category,
                    period.period_name,
                    str(period.period_start) if period.period_start else "",
                    str(period.period_end) if period.period_end else "",
                    str(period.attendee_count),
                    str(period.subtotal_revenue),
                    str(period.tax_amount),
                    str(period.total_revenue),
                    item.currency,
                ]
            )

    return csv_response(
        headers=headers,
        rows=flat_rows,
        row_mapper=lambda r: r,
        filename=f"revenue_{conference_id}.csv",
    )


# ---------------------------------------------------------------------------
# XLSX export
# ---------------------------------------------------------------------------


@router.get(
    "/revenue/export/xlsx",
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def export_revenue_xlsx(
    conference_id: UUID,
    db: DbSessionDep,
    current_user: CurrentUserDep,
) -> StreamingResponse:
    """Export revenue data as Excel (.xlsx)."""
    await check_conference_admin(conference_id, current_user, db)
    revenue = await _get_revenue_data(db, conference_id, current_user.tenant_id)

    from app.core.analytics_excel import build_revenue_workbook

    xlsx_bytes = await asyncio.to_thread(build_revenue_workbook, revenue)
    filename = f"revenue_{conference_id}.xlsx"
    return StreamingResponse(
        io.BytesIO(xlsx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": safe_content_disposition(filename)},
    )


# ---------------------------------------------------------------------------
# Financial report PDF export
# ---------------------------------------------------------------------------


@router.get(
    "/financial-report/export/pdf",
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def export_financial_report_pdf(
    conference_id: UUID,
    db: DbSessionDep,
    current_user: CurrentUserDep,
) -> StreamingResponse:
    """Export financial report as PDF."""
    await check_conference_admin(conference_id, current_user, db)
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    revenue_task = _get_revenue_data(db, conference_id, current_user.tenant_id)
    budget_task = _get_budget_data(db, conference_id, current_user.tenant_id)
    speaker_task = _get_speaker_expenses_total(db, conference_id, current_user.tenant_id)

    revenue, (budget_id, budget_name, variance_lines), speaker_expenses = await asyncio.gather(
        revenue_task, budget_task, speaker_task
    )

    total_costs = speaker_expenses
    for line in variance_lines:
        total_costs += line.actual if line.actual > Decimal("0") else line.planned

    report = FinancialReportResponse(
        pl_summary=PLSummary(
            total_revenue=revenue.total_revenue,
            outstanding_revenue=revenue.outstanding_revenue,
            total_costs=total_costs.quantize(Decimal("0.01")),
            net_result=(revenue.total_revenue - total_costs).quantize(Decimal("0.01")),
            currency=revenue.currency,
            as_of_date=date.today(),
        ),
        variance_by_category=variance_lines,
        cost_per_attendee=CostPerAttendee(
            total_paid_attendees=revenue.active_registrations,
            total_costs=total_costs.quantize(Decimal("0.01")),
            cost_per_attendee=(
                (total_costs / revenue.active_registrations).quantize(Decimal("0.01"))
                if revenue.active_registrations > 0
                else Decimal("0")
            ),
            revenue_per_attendee=(
                (revenue.total_revenue / revenue.active_registrations).quantize(Decimal("0.01"))
                if revenue.active_registrations > 0
                else Decimal("0")
            ),
            currency=revenue.currency,
        ),
        revenue=revenue,
        budget_id=budget_id,
        budget_name=budget_name,
        generated_at=datetime.now(UTC),
    )

    from app.core.analytics_pdf import build_financial_report_pdf

    pdf_bytes = await asyncio.to_thread(build_financial_report_pdf, conference.name, report)
    filename = f"financial_report_{conference_id}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": safe_content_disposition(filename)},
    )
