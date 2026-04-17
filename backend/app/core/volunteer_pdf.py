"""PDF rendering for volunteer schedules.

Pure rendering — no DB access. The service layer assembles
:class:`VolunteerScheduleEntry` lists and hands them to
:func:`generate_schedule_pdf` here.
"""

from __future__ import annotations

from app.schemas.volunteer_tasks import VolunteerScheduleEntry


def _sanitize(text: str) -> str:
    """Replace Unicode characters unsupported by fpdf2 built-in fonts."""
    replacements = {
        "\u2013": "-",
        "\u2014": "--",
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u2026": "...",
        "\u2022": "*",
        "\u00a0": " ",
    }
    for char, replacement in replacements.items():
        text = text.replace(char, replacement)
    return text


def generate_schedule_pdf(
    volunteer_name: str,
    volunteer_color: str | None,
    entries: list[VolunteerScheduleEntry],
    conference_name: str,
) -> bytes:
    """Generate a PDF schedule for a single volunteer."""
    from fpdf import FPDF

    pdf = FPDF()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=20)

    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, _sanitize(conference_name), new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("Helvetica", "B", 14)
    header_text = f"Volunteer Schedule: {volunteer_name}"

    if volunteer_color:
        try:
            r = int(volunteer_color[1:3], 16)
            g = int(volunteer_color[3:5], 16)
            b = int(volunteer_color[5:7], 16)
            pdf.set_fill_color(r, g, b)
            pdf.cell(8, 8, "", fill=True)
            pdf.cell(4, 8, "")
        except (ValueError, IndexError):
            pass

    pdf.cell(0, 8, _sanitize(header_text), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    if not entries:
        pdf.set_font("Helvetica", "", 12)
        pdf.cell(0, 8, "No assignments yet.", new_x="LMARGIN", new_y="NEXT")
        return bytes(pdf.output())

    day_groups: dict[str, list[VolunteerScheduleEntry]] = {}
    for entry in entries:
        key = f"{entry.day_name} ({entry.day_date})" if entry.day_date else entry.day_name
        day_groups.setdefault(key, []).append(entry)

    col_widths = [30, 50, 50, 50]  # Time, Session, Track, Task

    for day_label, day_entries in day_groups.items():
        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 8, _sanitize(day_label), new_x="LMARGIN", new_y="NEXT")

        pdf.set_font("Helvetica", "B", 9)
        pdf.set_fill_color(240, 240, 240)
        pdf.cell(col_widths[0], 7, "Time", border=1, fill=True)
        pdf.cell(col_widths[1], 7, "Session", border=1, fill=True)
        pdf.cell(col_widths[2], 7, "Track", border=1, fill=True)
        pdf.cell(col_widths[3], 7, "Task", border=1, fill=True, new_x="LMARGIN", new_y="NEXT")

        pdf.set_font("Helvetica", "", 9)
        for entry in day_entries:
            time_str = f"{entry.start_time}-{entry.end_time}" if entry.end_time else entry.start_time
            pdf.cell(col_widths[0], 7, _sanitize(time_str), border=1)
            pdf.cell(col_widths[1], 7, _sanitize(entry.session_title[:30]), border=1)
            pdf.cell(col_widths[2], 7, _sanitize((entry.track_name or "-")[:30]), border=1)
            pdf.cell(
                col_widths[3],
                7,
                _sanitize(entry.task_name[:30]),
                border=1,
                new_x="LMARGIN",
                new_y="NEXT",
            )

        pdf.ln(4)

    return bytes(pdf.output())
