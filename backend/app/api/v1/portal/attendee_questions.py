"""Portal endpoints for conference registration questions — attendee flow."""

from uuid import UUID

from fastapi import APIRouter, Request
from sqlalchemy import func, select

from app.api.v1.portal_auth import _get_current_portal_user
from app.core.dependencies import DbSessionDep
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
    rq = (conference.settings or {}).get("registration_questions", {})
    if not rq.get("enabled"):
        return []
    return [q for q in rq.get("questions", []) if q.get("is_active")]


@router.get(
    "/attendee/registration-questions/pending",
    response_model=PendingSummaryResponse,
)
async def get_attendee_pending_questions(
    request: Request,
    db: DbSessionDep,
) -> PendingSummaryResponse:
    """Check all conferences for pending mandatory registration questions (attendee flow).

    Finds conferences where the portal user has a registration (matched via
    email_hash) and returns unanswered mandatory questions.
    """
    user = await _get_current_portal_user(request, db)

    # Find conferences where this portal user is registered (email_hash match)
    reg_result = await db.execute(
        select(Registration.conference_id)
        .where(
            Registration.tenant_id == user.tenant_id,
            Registration.email_hash == user.email_hash,
            Registration.status != RegistrationStatus.CANCELLED,
        )
        .distinct()
    )
    conference_ids = [row[0] for row in reg_result.all()]

    if not conference_ids:
        return PendingSummaryResponse()

    conf_result = await db.execute(
        select(Conference).where(
            Conference.id.in_(conference_ids),
            Conference.tenant_id == user.tenant_id,
            Conference.is_active.is_(True),
        )
    )
    conferences = conf_result.scalars().all()

    # Load existing answers for this portal user
    ans_result = await db.execute(
        select(
            RegistrationQuestionAnswer.conference_id,
            RegistrationQuestionAnswer.question_id,
        ).where(
            RegistrationQuestionAnswer.portal_user_id == user.id,
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
                        help_text=q.get("help_text", ""),
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
    "/conferences/{conference_id}/attendee/registration-questions/answers",
)
async def submit_attendee_answers(
    conference_id: UUID,
    data: SubmitAnswersRequest,
    request: Request,
    db: DbSessionDep,
) -> dict:
    """Submit registration question answers for an attendee portal user."""
    user = await _get_current_portal_user(request, db)

    conf_result = await db.execute(
        select(Conference).where(
            Conference.id == conference_id,
            Conference.tenant_id == user.tenant_id,
            Conference.is_active.is_(True),
        )
    )
    conference = conf_result.scalar_one_or_none()
    if not conference:
        raise NotFoundError("Conference not found")

    reg_check = await db.execute(
        select(Registration.id).where(
            Registration.conference_id == conference_id,
            Registration.tenant_id == user.tenant_id,
            Registration.email_hash == user.email_hash,
            Registration.status != RegistrationStatus.CANCELLED,
        )
    )
    if not reg_check.scalar_one_or_none():
        raise ValidationError("You do not have a registration for this conference")

    active_questions = _get_active_questions(conference)
    question_map = {q["id"]: q for q in active_questions}

    submitted = {a.question_id: a.answer_value for a in data.answers}

    for q in active_questions:
        if q.get("required") and q["id"] not in submitted:
            raise ValidationError(f"Mandatory question not answered: {q['text']}")

    for answer in data.answers:
        question = question_map.get(answer.question_id)
        if not question:
            raise ValidationError(f"Unknown question: {answer.question_id}")
        if question["type"] in ("radio", "dropdown") and answer.answer_value not in question.get("options", []):
            raise ValidationError(f"Invalid option for question '{question['text']}': {answer.answer_value}")

    # Upsert answers keyed by portal_user_id
    existing_result = await db.execute(
        select(RegistrationQuestionAnswer).where(
            RegistrationQuestionAnswer.conference_id == conference_id,
            RegistrationQuestionAnswer.portal_user_id == user.id,
        )
    )
    existing_map = {a.question_id: a for a in existing_result.scalars().all()}

    now = func.now()
    for answer in data.answers:
        if answer.question_id in existing_map:
            existing_map[answer.question_id].answer_value = answer.answer_value
            existing_map[answer.question_id].answered_at = now  # type: ignore[assignment]
        else:
            db.add(
                RegistrationQuestionAnswer(
                    tenant_id=user.tenant_id,
                    conference_id=conference_id,
                    portal_user_id=user.id,
                    applicant_id=None,
                    question_id=answer.question_id,
                    answer_value=answer.answer_value,
                )
            )

    await db.commit()
    return {"status": "ok", "answers_saved": len(data.answers)}
