"""Portal news API endpoints for applicant-facing news articles."""

from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select, union_all

from app.core.applicant_dependencies import CurrentApplicantDep, DbSessionDep
from app.core.exceptions import NotFoundError
from app.models.associations import ConferenceCFP
from app.models.cfp import CFPCommitteeMember, CFPPaper
from app.models.conference import Conference
from app.models.news import NewsArticle
from app.schemas.news import PortalNewsArticle, PortalNewsListResponse

router = APIRouter()


async def _get_accessible_conference_ids(applicant_id: UUID, db, tenant_id: UUID) -> list[UUID]:
    """Resolve the set of conference IDs the applicant can access.

    An applicant has access to a conference if they:
      a) submitted a paper to a CFP linked to that conference, OR
      b) are a committee member for that conference.
    """
    # (a) Conferences via papers: applicant -> paper -> cfp -> conference_cfp -> conference
    paper_conf_q = (
        select(ConferenceCFP.conference_id)
        .join(CFPPaper, CFPPaper.cfp_id == ConferenceCFP.cfp_id)
        .where(CFPPaper.main_speaker_id == applicant_id)
    )

    # (b) Conferences via committee membership
    committee_conf_q = select(CFPCommitteeMember.conference_id).where(CFPCommitteeMember.applicant_id == applicant_id)

    # Union both sets
    combined = union_all(paper_conf_q, committee_conf_q).subquery()
    result = await db.execute(select(combined.c.conference_id).distinct())
    return list(result.scalars().all())


@router.get("/portal/news", response_model=PortalNewsListResponse)
async def list_portal_news(
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> PortalNewsListResponse:
    """List published news articles for conferences the applicant has access to."""
    applicant_id = current_applicant.applicant_id
    tenant_id = current_applicant.tenant_id

    conference_ids = await _get_accessible_conference_ids(applicant_id, db, tenant_id)

    if not conference_ids:
        return PortalNewsListResponse(items=[], total=0)

    # Query published articles joined with conference for the name
    query = (
        select(NewsArticle, Conference.name)
        .join(Conference, Conference.id == NewsArticle.conference_id)
        .where(
            NewsArticle.conference_id.in_(conference_ids),
            NewsArticle.is_published.is_(True),
        )
        .order_by(NewsArticle.published_at.desc())
    )

    result = await db.execute(query)
    rows = result.all()

    items = [
        PortalNewsArticle(
            id=article.id,
            conference_id=article.conference_id,
            conference_name=conf_name,
            title=article.title,
            body_html=article.body_html,
            published_at=article.published_at,
        )
        for article, conf_name in rows
    ]

    return PortalNewsListResponse(items=items, total=len(items))


@router.get("/portal/news/{article_id}", response_model=PortalNewsArticle)
async def get_portal_news_article(
    article_id: UUID,
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> PortalNewsArticle:
    """Get a single published news article.

    The article must be published and belong to a conference the applicant
    has access to (via papers or committee membership).
    """
    applicant_id = current_applicant.applicant_id
    tenant_id = current_applicant.tenant_id

    conference_ids = await _get_accessible_conference_ids(applicant_id, db, tenant_id)

    if not conference_ids:
        raise NotFoundError("News article not found")

    # Fetch the article joined with conference
    result = await db.execute(
        select(NewsArticle, Conference.name)
        .join(Conference, Conference.id == NewsArticle.conference_id)
        .where(
            NewsArticle.id == article_id,
            NewsArticle.is_published.is_(True),
            NewsArticle.conference_id.in_(conference_ids),
        )
    )
    row = result.one_or_none()

    if not row:
        raise NotFoundError("News article not found")

    article, conf_name = row

    return PortalNewsArticle(
        id=article.id,
        conference_id=article.conference_id,
        conference_name=conf_name,
        title=article.title,
        body_html=article.body_html,
        published_at=article.published_at,
    )
