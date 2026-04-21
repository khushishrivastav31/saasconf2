"""Admin messaging recipient list CRUD endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import func, select

from app.core.dependencies import CurrentUserDep, DbSessionDep, require_module
from app.core.exceptions import NotFoundError, ValidationError
from app.models.cfp import CFPApplicant
from app.models.messaging import RecipientList, RecipientListMember
from app.schemas.messaging import (
    RecipientListCreate,
    RecipientListDetailResponse,
    RecipientListListResponse,
    RecipientListMemberInfo,
    RecipientListResponse,
    RecipientListUpdate,
)

from ._shared import MODULE_CODE, _check_messaging_access

router = APIRouter(prefix="/recipient-lists")


@router.get(
    "",
    response_model=RecipientListListResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def list_recipient_lists(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> RecipientListListResponse:
    """List recipient lists for the tenant."""
    tenant_id = current_user.tenant_id

    query = select(RecipientList).where(RecipientList.tenant_id == tenant_id).order_by(RecipientList.name)

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    result = await db.execute(query)
    lists = result.scalars().all()

    # Get member counts
    items = []
    for rl in lists:
        count_result = await db.execute(select(func.count()).where(RecipientListMember.list_id == rl.id))
        member_count = count_result.scalar() or 0
        items.append(
            RecipientListResponse(
                id=rl.id,
                name=rl.name,
                description=rl.description,
                member_count=member_count,
                created_at=rl.created_at,
                updated_at=rl.updated_at,
            )
        )

    return RecipientListListResponse(items=items, total=total)


@router.post(
    "",
    response_model=RecipientListDetailResponse,
    status_code=201,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def create_recipient_list(
    conference_id: UUID,
    data: RecipientListCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> RecipientListDetailResponse:
    """Create a new recipient list."""
    tenant_id = current_user.tenant_id
    await _check_messaging_access(db, current_user, conference_id)

    # Check duplicate name
    existing = await db.execute(
        select(RecipientList).where(
            RecipientList.tenant_id == tenant_id,
            RecipientList.name == data.name,
        )
    )
    if existing.scalar_one_or_none():
        raise ValidationError(f"Recipient list with name '{data.name}' already exists")

    # Verify applicants exist
    result = await db.execute(
        select(CFPApplicant).where(
            CFPApplicant.id.in_(data.applicant_ids),
            CFPApplicant.tenant_id == tenant_id,
        )
    )
    applicants = list(result.scalars().all())
    if not applicants:
        raise NotFoundError("No valid applicants found")

    rl = RecipientList(
        tenant_id=tenant_id,
        name=data.name,
        description=data.description,
    )
    db.add(rl)
    await db.flush()

    for applicant in applicants:
        db.add(RecipientListMember(list_id=rl.id, applicant_id=applicant.id))

    await db.commit()
    await db.refresh(rl)

    return RecipientListDetailResponse(
        id=rl.id,
        name=rl.name,
        description=rl.description,
        members=[
            RecipientListMemberInfo(
                id=a.id,
                first_name=a.first_name,
                last_name=a.last_name,
                email=a.email or "",
            )
            for a in applicants
        ],
        created_at=rl.created_at,
        updated_at=rl.updated_at,
    )


@router.get(
    "/{list_id}",
    response_model=RecipientListDetailResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def get_recipient_list(
    conference_id: UUID,
    list_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> RecipientListDetailResponse:
    """Get recipient list with members."""
    tenant_id = current_user.tenant_id

    result = await db.execute(
        select(RecipientList).where(
            RecipientList.id == list_id,
            RecipientList.tenant_id == tenant_id,
        )
    )
    rl = result.scalar_one_or_none()
    if not rl:
        raise NotFoundError("Recipient list not found")

    # Get members
    members_result = await db.execute(
        select(RecipientListMember.applicant_id).where(RecipientListMember.list_id == list_id)
    )
    applicant_ids = [row[0] for row in members_result.all()]

    applicants = []
    if applicant_ids:
        app_result = await db.execute(select(CFPApplicant).where(CFPApplicant.id.in_(applicant_ids)))
        applicants = list(app_result.scalars().all())

    return RecipientListDetailResponse(
        id=rl.id,
        name=rl.name,
        description=rl.description,
        members=[
            RecipientListMemberInfo(
                id=a.id,
                first_name=a.first_name,
                last_name=a.last_name,
                email=a.email or "",
            )
            for a in applicants
        ],
        created_at=rl.created_at,
        updated_at=rl.updated_at,
    )


@router.put(
    "/{list_id}",
    response_model=RecipientListDetailResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def update_recipient_list(
    conference_id: UUID,
    list_id: UUID,
    data: RecipientListUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> RecipientListDetailResponse:
    """Update a recipient list."""
    tenant_id = current_user.tenant_id
    await _check_messaging_access(db, current_user, conference_id)

    result = await db.execute(
        select(RecipientList).where(
            RecipientList.id == list_id,
            RecipientList.tenant_id == tenant_id,
        )
    )
    rl = result.scalar_one_or_none()
    if not rl:
        raise NotFoundError("Recipient list not found")

    if data.name is not None and data.name != rl.name:
        dup = await db.execute(
            select(RecipientList).where(
                RecipientList.tenant_id == tenant_id,
                RecipientList.name == data.name,
                RecipientList.id != list_id,
            )
        )
        if dup.scalar_one_or_none():
            raise ValidationError(f"Recipient list with name '{data.name}' already exists")
        rl.name = data.name

    if data.description is not None:
        rl.description = data.description

    # Update members if provided
    if data.applicant_ids is not None:
        # Verify applicants
        app_result = await db.execute(
            select(CFPApplicant).where(
                CFPApplicant.id.in_(data.applicant_ids),
                CFPApplicant.tenant_id == tenant_id,
            )
        )
        applicants = list(app_result.scalars().all())
        valid_ids = {a.id for a in applicants}

        # Remove existing members
        existing_members = await db.execute(select(RecipientListMember).where(RecipientListMember.list_id == list_id))
        for m in existing_members.scalars():
            await db.delete(m)
        await db.flush()

        # Add new members
        for aid in valid_ids:
            db.add(RecipientListMember(list_id=list_id, applicant_id=aid))

    await db.commit()

    # Return updated detail
    return await get_recipient_list(conference_id, list_id, current_user, db)


@router.delete(
    "/{list_id}",
    status_code=204,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def delete_recipient_list(
    conference_id: UUID,
    list_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> None:
    """Delete a recipient list."""
    tenant_id = current_user.tenant_id
    await _check_messaging_access(db, current_user, conference_id)

    result = await db.execute(
        select(RecipientList).where(
            RecipientList.id == list_id,
            RecipientList.tenant_id == tenant_id,
        )
    )
    rl = result.scalar_one_or_none()
    if not rl:
        raise NotFoundError("Recipient list not found")

    await db.delete(rl)
    await db.commit()
