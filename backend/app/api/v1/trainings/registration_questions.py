"""Training registration questions settings endpoints.

Manages question definitions shown to registrants on training registration portals.
Questions can be checkbox, text field, radio buttons, or dropdown.
Stored in tenant.settings["training_registration_questions"] (tenant-scoped).
"""

from fastapi import APIRouter
from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

from app.core.dependencies import DbSessionDep, TenantAdminDep
from app.core.exceptions import ValidationError
from app.core.html_sanitize import sanitize_html
from app.models.tenant import Tenant
from app.schemas.registration_questions import (
    RegistrationQuestionsSettings,
    RegistrationQuestionsUpdate,
)

router = APIRouter(prefix="/registration-questions", tags=["training-registration-questions"])

SETTINGS_KEY = "training_registration_questions"


def _build_response(settings: dict) -> RegistrationQuestionsSettings:
    """Build registration questions response with defaults for missing data."""
    rq = settings.get(SETTINGS_KEY, {})
    return RegistrationQuestionsSettings(**rq)


@router.get(
    "",
    response_model=RegistrationQuestionsSettings,
)
async def get_training_registration_questions(
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> RegistrationQuestionsSettings:
    """Get training registration questions configuration for the tenant."""
    result = await db.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))
    tenant = result.scalar_one()
    return _build_response(tenant.settings or {})


@router.put(
    "",
    response_model=RegistrationQuestionsSettings,
)
async def update_training_registration_questions(
    data: RegistrationQuestionsUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> RegistrationQuestionsSettings:
    """Update training registration questions configuration.

    Validates question definitions and sanitizes HTML content.
    """
    result = await db.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))
    tenant = result.scalar_one()

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

    # Merge into existing settings
    settings = tenant.settings or {}
    existing_rq = settings.get(SETTINGS_KEY, {})
    merged = {**existing_rq, **update_data}
    settings[SETTINGS_KEY] = merged
    tenant.settings = settings

    flag_modified(tenant, "settings")
    await db.commit()
    await db.refresh(tenant)

    return _build_response(tenant.settings or {})
