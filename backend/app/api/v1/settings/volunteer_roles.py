"""Volunteer Roles CRUD endpoints."""

from app.models.settings import VolunteerRole
from app.schemas.settings import (
    VolunteerRoleCreate,
    VolunteerRoleListResponse,
    VolunteerRoleResponse,
    VolunteerRoleUpdate,
)

from ._crud_factory import create_crud_router

router = create_crud_router(
    prefix="volunteer-roles",
    entity_name="volunteer_role",
    model_class=VolunteerRole,
    create_schema=VolunteerRoleCreate,
    update_schema=VolunteerRoleUpdate,
    response_schema=VolunteerRoleResponse,
    list_response_schema=VolunteerRoleListResponse,
    unique_field="name",
    order_by=("name",),
)
