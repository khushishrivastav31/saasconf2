"""WeasyPrint PDF builder for financial reports.

Called via asyncio.to_thread() to avoid blocking the event loop.
"""

from decimal import Decimal

from app.schemas.analytics import FinancialReportResponse


def build_financial_report_pdf(conference_name: str, report: FinancialReportResponse) -> bytes:
    """Build a financial report PDF. Returns raw bytes."""
    from weasyprint import HTML

    html = _render_html(conference_name, report)
    return HTML(string=html).write_pdf()


def _fmt(value: Decimal, currency: str) -> str:
    return f"{currency} {value:,.2f}"


def _pct(value: float) -> str:
    sign = "+" if value >= 0 else ""
    return f"{sign}{value:.1f}%"


def _render_html(conference_name: str, report: FinancialReportResponse) -> str:
    pl = report.pl_summary
    cpa = report.cost_per_attendee
    currency = pl.currency

    net_color = "#16a34a" if pl.net_result >= Decimal("0") else "#dc2626"

    # ── Variance rows ───────────────────────────────────────────────────────
    variance_rows = ""
    for line in report.variance_by_category:
        color_dot = (
            f'<span style="display:inline-block;width:10px;height:10px;'
            f"border-radius:50%;background:{line.category_color or '#6b7280'};"
            f'margin-right:6px;"></span>'
            if line.category_color
            else ""
        )
        var_color = "#16a34a" if line.variance >= Decimal("0") else "#dc2626"
        variance_rows += f"""
        <tr>
          <td>{color_dot}{line.category_name}</td>
          <td style="text-align:right">{_fmt(line.planned, currency)}</td>
          <td style="text-align:right">{_fmt(line.actual, currency)}</td>
          <td style="text-align:right;color:{var_color}">{_fmt(line.variance, currency)}</td>
          <td style="text-align:right;color:{var_color}">{_pct(line.variance_percent)}</td>
        </tr>"""

    # ── Revenue rows (option header + period sub-rows) ───────────────────────
    revenue_rows = ""
    for item in report.revenue.by_booking_option:
        revenue_rows += f"""
        <tr style="background:#dbeafe;font-weight:bold">
          <td>{item.booking_option_name}</td>
          <td>{item.category}</td>
          <td>All Periods</td>
          <td style="text-align:right">{item.attendee_count}</td>
          <td style="text-align:right">{_fmt(item.subtotal_revenue, currency)}</td>
          <td style="text-align:right">{_fmt(item.tax_amount, currency)}</td>
          <td style="text-align:right">{_fmt(item.total_revenue, currency)}</td>
        </tr>"""
        for period in item.periods:
            date_range = ""
            if period.period_start and period.period_end:
                date_range = f" ({period.period_start} – {period.period_end})"
            revenue_rows += f"""
        <tr style="background:#f9fafb">
          <td style="padding-left:20px;color:#6b7280;font-size:11px">&nbsp;</td>
          <td style="color:#6b7280;font-size:11px"></td>
          <td style="color:#6b7280;font-size:11px">{period.period_name}{date_range}</td>
          <td style="text-align:right;font-size:11px">{period.attendee_count}</td>
          <td style="text-align:right;font-size:11px">{_fmt(period.subtotal_revenue, currency)}</td>
          <td style="text-align:right;font-size:11px">{_fmt(period.tax_amount, currency)}</td>
          <td style="text-align:right;font-size:11px">{_fmt(period.total_revenue, currency)}</td>
        </tr>"""

    budget_section = ""
    if report.budget_name:
        budget_section = f"<p style='color:#6b7280;font-size:12px'>Budget: {report.budget_name}</p>"

    multi_currency_warning = ""
    if report.revenue.multiple_currencies:
        multi_currency_warning = (
            "<div style='background:#fef9c3;border:1px solid #fde047;padding:8px 12px;"
            "border-radius:6px;margin-bottom:16px;font-size:12px;color:#713f12'>"
            f"Revenue shown in {currency}. Multi-currency invoices may be excluded.</div>"
        )

    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page {{ size: A4; margin: 2cm; }}
  body {{ font-family: sans-serif; font-size: 13px; color: #111827; }}
  h1 {{ font-size: 22px; margin-bottom: 4px; }}
  h2 {{ font-size: 15px; margin: 24px 0 8px; border-bottom: 2px solid #e5e7eb; padding-bottom: 4px; }}
  table {{ width: 100%; border-collapse: collapse; margin-bottom: 16px; }}
  th {{ background: #1d4ed8; color: #fff; padding: 6px 10px; text-align: left; font-size: 12px; }}
  td {{ padding: 5px 10px; border-bottom: 1px solid #f3f4f6; font-size: 12px; }}
  tr:nth-child(even) td {{ background: #f9fafb; }}
  .kpi-grid {{ display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }}
  .kpi {{ flex: 1; min-width: 130px; padding: 12px 16px; border: 1px solid #e5e7eb;
          border-radius: 8px; background: #f9fafb; }}
  .kpi-label {{ font-size: 11px; color: #6b7280; margin-bottom: 4px; }}
  .kpi-value {{ font-size: 18px; font-weight: bold; }}
  .net-positive {{ color: #16a34a; }}
  .net-negative {{ color: #dc2626; }}
</style>
</head>
<body>
  <h1>Financial Report</h1>
  <p style="color:#6b7280;font-size:12px">{conference_name} &bull; Generated {
        report.generated_at.strftime("%Y-%m-%d %H:%M UTC")
    }</p>
  {budget_section}
  {multi_currency_warning}

  <h2>P&amp;L Summary</h2>
  <div class="kpi-grid">
    <div class="kpi">
      <div class="kpi-label">Total Revenue</div>
      <div class="kpi-value">{_fmt(pl.total_revenue, currency)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Outstanding</div>
      <div class="kpi-value">{_fmt(pl.outstanding_revenue, currency)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Total Costs</div>
      <div class="kpi-value">{_fmt(pl.total_costs, currency)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Net Result</div>
      <div class="kpi-value" style="color:{net_color}">{_fmt(pl.net_result, currency)}</div>
    </div>
  </div>

  <h2>Cost Per Attendee</h2>
  <table>
    <tr>
      <th>Metric</th><th style="text-align:right">Value</th>
    </tr>
    <tr><td>Paid Attendees</td><td style="text-align:right">{cpa.total_paid_attendees}</td></tr>
    <tr><td>Cost per Attendee</td><td style="text-align:right">{_fmt(cpa.cost_per_attendee, currency)}</td></tr>
    <tr><td>Revenue per Attendee</td><td style="text-align:right">{_fmt(cpa.revenue_per_attendee, currency)}</td></tr>
  </table>

  <h2>Budget Variance by Category</h2>
  {
        "<p style='color:#6b7280;font-size:12px'>No active budget found.</p>"
        if not report.variance_by_category
        else f'''
  <table>
    <tr>
      <th>Category</th><th style="text-align:right">Planned</th>
      <th style="text-align:right">Actual</th>
      <th style="text-align:right">Variance</th>
      <th style="text-align:right">%</th>
    </tr>
    {variance_rows}
  </table>'''
    }

  <h2>Revenue by Booking Option &amp; Period</h2>
  {
        "<p style='color:#6b7280;font-size:12px'>No paid invoices found.</p>"
        if not report.revenue.by_booking_option
        else f'''
  <table>
    <tr>
      <th>Booking Option</th><th>Category</th><th>Period</th>
      <th style="text-align:right">Attendees</th>
      <th style="text-align:right">Subtotal</th>
      <th style="text-align:right">Tax</th>
      <th style="text-align:right">Total</th>
    </tr>
    {revenue_rows}
    <tr>
      <td colspan="3"><strong>Total</strong></td>
      <td style="text-align:right"><strong>{report.revenue.total_registrations}</strong></td>
      <td style="text-align:right"></td>
      <td style="text-align:right"></td>
      <td style="text-align:right"><strong>{_fmt(report.revenue.total_revenue, currency)}</strong></td>
    </tr>
  </table>'''
    }
</body>
</html>"""
