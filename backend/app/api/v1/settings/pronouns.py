"""Pronoun Options CRUD endpoints (conference-scoped)."""

from app.models.settings import PronounOption
from app.schemas.settings import (
    PronounOptionCreate,
    PronounOptionListResponse,
    PronounOptionResponse,
    PronounOptionUpdate,
)

from ._crud_factory import create_crud_router

router = create_crud_router(
    prefix="pronouns",
    entity_name="pronoun_option",
    model_class=PronounOption,
    create_schema=PronounOptionCreate,
    update_schema=PronounOptionUpdate,
    response_schema=PronounOptionResponse,
    list_response_schema=PronounOptionListResponse,
    unique_field="name",
    order_by=("name",),
)
