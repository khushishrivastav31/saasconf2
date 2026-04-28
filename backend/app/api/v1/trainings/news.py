"""Trainings-side news article management.

Mirror of the per-conference ``/conferences/{id}/news/*`` endpoints, but
tenant-scoped: training-domain news articles apply tenant-wide to
portal users on the trainings module (no per-placement fan-out — the
admin News tab under Trainings module manages a single feed for the
tenant).

Migration 217 made ``news_articles.conference_id`` nullable and added a
``domain`` discriminator. Training-domain rows leave ``conference_id``
at ``NULL``; the CHECK constraint enforces the pairing.

The "send" endpoint emails published articles to training attendees
across the tenant — same pattern the conference side uses for CFP
applicants, with the recipient pool swapped for training-portal
identities.
"""

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select

from app.core.dependencies import DbSessionDep, TenantAdminDep
from app.core.email import send_direct_message_email
from app.core.exceptions import NotFoundError
from app.core.security.pii_crypto import read_pii
from app.models.news import NEWS_DOMAIN_TRAINING, NewsArticle
from app.models.training_program import ProgramYearTraining
from app.models.training_registration import TrainingRegistration, TrainingRegistrationAttendee
from app.models.user import User
from app.schemas.news import (
    NewsArticleCreate,
    NewsArticleListResponse,
    NewsArticleResponse,
    NewsArticleSendResponse,
    NewsArticleUpdate,
    TrainingNewsSendRequest,
)

router = APIRouter(prefix="/news", tags=["training-news"])


def _build_response(
    article: NewsArticle,
    author_first_name: str | None = None,
    author_last_name: str | None = None,
) -> NewsArticleResponse:
    return NewsArticleResponse(
        id=article.id,
        tenant_id=article.tenant_id,
        conference_id=article.conference_id,
        domain=article.domain,
        title=article.title,
        body_html=article.body_html,
        is_published=article.is_published,
        published_at=article.published_at,
        screen_overlay_id=article.screen_overlay_id,
        author_first_name=author_first_name,
        author_last_name=author_last_name,
        created_at=article.created_at,
        updated_at=article.updated_at,
    )


async def _resolve_author(db, user_id: UUID | None) -> tuple[str | None, str | None]:
    if not user_id:
        return None, None
    result = await db.execute(select(User.first_name, User.last_name).where(User.id == user_id))
    row = result.one_or_none()
    if not row:
        return None, None
    return row.first_name, row.last_name


async def _load_training_article(db, tenant_id: UUID, article_id: UUID) -> NewsArticle:
    result = await db.execute(
        select(NewsArticle).where(
            NewsArticle.id == article_id,
            NewsArticle.tenant_id == tenant_id,
            NewsArticle.domain == NEWS_DOMAIN_TRAINING,
        )
    )
    article = result.scalar_one_or_none()
    if article is None:
        raise NotFoundError("News article not found")
    return article


@router.get("", response_model=NewsArticleListResponse)
async def list_training_articles(
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> NewsArticleListResponse:
    """List every training-domain news article in the tenant (drafts + published)."""
    tenant_id = current_user.require_tenant_id()
    result = await db.execute(
        select(
            NewsArticle,
            User.first_name.label("author_first_name"),
            User.last_name.label("author_last_name"),
        )
        .outerjoin(User, User.id == NewsArticle.created_by)
        .where(
            NewsArticle.tenant_id == tenant_id,
            NewsArticle.domain == NEWS_DOMAIN_TRAINING,
        )
        .order_by(NewsArticle.created_at.desc())
    )
    rows = result.all()
    items = [_build_response(article, author_first_name=fn, author_last_name=ln) for article, fn, ln in rows]
    return NewsArticleListResponse(items=items, total=len(items))


@router.post("", response_model=NewsArticleResponse, status_code=201)
async def create_training_article(
    data: NewsArticleCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> NewsArticleResponse:
    """Create a tenant-wide training news article (draft by default)."""
    tenant_id = current_user.require_tenant_id()
    article = NewsArticle(
        tenant_id=tenant_id,
        conference_id=None,
        domain=NEWS_DOMAIN_TRAINING,
        title=data.title,
        body_html=data.body_html,
        screen_overlay_id=data.screen_overlay_id,
        is_published=False,
        created_by=current_user.user_id,
    )
    db.add(article)
    await db.commit()
    await db.refresh(article)
    fn, ln = await _resolve_author(db, article.created_by)
    return _build_response(article, fn, ln)


@router.get("/{article_id}", response_model=NewsArticleResponse)
async def get_training_article(
    article_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> NewsArticleResponse:
    article = await _load_training_article(db, current_user.require_tenant_id(), article_id)
    fn, ln = await _resolve_author(db, article.created_by)
    return _build_response(article, fn, ln)


@router.put("/{article_id}", response_model=NewsArticleResponse)
async def update_training_article(
    article_id: UUID,
    data: NewsArticleUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> NewsArticleResponse:
    article = await _load_training_article(db, current_user.require_tenant_id(), article_id)
    update_data = data.model_dump(exclude_unset=True)
    if "is_published" in update_data:
        if update_data["is_published"] and not article.is_published:
            update_data["published_at"] = datetime.now(UTC)
        elif not update_data["is_published"] and article.is_published:
            update_data["published_at"] = None
    for k, v in update_data.items():
        setattr(article, k, v)
    await db.commit()
    await db.refresh(article)
    fn, ln = await _resolve_author(db, article.created_by)
    return _build_response(article, fn, ln)


@router.delete("/{article_id}")
async def delete_training_article(
    article_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    article = await _load_training_article(db, current_user.require_tenant_id(), article_id)
    title = article.title
    await db.delete(article)
    await db.commit()
    return {"message": f"News article '{title}' deleted successfully"}


@router.post("/{article_id}/send", response_model=NewsArticleSendResponse)
async def send_training_article(
    article_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    filters: TrainingNewsSendRequest | None = None,
) -> NewsArticleSendResponse:
    """Email a published training news article to training attendees.

    Default (no body) broadcasts to every training attendee in the
    tenant. Optional filters narrow the pool:

    * ``placement_ids`` — only attendees on these placements.
    * ``program_year_id`` — only attendees on placements in this year.
    * ``registration_status`` — only attendees on registrations with
      this status (e.g. ``paid``, ``pending``).

    Filters are AND'd together. The recipient pool is deduped by email.
    """
    tenant_id = current_user.require_tenant_id()
    article = await _load_training_article(db, tenant_id, article_id)
    if not article.is_published:
        raise NotFoundError("Only published articles can be sent")

    query = select(TrainingRegistrationAttendee).where(
        TrainingRegistrationAttendee.tenant_id == tenant_id,
    )
    if filters is not None and (filters.placement_ids or filters.program_year_id or filters.registration_status):
        query = query.join(
            TrainingRegistration,
            TrainingRegistration.id == TrainingRegistrationAttendee.registration_id,
        )
        if filters.placement_ids:
            query = query.where(TrainingRegistration.placement_id.in_(filters.placement_ids))
        if filters.registration_status:
            query = query.where(TrainingRegistration.status == filters.registration_status)
        if filters.program_year_id:
            query = query.join(
                ProgramYearTraining,
                ProgramYearTraining.id == TrainingRegistration.placement_id,
            ).where(ProgramYearTraining.program_year_id == filters.program_year_id)

    attendee_result = await db.execute(query)
    attendees = list(attendee_result.scalars().all())

    # De-duplicate by email so the same person registered for multiple
    # trainings doesn't get the article twice.
    seen: set[str] = set()
    unique_attendees: list[TrainingRegistrationAttendee] = []
    for a in attendees:
        key = (a.email or "").strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        unique_attendees.append(a)

    user_result = await db.execute(select(User).where(User.id == current_user.user_id))
    user = user_result.scalar_one()
    sender_name = f"{user.first_name or ''} {user.last_name or ''}".strip() or (read_pii(user, "email") or "")

    emails_sent = 0
    for attendee in unique_attendees:
        sent = await send_direct_message_email(
            db,
            email=attendee.email or "",
            first_name=attendee.first_name or "",
            subject=article.title,
            body_html=article.body_html,
            conference_name="",  # template slot; trainings have no conference name
            conference_id=None,
            tenant_id=tenant_id,
            sender_name=sender_name,
        )
        if sent:
            emails_sent += 1

    return NewsArticleSendResponse(emails_sent=emails_sent)
