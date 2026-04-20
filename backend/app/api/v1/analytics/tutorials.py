"""Tutorial statistics endpoint."""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import func, select, text

from app.constants import ModuleCode
from app.core.conference_helpers import check_conference_admin
from app.core.dependencies import CurrentUserDep, DbSessionDep, require_module
from app.models.booking import BookingOption
from app.models.registration import Registration, RegistrationItem, RegistrationStatus
from app.schemas.analytics import TutorialsResponse, TutorialStats

MODULE_CODE = ModuleCode.ANALYTICS

router = APIRouter()


@router.get(
    "/stats/tutorials",
    response_model=TutorialsResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def get_tutorials_stats(
    conference_id: UUID,
    db: DbSessionDep,
    current_user: CurrentUserDep,
) -> TutorialsResponse:
    """Attendee count and revenue per tutorial session.

    Tutorials are identified from registration data (not heuristics):
      1. Registration.main_session_id — main booking option is a tutorial
      2. RegistrationItem.item_type = 'tutorial' — add-on tutorial item
    Revenue comes from matching invoice line items by description.
    """
    await check_conference_admin(conference_id, current_user, db)

    from app.models.cfp_applicants import CFPApplicant
    from app.models.cfp_papers import CFPPaper
    from app.models.program import ProgramSession

    tenant_id = current_user.tenant_id

    # Source 1: Main booking option tutorials (Registration.main_session_id)
    main_stmt = (
        select(
            BookingOption.name.label("option_name"),
            ProgramSession.title.label("session_title"),
            func.count(Registration.id).label("cnt"),
        )
        .join(BookingOption, BookingOption.id == Registration.booking_option_id)
        .join(ProgramSession, ProgramSession.id == Registration.main_session_id)
        .where(
            Registration.conference_id == conference_id,
            Registration.tenant_id == tenant_id,
            Registration.main_session_id.is_not(None),
            Registration.status != RegistrationStatus.CANCELLED,
        )
        .group_by(BookingOption.name, ProgramSession.title)
    )

    # Source 2: Add-on tutorial items (RegistrationItem.item_type = 'tutorial')
    addon_stmt = (
        select(
            RegistrationItem.item_name.label("session_title"),
            func.count(RegistrationItem.id).label("cnt"),
        )
        .join(Registration, Registration.id == RegistrationItem.registration_id)
        .where(
            RegistrationItem.item_type == "tutorial",
            Registration.conference_id == conference_id,
            Registration.tenant_id == tenant_id,
            Registration.status != RegistrationStatus.CANCELLED,
        )
        .group_by(RegistrationItem.item_name)
    )

    main_result = await db.execute(main_stmt)
    addon_result = await db.execute(addon_stmt)

    # Merge: key by session_title, sum attendee counts
    tut_counts: dict[str, int] = {}
    tut_option: dict[str, str | None] = {}
    for main_row in main_result.all():
        key = main_row.session_title or "Unknown"
        tut_counts[key] = tut_counts.get(key, 0) + int(main_row.cnt)
        if key not in tut_option:
            tut_option[key] = main_row.option_name

    for addon_row in addon_result.all():
        key = addon_row.session_title or "Unknown"
        tut_counts[key] = tut_counts.get(key, 0) + int(addon_row.cnt)
        if key not in tut_option:
            tut_option[key] = None

    if not tut_counts:
        return TutorialsResponse(tutorials=[], has_tutorials=False, total_revenue=0.0)

    # Get revenue from invoice line items grouped by description
    revenue_stmt = text("""
        SELECT
            li->>'description' AS description,
            COALESCE(SUM((li->>'total')::numeric), 0) AS revenue
        FROM invoices i
        CROSS JOIN jsonb_array_elements(
            CASE WHEN jsonb_typeof(i.line_items) = 'array' THEN i.line_items ELSE jsonb_build_array() END
        ) AS li
        WHERE i.conference_id = :conference_id
          AND i.tenant_id = :tenant_id
          AND i.is_active = true
          AND i.status IN ('paid', 'overdue', 'sent')
          AND i.recipient_source_type IN ('registration', 'billing_profile')
          AND i.template_type != 'credit_note'
        GROUP BY li->>'description'
    """)
    revenue_result = await db.execute(
        revenue_stmt,
        {"conference_id": str(conference_id), "tenant_id": str(tenant_id)},
    )
    desc_revenue: dict[str, float] = {}
    for rev_row in revenue_result.mappings().all():
        desc_revenue[rev_row["description"]] = float(rev_row["revenue"])

    # Get speaker names: ProgramSession.title -> main speaker name
    speaker_stmt = (
        select(
            ProgramSession.title.label("session_title"),
            (CFPApplicant.first_name + " " + CFPApplicant.last_name).label("speaker_name"),
        )
        .join(CFPPaper, CFPPaper.id == ProgramSession.paper_id)
        .join(CFPApplicant, CFPApplicant.id == CFPPaper.main_speaker_id)
        .where(
            ProgramSession.conference_id == conference_id,
            ProgramSession.tenant_id == tenant_id,
            ProgramSession.title.in_(list(tut_counts.keys())),
        )
    )
    speaker_result = await db.execute(speaker_stmt)
    speaker_map: dict[str, str] = {}
    for sp_row in speaker_result.all():
        if sp_row.session_title:
            speaker_map[sp_row.session_title] = sp_row.speaker_name

    # Match tutorials to invoice revenue by description
    tutorials: list[TutorialStats] = []
    total_revenue = 0.0

    for session_title, count in sorted(tut_counts.items(), key=lambda x: -x[1]):
        option_name = tut_option.get(session_title)

        revenue = 0.0
        if option_name:
            full_desc = f"{option_name} - {session_title}"
            revenue = desc_revenue.get(full_desc, 0.0)
        if revenue == 0.0:
            revenue = desc_revenue.get(session_title, 0.0)

        total_revenue += revenue
        tutorials.append(
            TutorialStats(
                tutorial_name=session_title,
                session_title=option_name,
                speaker_name=speaker_map.get(session_title),
                attendee_count=count,
                revenue=revenue,
            )
        )

    return TutorialsResponse(tutorials=tutorials, has_tutorials=True, total_revenue=total_revenue)
