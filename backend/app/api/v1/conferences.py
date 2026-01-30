"""Conference management endpoints."""

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, literal, select

from app.api.v1.service_providers import build_service_provider_response
from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    TenantAdminDep,
    get_client_ip,
    require_module,
)
from app.core.exceptions import NotFoundError, ValidationError
from app.core.pagination import paginate
from app.models.associations import ConferenceCFP, ConferenceLocation, ConferenceVolunteer
from app.models.audit import AuditAction, AuditLog
from app.models.cfp import CallForPapers
from app.models.conference import Conference
from app.models.location import Location
from app.models.service_provider import ServiceProvider
from app.models.volunteer import Volunteer
from app.schemas.cfp import CFPListResponse, CFPResponse
from app.schemas.conference import (
    ConferenceAssociationRequest,
    ConferenceCreate,
    ConferenceListResponse,
    ConferenceResponse,
    ConferenceStats,
    ConferenceUpdate,
    TeamMember,
)
from app.schemas.location import LocationListResponse, LocationResponse
from app.schemas.service_provider import (
    ServiceProviderCreate,
    ServiceProviderListResponse,
    ServiceProviderResponse,
    ServiceProviderUpdate,
)
from app.schemas.volunteer import VolunteerListResponse, VolunteerResponse

router = APIRouter()

MODULE_CODE = "conferences"


def _tenant_filter(current_user: CurrentUserDep):
    """Return a tenant filter clause. Super admins bypass the filter."""
    if current_user.is_super_admin:
        return literal(True)
    return Conference.tenant_id == current_user.tenant_id


def _build_conference_response(conf: Conference) -> ConferenceResponse:
    """Build a ConferenceResponse from a Conference model."""
    # Calculate status
    today = date.today()
    if not conf.start_date:
        status = "draft"
    elif conf.start_date > today:
        status = "upcoming"
    elif conf.end_date and conf.end_date < today:
        status = "past"
    elif conf.start_date <= today <= (conf.end_date or conf.start_date):
        status = "ongoing"
    else:
        status = "draft"

    # Parse team members
    team_members = []
    for tm in (conf.team_members or []):
        team_members.append(TeamMember(
            user_id=tm.get("user_id"),
            first_name=tm.get("first_name", ""),
            last_name=tm.get("last_name", ""),
            email=tm.get("email"),
            phone=tm.get("phone"),
            role=tm.get("role"),
            is_manager=tm.get("is_manager", False),
        ))

    managers_count = sum(1 for tm in team_members if tm.is_manager)

    return ConferenceResponse(
        id=conf.id,
        tenant_id=conf.tenant_id,
        name=conf.name,
        abbreviation=conf.abbreviation,
        description=conf.description,
        website=conf.website,
        logo_url=conf.logo_url,
        start_date=conf.start_date,
        end_date=conf.end_date,
        venue_name=conf.venue_name,
        venue_address=conf.venue_address,
        city=conf.city,
        country=conf.country,
        timezone=conf.timezone,
        venue_type=conf.venue_type,
        virtual_platform_url=conf.virtual_platform_url,
        social_links=conf.social_links or {},
        team_members=team_members,
        settings=conf.settings or {},
        is_active=conf.is_active,
        is_published=conf.is_published,
        created_at=conf.created_at,
        updated_at=conf.updated_at,
        managers_count=managers_count,
        team_count=len(team_members),
        status=status,
    )


@router.get("", response_model=ConferenceListResponse, dependencies=[Depends(require_module(MODULE_CODE))])
async def list_conferences(
    current_user: CurrentUserDep,
    db: DbSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = None,
    search: str | None = None,
    is_active: bool | None = None,
) -> ConferenceListResponse:
    """
    List conferences for the current tenant.

    Requires the 'conferences' module.
    """
    query = select(Conference).where(_tenant_filter(current_user))

    if is_active is not None:
        query = query.where(Conference.is_active == is_active)

    if search:
        search_filter = (
            Conference.name.ilike(f"%{search}%")
            | Conference.abbreviation.ilike(f"%{search}%")
            | Conference.city.ilike(f"%{search}%")
        )
        query = query.where(search_filter)

    # Filter by status (requires date filtering)
    if status:
        today = date.today()
        if status == "upcoming":
            query = query.where(Conference.start_date > today)
        elif status == "ongoing":
            query = query.where(
                (Conference.start_date <= today) &
                ((Conference.end_date >= today) | (Conference.end_date.is_(None)))
            )
        elif status == "past":
            query = query.where(Conference.end_date < today)
        elif status == "draft":
            query = query.where(Conference.start_date.is_(None))

    query = query.order_by(Conference.start_date.desc().nulls_last(), Conference.created_at.desc())
    result = await paginate(db, query, page, page_size)

    items = [_build_conference_response(conf) for conf in result.items]

    pages = (result.total + page_size - 1) // page_size if page_size > 0 else 0

    return ConferenceListResponse(
        items=items,
        total=result.total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


@router.post("", response_model=ConferenceResponse, status_code=201, dependencies=[Depends(require_module(MODULE_CODE))])
async def create_conference(
    conference_data: ConferenceCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> ConferenceResponse:
    """
    Create a new conference.

    Requires the 'conferences' module.
    """

    if not current_user.tenant_id:
        raise ValidationError("A tenant context is required to create a conference")

    # Create conference
    conference = Conference(
        tenant_id=current_user.tenant_id,
        name=conference_data.name,
        abbreviation=conference_data.abbreviation,
        description=conference_data.description,
        website=conference_data.website,
        logo_url=conference_data.logo_url,
        start_date=conference_data.start_date,
        end_date=conference_data.end_date,
        venue_name=conference_data.venue_name,
        venue_address=conference_data.venue_address,
        city=conference_data.city,
        country=conference_data.country,
        timezone=conference_data.timezone,
        venue_type=conference_data.venue_type,
        virtual_platform_url=conference_data.virtual_platform_url,
        social_links=conference_data.social_links.model_dump() if conference_data.social_links else {},
        team_members=[tm.model_dump() for tm in conference_data.team_members] if conference_data.team_members else [],
        settings=conference_data.settings,
    )
    db.add(conference)

    # Log action
    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action=AuditAction.CONFERENCE_CREATE,
        resource_type="conference",
        resource_id=conference.id,
        details={"name": conference.name, "abbreviation": conference.abbreviation},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(conference)

    return _build_conference_response(conference)


@router.get("/stats", response_model=ConferenceStats, dependencies=[Depends(require_module(MODULE_CODE))])
async def get_conference_stats(
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> ConferenceStats:
    """
    Get conference statistics for the current tenant.

    Requires the 'conferences' module.
    """

    today = date.today()

    # Total conferences
    total = (await db.execute(
        select(func.count()).select_from(Conference).where(_tenant_filter(current_user))
    )).scalar() or 0

    # Active conferences
    active = (await db.execute(
        select(func.count()).select_from(Conference)
        .where(_tenant_filter(current_user))
        .where(Conference.is_active == True)
    )).scalar() or 0

    # Published conferences
    published = (await db.execute(
        select(func.count()).select_from(Conference)
        .where(_tenant_filter(current_user))
        .where(Conference.is_published == True)
    )).scalar() or 0

    # Upcoming conferences
    upcoming = (await db.execute(
        select(func.count()).select_from(Conference)
        .where(_tenant_filter(current_user))
        .where(Conference.start_date > today)
    )).scalar() or 0

    # Ongoing conferences
    ongoing = (await db.execute(
        select(func.count()).select_from(Conference)
        .where(_tenant_filter(current_user))
        .where(Conference.start_date <= today)
        .where((Conference.end_date >= today) | (Conference.end_date.is_(None)))
    )).scalar() or 0

    # Past conferences
    past = (await db.execute(
        select(func.count()).select_from(Conference)
        .where(_tenant_filter(current_user))
        .where(Conference.end_date < today)
    )).scalar() or 0

    return ConferenceStats(
        total=total,
        active=active,
        published=published,
        upcoming=upcoming,
        ongoing=ongoing,
        past=past,
    )


@router.get("/{conference_id}", response_model=ConferenceResponse, dependencies=[Depends(require_module(MODULE_CODE))])
async def get_conference(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> ConferenceResponse:
    """
    Get a conference by ID.

    Requires the 'conferences' module.
    """

    result = await db.execute(
        select(Conference)
        .where(Conference.id == conference_id)
        .where(_tenant_filter(current_user))
    )
    conference = result.scalar_one_or_none()

    if not conference:
        raise NotFoundError("Conference not found")

    return _build_conference_response(conference)


@router.put("/{conference_id}", response_model=ConferenceResponse, dependencies=[Depends(require_module(MODULE_CODE))])
async def update_conference(
    conference_id: UUID,
    conference_data: ConferenceUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> ConferenceResponse:
    """
    Update a conference.

    Requires the 'conferences' module.
    """

    result = await db.execute(
        select(Conference)
        .where(Conference.id == conference_id)
        .where(_tenant_filter(current_user))
    )
    conference = result.scalar_one_or_none()

    if not conference:
        raise NotFoundError("Conference not found")

    # Update fields that are provided
    update_data = conference_data.model_dump(exclude_unset=True)

    # Handle special fields
    if "social_links" in update_data and update_data["social_links"] is not None:
        update_data["social_links"] = update_data["social_links"].model_dump() if hasattr(update_data["social_links"], "model_dump") else update_data["social_links"]

    if "team_members" in update_data and update_data["team_members"] is not None:
        update_data["team_members"] = [
            tm.model_dump() if hasattr(tm, "model_dump") else tm
            for tm in update_data["team_members"]
        ]

    for field, value in update_data.items():
        setattr(conference, field, value)

    # Log action
    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action=AuditAction.CONFERENCE_UPDATE,
        resource_type="conference",
        resource_id=conference.id,
        details={"updated_fields": list(update_data.keys())},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(conference)

    return _build_conference_response(conference)


@router.delete("/{conference_id}", dependencies=[Depends(require_module(MODULE_CODE))])
async def delete_conference(
    conference_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """
    Delete a conference and all exclusively-linked entities.

    Entities (volunteers, locations, CFPs) that are ONLY linked to this
    conference are deleted. Entities also linked to other conferences are
    simply unlinked (handled by CASCADE on junction tables).

    Requires the 'conferences' module.
    """

    result = await db.execute(
        select(Conference)
        .where(Conference.id == conference_id)
        .where(_tenant_filter(current_user))
    )
    conference = result.scalar_one_or_none()

    if not conference:
        raise NotFoundError("Conference not found")

    conference_name = conference.name

    # --- Find entities exclusively linked to this conference ---

    # Volunteers only in this conference
    exclusive_vol_ids_q = (
        select(ConferenceVolunteer.volunteer_id)
        .where(ConferenceVolunteer.conference_id == conference_id)
        .where(
            ~ConferenceVolunteer.volunteer_id.in_(
                select(ConferenceVolunteer.volunteer_id)
                .where(ConferenceVolunteer.conference_id != conference_id)
            )
        )
    )
    exclusive_vols = (await db.execute(exclusive_vol_ids_q)).scalars().all()

    # Locations only in this conference
    exclusive_loc_ids_q = (
        select(ConferenceLocation.location_id)
        .where(ConferenceLocation.conference_id == conference_id)
        .where(
            ~ConferenceLocation.location_id.in_(
                select(ConferenceLocation.location_id)
                .where(ConferenceLocation.conference_id != conference_id)
            )
        )
    )
    exclusive_locs = (await db.execute(exclusive_loc_ids_q)).scalars().all()

    # CFPs only in this conference
    exclusive_cfp_ids_q = (
        select(ConferenceCFP.cfp_id)
        .where(ConferenceCFP.conference_id == conference_id)
        .where(
            ~ConferenceCFP.cfp_id.in_(
                select(ConferenceCFP.cfp_id)
                .where(ConferenceCFP.conference_id != conference_id)
            )
        )
    )
    exclusive_cfps = (await db.execute(exclusive_cfp_ids_q)).scalars().all()

    # --- Delete exclusive entities ---
    deleted_volunteers = 0
    deleted_locations = 0
    deleted_cfps = 0

    if exclusive_vols:
        vols_result = await db.execute(
            select(Volunteer).where(Volunteer.id.in_(exclusive_vols))
        )
        for vol in vols_result.scalars().all():
            await db.delete(vol)
            deleted_volunteers += 1

    if exclusive_locs:
        locs_result = await db.execute(
            select(Location).where(Location.id.in_(exclusive_locs))
        )
        for loc in locs_result.scalars().all():
            await db.delete(loc)
            deleted_locations += 1

    if exclusive_cfps:
        cfps_result = await db.execute(
            select(CallForPapers).where(CallForPapers.id.in_(exclusive_cfps))
        )
        for cfp in cfps_result.scalars().all():
            await db.delete(cfp)
            deleted_cfps += 1

    # --- Audit log ---
    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action=AuditAction.CONFERENCE_DELETE,
        resource_type="conference",
        resource_id=conference.id,
        details={
            "name": conference_name,
            "deleted_volunteers": deleted_volunteers,
            "deleted_locations": deleted_locations,
            "deleted_cfps": deleted_cfps,
        },
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    # Delete the conference (junction rows cascade-delete automatically)
    await db.delete(conference)
    await db.commit()

    return {
        "message": f"Conference '{conference_name}' deleted successfully",
        "deleted_volunteers": deleted_volunteers,
        "deleted_locations": deleted_locations,
        "deleted_cfps": deleted_cfps,
    }


@router.get("/{conference_id}/delete-preview", dependencies=[Depends(require_module(MODULE_CODE))])
async def delete_conference_preview(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> dict:
    """
    Preview what will be deleted when a conference is removed.

    Returns counts of exclusively-linked entities that will be deleted,
    plus counts of shared entities that will only be unlinked.
    """

    result = await db.execute(
        select(Conference)
        .where(Conference.id == conference_id)
        .where(_tenant_filter(current_user))
    )
    conference = result.scalar_one_or_none()
    if not conference:
        raise NotFoundError("Conference not found")

    # Total linked counts
    total_vols = (await db.execute(
        select(func.count()).where(ConferenceVolunteer.conference_id == conference_id)
    )).scalar() or 0
    total_locs = (await db.execute(
        select(func.count()).where(ConferenceLocation.conference_id == conference_id)
    )).scalar() or 0
    total_cfps = (await db.execute(
        select(func.count()).where(ConferenceCFP.conference_id == conference_id)
    )).scalar() or 0

    # Exclusively-linked counts (will be deleted)
    exclusive_vols = (await db.execute(
        select(func.count()).select_from(
            select(ConferenceVolunteer.volunteer_id)
            .where(ConferenceVolunteer.conference_id == conference_id)
            .where(
                ~ConferenceVolunteer.volunteer_id.in_(
                    select(ConferenceVolunteer.volunteer_id)
                    .where(ConferenceVolunteer.conference_id != conference_id)
                )
            )
            .subquery()
        )
    )).scalar() or 0

    exclusive_locs = (await db.execute(
        select(func.count()).select_from(
            select(ConferenceLocation.location_id)
            .where(ConferenceLocation.conference_id == conference_id)
            .where(
                ~ConferenceLocation.location_id.in_(
                    select(ConferenceLocation.location_id)
                    .where(ConferenceLocation.conference_id != conference_id)
                )
            )
            .subquery()
        )
    )).scalar() or 0

    exclusive_cfps = (await db.execute(
        select(func.count()).select_from(
            select(ConferenceCFP.cfp_id)
            .where(ConferenceCFP.conference_id == conference_id)
            .where(
                ~ConferenceCFP.cfp_id.in_(
                    select(ConferenceCFP.cfp_id)
                    .where(ConferenceCFP.conference_id != conference_id)
                )
            )
            .subquery()
        )
    )).scalar() or 0

    return {
        "conference_name": conference.name,
        "volunteers": {"total_linked": total_vols, "will_delete": exclusive_vols, "will_unlink": total_vols - exclusive_vols},
        "locations": {"total_linked": total_locs, "will_delete": exclusive_locs, "will_unlink": total_locs - exclusive_locs},
        "cfps": {"total_linked": total_cfps, "will_delete": exclusive_cfps, "will_unlink": total_cfps - exclusive_cfps},
    }


@router.post("/{conference_id}/publish", response_model=ConferenceResponse, dependencies=[Depends(require_module(MODULE_CODE))])
async def publish_conference(
    conference_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> ConferenceResponse:
    """
    Publish a conference (make it visible).

    Requires the 'conferences' module.
    """

    result = await db.execute(
        select(Conference)
        .where(Conference.id == conference_id)
        .where(_tenant_filter(current_user))
    )
    conference = result.scalar_one_or_none()

    if not conference:
        raise NotFoundError("Conference not found")

    conference.is_published = True

    # Log action
    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action=AuditAction.CONFERENCE_UPDATE,
        resource_type="conference",
        resource_id=conference.id,
        details={"action": "publish"},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(conference)

    return _build_conference_response(conference)


@router.post("/{conference_id}/unpublish", response_model=ConferenceResponse, dependencies=[Depends(require_module(MODULE_CODE))])
async def unpublish_conference(
    conference_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> ConferenceResponse:
    """
    Unpublish a conference (hide it).

    Requires the 'conferences' module.
    """

    result = await db.execute(
        select(Conference)
        .where(Conference.id == conference_id)
        .where(_tenant_filter(current_user))
    )
    conference = result.scalar_one_or_none()

    if not conference:
        raise NotFoundError("Conference not found")

    conference.is_published = False

    # Log action
    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action=AuditAction.CONFERENCE_UPDATE,
        resource_type="conference",
        resource_id=conference.id,
        details={"action": "unpublish"},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(conference)

    return _build_conference_response(conference)


# ---------------------------------------------------------------------------
# Helper functions for association endpoints
# ---------------------------------------------------------------------------


async def _get_conference_for_tenant(
    conference_id: UUID, tenant_id: UUID, db: DbSessionDep
) -> Conference:
    """Fetch a conference and verify it belongs to the tenant."""
    result = await db.execute(
        select(Conference)
        .where(Conference.id == conference_id)
        .where(Conference.tenant_id == tenant_id)
    )
    conference = result.scalar_one_or_none()
    if not conference:
        raise NotFoundError("Conference not found")
    return conference


def _build_volunteer_response(
    v: Volunteer, conference_ids: list[UUID] | None = None
) -> VolunteerResponse:
    """Build a VolunteerResponse from a Volunteer model."""
    return VolunteerResponse(
        id=v.id,
        tenant_id=v.tenant_id,
        email=v.email,
        first_name=v.first_name,
        last_name=v.last_name,
        full_name=v.full_name,
        phone=v.phone,
        status=v.status,
        role=v.role,
        skills=v.skills,
        availability=v.availability,
        notes=v.notes,
        emergency_contact_name=v.emergency_contact_name,
        emergency_contact_phone=v.emergency_contact_phone,
        tshirt_size=v.tshirt_size,
        application_date=v.application_date,
        approved_date=v.approved_date,
        total_hours=v.total_hours,
        created_at=v.created_at,
        updated_at=v.updated_at,
        conference_ids=conference_ids or [],
    )


def _build_location_response_assoc(
    loc: Location, conference_ids: list[UUID] | None = None
) -> LocationResponse:
    """Build a LocationResponse from a Location model."""
    return LocationResponse(
        id=loc.id,
        tenant_id=loc.tenant_id,
        parent_id=loc.parent_id,
        name=loc.name,
        code=loc.code,
        location_type=loc.location_type,
        description=loc.description,
        capacity=loc.capacity,
        address_line1=loc.address_line1,
        address_line2=loc.address_line2,
        city=loc.city,
        state=loc.state,
        postal_code=loc.postal_code,
        country=loc.country,
        full_address=loc.full_address,
        latitude=loc.latitude,
        longitude=loc.longitude,
        building=loc.building,
        floor=loc.floor,
        phone=loc.phone,
        website=loc.website,
        vat_number=loc.vat_number,
        amenities=loc.amenities,
        accessibility_features=loc.accessibility_features,
        virtual_url=loc.virtual_url,
        virtual_platform=loc.virtual_platform,
        is_active=loc.is_active,
        settings=loc.settings,
        contact_persons=loc.contact_persons or [],
        created_at=loc.created_at,
        updated_at=loc.updated_at,
        conference_ids=conference_ids or [],
    )


def _build_cfp_response(
    cfp: CallForPapers, conference_ids: list[UUID] | None = None, submission_count: int = 0
) -> CFPResponse:
    """Build a CFPResponse from a CallForPapers model."""
    return CFPResponse(
        id=cfp.id,
        tenant_id=cfp.tenant_id,
        title=cfp.title,
        description=cfp.description,
        status=cfp.status,
        open_date=cfp.open_date,
        close_date=cfp.close_date,
        notification_date=cfp.notification_date,
        program_announcement_date=cfp.program_announcement_date,
        max_submissions_per_speaker=cfp.max_submissions_per_speaker,
        required_speaker_fields=cfp.required_speaker_fields,
        required_paper_fields=cfp.required_paper_fields,
        is_anonymous_review=cfp.is_anonymous_review,
        reviewers_per_paper=cfp.reviewers_per_paper,
        allowed_formats=cfp.allowed_formats,
        tracks=cfp.tracks,
        custom_fields=cfp.custom_fields,
        settings=cfp.settings,
        code_of_conduct=cfp.code_of_conduct,
        incentives_conditions=cfp.incentives_conditions,
        tips_for_submission=cfp.tips_for_submission,
        guidelines_for_submissions=cfp.guidelines_for_submissions,
        faqs=cfp.faqs,
        submission_count=submission_count,
        created_at=cfp.created_at,
        updated_at=cfp.updated_at,
        conference_ids=conference_ids or [],
    )


# ---------------------------------------------------------------------------
# Conference <-> Volunteer association endpoints
# ---------------------------------------------------------------------------


@router.get("/{conference_id}/volunteers", response_model=VolunteerListResponse, dependencies=[Depends(require_module(MODULE_CODE))])
async def list_conference_volunteers(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> VolunteerListResponse:
    """List volunteers linked to a conference."""
    await _get_conference_for_tenant(conference_id, current_user.tenant_id, db)

    query = (
        select(Volunteer)
        .join(ConferenceVolunteer, ConferenceVolunteer.volunteer_id == Volunteer.id)
        .where(ConferenceVolunteer.conference_id == conference_id)
        .where(Volunteer.tenant_id == current_user.tenant_id)
    )

    query = query.order_by(Volunteer.created_at.desc())
    result = await paginate(db, query, page, page_size)
    volunteers = result.items

    # Batch-query conference_ids
    vol_ids = [v.id for v in volunteers]
    conf_ids_map: dict[UUID, list[UUID]] = {vid: [] for vid in vol_ids}
    if vol_ids:
        assoc_result = await db.execute(
            select(ConferenceVolunteer.volunteer_id, ConferenceVolunteer.conference_id)
            .where(ConferenceVolunteer.volunteer_id.in_(vol_ids))
        )
        for row in assoc_result:
            conf_ids_map[row.volunteer_id].append(row.conference_id)

    items = [_build_volunteer_response(v, conf_ids_map.get(v.id, [])) for v in volunteers]
    pages = (result.total + page_size - 1) // page_size if page_size > 0 else 0

    return VolunteerListResponse(
        items=items,
        total=result.total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


@router.post("/{conference_id}/volunteers", status_code=201, dependencies=[Depends(require_module(MODULE_CODE))])
async def link_volunteer_to_conference(
    conference_id: UUID,
    body: ConferenceAssociationRequest,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Link an existing volunteer to a conference."""

    await _get_conference_for_tenant(conference_id, current_user.tenant_id, db)

    vol_result = await db.execute(
        select(Volunteer)
        .where(Volunteer.id == body.id)
        .where(Volunteer.tenant_id == current_user.tenant_id)
    )
    if not vol_result.scalar_one_or_none():
        raise NotFoundError("Volunteer not found")

    existing = await db.execute(
        select(ConferenceVolunteer)
        .where(ConferenceVolunteer.conference_id == conference_id)
        .where(ConferenceVolunteer.volunteer_id == body.id)
    )
    if existing.scalar_one_or_none():
        raise ValidationError("Volunteer is already linked to this conference")

    db.add(ConferenceVolunteer(conference_id=conference_id, volunteer_id=body.id))
    db.add(AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action=AuditAction.CONFERENCE_LINK_VOLUNTEER,
        resource_type="conference",
        resource_id=conference_id,
        details={"volunteer_id": str(body.id)},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    ))

    await db.commit()
    return {"message": "Volunteer linked to conference"}


@router.delete("/{conference_id}/volunteers/{volunteer_id}", dependencies=[Depends(require_module(MODULE_CODE))])
async def unlink_volunteer_from_conference(
    conference_id: UUID,
    volunteer_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Unlink a volunteer from a conference. Blocked if it's the volunteer's only conference."""

    await _get_conference_for_tenant(conference_id, current_user.tenant_id, db)

    result = await db.execute(
        select(ConferenceVolunteer)
        .where(ConferenceVolunteer.conference_id == conference_id)
        .where(ConferenceVolunteer.volunteer_id == volunteer_id)
    )
    assoc = result.scalar_one_or_none()
    if not assoc:
        raise NotFoundError("Volunteer is not linked to this conference")

    count = (await db.execute(
        select(func.count())
        .select_from(ConferenceVolunteer)
        .where(ConferenceVolunteer.volunteer_id == volunteer_id)
    )).scalar() or 0

    if count <= 1:
        raise ValidationError("Cannot unlink: this is the volunteer's only conference")

    await db.delete(assoc)
    db.add(AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action=AuditAction.CONFERENCE_UNLINK_VOLUNTEER,
        resource_type="conference",
        resource_id=conference_id,
        details={"volunteer_id": str(volunteer_id)},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    ))

    await db.commit()
    return {"message": "Volunteer unlinked from conference"}


# ---------------------------------------------------------------------------
# Conference <-> Location association endpoints
# ---------------------------------------------------------------------------


@router.get("/{conference_id}/locations", response_model=LocationListResponse, dependencies=[Depends(require_module(MODULE_CODE))])
async def list_conference_locations(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> LocationListResponse:
    """List locations linked to a conference."""
    await _get_conference_for_tenant(conference_id, current_user.tenant_id, db)

    query = (
        select(Location)
        .join(ConferenceLocation, ConferenceLocation.location_id == Location.id)
        .where(ConferenceLocation.conference_id == conference_id)
        .where(Location.tenant_id == current_user.tenant_id)
    )

    query = query.order_by(Location.created_at.desc())
    result = await paginate(db, query, page, page_size)
    locations = result.items

    loc_ids = [loc.id for loc in locations]
    conf_ids_map: dict[UUID, list[UUID]] = {lid: [] for lid in loc_ids}
    if loc_ids:
        assoc_result = await db.execute(
            select(ConferenceLocation.location_id, ConferenceLocation.conference_id)
            .where(ConferenceLocation.location_id.in_(loc_ids))
        )
        for row in assoc_result:
            conf_ids_map[row.location_id].append(row.conference_id)

    items = [_build_location_response_assoc(loc, conf_ids_map.get(loc.id, [])) for loc in locations]
    pages = (result.total + page_size - 1) // page_size if page_size > 0 else 0

    return LocationListResponse(
        items=items,
        total=result.total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


@router.post("/{conference_id}/locations", status_code=201, dependencies=[Depends(require_module(MODULE_CODE))])
async def link_location_to_conference(
    conference_id: UUID,
    body: ConferenceAssociationRequest,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Link an existing location to a conference."""

    await _get_conference_for_tenant(conference_id, current_user.tenant_id, db)

    loc_result = await db.execute(
        select(Location)
        .where(Location.id == body.id)
        .where(Location.tenant_id == current_user.tenant_id)
    )
    if not loc_result.scalar_one_or_none():
        raise NotFoundError("Location not found")

    existing = await db.execute(
        select(ConferenceLocation)
        .where(ConferenceLocation.conference_id == conference_id)
        .where(ConferenceLocation.location_id == body.id)
    )
    if existing.scalar_one_or_none():
        raise ValidationError("Location is already linked to this conference")

    db.add(ConferenceLocation(conference_id=conference_id, location_id=body.id))
    db.add(AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action=AuditAction.CONFERENCE_LINK_LOCATION,
        resource_type="conference",
        resource_id=conference_id,
        details={"location_id": str(body.id)},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    ))

    await db.commit()
    return {"message": "Location linked to conference"}


@router.delete("/{conference_id}/locations/{location_id}", dependencies=[Depends(require_module(MODULE_CODE))])
async def unlink_location_from_conference(
    conference_id: UUID,
    location_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Unlink a location from a conference. Blocked if it's the location's only conference."""

    await _get_conference_for_tenant(conference_id, current_user.tenant_id, db)

    result = await db.execute(
        select(ConferenceLocation)
        .where(ConferenceLocation.conference_id == conference_id)
        .where(ConferenceLocation.location_id == location_id)
    )
    assoc = result.scalar_one_or_none()
    if not assoc:
        raise NotFoundError("Location is not linked to this conference")

    count = (await db.execute(
        select(func.count())
        .select_from(ConferenceLocation)
        .where(ConferenceLocation.location_id == location_id)
    )).scalar() or 0

    if count <= 1:
        raise ValidationError("Cannot unlink: this is the location's only conference")

    await db.delete(assoc)
    db.add(AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action=AuditAction.CONFERENCE_UNLINK_LOCATION,
        resource_type="conference",
        resource_id=conference_id,
        details={"location_id": str(location_id)},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    ))

    await db.commit()
    return {"message": "Location unlinked from conference"}


# ---------------------------------------------------------------------------
# Conference <-> CFP association endpoints
# ---------------------------------------------------------------------------


@router.get("/{conference_id}/cfps", response_model=CFPListResponse, dependencies=[Depends(require_module(MODULE_CODE))])
async def list_conference_cfps(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> CFPListResponse:
    """List CFPs linked to a conference."""
    await _get_conference_for_tenant(conference_id, current_user.tenant_id, db)

    query = (
        select(CallForPapers)
        .join(ConferenceCFP, ConferenceCFP.cfp_id == CallForPapers.id)
        .where(ConferenceCFP.conference_id == conference_id)
        .where(CallForPapers.tenant_id == current_user.tenant_id)
    )

    query = query.order_by(CallForPapers.created_at.desc())
    result = await paginate(db, query, page, page_size)
    cfps = result.items

    cfp_ids = [c.id for c in cfps]
    conf_ids_map: dict[UUID, list[UUID]] = {cid: [] for cid in cfp_ids}
    if cfp_ids:
        assoc_result = await db.execute(
            select(ConferenceCFP.cfp_id, ConferenceCFP.conference_id)
            .where(ConferenceCFP.cfp_id.in_(cfp_ids))
        )
        for row in assoc_result:
            conf_ids_map[row.cfp_id].append(row.conference_id)

    # Batch-query submission counts
    from app.models.cfp import Submission
    sub_counts: dict[UUID, int] = {cid: 0 for cid in cfp_ids}
    if cfp_ids:
        sub_result = await db.execute(
            select(Submission.cfp_id, func.count())
            .where(Submission.cfp_id.in_(cfp_ids))
            .group_by(Submission.cfp_id)
        )
        for row in sub_result:
            sub_counts[row[0]] = row[1]

    items = [
        _build_cfp_response(c, conf_ids_map.get(c.id, []), sub_counts.get(c.id, 0))
        for c in cfps
    ]
    pages = (result.total + page_size - 1) // page_size if page_size > 0 else 0

    return CFPListResponse(
        items=items,
        total=result.total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


@router.post("/{conference_id}/cfps", status_code=201, dependencies=[Depends(require_module(MODULE_CODE))])
async def link_cfp_to_conference(
    conference_id: UUID,
    body: ConferenceAssociationRequest,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Link an existing CFP to a conference."""

    await _get_conference_for_tenant(conference_id, current_user.tenant_id, db)

    cfp_result = await db.execute(
        select(CallForPapers)
        .where(CallForPapers.id == body.id)
        .where(CallForPapers.tenant_id == current_user.tenant_id)
    )
    if not cfp_result.scalar_one_or_none():
        raise NotFoundError("Call for Papers not found")

    existing = await db.execute(
        select(ConferenceCFP)
        .where(ConferenceCFP.conference_id == conference_id)
        .where(ConferenceCFP.cfp_id == body.id)
    )
    if existing.scalar_one_or_none():
        raise ValidationError("CFP is already linked to this conference")

    db.add(ConferenceCFP(conference_id=conference_id, cfp_id=body.id))
    db.add(AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action=AuditAction.CONFERENCE_LINK_CFP,
        resource_type="conference",
        resource_id=conference_id,
        details={"cfp_id": str(body.id)},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    ))

    await db.commit()
    return {"message": "CFP linked to conference"}


@router.delete("/{conference_id}/cfps/{cfp_id}", dependencies=[Depends(require_module(MODULE_CODE))])
async def unlink_cfp_from_conference(
    conference_id: UUID,
    cfp_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Unlink a CFP from a conference. Blocked if it's the CFP's only conference."""

    await _get_conference_for_tenant(conference_id, current_user.tenant_id, db)

    result = await db.execute(
        select(ConferenceCFP)
        .where(ConferenceCFP.conference_id == conference_id)
        .where(ConferenceCFP.cfp_id == cfp_id)
    )
    assoc = result.scalar_one_or_none()
    if not assoc:
        raise NotFoundError("CFP is not linked to this conference")

    count = (await db.execute(
        select(func.count())
        .select_from(ConferenceCFP)
        .where(ConferenceCFP.cfp_id == cfp_id)
    )).scalar() or 0

    if count <= 1:
        raise ValidationError("Cannot unlink: this is the CFP's only conference")

    await db.delete(assoc)
    db.add(AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action=AuditAction.CONFERENCE_UNLINK_CFP,
        resource_type="conference",
        resource_id=conference_id,
        details={"cfp_id": str(cfp_id)},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    ))

    await db.commit()
    return {"message": "CFP unlinked from conference"}


# ---------------------------------------------------------------------------
# Conference Service Providers (direct, not location-linked)
# ---------------------------------------------------------------------------

MODULE_CODE_SP = "service_providers"


@router.get("/{conference_id}/service-providers", response_model=ServiceProviderListResponse, dependencies=[Depends(require_module(MODULE_CODE_SP))])
async def list_conference_service_providers(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> ServiceProviderListResponse:
    """List service providers directly linked to a conference."""
    conference = await _get_conference_for_tenant(conference_id, current_user.tenant_id, db)

    result = await db.execute(
        select(ServiceProvider)
        .where(ServiceProvider.conference_id == conference.id)
        .where(ServiceProvider.tenant_id == current_user.tenant_id)
        .order_by(ServiceProvider.company_name)
    )
    providers = result.scalars().all()

    items = [build_service_provider_response(sp) for sp in providers]

    return ServiceProviderListResponse(items=items, total=len(items))


@router.post("/{conference_id}/service-providers", response_model=ServiceProviderResponse, status_code=201, dependencies=[Depends(require_module(MODULE_CODE_SP))])
async def create_conference_service_provider(
    conference_id: UUID,
    data: ServiceProviderCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> ServiceProviderResponse:
    """Create a service provider directly linked to a conference (no location)."""
    conference = await _get_conference_for_tenant(conference_id, current_user.tenant_id, db)

    sp = ServiceProvider(
        tenant_id=current_user.tenant_id,
        conference_id=conference.id,
        location_id=None,
        company_name=data.company_name,
        service_description=data.service_description,
        phone=data.phone,
        email=data.email,
        website=data.website,
        address_line1=data.address_line1,
        address_line2=data.address_line2,
        city=data.city,
        state=data.state,
        postal_code=data.postal_code,
        country=data.country,
        vat_number=data.vat_number,
        contact_persons=[cp.model_dump() for cp in data.contact_persons] if data.contact_persons else [],
    )
    db.add(sp)

    db.add(AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="service_provider.create",
        resource_type="service_provider",
        resource_id=sp.id,
        details={"company_name": sp.company_name, "conference_id": str(conference.id)},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    ))

    await db.commit()
    await db.refresh(sp)

    return build_service_provider_response(sp)


@router.put("/{conference_id}/service-providers/{provider_id}", response_model=ServiceProviderResponse, dependencies=[Depends(require_module(MODULE_CODE_SP))])
async def update_conference_service_provider(
    conference_id: UUID,
    provider_id: UUID,
    data: ServiceProviderUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> ServiceProviderResponse:
    """Update a conference service provider."""
    conference = await _get_conference_for_tenant(conference_id, current_user.tenant_id, db)

    result = await db.execute(
        select(ServiceProvider)
        .where(ServiceProvider.id == provider_id)
        .where(ServiceProvider.conference_id == conference.id)
        .where(ServiceProvider.tenant_id == current_user.tenant_id)
    )
    sp = result.scalar_one_or_none()
    if not sp:
        raise NotFoundError(f"Service provider '{provider_id}' not found")

    update_data = data.model_dump(exclude_unset=True)
    if "contact_persons" in update_data and update_data["contact_persons"] is not None:
        update_data["contact_persons"] = [
            cp.model_dump() if hasattr(cp, "model_dump") else cp
            for cp in update_data["contact_persons"]
        ]

    for field, value in update_data.items():
        setattr(sp, field, value)

    db.add(AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="service_provider.update",
        resource_type="service_provider",
        resource_id=sp.id,
        details={"updated_fields": list(update_data.keys())},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    ))

    await db.commit()
    await db.refresh(sp)

    return build_service_provider_response(sp)


@router.delete("/{conference_id}/service-providers/{provider_id}", dependencies=[Depends(require_module(MODULE_CODE_SP))])
async def delete_conference_service_provider(
    conference_id: UUID,
    provider_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete a conference service provider and its attachments."""
    from app.models.attachment import Attachment

    conference = await _get_conference_for_tenant(conference_id, current_user.tenant_id, db)

    result = await db.execute(
        select(ServiceProvider)
        .where(ServiceProvider.id == provider_id)
        .where(ServiceProvider.conference_id == conference.id)
        .where(ServiceProvider.tenant_id == current_user.tenant_id)
    )
    sp = result.scalar_one_or_none()
    if not sp:
        raise NotFoundError(f"Service provider '{provider_id}' not found")

    # Delete associated attachments
    attachments = await db.execute(
        select(Attachment)
        .where(Attachment.entity_type == "service_provider")
        .where(Attachment.entity_id == sp.id)
    )
    for att in attachments.scalars().all():
        await db.delete(att)

    company_name = sp.company_name
    await db.delete(sp)

    db.add(AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="service_provider.delete",
        resource_type="service_provider",
        resource_id=provider_id,
        details={"company_name": company_name, "conference_id": str(conference.id)},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    ))

    await db.commit()
    return {"message": f"Service provider '{company_name}' deleted"}
