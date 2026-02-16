"""Currencies CRUD endpoints."""

from typing import Any

from sqlalchemy import func, select
from sqlalchemy import update as sql_update

from app.core.exceptions import ValidationError
from app.models.settings import ConferenceCurrency, SponsorPackage
from app.schemas.settings import (
    CurrencyCreate,
    CurrencyListResponse,
    CurrencyResponse,
    CurrencyUpdate,
)

from ._crud_factory import create_crud_router


async def _cascade_code_change(entity: Any, update_data: dict[str, Any], conference: Any, db: Any) -> None:
    """If the currency code changed, update all sponsor packages using the old code."""
    if "code" not in update_data:
        return
    # The entity already has the new code applied; we need the old code.
    # Since update_data was applied before this hook, we need to check against
    # what was stored. We can detect this from the inspection state.
    from sqlalchemy import inspect as sa_inspect
    state = sa_inspect(entity)
    history = state.attrs.code.history
    if history.deleted and history.deleted[0] != entity.code:
        old_code = history.deleted[0]
        await db.execute(
            sql_update(SponsorPackage)
            .where(
                SponsorPackage.conference_id == conference.id,
                SponsorPackage.currency == old_code,
            )
            .values(currency=entity.code)
        )


async def _check_packages_using_currency(entity: Any, conference: Any, db: Any) -> None:
    """Block deletion if any sponsor packages are using this currency."""
    usage_count = (
        await db.execute(
            select(func.count()).where(
                SponsorPackage.conference_id == conference.id,
                SponsorPackage.currency == entity.code,
            )
        )
    ).scalar() or 0

    if usage_count > 0:
        raise ValidationError(
            f"Cannot delete currency '{entity.code}': {usage_count} sponsor package(s) are using it"
        )


router = create_crud_router(
    prefix="currencies",
    entity_name="currency",
    model_class=ConferenceCurrency,
    create_schema=CurrencyCreate,
    update_schema=CurrencyUpdate,
    response_schema=CurrencyResponse,
    list_response_schema=CurrencyListResponse,
    unique_field="code",
    unique_field_label="code",
    label_field="code",
    order_by=("code",),
    audit_create_fields=["code"],
    pre_delete_check=_check_packages_using_currency,
    post_update_hook=_cascade_code_change,
)
