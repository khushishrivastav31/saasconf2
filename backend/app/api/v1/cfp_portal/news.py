"""Portal news API endpoints for applicant-facing news articles."""

from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import or_, select, union_all

from app.core.applicant_dependencies import CurrentApplicantDep, DbSessionDep
from app.core.exceptions import NotFoundError
from app.core.security.pii_crypto import hash_email
from app.models.associations import ConferenceCFP
from app.models.cfp import CFPCommitteeMember, CFPPaper
from app.models.conference import Conference
from app.models.news import NEWS_DOMAIN_CONFERENCE, NEWS_DOMAIN_TRAINING, NewsArticle
from app.models.training_registration import TrainingRegistrationAttendee
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


async def _has_training_access(applicant_email: str, tenant_id: UUID, db) -> bool:
    """Does this applicant have any training-portal identity in the tenant?

    The unified portal links a CFPApplicant to TrainingRegistrationAttendee
    rows by ``email_hash`` (same identity rule as the seed). If at least one
    matching attendee row exists, the user is considered a trainings-portal
    user and gets training-domain news.
    """
    if not applicant_email:
        return False
    email_hash = hash_email(applicant_email)
    result = await db.execute(
        select(TrainingRegistrationAttendee.id)
        .where(
            TrainingRegistrationAttendee.tenant_id == tenant_id,
            TrainingRegistrationAttendee.email_hash == email_hash,
        )
        .limit(1)
    )
    return result.first() is not None


@router.get("/portal/news", response_model=PortalNewsListResponse)
async def list_portal_news(
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> PortalNewsListResponse:
    """List published news for the portal user.

    Surfaces:
      - Conference news for any conference the user can access (via
        papers or committee membership).
      - Training news (tenant-wide) when the user is a training-portal
        identity (any matching ``TrainingRegistrationAttendee`` in the
        tenant).
    """
    applicant_id = current_applicant.applicant_id
    tenant_id = current_applicant.tenant_id

    conference_ids = await _get_accessible_conference_ids(applicant_id, db, tenant_id)
    has_training = await _has_training_access(current_applicant.applicant.email or "", tenant_id, db)

    if not conference_ids and not has_training:
        return PortalNewsListResponse(items=[], total=0)

    # Build the union of (conference articles, training articles) in one
    # query so the FE gets a single sorted feed.
    filters = []
    if conference_ids:
        filters.append((NewsArticle.domain == NEWS_DOMAIN_CONFERENCE) & NewsArticle.conference_id.in_(conference_ids))
    if has_training:
        filters.append((NewsArticle.domain == NEWS_DOMAIN_TRAINING) & (NewsArticle.tenant_id == tenant_id))

    query = (
        select(NewsArticle, Conference.name)
        .outerjoin(Conference, Conference.id == NewsArticle.conference_id)
        .where(NewsArticle.is_published.is_(True), or_(*filters))
        .order_by(NewsArticle.published_at.desc())
    )

    result = await db.execute(query)
    rows = result.all()

    items = [
        PortalNewsArticle(
            id=article.id,
            conference_id=article.conference_id,
            conference_name=conf_name,
            domain=article.domain,
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

    The article must be published and either:
      - belong to a conference the applicant has access to, OR
      - be a training-domain article in a tenant where the applicant
        has a training-portal identity.
    """
    applicant_id = current_applicant.applicant_id
    tenant_id = current_applicant.tenant_id

    conference_ids = await _get_accessible_conference_ids(applicant_id, db, tenant_id)
    has_training = await _has_training_access(current_applicant.applicant.email or "", tenant_id, db)

    if not conference_ids and not has_training:
        raise NotFoundError("News article not found")

    filters = []
    if conference_ids:
        filters.append((NewsArticle.domain == NEWS_DOMAIN_CONFERENCE) & NewsArticle.conference_id.in_(conference_ids))
    if has_training:
        filters.append((NewsArticle.domain == NEWS_DOMAIN_TRAINING) & (NewsArticle.tenant_id == tenant_id))

    result = await db.execute(
        select(NewsArticle, Conference.name)
        .outerjoin(Conference, Conference.id == NewsArticle.conference_id)
        .where(
            NewsArticle.id == article_id,
            NewsArticle.is_published.is_(True),
            or_(*filters),
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
        domain=article.domain,
        title=article.title,
        body_html=article.body_html,
        published_at=article.published_at,
    )
