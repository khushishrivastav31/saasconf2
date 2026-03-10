"""Conference policies settings endpoints.

Manages legal/compliance policies displayed on the public registration portal:
- Privacy Policy
- Cookies Policy
- Imprint
- Terms and Conditions
- Code of Conduct

Each policy can be an external URL or inline rich text content.
"""

from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

from app.core.conference_helpers import check_conference_admin, get_conference_for_tenant
from app.core.dependencies import CurrentUserDep, DbSessionDep
from app.core.exceptions import ValidationError
from app.models.conference import Conference
from app.schemas.settings import PoliciesSettingsResponse, PoliciesSettingsUpdate, PolicyEntry

router = APIRouter()

POLICY_KEYS = [
    "privacy_policy",
    "cookies_policy",
    "imprint",
    "terms_and_conditions",
    "code_of_conduct",
]


def _build_policies_response(settings: dict) -> PoliciesSettingsResponse:
    """Build policies response with defaults for missing entries."""
    policies = settings.get("policies", {})
    return PoliciesSettingsResponse(**{key: PolicyEntry(**policies.get(key, {})) for key in POLICY_KEYS})


@router.get(
    "/policies",
    response_model=PoliciesSettingsResponse,
)
async def get_policies_settings(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> PoliciesSettingsResponse:
    """Get policy settings for conference.

    Returns policy configuration with defaults if not explicitly configured.
    """
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)
    return _build_policies_response(conference.settings or {})


@router.put(
    "/policies",
    response_model=PoliciesSettingsResponse,
)
async def update_policies_settings(
    conference_id: UUID,
    data: PoliciesSettingsUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> PoliciesSettingsResponse:
    """Update policy settings for conference.

    Requires admin access. Validates URLs and sanitizes HTML content.
    """
    await check_conference_admin(conference_id, current_user, db)

    result = await db.execute(
        select(Conference).where(
            Conference.id == conference_id,
            Conference.tenant_id == current_user.tenant_id,
        )
    )
    conference = result.scalar_one()

    # Validate and sanitize each policy entry
    update_data = data.model_dump(exclude_unset=True, mode="json")

    for key in POLICY_KEYS:
        entry = update_data.get(key)
        if not entry:
            continue

        policy_type = entry.get("type")
        if policy_type == "url":
            url = entry.get("url", "")
            if url and not url.startswith(("https://", "http://")):
                raise ValidationError(f"Invalid URL for {key}: must start with http:// or https://")
            # Clear content when type is URL
            entry["content"] = None
        elif policy_type == "content":
            content = entry.get("content", "")
            if content:
                from app.core.html_sanitize import sanitize_html

                entry["content"] = sanitize_html(content)
            # Clear URL when type is content
            entry["url"] = None

    # Merge into existing settings
    settings = conference.settings or {}
    existing_policies = settings.get("policies", {})
    merged_policies = {**existing_policies, **update_data}
    settings["policies"] = merged_policies
    conference.settings = settings

    flag_modified(conference, "settings")
    await db.commit()
    await db.refresh(conference)

    return _build_policies_response(conference.settings or {})
