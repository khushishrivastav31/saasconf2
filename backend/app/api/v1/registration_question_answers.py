"""Admin endpoints for viewing registration question answers."""

from uuid import UUID

from fastapi import APIRouter, Query
from sqlalchemy import func, select

from app.core.conference_helpers import get_conference_for_tenant
from app.core.dependencies import CurrentUserDep, DbSessionDep
from app.models.cfp_applicants import CFPApplicant
from app.models.registration_question_answer import RegistrationQuestionAnswer
from app.schemas.registration_questions import (
    AnswersListResponse,
    ApplicantAnswersResponse,
    QuestionAnswerResponse,
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
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    search: str | None = None,
) -> AnswersListResponse:
    """List all registration question answers for a conference, grouped by applicant.

    Admin-only. Returns applicant info alongside their answers.
    """
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    # Build question lookup from settings
    rq = (conference.settings or {}).get("registration_questions", {})
    question_map: dict[str, str] = {}
    for q in rq.get("questions", []):
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
        .offset(skip)
        .limit(limit)
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
