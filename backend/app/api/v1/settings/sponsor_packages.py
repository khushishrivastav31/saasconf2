"""Sponsor Packages CRUD endpoints."""

from typing import Any

from sqlalchemy import func, select

from app.core.exceptions import ValidationError
from app.models.settings import SponsorPackage
from app.models.sponsor import Sponsor
from app.schemas.settings import (
    SponsorPackageCreate,
    SponsorPackageListResponse,
    SponsorPackageResponse,
    SponsorPackageUpdate,
)

from ._crud_factory import create_crud_router


async def _check_sponsors_using_package(entity: Any, conference: Any, db: Any) -> None:
    """Block deletion if any sponsors are using this package."""
    sponsor_count = (
        await db.execute(select(func.count()).where(Sponsor.sponsor_package_id == entity.id))
    ).scalar() or 0

    if sponsor_count > 0:
        raise ValidationError(
            f"Cannot delete '{entity.name}'. {sponsor_count} sponsor{'s' if sponsor_count > 1 else ''} "
            f"{'are' if sponsor_count > 1 else 'is'} using this package. "
            f"Please reassign them to a different package first."
        )


router = create_crud_router(
    prefix="sponsor-packages",
    entity_name="sponsor_package",
    model_class=SponsorPackage,
    create_schema=SponsorPackageCreate,
    update_schema=SponsorPackageUpdate,
    response_schema=SponsorPackageResponse,
    list_response_schema=SponsorPackageListResponse,
    unique_field="name",
    order_by=(("price", "desc"), "name"),
    pre_delete_check=_check_sponsors_using_package,
)
