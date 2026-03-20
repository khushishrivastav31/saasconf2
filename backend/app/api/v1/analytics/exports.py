"""CSV, XLSX, and PDF export endpoints for analytics."""

import asyncio
import io
from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.constants import ModuleCode
from app.core.conference_helpers import check_conference_admin, get_conference_for_tenant
from app.core.csv_export import csv_response
from app.core.dependencies import CurrentUserDep, DbSessionDep, require_module
from app.core.file_validation import safe_content_disposition
from app.schemas.analytics import (
    CostPerAttendee,
    FinancialReportResponse,
    PLSummary,
)

from .revenue import _get_budget_data, _get_revenue_data, _get_speaker_expenses_total

MODULE_CODE = ModuleCode.ANALYTICS

router = APIRouter()


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
