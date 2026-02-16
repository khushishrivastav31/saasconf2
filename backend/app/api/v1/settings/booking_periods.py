"""Booking Periods CRUD endpoints."""

from typing import Any

from app.models.settings import BookingPeriod
from app.schemas.settings import (
    BookingPeriodCreate,
    BookingPeriodListResponse,
    BookingPeriodResponse,
    BookingPeriodUpdate,
)

from ._crud_factory import create_crud_router


async def _transform_prices(data_dict: dict[str, Any], conference: Any, db: Any) -> dict[str, Any]:
    """Serialize Decimal prices to float for JSONB storage."""
    if data_dict.get("prices"):
        data_dict["prices"] = {k: float(v) for k, v in data_dict["prices"].items()}
    return data_dict


async def _update_prices(entity: Any, update_data: dict[str, Any], conference: Any, db: Any) -> None:
    """Serialize Decimal prices to float on update."""
    if "prices" in update_data and update_data["prices"] is not None:
        entity.prices = {k: float(v) for k, v in entity.prices.items()}


router = create_crud_router(
    prefix="booking-periods",
    entity_name="booking_period",
    model_class=BookingPeriod,
    create_schema=BookingPeriodCreate,
    update_schema=BookingPeriodUpdate,
    response_schema=BookingPeriodResponse,
    list_response_schema=BookingPeriodListResponse,
    unique_field="name",
    order_by=("sort_order", "name"),
    pre_create_transform=_transform_prices,
    post_update_hook=_update_prices,
)
