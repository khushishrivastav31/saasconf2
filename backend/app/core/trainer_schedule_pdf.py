"""Generate per-trainer schedule PDFs using WeasyPrint."""

from __future__ import annotations

import asyncio
import datetime
from html import escape
from typing import Any

MONTH_NAMES = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
]


def _is_weekend(d: datetime.date) -> bool:
    return d.weekday() >= 5


def _format_date_de(iso_date: str) -> str:
    parts = iso_date.split("-")
    if len(parts) == 3:
        return f"{parts[2]}.{parts[1]}.{parts[0]}"
    return iso_date


def _compute_end_date(start_date: str, duration: int) -> datetime.date:
    d = datetime.date.fromisoformat(start_date)
    return d + datetime.timedelta(days=max(duration, 1) - 1)


def _check_warnings(
    start_date: str,
    duration: int,
    holiday_dates_set: set[str],
    all_placements: list[dict[str, Any]],
    current_placement_id: str,
) -> list[str]:
    """Check for weekend, holiday, and parallel training warnings."""
    warnings: list[str] = []
    start = datetime.date.fromisoformat(start_date)
    end = _compute_end_date(start_date, duration)

    # Check weekends
    d = start
    while d <= end:
        if _is_weekend(d):
            warnings.append("Spans weekend")
            break
        d += datetime.timedelta(days=1)

    # Check holidays
    d = start
    while d <= end:
        if d.isoformat() in holiday_dates_set:
            warnings.append("Spans holiday/blocked day")
            break
        d += datetime.timedelta(days=1)

    # Check parallel trainings
    for other in all_placements:
        if other.get("placement_id") == current_placement_id:
            continue
        other_start = datetime.date.fromisoformat(other["start_date"])
        other_end = _compute_end_date(other["start_date"], other.get("duration", 1))
        if start <= other_end and end >= other_start:
            other_name = other.get("training_slug") or other.get("training_name", "?")
            warnings.append(f"Parallel with {other_name}")

    return warnings


def _build_html(
    trainer_name: str,
    year: int,
    placements: list[dict[str, Any]],
    holiday_dates_set: set[str],
) -> str:
    """Build the HTML for the trainer schedule PDF."""
    today = datetime.date.today().strftime("%d.%m.%Y")

    # Sort by start_date
    sorted_placements = sorted(placements, key=lambda p: p.get("start_date", ""))

    rows = ""
    for p in sorted_placements:
        start_date = p.get("start_date", "")
        duration = p.get("duration", 1)
        end_date = _compute_end_date(start_date, duration)
        name = escape(p.get("training_name", ""))
        slug = escape(p.get("training_slug") or p.get("training_abbreviation") or "")
        loc = escape(p.get("location_name") or "—")
        loc_code = escape(p.get("location_code") or "")
        location_display = f"{loc_code} ({loc})" if loc_code and loc != "—" else loc

        warnings = _check_warnings(start_date, duration, holiday_dates_set, placements, p.get("placement_id", ""))
        warning_html = ""
        if warnings:
            warning_items = "".join(f"<li>{escape(w)}</li>" for w in warnings)
            warning_html = f'<ul class="warnings">{warning_items}</ul>'

        start_month = datetime.date.fromisoformat(start_date).month
        month_name = MONTH_NAMES[start_month - 1]

        rows += f"""
        <tr>
            <td>{escape(month_name)}</td>
            <td><strong>{escape(slug or name)}</strong><br><span class="sub">{name}</span></td>
            <td>{_format_date_de(start_date)} — {_format_date_de(end_date.isoformat())}</td>
            <td>{duration}d</td>
            <td>{location_display}</td>
            <td>{warning_html}</td>
        </tr>"""

    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
    @page {{
        size: A4 landscape;
        margin: 15mm;
    }}
    body {{
        font-family: Arial, Helvetica, sans-serif;
        font-size: 11px;
        color: #333;
        line-height: 1.4;
    }}
    h1 {{
        font-size: 18px;
        color: #1a1a1a;
        margin-bottom: 4px;
    }}
    .subtitle {{
        font-size: 12px;
        color: #666;
        margin-bottom: 16px;
    }}
    table {{
        width: 100%;
        border-collapse: collapse;
        margin-top: 8px;
    }}
    th {{
        background-color: #f3f4f6;
        font-weight: 600;
        text-align: left;
        padding: 6px 8px;
        border-bottom: 2px solid #d1d5db;
        font-size: 10px;
        text-transform: uppercase;
        color: #4b5563;
    }}
    td {{
        padding: 6px 8px;
        border-bottom: 1px solid #e5e7eb;
        vertical-align: top;
    }}
    tr:nth-child(even) {{
        background-color: #f9fafb;
    }}
    .sub {{
        font-size: 9px;
        color: #6b7280;
    }}
    .warnings {{
        margin: 2px 0 0 0;
        padding-left: 14px;
        font-size: 9px;
    }}
    .warnings li {{
        color: #d97706;
        margin-bottom: 1px;
    }}
    .footer {{
        margin-top: 16px;
        font-size: 9px;
        color: #9ca3af;
        text-align: right;
    }}
    .count {{
        font-size: 11px;
        color: #6b7280;
        margin-bottom: 8px;
    }}
</style>
</head>
<body>
    <h1>Training Schedule {year}</h1>
    <div class="subtitle">{escape(trainer_name)}</div>
    <div class="count">{len(sorted_placements)} training{"s" if len(sorted_placements) != 1 else ""}</div>
    <table>
        <thead>
            <tr>
                <th>Month</th>
                <th>Training</th>
                <th>Dates</th>
                <th>Duration</th>
                <th>Location</th>
                <th>Notes</th>
            </tr>
        </thead>
        <tbody>
            {rows if rows else '<tr><td colspan="6" style="text-align:center;color:#9ca3af;">No trainings assigned</td></tr>'}
        </tbody>
    </table>
    <div class="footer">Generated on {today}</div>
</body>
</html>"""


def _render_pdf(html: str) -> bytes:
    """Render HTML to PDF bytes via WeasyPrint (blocking)."""
    from weasyprint import HTML

    return HTML(string=html).write_pdf()


async def generate_trainer_schedule_pdf(
    trainer_name: str,
    year: int,
    placements: list[dict[str, Any]],
    holiday_date_strings: set[str],
) -> bytes:
    """Generate a PDF schedule for a single trainer.

    Args:
        trainer_name: Full name of the trainer.
        year: The program year.
        placements: Snapshot entries filtered to this trainer's assignments.
        holiday_date_strings: Set of ISO date strings that are holidays/blocked.

    Returns:
        PDF bytes.
    """
    html = _build_html(trainer_name, year, placements, holiday_date_strings)
    return await asyncio.to_thread(_render_pdf, html)
