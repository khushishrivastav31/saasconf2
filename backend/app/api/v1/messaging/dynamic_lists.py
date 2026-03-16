"""Admin messaging dynamic recipient list CRUD endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.core.conference_helpers import get_conference_for_tenant
from app.core.dependencies import CurrentUserDep, DbSessionDep, require_module
from app.core.exceptions import NotFoundError, ValidationError
from app.models.messaging import DynamicRecipientList
from app.schemas.messaging import (
    DynamicRecipientListCreate,
    DynamicRecipientListListResponse,
    DynamicRecipientListResponse,
    DynamicRecipientListUpdate,
    RecipientPreviewResponse,
)

from ._shared import (
    MODULE_CODE,
    _check_messaging_access,
    recipients_to_preview,
    resolve_registrations,
    resolve_sponsors,
)

router = APIRouter(prefix="/dynamic-lists")


async def _resolve_dynamic_list_count(
    db,
    dl: DynamicRecipientList,
) -> int:
    """Resolve a dynamic list and return the recipient count."""
    if dl.target_type == "registration":
        recipients = await resolve_registrations(db, dl.tenant_id, dl.conference_id, filters=dl.filters)
    elif dl.target_type == "sponsor":
        recipients = await resolve_sponsors(db, dl.tenant_id, dl.conference_id, filters=dl.filters)
    else:
        recipients = []
    return len(recipients)


def _to_response(dl: DynamicRecipientList, recipient_count: int = 0) -> DynamicRecipientListResponse:
    return DynamicRecipientListResponse(
        id=dl.id,
        name=dl.name,
        description=dl.description,
        target_type=dl.target_type,
        filters=dl.filters,
        recipient_count=recipient_count,
        created_at=dl.created_at,
        updated_at=dl.updated_at,
    )


@router.get(
    "",
    response_model=DynamicRecipientListListResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def list_dynamic_lists(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> DynamicRecipientListListResponse:
    """List dynamic recipient lists for this conference."""
    tenant_id = current_user.tenant_id
    await get_conference_for_tenant(db, conference_id, tenant_id)

    result = await db.execute(
        select(DynamicRecipientList)
        .where(
            DynamicRecipientList.tenant_id == tenant_id,
            DynamicRecipientList.conference_id == conference_id,
        )
        .order_by(DynamicRecipientList.name)
    )
    lists = list(result.scalars().all())

    items = []
    for dl in lists:
        count = await _resolve_dynamic_list_count(db, dl)
        items.append(_to_response(dl, count))

    return DynamicRecipientListListResponse(items=items, total=len(items))


@router.post(
    "",
    response_model=DynamicRecipientListResponse,
    status_code=201,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def create_dynamic_list(
    conference_id: UUID,
    data: DynamicRecipientListCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> DynamicRecipientListResponse:
    """Create a new dynamic recipient list."""
    tenant_id = current_user.tenant_id
    await _check_messaging_access(db, current_user, conference_id)

    # Check duplicate name
    existing = await db.execute(
        select(DynamicRecipientList).where(
            DynamicRecipientList.tenant_id == tenant_id,
            DynamicRecipientList.conference_id == conference_id,
            DynamicRecipientList.name == data.name,
        )
    )
    if existing.scalar_one_or_none():
        raise ValidationError(f"Dynamic list with name '{data.name}' already exists")

    dl = DynamicRecipientList(
        tenant_id=tenant_id,
        conference_id=conference_id,
        name=data.name,
        description=data.description,
        target_type=data.target_type,
        filters=data.filters,
    )
    db.add(dl)
    await db.commit()
    await db.refresh(dl)

    count = await _resolve_dynamic_list_count(db, dl)
    return _to_response(dl, count)


@router.get(
    "/{list_id}",
    response_model=DynamicRecipientListResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def get_dynamic_list(
    conference_id: UUID,
    list_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> DynamicRecipientListResponse:
    """Get a dynamic recipient list with recipient count."""
    tenant_id = current_user.tenant_id

    result = await db.execute(
        select(DynamicRecipientList).where(
            DynamicRecipientList.id == list_id,
            DynamicRecipientList.tenant_id == tenant_id,
            DynamicRecipientList.conference_id == conference_id,
        )
    )
    dl = result.scalar_one_or_none()
    if not dl:
        raise NotFoundError("Dynamic recipient list not found")

    count = await _resolve_dynamic_list_count(db, dl)
    return _to_response(dl, count)


@router.put(
    "/{list_id}",
    response_model=DynamicRecipientListResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def update_dynamic_list(
    conference_id: UUID,
    list_id: UUID,
    data: DynamicRecipientListUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> DynamicRecipientListResponse:
    """Update a dynamic recipient list."""
    tenant_id = current_user.tenant_id
    await _check_messaging_access(db, current_user, conference_id)

    result = await db.execute(
        select(DynamicRecipientList).where(
            DynamicRecipientList.id == list_id,
            DynamicRecipientList.tenant_id == tenant_id,
            DynamicRecipientList.conference_id == conference_id,
        )
    )
    dl = result.scalar_one_or_none()
    if not dl:
        raise NotFoundError("Dynamic recipient list not found")

    if data.name is not None and data.name != dl.name:
        dup = await db.execute(
            select(DynamicRecipientList).where(
                DynamicRecipientList.tenant_id == tenant_id,
                DynamicRecipientList.conference_id == conference_id,
                DynamicRecipientList.name == data.name,
                DynamicRecipientList.id != list_id,
            )
        )
        if dup.scalar_one_or_none():
            raise ValidationError(f"Dynamic list with name '{data.name}' already exists")
        dl.name = data.name

    if data.description is not None:
        dl.description = data.description

    if data.filters is not None:
        dl.filters = data.filters

    await db.commit()
    await db.refresh(dl)

    count = await _resolve_dynamic_list_count(db, dl)
    return _to_response(dl, count)


@router.delete(
    "/{list_id}",
    status_code=204,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def delete_dynamic_list(
    conference_id: UUID,
    list_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> None:
    """Delete a dynamic recipient list."""
    tenant_id = current_user.tenant_id
    await _check_messaging_access(db, current_user, conference_id)

    result = await db.execute(
        select(DynamicRecipientList).where(
            DynamicRecipientList.id == list_id,
            DynamicRecipientList.tenant_id == tenant_id,
            DynamicRecipientList.conference_id == conference_id,
        )
    )
    dl = result.scalar_one_or_none()
    if not dl:
        raise NotFoundError("Dynamic recipient list not found")

    await db.delete(dl)
    await db.commit()


@router.get(
    "/{list_id}/preview",
    response_model=RecipientPreviewResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def preview_dynamic_list(
    conference_id: UUID,
    list_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> RecipientPreviewResponse:
    """Preview resolved recipients for a dynamic list."""
    tenant_id = current_user.tenant_id

    result = await db.execute(
        select(DynamicRecipientList).where(
            DynamicRecipientList.id == list_id,
            DynamicRecipientList.tenant_id == tenant_id,
            DynamicRecipientList.conference_id == conference_id,
        )
    )
    dl = result.scalar_one_or_none()
    if not dl:
        raise NotFoundError("Dynamic recipient list not found")

    if dl.target_type == "registration":
        recipients = await resolve_registrations(db, dl.tenant_id, dl.conference_id, filters=dl.filters)
    elif dl.target_type == "sponsor":
        recipients = await resolve_sponsors(db, dl.tenant_id, dl.conference_id, filters=dl.filters)
    else:
        recipients = []

    return RecipientPreviewResponse(
        total=len(recipients),
        items=recipients_to_preview(recipients),
    )
