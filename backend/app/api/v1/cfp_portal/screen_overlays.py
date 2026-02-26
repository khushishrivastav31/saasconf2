"""Portal screen overlay endpoints for applicant-facing overlays."""

from fastapi import APIRouter
from sqlalchemy import select

from app.core.applicant_dependencies import CurrentApplicantDep, DbSessionDep
from app.models.conference import Conference
from app.models.messaging import MessageParticipant, MessageTemplate, MessageThread
from app.models.news import NewsArticle
from app.models.screen_overlay import ScreenOverlay
from app.models.settings import EmailTemplate
from app.schemas.screen_overlay import (
    PortalScreenOverlayListResponse,
    PortalScreenOverlayResponse,
)

from .news import _get_accessible_conference_ids

router = APIRouter()


def _overlay_response(overlay: ScreenOverlay, conf_name: str, source: str) -> PortalScreenOverlayResponse:
    return PortalScreenOverlayResponse(
        id=overlay.id,
        conference_id=overlay.conference_id,
        conference_name=conf_name,
        trigger_type=overlay.trigger_type,
        title=overlay.title,
        body_text=overlay.body_text,
        animation_style=overlay.animation_style,
        duration_seconds=overlay.duration_seconds,
        image_url=overlay.image_url,
        source=source,
    )


@router.get("/portal/screen-overlays", response_model=PortalScreenOverlayListResponse)
async def list_portal_screen_overlays(
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> PortalScreenOverlayListResponse:
    """List active screen overlays for conferences the applicant has access to."""
    applicant_id = current_applicant.applicant_id
    tenant_id = current_applicant.tenant_id

    conference_ids = await _get_accessible_conference_ids(applicant_id, db, tenant_id)

    if not conference_ids:
        return PortalScreenOverlayListResponse(items=[], total=0)

    seen_ids: set[str] = set()
    items: list[PortalScreenOverlayResponse] = []

    def _add(overlay: ScreenOverlay, conf_name: str, source: str) -> None:
        oid = str(overlay.id)
        if oid not in seen_ids:
            seen_ids.add(oid)
            items.append(_overlay_response(overlay, conf_name, source))

    # 1. Standalone overlays (existing behaviour)
    standalone_q = (
        select(ScreenOverlay, Conference.name)
        .join(Conference, Conference.id == ScreenOverlay.conference_id)
        .where(
            ScreenOverlay.conference_id.in_(conference_ids),
            ScreenOverlay.is_active.is_(True),
        )
        .order_by(ScreenOverlay.display_order, ScreenOverlay.created_at.desc())
    )
    for overlay, conf_name in (await db.execute(standalone_q)).all():
        _add(overlay, conf_name, "standalone")

    # 2. News-linked overlays
    news_q = (
        select(ScreenOverlay, Conference.name)
        .join(NewsArticle, NewsArticle.screen_overlay_id == ScreenOverlay.id)
        .join(Conference, Conference.id == NewsArticle.conference_id)
        .where(
            NewsArticle.conference_id.in_(conference_ids),
            NewsArticle.is_published.is_(True),
            NewsArticle.screen_overlay_id.isnot(None),
            ScreenOverlay.is_active.is_(True),
        )
    )
    for overlay, conf_name in (await db.execute(news_q)).all():
        _add(overlay, conf_name, "news")

    # 3. Message-linked overlays (threads the applicant participates in)
    msg_q = (
        select(ScreenOverlay, Conference.name)
        .join(MessageThread, MessageThread.screen_overlay_id == ScreenOverlay.id)
        .join(Conference, Conference.id == MessageThread.conference_id)
        .join(MessageParticipant, MessageParticipant.thread_id == MessageThread.id)
        .where(
            MessageParticipant.participant_type == "applicant",
            MessageParticipant.participant_id == applicant_id,
            MessageThread.screen_overlay_id.isnot(None),
            ScreenOverlay.is_active.is_(True),
        )
    )
    for overlay, conf_name in (await db.execute(msg_q)).all():
        _add(overlay, conf_name, "message")

    # 4. Email-template-linked overlays
    email_q = (
        select(ScreenOverlay, Conference.name)
        .join(EmailTemplate, EmailTemplate.screen_overlay_id == ScreenOverlay.id)
        .join(Conference, Conference.id == EmailTemplate.conference_id)
        .where(
            EmailTemplate.conference_id.in_(conference_ids),
            EmailTemplate.is_active.is_(True),
            EmailTemplate.screen_overlay_id.isnot(None),
            ScreenOverlay.is_active.is_(True),
        )
    )
    for overlay, conf_name in (await db.execute(email_q)).all():
        _add(overlay, conf_name, "email_template")

    # 5. Message-template-linked overlays (tenant-scoped, use overlay's conference)
    mt_q = (
        select(ScreenOverlay, Conference.name)
        .join(MessageTemplate, MessageTemplate.screen_overlay_id == ScreenOverlay.id)
        .join(Conference, Conference.id == ScreenOverlay.conference_id)
        .where(
            MessageTemplate.tenant_id == tenant_id,
            MessageTemplate.screen_overlay_id.isnot(None),
            ScreenOverlay.is_active.is_(True),
            ScreenOverlay.conference_id.in_(conference_ids),
        )
    )
    for overlay, conf_name in (await db.execute(mt_q)).all():
        _add(overlay, conf_name, "message_template")

    return PortalScreenOverlayListResponse(items=items, total=len(items))
