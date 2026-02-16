"""Booking Options CRUD endpoints."""

from typing import Any

import sqlalchemy as sa

from app.models.settings import BookingOption
from app.schemas.settings import (
    BookingOptionCreate,
    BookingOptionListResponse,
    BookingOptionResponse,
    BookingOptionUpdate,
)

from ._crud_factory import create_crud_router


async def _clean_dangling_prices(entity: Any, conference: Any, db: Any) -> None:
    """Clean up dangling option_id key from all booking_periods prices JSONB."""
    await db.execute(
        sa.text(
            "UPDATE booking_periods SET prices = prices - :option_key "
            "WHERE conference_id = :conf_id AND tenant_id = :tenant_id AND prices ? :option_key"
        ),
        {"option_key": str(entity.id), "conf_id": conference.id, "tenant_id": conference.tenant_id},
    )


router = create_crud_router(
    prefix="booking-options",
    entity_name="booking_option",
    model_class=BookingOption,
    create_schema=BookingOptionCreate,
    update_schema=BookingOptionUpdate,
    response_schema=BookingOptionResponse,
    list_response_schema=BookingOptionListResponse,
    unique_field="name",
    order_by=("sort_order", "name"),
    post_delete_hook=_clean_dangling_prices,
)
