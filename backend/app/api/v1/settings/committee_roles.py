"""CFP Committee Roles CRUD endpoints."""

from app.models.settings import CFPCommitteeRole
from app.schemas.settings import (
    CFPCommitteeRoleCreate,
    CFPCommitteeRoleListResponse,
    CFPCommitteeRoleResponse,
    CFPCommitteeRoleUpdate,
)

from ._crud_factory import create_crud_router

router = create_crud_router(
    prefix="committee-roles",
    entity_name="committee_role",
    model_class=CFPCommitteeRole,
    create_schema=CFPCommitteeRoleCreate,
    update_schema=CFPCommitteeRoleUpdate,
    response_schema=CFPCommitteeRoleResponse,
    list_response_schema=CFPCommitteeRoleListResponse,
    unique_field="name",
    order_by=("name",),
)
