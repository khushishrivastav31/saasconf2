"""News article management endpoints (conference-scoped)."""

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    require_module,
)
from app.core.email import send_direct_message_email
from app.core.exceptions import NotFoundError
from app.core.security.pii_crypto import read_pii
from app.models.associations import ConferenceCFP
from app.models.cfp import CFPApplicant, CFPCommitteeMember, CFPPaper
from app.models.messaging import RecipientListMember
from app.models.news import NewsArticle
from app.models.user import User
from app.schemas.news import (
    NewsArticleCreate,
    NewsArticleListResponse,
    NewsArticleResponse,
    NewsArticleSendRequest,
    NewsArticleSendResponse,
    NewsArticleUpdate,
)
from app.services.conference import ConferenceService

MODULE_CODE = "news"

router = APIRouter(dependencies=[Depends(require_module(MODULE_CODE))])

svc = ConferenceService


def _build_response(
    article: NewsArticle,
    author_first_name: str | None = None,
    author_last_name: str | None = None,
) -> NewsArticleResponse:
    """Build a NewsArticleResponse from a NewsArticle model."""
    return NewsArticleResponse(
        id=article.id,
        tenant_id=article.tenant_id,
        conference_id=article.conference_id,
        title=article.title,
        body_html=article.body_html,
        is_published=article.is_published,
        published_at=article.published_at,
        author_first_name=author_first_name,
        author_last_name=author_last_name,
        created_at=article.created_at,
        updated_at=article.updated_at,
    )


async def _resolve_author(db, user_id: UUID | None) -> tuple[str | None, str | None]:
    """Resolve author first/last name from User table."""
    if not user_id:
        return None, None
    result = await db.execute(select(User.first_name, User.last_name).where(User.id == user_id))
    row = result.one_or_none()
    if not row:
        return None, None
    return row.first_name, row.last_name


@router.get("", response_model=NewsArticleListResponse)
async def list_articles(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> NewsArticleListResponse:
    """List all news articles for a conference. Admin sees drafts and published."""
    tenant_id = current_user.tenant_id
    await svc.resolve_conference(db, conference_id, tenant_id)

    # Single query with LEFT JOIN to resolve author names
    result = await db.execute(
        select(
            NewsArticle,
            User.first_name.label("author_first_name"),
            User.last_name.label("author_last_name"),
        )
        .outerjoin(User, User.id == NewsArticle.created_by)
        .where(
            NewsArticle.tenant_id == tenant_id,
            NewsArticle.conference_id == conference_id,
        )
        .order_by(NewsArticle.created_at.desc())
    )
    rows = result.all()

    items = [
        _build_response(
            article,
            author_first_name=author_first_name,
            author_last_name=author_last_name,
        )
        for article, author_first_name, author_last_name in rows
    ]

    return NewsArticleListResponse(items=items, total=len(items))


@router.post("", response_model=NewsArticleResponse, status_code=201)
async def create_article(
    conference_id: UUID,
    data: NewsArticleCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> NewsArticleResponse:
    """Create a new news article (draft by default)."""
    tenant_id = current_user.tenant_id
    await svc.resolve_conference(db, conference_id, tenant_id)
    await svc.require_admin(db, current_user, conference_id)

    article = NewsArticle(
        tenant_id=tenant_id,
        conference_id=conference_id,
        title=data.title,
        body_html=data.body_html,
        is_published=False,
        created_by=current_user.user_id,
    )

    await svc.create_resource(db, article)

    first_name, last_name = await _resolve_author(db, article.created_by)
    return _build_response(article, author_first_name=first_name, author_last_name=last_name)


@router.get("/{article_id}", response_model=NewsArticleResponse)
async def get_article(
    conference_id: UUID,
    article_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> NewsArticleResponse:
    """Get a single news article."""
    tenant_id = current_user.tenant_id

    article = await svc.get_resource(
        db,
        NewsArticle,
        article_id,
        conference_id=conference_id,
        tenant_id=tenant_id,
        label="News article",
    )

    first_name, last_name = await _resolve_author(db, article.created_by)
    return _build_response(article, author_first_name=first_name, author_last_name=last_name)


@router.put("/{article_id}", response_model=NewsArticleResponse)
async def update_article(
    conference_id: UUID,
    article_id: UUID,
    data: NewsArticleUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> NewsArticleResponse:
    """Update a news article."""
    tenant_id = current_user.tenant_id
    await svc.require_admin(db, current_user, conference_id)

    article = await svc.get_resource(
        db,
        NewsArticle,
        article_id,
        conference_id=conference_id,
        tenant_id=tenant_id,
        label="News article",
    )

    update_data = data.model_dump(exclude_unset=True)

    # Handle publish/unpublish transitions
    if "is_published" in update_data:
        if update_data["is_published"] and not article.is_published:
            update_data["published_at"] = datetime.now(UTC)
        elif not update_data["is_published"] and article.is_published:
            update_data["published_at"] = None

    await svc.update_resource(db, article, update_data)

    first_name, last_name = await _resolve_author(db, article.created_by)
    return _build_response(article, author_first_name=first_name, author_last_name=last_name)


@router.delete("/{article_id}")
async def delete_article(
    conference_id: UUID,
    article_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> dict:
    """Delete a news article."""
    tenant_id = current_user.tenant_id
    await svc.require_admin(db, current_user, conference_id)

    article = await svc.get_resource(
        db,
        NewsArticle,
        article_id,
        conference_id=conference_id,
        tenant_id=tenant_id,
        label="News article",
    )

    title = article.title
    await svc.delete_resource(db, article)

    return {"message": f"News article '{title}' deleted successfully"}


@router.post("/{article_id}/send", response_model=NewsArticleSendResponse)
async def send_article(
    conference_id: UUID,
    article_id: UUID,
    data: NewsArticleSendRequest,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> NewsArticleSendResponse:
    """Send a published news article as email to selected recipients."""
    tenant_id = current_user.tenant_id
    await svc.require_admin(db, current_user, conference_id)

    conference = await svc.resolve_conference(db, conference_id, tenant_id)

    # Fetch the article
    article = await svc.get_resource(
        db,
        NewsArticle,
        article_id,
        conference_id=conference_id,
        tenant_id=tenant_id,
        label="News article",
    )

    if not article.is_published:
        raise NotFoundError("Only published articles can be sent")

    # Resolve recipients
    applicant_ids: set[UUID] = set()

    # Subquery: CFP IDs linked to this conference
    conference_cfp_ids = select(ConferenceCFP.cfp_id).where(ConferenceCFP.conference_id == conference_id)

    if data.all_applicants:
        result = await db.execute(
            select(CFPPaper.main_speaker_id)
            .where(
                CFPPaper.tenant_id == tenant_id,
                CFPPaper.cfp_id.in_(conference_cfp_ids),
            )
            .distinct()
        )
        applicant_ids.update(row[0] for row in result.all())

    if data.paper_status:
        result = await db.execute(
            select(CFPPaper.main_speaker_id)
            .where(
                CFPPaper.tenant_id == tenant_id,
                CFPPaper.cfp_id.in_(conference_cfp_ids),
                CFPPaper.status == data.paper_status,
            )
            .distinct()
        )
        applicant_ids.update(row[0] for row in result.all())

    if data.committee_role:
        result = await db.execute(
            select(CFPCommitteeMember.applicant_id).where(
                CFPCommitteeMember.tenant_id == tenant_id,
                CFPCommitteeMember.conference_id == conference_id,
                CFPCommitteeMember.role == data.committee_role,
            )
        )
        applicant_ids.update(row[0] for row in result.all())

    if data.recipient_list_id:
        result = await db.execute(
            select(RecipientListMember.applicant_id).where(
                RecipientListMember.list_id == data.recipient_list_id,
            )
        )
        applicant_ids.update(row[0] for row in result.all())

    if data.applicant_ids:
        applicant_ids.update(data.applicant_ids)

    if not applicant_ids:
        raise NotFoundError("No recipients found matching the criteria")

    # Fetch applicant details for email sending
    result = await db.execute(
        select(CFPApplicant).where(
            CFPApplicant.id.in_(list(applicant_ids)),
            CFPApplicant.tenant_id == tenant_id,
        )
    )
    applicants = result.scalars().all()

    user_result = await db.execute(select(User).where(User.id == current_user.user_id))
    user = user_result.scalar_one()
    sender_name = f"{user.first_name or ''} {user.last_name or ''}".strip() or (read_pii(user, "email") or "")
    conference_name = conference.name or ""
    emails_sent = 0

    for applicant in applicants:
        sent = await send_direct_message_email(
            db,
            email=applicant.email,
            first_name=applicant.first_name or "",
            subject=article.title,
            body_html=article.body_html,
            conference_name=conference_name,
            conference_id=conference_id,
            tenant_id=current_user.tenant_id,
            sender_name=sender_name,
        )
        if sent:
            emails_sent += 1

    return NewsArticleSendResponse(emails_sent=emails_sent)
