"""Admin endpoints for viewing registration question answers."""

import csv
import io
from uuid import UUID

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select

from app.core.conference_helpers import get_conference_for_tenant
from app.core.dependencies import CurrentUserDep, DbSessionDep
from app.models.cfp_applicants import CFPApplicant
from app.models.registration_question_answer import RegistrationQuestionAnswer
from app.schemas.registration_questions import (
    AnswersListResponse,
    AnswerStatsResponse,
    ApplicantAnswersResponse,
    OptionStat,
    QuestionAnswerResponse,
    QuestionStat,
)

router = APIRouter()


@router.get(
    "/conferences/{conference_id}/registration-question-answers",
    response_model=AnswersListResponse,
)
async def list_registration_question_answers(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    search: str | None = None,
) -> AnswersListResponse:
    """List all registration question answers for a conference, grouped by applicant.

    Admin-only. Returns applicant info alongside their answers.
    """
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    # Build question lookup from settings
    rq = (conference.settings or {}).get("registration_questions", {})
    questions_list = rq if isinstance(rq, list) else rq.get("questions", [])
    question_map: dict[str, str] = {}
    for q in questions_list:
        question_map[q["id"]] = q.get("text", "Unknown question")

    # Count distinct applicants with answers
    count_query = select(func.count(func.distinct(RegistrationQuestionAnswer.applicant_id))).where(
        RegistrationQuestionAnswer.conference_id == conference_id,
        RegistrationQuestionAnswer.tenant_id == current_user.tenant_id,
    )

    # Apply search filter if provided
    applicant_filter = None
    if search:
        search_term = f"%{search.lower()}%"
        applicant_filter = select(CFPApplicant.id).where(
            CFPApplicant.tenant_id == current_user.tenant_id,
            (
                func.lower(CFPApplicant.email).like(search_term)
                | func.lower(CFPApplicant.first_name).like(search_term)
                | func.lower(CFPApplicant.last_name).like(search_term)
            ),
        )
        count_query = count_query.where(RegistrationQuestionAnswer.applicant_id.in_(applicant_filter))

    total = (await db.execute(count_query)).scalar() or 0

    # Get paginated list of applicant IDs
    applicant_ids_query = (
        select(RegistrationQuestionAnswer.applicant_id)
        .where(
            RegistrationQuestionAnswer.conference_id == conference_id,
            RegistrationQuestionAnswer.tenant_id == current_user.tenant_id,
        )
        .group_by(RegistrationQuestionAnswer.applicant_id)
        .order_by(func.max(RegistrationQuestionAnswer.answered_at).desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )

    if applicant_filter is not None:
        applicant_ids_query = applicant_ids_query.where(RegistrationQuestionAnswer.applicant_id.in_(applicant_filter))

    applicant_ids_result = await db.execute(applicant_ids_query)
    applicant_ids = [row[0] for row in applicant_ids_result.all()]

    if not applicant_ids:
        return AnswersListResponse(items=[], total=total)

    # Load applicant details
    applicant_result = await db.execute(select(CFPApplicant).where(CFPApplicant.id.in_(applicant_ids)))
    applicants = {a.id: a for a in applicant_result.scalars().all()}

    # Load all answers for these applicants
    answers_result = await db.execute(
        select(RegistrationQuestionAnswer)
        .where(
            RegistrationQuestionAnswer.conference_id == conference_id,
            RegistrationQuestionAnswer.applicant_id.in_(applicant_ids),
        )
        .order_by(RegistrationQuestionAnswer.answered_at)
    )
    all_answers = answers_result.scalars().all()

    # Group answers by applicant
    answers_by_applicant: dict[UUID, list[RegistrationQuestionAnswer]] = {}
    for a in all_answers:
        answers_by_applicant.setdefault(a.applicant_id, []).append(a)

    items: list[ApplicantAnswersResponse] = []
    for aid in applicant_ids:
        applicant = applicants.get(aid)
        if not applicant:
            continue
        answers = answers_by_applicant.get(aid, [])
        items.append(
            ApplicantAnswersResponse(
                applicant_id=aid,
                applicant_name=f"{applicant.first_name} {applicant.last_name}".strip(),
                applicant_email=applicant.email,
                answers=[
                    QuestionAnswerResponse(
                        id=a.id,
                        question_id=a.question_id,
                        question_text=question_map.get(a.question_id),
                        answer_value=a.answer_value,
                        answered_at=a.answered_at,
                    )
                    for a in answers
                ],
                completed_at=max((a.answered_at for a in answers), default=None),
            )
        )

    return AnswersListResponse(items=items, total=total)


@router.get(
    "/conferences/{conference_id}/registration-question-answers/stats",
    response_model=AnswerStatsResponse,
)
async def get_registration_question_answer_stats(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> AnswerStatsResponse:
    """Get per-question statistics for registration question answers."""
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    # Get question definitions
    rq = (conference.settings or {}).get("registration_questions", {})
    questions = rq if isinstance(rq, list) else rq.get("questions", [])

    # Load ALL answers for this conference
    answers_result = await db.execute(
        select(RegistrationQuestionAnswer).where(
            RegistrationQuestionAnswer.conference_id == conference_id,
            RegistrationQuestionAnswer.tenant_id == current_user.tenant_id,
        )
    )
    all_answers = answers_result.scalars().all()

    # Count distinct respondents
    respondent_ids = {a.applicant_id for a in all_answers}
    total_respondents = len(respondent_ids)

    # Group answers by question
    answers_by_question: dict[str, list[RegistrationQuestionAnswer]] = {}
    for a in all_answers:
        answers_by_question.setdefault(a.question_id, []).append(a)

    # Load applicant info for text answers
    if respondent_ids:
        applicant_result = await db.execute(select(CFPApplicant).where(CFPApplicant.id.in_(respondent_ids)))
        applicants = {a.id: a for a in applicant_result.scalars().all()}
    else:
        applicants = {}

    # Build stats per question
    question_stats: list[QuestionStat] = []
    for q in questions:
        qid = q["id"]
        qtype = q["type"]
        q_answers = answers_by_question.get(qid, [])
        total_responses = len(q_answers)

        option_stats: list[OptionStat] = []
        text_answers: list[dict] | None = None

        if qtype in ("radio", "dropdown"):
            # Count each option
            option_counts: dict[str, int] = {}
            for opt in q.get("options", []):
                option_counts[opt] = 0
            for a in q_answers:
                option_counts[a.answer_value] = option_counts.get(a.answer_value, 0) + 1
            for label, count in option_counts.items():
                pct = (count / total_responses * 100) if total_responses > 0 else 0.0
                option_stats.append(OptionStat(label=label, count=count, percentage=round(pct, 1)))
        elif qtype == "checkbox":
            true_count = sum(1 for a in q_answers if a.answer_value.lower() == "true")
            false_count = total_responses - true_count
            if total_responses > 0:
                option_stats.append(
                    OptionStat(label="Yes", count=true_count, percentage=round(true_count / total_responses * 100, 1))
                )
                option_stats.append(
                    OptionStat(label="No", count=false_count, percentage=round(false_count / total_responses * 100, 1))
                )
        elif qtype == "text":
            text_answers = []
            for a in q_answers:
                applicant = applicants.get(a.applicant_id)
                text_answers.append(
                    {
                        "applicant_name": f"{applicant.first_name} {applicant.last_name}".strip()
                        if applicant
                        else "Unknown",
                        "applicant_email": applicant.email if applicant else "unknown",
                        "answer_value": a.answer_value,
                    }
                )

        question_stats.append(
            QuestionStat(
                question_id=qid,
                question_text=q.get("text", ""),
                question_type=qtype,
                total_responses=total_responses,
                option_stats=option_stats,
                text_answers=text_answers,
            )
        )

    return AnswerStatsResponse(questions=question_stats, total_respondents=total_respondents)


@router.get(
    "/conferences/{conference_id}/registration-question-answers/export",
)
async def export_registration_question_answers(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> StreamingResponse:
    """Export registration question answers as CSV."""
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    # Get question definitions
    rq = (conference.settings or {}).get("registration_questions", {})
    questions = rq if isinstance(rq, list) else rq.get("questions", [])

    # Load ALL answers
    answers_result = await db.execute(
        select(RegistrationQuestionAnswer).where(
            RegistrationQuestionAnswer.conference_id == conference_id,
            RegistrationQuestionAnswer.tenant_id == current_user.tenant_id,
        )
    )
    all_answers = answers_result.scalars().all()

    # Group by applicant
    answers_by_applicant: dict[UUID, list[RegistrationQuestionAnswer]] = {}
    for a in all_answers:
        answers_by_applicant.setdefault(a.applicant_id, []).append(a)

    # Load applicant info
    applicant_ids = list(answers_by_applicant.keys())
    if applicant_ids:
        applicant_result = await db.execute(select(CFPApplicant).where(CFPApplicant.id.in_(applicant_ids)))
        applicants = {a.id: a for a in applicant_result.scalars().all()}
    else:
        applicants = {}

    # Build CSV
    output = io.StringIO()
    # BOM for Excel compatibility
    output.write("\ufeff")

    headers = ["Applicant Name", "Applicant Email", "Completed At"]
    for q in questions:
        headers.append(q.get("text", q["id"]))

    writer = csv.writer(output)
    writer.writerow(headers)

    for applicant_id, answers in answers_by_applicant.items():
        applicant = applicants.get(applicant_id)
        if not applicant:
            continue
        answer_map = {a.question_id: a for a in answers}
        completed_at = max((a.answered_at for a in answers), default=None)

        row = [
            f"{applicant.first_name} {applicant.last_name}".strip(),
            applicant.email,
            completed_at.isoformat() if completed_at else "",
        ]
        for q in questions:
            a = answer_map.get(q["id"])
            row.append(a.answer_value if a else "")
        writer.writerow(row)

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=registration-answers-{conference_id}.csv"},
    )
