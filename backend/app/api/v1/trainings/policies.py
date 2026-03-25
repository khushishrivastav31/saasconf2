"""Training policies settings endpoints.

Manages legal/compliance policies for the training registration portal:
- Privacy Policy
- Cookies Policy
- Imprint
- Terms and Conditions
- Code of Conduct

Each policy can be an external URL or inline rich text content.
Stored in tenant.settings["training_policies"] (tenant-scoped, shared across all trainings).
"""

from fastapi import APIRouter
from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

from app.core.dependencies import DbSessionDep, TenantAdminDep
from app.core.exceptions import ValidationError
from app.models.tenant import Tenant
from app.schemas.settings import PoliciesSettingsResponse, PoliciesSettingsUpdate, PolicyEntry

router = APIRouter(prefix="/policies", tags=["training-policies"])

POLICY_KEYS = [
    "privacy_policy",
    "cookies_policy",
    "imprint",
    "terms_and_conditions",
    "code_of_conduct",
]


def _build_policies_response(settings: dict) -> PoliciesSettingsResponse:
    """Build policies response with defaults for missing entries."""
    policies = settings.get("training_policies", {})
    return PoliciesSettingsResponse(**{key: PolicyEntry(**policies.get(key, {})) for key in POLICY_KEYS})


@router.get(
    "",
    response_model=PoliciesSettingsResponse,
)
async def get_training_policies(
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> PoliciesSettingsResponse:
    """Get training policy settings for the tenant.

    Returns policy configuration with defaults if not explicitly configured.
    """
    result = await db.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))
    tenant = result.scalar_one()
    return _build_policies_response(tenant.settings or {})


@router.put(
    "",
    response_model=PoliciesSettingsResponse,
)
async def update_training_policies(
    data: PoliciesSettingsUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> PoliciesSettingsResponse:
    """Update training policy settings for the tenant.

    Validates URLs and sanitizes HTML content.
    """
    result = await db.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))
    tenant = result.scalar_one()

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
            entry["content"] = None
        elif policy_type == "content":
            content = entry.get("content", "")
            if content:
                from app.core.html_sanitize import sanitize_html

                entry["content"] = sanitize_html(content)
            entry["url"] = None

    settings = tenant.settings or {}
    existing_policies = settings.get("training_policies", {})
    merged_policies = {**existing_policies, **update_data}
    settings["training_policies"] = merged_policies
    tenant.settings = settings

    flag_modified(tenant, "settings")
    await db.commit()
    await db.refresh(tenant)

    return _build_policies_response(tenant.settings or {})
