"""CFP Applicant Portal - Conference and topic browsing endpoints."""

from datetime import date

from fastapi import APIRouter
from sqlalchemy import select

from app.core.applicant_dependencies import CurrentApplicantDep, DbSessionDep
from app.core.exceptions import NotFoundError
from app.models.associations import ConferenceCFP
from app.models.cfp import (
    CallForPapers,
    CFPTopic,
)
from app.models.conference import Conference
from app.models.settings import SessionType
from app.schemas.cfp_portal import (
    PortalCFPResponse,
    PortalConferenceDetailResponse,
    PortalConferenceSummary,
    PortalSessionTypeResponse,
    PortalTopicResponse,
)

router = APIRouter()


@router.get("/portal/topics", response_model=list[PortalTopicResponse])
async def list_portal_topics(
    current: CurrentApplicantDep,
    db: DbSessionDep,
) -> list[PortalTopicResponse]:
    """List all topics available for the current tenant."""
    result = await db.execute(select(CFPTopic).where(CFPTopic.tenant_id == current.tenant_id).order_by(CFPTopic.name))
    topics = list(result.scalars().all())
    return [PortalTopicResponse(id=t.id, name=t.name, description=t.description) for t in topics]


@router.get("/portal/conferences", response_model=list[PortalConferenceSummary])
async def list_conferences(
    current: CurrentApplicantDep,
    db: DbSessionDep,
) -> list[PortalConferenceSummary]:
    """List conferences with open CFPs for the tenant."""
    result = await db.execute(
        select(Conference)
        .where(Conference.tenant_id == current.tenant_id)
        .where(Conference.is_active == True)
        .order_by(Conference.start_date.desc().nulls_last())
    )
    conferences = result.scalars().all()

    # Batch-load all CFPs for all conferences (single query instead of N+1)
    conf_ids = [conf.id for conf in conferences]
    cfps_by_conf: dict = {cid: [] for cid in conf_ids}
    if conf_ids:
        cfp_result = await db.execute(
            select(ConferenceCFP.conference_id, CallForPapers)
            .join(CallForPapers, CallForPapers.id == ConferenceCFP.cfp_id)
            .where(ConferenceCFP.conference_id.in_(conf_ids))
        )
        for conference_id, cfp in cfp_result.all():
            cfps_by_conf[conference_id].append(cfp)

    # Check registration status per conference (matched by email)
    from app.models.registration import Registration, RegistrationStatus

    user_email = (current.applicant.email or "").lower()
    registered_conf_ids: set = set()
    if conf_ids:
        reg_result = await db.execute(
            select(Registration.conference_id)
            .where(
                Registration.tenant_id == current.tenant_id,
                Registration.email == user_email,
                Registration.conference_id.in_(conf_ids),
                Registration.status != RegistrationStatus.CANCELLED.value,
            )
            .distinct()
        )
        registered_conf_ids = set(reg_result.scalars().all())

    # Check speaker status per conference (has accepted/confirmed papers)
    speaker_conf_ids: set = set()
    if conf_ids:
        from app.models.cfp_papers import CFPPaper

        speaker_result = await db.execute(
            select(ConferenceCFP.conference_id)
            .join(CFPPaper, CFPPaper.cfp_id == ConferenceCFP.cfp_id)
            .where(
                CFPPaper.main_speaker_id == current.applicant_id,
                ConferenceCFP.conference_id.in_(conf_ids),
                CFPPaper.status == "accepted",
            )
            .distinct()
        )
        speaker_conf_ids = set(speaker_result.scalars().all())

    today = date.today()
    items = []
    for conf in conferences:
        # Determine if public registration is currently open
        portal_settings = (conf.settings or {}).get("public_registration_portal", {})
        reg_open = False
        if portal_settings.get("enabled"):
            reg_start = portal_settings.get("registration_start_date")
            reg_end = portal_settings.get("registration_end_date")
            start_ok = reg_start is None or date.fromisoformat(reg_start) <= today
            end_ok = reg_end is None or today <= date.fromisoformat(reg_end)
            reg_open = start_ok and end_ok

        items.append(
            PortalConferenceSummary(
                id=conf.id,
                name=conf.name,
                abbreviation=conf.abbreviation,
                description=conf.description,
                start_date=conf.start_date,
                end_date=conf.end_date,
                city=conf.city,
                country=conf.country,
                venue_type=conf.venue_type,
                logo_url=conf.logo_url,
                cfps=[PortalCFPResponse.model_validate(cfp) for cfp in cfps_by_conf.get(conf.id, [])],
                registration_open=reg_open,
                is_registered=conf.id in registered_conf_ids,
                is_speaker=conf.id in speaker_conf_ids,
                expenses_enabled=(conf.settings or {}).get("speaker_expenses", {}).get("expenses_enabled", False),
            )
        )

    return items


@router.get("/portal/conferences/{conference_id}", response_model=PortalConferenceDetailResponse)
async def get_conference_detail(
    conference_id: str,
    current: CurrentApplicantDep,
    db: DbSessionDep,
) -> PortalConferenceDetailResponse:
    """Get conference details with session types for paper submission."""
    result = await db.execute(
        select(Conference).where(
            Conference.id == conference_id,
            Conference.tenant_id == current.tenant_id,
        )
    )
    conference = result.scalar_one_or_none()
    if not conference:
        raise NotFoundError("Conference not found")

    # Load CFPs
    cfp_result = await db.execute(
        select(CallForPapers)
        .join(ConferenceCFP, ConferenceCFP.cfp_id == CallForPapers.id)
        .where(ConferenceCFP.conference_id == conference.id)
    )
    cfps = cfp_result.scalars().all()

    # Load session types
    st_result = await db.execute(
        select(SessionType).where(
            SessionType.conference_id == conference.id,
            SessionType.is_active == True,
            SessionType.cfp_eligible == True,
        )
    )
    session_types = st_result.scalars().all()

    return PortalConferenceDetailResponse(
        id=conference.id,
        name=conference.name,
        abbreviation=conference.abbreviation,
        cfps=[PortalCFPResponse.model_validate(cfp) for cfp in cfps],
        session_types=[PortalSessionTypeResponse.model_validate(st) for st in session_types],
    )
