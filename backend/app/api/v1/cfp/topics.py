"""CFP Topic CRUD endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    TenantAdminDep,
    require_module,
)
from app.core.exceptions import NotFoundError
from app.models.cfp import CFPTopic
from app.schemas.cfp import (
    TopicCreate,
    TopicListResponse,
    TopicResponse,
    TopicUpdate,
)

from .shared import MODULE_CODE

router = APIRouter()


@router.get("/topics", response_model=TopicListResponse, dependencies=[Depends(require_module(MODULE_CODE))])
async def list_topics(
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> TopicListResponse:
    """List all topics for the current tenant."""
    query = select(CFPTopic).where(CFPTopic.tenant_id == current_user.tenant_id).order_by(CFPTopic.name)
    result = await db.execute(query)
    topics = list(result.scalars().all())

    items = [
        TopicResponse(
            id=t.id,
            tenant_id=t.tenant_id,
            name=t.name,
            description=t.description,
            created_at=t.created_at,
            updated_at=t.updated_at,
        )
        for t in topics
    ]

    return TopicListResponse(items=items, total=len(items))


@router.post(
    "/topics", response_model=TopicResponse, status_code=201, dependencies=[Depends(require_module(MODULE_CODE))]
)
async def create_topic(
    topic_data: TopicCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> TopicResponse:
    """Create a new topic."""
    topic = CFPTopic(
        tenant_id=current_user.tenant_id,
        name=topic_data.name,
        description=topic_data.description,
    )
    db.add(topic)
    await db.commit()
    await db.refresh(topic)

    return TopicResponse(
        id=topic.id,
        tenant_id=topic.tenant_id,
        name=topic.name,
        description=topic.description,
        created_at=topic.created_at,
        updated_at=topic.updated_at,
    )


@router.put("/topics/{topic_id}", response_model=TopicResponse, dependencies=[Depends(require_module(MODULE_CODE))])
async def update_topic(
    topic_id: UUID,
    topic_data: TopicUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> TopicResponse:
    """Update a topic."""
    result = await db.execute(
        select(CFPTopic).where(
            CFPTopic.id == topic_id,
            CFPTopic.tenant_id == current_user.tenant_id,
        )
    )
    topic = result.scalar_one_or_none()

    if not topic:
        raise NotFoundError(f"Topic with ID '{topic_id}' not found")

    update_data = topic_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(topic, field, value)

    await db.commit()
    await db.refresh(topic)

    return TopicResponse(
        id=topic.id,
        tenant_id=topic.tenant_id,
        name=topic.name,
        description=topic.description,
        created_at=topic.created_at,
        updated_at=topic.updated_at,
    )


@router.delete("/topics/{topic_id}", dependencies=[Depends(require_module(MODULE_CODE))])
async def delete_topic(
    topic_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Delete a topic."""
    result = await db.execute(
        select(CFPTopic).where(
            CFPTopic.id == topic_id,
            CFPTopic.tenant_id == current_user.tenant_id,
        )
    )
    topic = result.scalar_one_or_none()

    if not topic:
        raise NotFoundError(f"Topic with ID '{topic_id}' not found")

    await db.delete(topic)
    await db.commit()

    return {"message": f"Topic '{topic.name}' deleted successfully"}
