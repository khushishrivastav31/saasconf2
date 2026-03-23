"""Stripe settings endpoints.

Conference-scoped Stripe API key management with role-based masking.
Only tenant super users can see/edit actual secret keys.
"""

from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select

from app.core.conference_helpers import check_conference_admin, get_conference_for_tenant
from app.core.default_settings import BANK_TRANSFER_COUNTRIES
from app.core.dependencies import CurrentUserDep, DbSessionDep
from app.core.exceptions import AuthorizationError
from app.models.conference import Conference
from app.schemas.settings import BankTransferCountriesUpdate, StripeSettings, StripeSettingsResponse

router = APIRouter()


def _mask_secret_key(key: str) -> str:
    """Mask secret key for non-super-users.

    Returns: sk_****...****abc (first 3 chars + stars + last 3 chars)

    Args:
        key: The secret key to mask

    Returns:
        Masked secret key string
    """
    if not key or len(key) < 8:
        return "****"
    return f"{key[:3]}{'*' * (len(key) - 6)}{key[-3:]}"


@router.get(
    "/stripe-settings",
    response_model=StripeSettingsResponse,
)
async def get_stripe_settings(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> StripeSettingsResponse:
    """Get Stripe configuration for conference.

    Secret key is masked for non-super-users (only shows first 3 + last 3 chars).
    Tenant super users see the full secret key.

    Args:
        conference_id: Conference UUID
        current_user: Current authenticated user
        db: Database session

    Returns:
        Stripe settings response with conditional masking
    """
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)
    settings = conference.settings or {}
    stripe_settings = settings.get("stripe", {})

    # Mask secret key for non-super-users
    secret_key = stripe_settings.get("secret_key")
    if secret_key and not current_user.is_tenant_super_user:
        secret_key = _mask_secret_key(secret_key)

    return StripeSettingsResponse(
        publishable_key=stripe_settings.get("publishable_key"),
        secret_key=secret_key,
        is_enabled=stripe_settings.get("is_enabled", False),
        bank_transfer_countries=settings.get("bank_transfer_countries", BANK_TRANSFER_COUNTRIES),
    )


@router.put(
    "/stripe-settings",
    response_model=StripeSettingsResponse,
)
async def update_stripe_settings(
    conference_id: UUID,
    data: StripeSettings,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> StripeSettingsResponse:
    """Update Stripe configuration.

    Only tenant super users can update secret key.
    Regular admins get 403 error if they attempt to update.

    Args:
        conference_id: Conference UUID
        data: Stripe settings update data
        current_user: Current authenticated user
        db: Database session

    Returns:
        Updated Stripe settings response

    Raises:
        AuthorizationError: If user is not a tenant super user
    """
    await check_conference_admin(conference_id, current_user, db)

    # Only tenant super users can update Stripe settings
    if not current_user.is_tenant_super_user:
        raise AuthorizationError("Only tenant super users can update Stripe settings")

    # Get conference
    result = await db.execute(
        select(Conference).where(
            Conference.id == conference_id,
            Conference.tenant_id == current_user.tenant_id,
        )
    )
    conference = result.scalar_one()

    # Update settings
    settings = conference.settings or {}
    update_data = data.model_dump(exclude_none=True)

    # Merge with existing stripe settings (partial update)
    existing_stripe = settings.get("stripe", {})
    merged_stripe = {**existing_stripe, **update_data}
    settings["stripe"] = merged_stripe

    conference.settings = settings
    from sqlalchemy.orm.attributes import flag_modified

    flag_modified(conference, "settings")
    await db.commit()
    await db.refresh(conference)

    # Return updated settings (unmasked for super user)
    return await get_stripe_settings(conference_id, current_user, db)


@router.put(
    "/stripe-settings/bank-transfer-countries",
    response_model=list[str],
)
async def update_bank_transfer_countries(
    conference_id: UUID,
    data: BankTransferCountriesUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> list[str]:
    """Update which countries are eligible for bank transfer payment.

    Any conference admin can update this setting (not restricted to super users).
    """
    await check_conference_admin(conference_id, current_user, db)

    result = await db.execute(
        select(Conference).where(
            Conference.id == conference_id,
            Conference.tenant_id == current_user.tenant_id,
        )
    )
    conference = result.scalar_one()

    settings = conference.settings or {}
    settings["bank_transfer_countries"] = data.countries
    conference.settings = settings

    from sqlalchemy.orm.attributes import flag_modified

    flag_modified(conference, "settings")
    await db.commit()

    return data.countries
