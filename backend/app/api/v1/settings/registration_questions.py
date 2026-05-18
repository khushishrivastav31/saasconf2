"""Conference registration questions settings endpoints.

Manages questions shown to portal users after their first login post-registration.
Questions can be checkbox, text field, or radio buttons, and can be mandatory or optional.
"""

from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

from app.core.conference_helpers import check_conference_admin, get_conference_for_tenant
from app.core.dependencies import CurrentUserDep, DbSessionDep
from app.core.exceptions import ValidationError
from app.core.html_sanitize import sanitize_html
from app.models.conference import Conference
from app.schemas.registration_questions import (
    RegistrationQuestionsSettings,
    RegistrationQuestionsUpdate,
)

router = APIRouter()


def _build_response(settings: dict) -> RegistrationQuestionsSettings:
    """Build registration questions response with defaults for missing data."""
    rq = settings.get("registration_questions", {})
    if not isinstance(rq, dict):
        rq = {}
    return RegistrationQuestionsSettings(**rq)


@router.get(
    "/registration-questions",
    response_model=RegistrationQuestionsSettings,
)
async def get_registration_questions_settings(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> RegistrationQuestionsSettings:
    """Get registration questions configuration for a conference."""
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)
    return _build_response(conference.settings or {})


@router.put(
    "/registration-questions",
    response_model=RegistrationQuestionsSettings,
)
async def update_registration_questions_settings(
    conference_id: UUID,
    data: RegistrationQuestionsUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> RegistrationQuestionsSettings:
    """Update registration questions configuration. Requires admin access."""
    await check_conference_admin(conference_id, current_user, db)

    result = await db.execute(
        select(Conference).where(
            Conference.id == conference_id,
            Conference.tenant_id == current_user.tenant_id,
        )
    )
    conference = result.scalar_one()

    update_data = data.model_dump(exclude_unset=True, mode="json")

    # Validate questions
    questions = update_data.get("questions")
    if questions is not None:
        seen_ids: set[str] = set()
        for q in questions:
            qid = q.get("id", "")
            if not qid:
                raise ValidationError("Each question must have an id")
            if qid in seen_ids:
                raise ValidationError(f"Duplicate question id: {qid}")
            seen_ids.add(qid)

            qtype = q.get("type")
            if qtype in ("radio", "dropdown"):
                options = q.get("options", [])
                if len(options) < 2:
                    raise ValidationError(f"Radio/dropdown question '{q.get('text', '')}' must have at least 2 options")

            # Sanitize HTML in text, help_text, and options
            if q.get("text"):
                q["text"] = sanitize_html(q["text"])
            if q.get("help_text"):
                q["help_text"] = sanitize_html(q["help_text"])
            if q.get("options"):
                q["options"] = [sanitize_html(opt) for opt in q["options"]]

    # Merge into existing settings.
    # Guard against legacy data where registration_questions was stored as a
    # bare list instead of a dict — treat it as empty so the new shape wins.
    settings = conference.settings or {}
    existing_rq = settings.get("registration_questions", {})
    if not isinstance(existing_rq, dict):
        existing_rq = {}
    merged = {**existing_rq, **update_data}
    settings["registration_questions"] = merged
    conference.settings = settings

    flag_modified(conference, "settings")
    await db.commit()
    await db.refresh(conference)

    return _build_response(conference.settings or {})
