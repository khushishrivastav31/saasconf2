"""Session Types CRUD endpoints."""

from typing import Any

from sqlalchemy import func, select

from app.core.exceptions import ValidationError
from app.models.cfp import CFPPaper
from app.models.settings import SessionType
from app.schemas.settings import (
    SessionTypeCreate,
    SessionTypeListResponse,
    SessionTypeResponse,
    SessionTypeUpdate,
)

from ._crud_factory import create_crud_router


async def _check_papers_using_session_type(entity: Any, conference: Any, db: Any) -> None:
    """Block deletion if any papers are using this session type."""
    paper_count = (
        await db.execute(
            select(func.count()).where(CFPPaper.session_type_id == entity.id)
        )
    ).scalar() or 0

    if paper_count > 0:
        raise ValidationError(
            f"Cannot delete '{entity.name}'. {paper_count} paper{'s' if paper_count > 1 else ''} "
            f"{'are' if paper_count > 1 else 'is'} using this session type. "
            f"Please reassign them to a different session type first."
        )


router = create_crud_router(
    prefix="session-types",
    entity_name="session_type",
    model_class=SessionType,
    create_schema=SessionTypeCreate,
    update_schema=SessionTypeUpdate,
    response_schema=SessionTypeResponse,
    list_response_schema=SessionTypeListResponse,
    unique_field="slug",
    unique_field_label="slug",
    label_field="name",
    order_by=(("duration_minutes", "desc"), "name"),
    audit_create_fields=["name", "slug"],
    pre_delete_check=_check_papers_using_session_type,
)
