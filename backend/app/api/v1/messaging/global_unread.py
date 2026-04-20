"""Global (cross-conference) unread count endpoint."""

from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import func, select

from app.core.dependencies import CurrentUserDep, DbSessionDep
from app.models.conference import Conference
from app.models.messaging import Message, MessageParticipant, MessageThread
from app.schemas.messaging import ConferenceUnreadCount, GlobalUnreadCountResponse

router = APIRouter()


@router.get("/unread-count", response_model=GlobalUnreadCountResponse)
async def get_global_unread_count(
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> GlobalUnreadCountResponse:
    """Get unread thread count across all conferences the user has access to."""
    tenant_id = current_user.tenant_id

    # Subquery: threads where user is a participant
    my_threads = (
        select(MessageParticipant.thread_id, MessageParticipant.last_read_at)
        .where(
            MessageParticipant.participant_type == "user",
            MessageParticipant.participant_id == current_user.user_id,
        )
        .subquery()
    )

    # Subquery: last message time per thread
    last_msg = (
        select(
            Message.thread_id,
            func.max(Message.created_at).label("last_at"),
        )
        .group_by(Message.thread_id)
        .subquery()
    )

    # Get unread counts grouped by conference
    result = await db.execute(
        select(
            MessageThread.conference_id,
            func.count().label("unread_count"),
        )
        .select_from(my_threads)
        .join(
            MessageThread,
            (MessageThread.id == my_threads.c.thread_id)
            & (MessageThread.tenant_id == tenant_id)
            & (MessageThread.archived_at.is_(None)),
        )
        .join(last_msg, last_msg.c.thread_id == my_threads.c.thread_id)
        .where((my_threads.c.last_read_at.is_(None)) | (last_msg.c.last_at > my_threads.c.last_read_at))
        .group_by(MessageThread.conference_id)
    )

    rows = result.all()

    if not rows:
        return GlobalUnreadCountResponse(total_unread_count=0, conferences=[])

    # Resolve conference names
    conf_ids = [row.conference_id for row in rows]
    conf_result = await db.execute(select(Conference.id, Conference.name).where(Conference.id.in_(conf_ids)))
    conf_names: dict[UUID, str] = dict(conf_result.tuples().all())

    conferences = []
    total = 0
    for row in rows:
        count = row.unread_count
        total += count
        conferences.append(
            ConferenceUnreadCount(
                conference_id=row.conference_id,
                conference_name=conf_names.get(row.conference_id, ""),
                unread_count=count,
            )
        )

    return GlobalUnreadCountResponse(
        total_unread_count=total,
        conferences=conferences,
    )
