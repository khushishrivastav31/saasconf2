"""Portal endpoints for registration questions — pending check and answer submission."""

from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import func, select

from app.core.applicant_dependencies import CurrentApplicantDep, DbSessionDep
from app.core.exceptions import NotFoundError, ValidationError
from app.models.conference import Conference
from app.models.registration import Registration, RegistrationStatus
from app.models.registration_question_answer import RegistrationQuestionAnswer
from app.schemas.registration_questions import (
    ConferencePendingQuestions,
    PendingQuestion,
    PendingSummaryResponse,
    SubmitAnswersRequest,
)

router = APIRouter()


def _get_active_questions(conference: Conference) -> list[dict]:
    """Extract active registration questions from conference settings."""
    rq = (conference.settings or {}).get("registration_questions", {})
    if not rq.get("enabled"):
        return []
    return [q for q in rq.get("questions", []) if q.get("is_active")]


@router.get(
    "/portal/registration-questions/pending",
    response_model=PendingSummaryResponse,
)
async def get_pending_questions_summary(
    current: CurrentApplicantDep,
    db: DbSessionDep,
) -> PendingSummaryResponse:
    """Check all conferences for pending mandatory registration questions.

    Returns conferences where the applicant has a registration and
    unanswered mandatory questions exist.
    """
    # Find conferences where this applicant is registered
    reg_result = await db.execute(
        select(Registration.conference_id)
        .where(
            Registration.tenant_id == current.tenant_id,
            func.lower(Registration.email) == current.applicant.email.lower(),
            Registration.status != RegistrationStatus.CANCELLED,
        )
        .distinct()
    )
    conference_ids = [row[0] for row in reg_result.all()]

    if not conference_ids:
        return PendingSummaryResponse()

    # Load those conferences
    conf_result = await db.execute(
        select(Conference).where(
            Conference.id.in_(conference_ids),
            Conference.tenant_id == current.tenant_id,
            Conference.is_active.is_(True),
        )
    )
    conferences = conf_result.scalars().all()

    # Load existing answers for this applicant across all conferences
    ans_result = await db.execute(
        select(
            RegistrationQuestionAnswer.conference_id,
            RegistrationQuestionAnswer.question_id,
        ).where(
            RegistrationQuestionAnswer.applicant_id == current.applicant_id,
            RegistrationQuestionAnswer.conference_id.in_(conference_ids),
        )
    )
    answered: dict[UUID, set[str]] = {}
    for conf_id, q_id in ans_result.all():
        answered.setdefault(conf_id, set()).add(q_id)

    pending_conferences: list[ConferencePendingQuestions] = []

    for conf in conferences:
        active_questions = _get_active_questions(conf)
        if not active_questions:
            continue

        answered_ids = answered.get(conf.id, set())
        pending_qs: list[PendingQuestion] = []

        for q in active_questions:
            if q["id"] not in answered_ids:
                pending_qs.append(
                    PendingQuestion(
                        id=q["id"],
                        text=q["text"],
                        type=q["type"],
                        required=q.get("required", False),
                        options=q.get("options", []),
                    )
                )

        if not pending_qs:
            continue

        has_mandatory = any(q.required for q in pending_qs)
        pending_conferences.append(
            ConferencePendingQuestions(
                conference_id=conf.id,
                conference_name=conf.name,
                questions=pending_qs,
                has_mandatory_pending=has_mandatory,
            )
        )

    return PendingSummaryResponse(
        conferences=pending_conferences,
        has_any_mandatory_pending=any(c.has_mandatory_pending for c in pending_conferences),
    )


@router.post(
    "/portal/conferences/{conference_id}/registration-questions/answers",
)
async def submit_answers(
    conference_id: UUID,
    data: SubmitAnswersRequest,
    current: CurrentApplicantDep,
    db: DbSessionDep,
) -> dict:
    """Submit answers for a conference's registration questions.

    Validates that all mandatory questions are answered.
    """
    # Verify conference exists and applicant is registered
    conf_result = await db.execute(
        select(Conference).where(
            Conference.id == conference_id,
            Conference.tenant_id == current.tenant_id,
            Conference.is_active.is_(True),
        )
    )
    conference = conf_result.scalar_one_or_none()
    if not conference:
        raise NotFoundError("Conference not found")

    # Verify applicant has a registration for this conference
    reg_check = await db.execute(
        select(Registration.id).where(
            Registration.conference_id == conference_id,
            Registration.tenant_id == current.tenant_id,
            func.lower(Registration.email) == current.applicant.email.lower(),
            Registration.status != RegistrationStatus.CANCELLED,
        )
    )
    if not reg_check.scalar_one_or_none():
        raise ValidationError("You do not have a registration for this conference")

    active_questions = _get_active_questions(conference)
    question_map = {q["id"]: q for q in active_questions}

    # Build answer map from submission
    submitted = {a.question_id: a.answer_value for a in data.answers}

    # Validate mandatory questions are answered
    for q in active_questions:
        if q.get("required") and q["id"] not in submitted:
            raise ValidationError(f"Mandatory question not answered: {q['text']}")

    # Validate radio answers have valid options
    for answer in data.answers:
        q = question_map.get(answer.question_id)
        if not q:
            raise ValidationError(f"Unknown question: {answer.question_id}")
        if q["type"] == "radio" and answer.answer_value not in q.get("options", []):
            raise ValidationError(f"Invalid option for question '{q['text']}': {answer.answer_value}")

    # Load existing answers to handle upsert
    existing_result = await db.execute(
        select(RegistrationQuestionAnswer).where(
            RegistrationQuestionAnswer.conference_id == conference_id,
            RegistrationQuestionAnswer.applicant_id == current.applicant_id,
        )
    )
    existing_map = {a.question_id: a for a in existing_result.scalars().all()}

    # Upsert answers
    now = func.now()
    for answer in data.answers:
        if answer.question_id in existing_map:
            # Update existing
            existing_answer = existing_map[answer.question_id]
            existing_answer.answer_value = answer.answer_value
            existing_answer.answered_at = now  # type: ignore[assignment]
        else:
            # Create new
            db.add(
                RegistrationQuestionAnswer(
                    tenant_id=current.tenant_id,
                    conference_id=conference_id,
                    applicant_id=current.applicant_id,
                    question_id=answer.question_id,
                    answer_value=answer.answer_value,
                )
            )

    await db.commit()
    return {"status": "ok", "answers_saved": len(data.answers)}
