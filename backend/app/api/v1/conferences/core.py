"""Conference CRUD and lifecycle endpoints."""

import csv
import io
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, func, select
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import flag_modified

from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    TenantAdminDep,
    check_conference_admin_access,
    get_client_ip,
    require_module,
)
from app.core.default_settings import seed_default_settings
from app.core.exceptions import AuthorizationError, NotFoundError, ValidationError
from app.core.file_validation import safe_content_disposition
from app.core.pagination import paginate
from app.models.associations import ConferenceCFP, ConferenceLocation, ConferenceVolunteer
from app.models.attachment import Attachment
from app.models.audit import AuditAction, AuditLog
from app.models.cfp import CallForPapers, CFPApplicant, CFPPaper
from app.models.conference import Conference
from app.models.invoice import Invoice
from app.models.location import Location
from app.models.sponsor import Sponsor
from app.models.tenant import Tenant
from app.models.volunteer import Volunteer
from app.schemas.conference import (
    ConferenceAssociationRequest,
    ConferenceCreate,
    ConferenceListResponse,
    ConferenceResponse,
    ConferenceStats,
    ConferenceUpdate,
)

from ._shared import (
    MODULE_CODE,
    _build_conference_response,
    _get_accessible_conference_ids,
    _tenant_filter,
)

router = APIRouter()


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
    Users with restricted access only see conferences they have explicit access to.
    """
    query = select(Conference).options(selectinload(Conference.tenant)).where(_tenant_filter(current_user))

    # Apply conference access filtering for non-admin users
    accessible_ids = await _get_accessible_conference_ids(db, current_user)
    if accessible_ids is not None:
        if not accessible_ids:
            # User has no conference access - return empty result
            return ConferenceListResponse(
                items=[], total=0, page=page, page_size=page_size, pages=0
            )
        query = query.where(Conference.id.in_(accessible_ids))

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

    items = [_build_conference_response(conf, conf.tenant.slug if conf.tenant else None) for conf in result.items]

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
        social_links=conference_data.social_links.model_dump(mode='json') if conference_data.social_links else {},
        team_members=[tm.model_dump(mode='json') for tm in conference_data.team_members] if conference_data.team_members else [],
        settings=conference_data.settings,
        currency=conference_data.currency,
    )
    db.add(conference)
    await db.flush()  # Get the conference ID before seeding default settings

    # Seed default settings for the new conference
    await seed_default_settings(db, current_user.tenant_id, conference.id)

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

    # Get tenant slug for the response
    tenant_result = await db.execute(select(Tenant.slug).where(Tenant.id == conference.tenant_id))
    tenant_slug = tenant_result.scalar_one_or_none()

    return _build_conference_response(conference, tenant_slug)


@router.get("/stats", response_model=ConferenceStats, dependencies=[Depends(require_module(MODULE_CODE))])
async def get_conference_stats(
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> ConferenceStats:
    """
    Get conference statistics for the current tenant.

    Requires the 'conferences' module.
    Stats only count conferences the user has access to.
    """

    today = date.today()

    # Check access restrictions
    accessible_ids = await _get_accessible_conference_ids(db, current_user)
    if accessible_ids is not None and not accessible_ids:
        # User has no conference access - return zeros
        return ConferenceStats(
            total=0, active=0, published=0, upcoming=0, ongoing=0, past=0
        )

    def _apply_access_filter(query):
        """Apply conference access filter to a query."""
        q = query.where(_tenant_filter(current_user))
        if accessible_ids is not None:
            q = q.where(Conference.id.in_(accessible_ids))
        return q

    # Total conferences
    total = (await db.execute(
        _apply_access_filter(select(func.count()).select_from(Conference))
    )).scalar() or 0

    # Active conferences
    active = (await db.execute(
        _apply_access_filter(
            select(func.count()).select_from(Conference)
            .where(Conference.is_active == True)
        )
    )).scalar() or 0

    # Published conferences
    published = (await db.execute(
        _apply_access_filter(
            select(func.count()).select_from(Conference)
            .where(Conference.is_published == True)
        )
    )).scalar() or 0

    # Upcoming conferences
    upcoming = (await db.execute(
        _apply_access_filter(
            select(func.count()).select_from(Conference)
            .where(Conference.start_date > today)
        )
    )).scalar() or 0

    # Ongoing conferences
    ongoing = (await db.execute(
        _apply_access_filter(
            select(func.count()).select_from(Conference)
            .where(Conference.start_date <= today)
            .where((Conference.end_date >= today) | (Conference.end_date.is_(None)))
        )
    )).scalar() or 0

    # Past conferences
    past = (await db.execute(
        _apply_access_filter(
            select(func.count()).select_from(Conference)
            .where(Conference.end_date < today)
        )
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
    Users with restricted access can only view conferences they have explicit access to.
    """

    result = await db.execute(
        select(Conference)
        .options(selectinload(Conference.tenant))
        .where(Conference.id == conference_id)
        .where(_tenant_filter(current_user))
    )
    conference = result.scalar_one_or_none()

    if not conference:
        raise NotFoundError("Conference not found")

    # Check if user has access to this conference
    accessible_ids = await _get_accessible_conference_ids(db, current_user)
    if accessible_ids is not None and conference_id not in accessible_ids:
        raise AuthorizationError("You don't have access to this conference")

    return _build_conference_response(conference, conference.tenant.slug if conference.tenant else None)


@router.put("/{conference_id}", response_model=ConferenceResponse, dependencies=[Depends(require_module(MODULE_CODE))])
async def update_conference(
    conference_id: UUID,
    conference_data: ConferenceUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> ConferenceResponse:
    """
    Update a conference.

    Requires the 'conferences' module and admin access to the conference.
    (Tenant admins or users with conference-specific admin access)
    """
    # Check admin access: tenant admin OR conference-specific admin
    if not current_user.is_super_admin and not current_user.is_tenant_admin:
        has_access = await check_conference_admin_access(db, current_user.user_id, conference_id)
        if not has_access:
            raise AuthorizationError("Admin access to this conference required")

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
        # Use mode='json' to ensure proper JSON serialization for JSONB storage
        update_data["social_links"] = update_data["social_links"].model_dump(mode='json') if hasattr(update_data["social_links"], "model_dump") else update_data["social_links"]

    if "team_members" in update_data and update_data["team_members"] is not None:
        team_members_data = []
        for tm in update_data["team_members"]:
            # Serialize to dict
            tm_dict = tm.model_dump(mode='json') if hasattr(tm, "model_dump") else tm
            # Sanitize empty strings to None for optional fields
            for key in ("email", "phone", "role"):
                if tm_dict.get(key) == "":
                    tm_dict[key] = None
            # Remove user_id if present (team members are informational only, not linked to users)
            tm_dict.pop("user_id", None)
            team_members_data.append(tm_dict)
        update_data["team_members"] = team_members_data

    for field, value in update_data.items():
        setattr(conference, field, value)

    # Explicitly mark JSONB columns as modified to ensure SQLAlchemy includes them in UPDATE
    if "team_members" in update_data:
        flag_modified(conference, "team_members")
    if "social_links" in update_data:
        flag_modified(conference, "social_links")
    if "settings" in update_data:
        flag_modified(conference, "settings")

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

    # Get tenant slug for the response
    tenant_result = await db.execute(select(Tenant.slug).where(Tenant.id == conference.tenant_id))
    tenant_slug = tenant_result.scalar_one_or_none()

    return _build_conference_response(conference, tenant_slug)


@router.delete("/{conference_id}", dependencies=[Depends(require_module(MODULE_CODE))])
async def delete_conference(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """
    Delete a conference and all related data.

    Requirements:
    - Conference must be deactivated first (is_active = False)
    - Only the Tenant Super User or SaaS Super Admin can delete conferences
    - All orphaned data (attachments, applicants with no other papers) will be cleaned up

    Entities (volunteers, locations, CFPs) that are ONLY linked to this
    conference are deleted. Entities also linked to other conferences are
    simply unlinked (handled by CASCADE on junction tables).
    """
    # Check authorization: only SaaS super admin OR tenant super user can delete
    if not current_user.is_super_admin:
        # Check if user is the tenant super user
        tenant_result = await db.execute(
            select(Tenant.super_user_id)
            .where(Tenant.id == current_user.tenant_id)
        )
        tenant_super_user_id = tenant_result.scalar_one_or_none()

        if tenant_super_user_id != current_user.user_id:
            raise AuthorizationError(
                "Only the Tenant Super User or SaaS Super Admin can delete conferences"
            )

    result = await db.execute(
        select(Conference)
        .where(Conference.id == conference_id)
        .where(_tenant_filter(current_user))
    )
    conference = result.scalar_one_or_none()

    if not conference:
        raise NotFoundError("Conference not found")

    # Check that conference is deactivated
    if conference.is_active:
        raise ValidationError(
            "Conference must be deactivated before deletion. "
            "Please deactivate the conference first."
        )

    conference_name = conference.name

    # --- Collect IDs for attachment cleanup before CASCADE deletes ---

    # Get sponsor IDs for this conference
    sponsor_ids_result = await db.execute(
        select(Sponsor.id).where(Sponsor.conference_id == conference_id)
    )
    sponsor_ids = [str(sid) for sid in sponsor_ids_result.scalars().all()]

    # Get invoice IDs for this conference
    invoice_ids_result = await db.execute(
        select(Invoice.id).where(Invoice.conference_id == conference_id)
    )
    invoice_ids = [str(iid) for iid in invoice_ids_result.scalars().all()]

    # Get CFP IDs linked to this conference
    cfp_ids_result = await db.execute(
        select(ConferenceCFP.cfp_id).where(ConferenceCFP.conference_id == conference_id)
    )
    cfp_ids = list(cfp_ids_result.scalars().all())

    # Get paper IDs for those CFPs
    paper_ids_result = await db.execute(
        select(CFPPaper.id).where(CFPPaper.cfp_id.in_(cfp_ids))
    ) if cfp_ids else None
    paper_ids = [str(pid) for pid in paper_ids_result.scalars().all()] if paper_ids_result else []

    # Get applicant IDs who have papers in these CFPs
    applicant_ids_in_conf_result = await db.execute(
        select(CFPPaper.main_speaker_id).where(CFPPaper.cfp_id.in_(cfp_ids)).distinct()
    ) if cfp_ids else None
    applicant_ids_in_conf = list(applicant_ids_in_conf_result.scalars().all()) if applicant_ids_in_conf_result else []

    # Find applicants who have NO papers in other CFPs (orphaned applicants)
    orphaned_applicant_ids = []
    if applicant_ids_in_conf:
        # Find applicants who have papers in OTHER CFPs
        applicants_with_other_papers = await db.execute(
            select(CFPPaper.main_speaker_id)
            .where(CFPPaper.main_speaker_id.in_(applicant_ids_in_conf))
            .where(~CFPPaper.cfp_id.in_(cfp_ids))
            .distinct()
        )
        applicants_with_other_papers_ids = set(applicants_with_other_papers.scalars().all())
        orphaned_applicant_ids = [
            aid for aid in applicant_ids_in_conf
            if aid not in applicants_with_other_papers_ids
        ]

    # --- Delete orphaned attachments (before CASCADE deletes parent entities) ---
    deleted_attachments = 0

    # Delete conference logo attachments
    result_att = await db.execute(
        delete(Attachment)
        .where(Attachment.tenant_id == current_user.tenant_id)
        .where(Attachment.entity_type == "conference_logo")
        .where(Attachment.entity_id == str(conference_id))
        .returning(Attachment.id)
    )
    deleted_attachments += len(result_att.fetchall())

    # Delete sponsor attachments
    if sponsor_ids:
        result_att = await db.execute(
            delete(Attachment)
            .where(Attachment.tenant_id == current_user.tenant_id)
            .where(Attachment.entity_type == "sponsor")
            .where(Attachment.entity_id.in_(sponsor_ids))
            .returning(Attachment.id)
        )
        deleted_attachments += len(result_att.fetchall())

    # Delete invoice attachments
    if invoice_ids:
        result_att = await db.execute(
            delete(Attachment)
            .where(Attachment.tenant_id == current_user.tenant_id)
            .where(Attachment.entity_type == "invoice")
            .where(Attachment.entity_id.in_(invoice_ids))
            .returning(Attachment.id)
        )
        deleted_attachments += len(result_att.fetchall())

    # Delete paper video attachments
    if paper_ids:
        result_att = await db.execute(
            delete(Attachment)
            .where(Attachment.tenant_id == current_user.tenant_id)
            .where(Attachment.entity_type == "paper_video")
            .where(Attachment.entity_id.in_(paper_ids))
            .returning(Attachment.id)
        )
        deleted_attachments += len(result_att.fetchall())

    # Delete applicant attachments for orphaned applicants
    orphaned_applicant_str_ids = [str(aid) for aid in orphaned_applicant_ids]
    if orphaned_applicant_str_ids:
        result_att = await db.execute(
            delete(Attachment)
            .where(Attachment.tenant_id == current_user.tenant_id)
            .where(Attachment.entity_type.in_(["applicant_picture", "applicant_video"]))
            .where(Attachment.entity_id.in_(orphaned_applicant_str_ids))
            .returning(Attachment.id)
        )
        deleted_attachments += len(result_att.fetchall())

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

    # --- Delete orphaned applicants (after CFPs/papers are deleted) ---
    deleted_applicants = 0
    if orphaned_applicant_ids:
        for aid in orphaned_applicant_ids:
            applicant_result = await db.execute(
                select(CFPApplicant).where(CFPApplicant.id == aid)
            )
            applicant = applicant_result.scalar_one_or_none()
            if applicant:
                await db.delete(applicant)
                deleted_applicants += 1

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
            "deleted_applicants": deleted_applicants,
            "deleted_attachments": deleted_attachments,
        },
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    # Delete the conference (junction rows and related entities cascade-delete automatically)
    await db.delete(conference)
    await db.commit()

    return {
        "message": f"Conference '{conference_name}' deleted successfully",
        "deleted_volunteers": deleted_volunteers,
        "deleted_locations": deleted_locations,
        "deleted_cfps": deleted_cfps,
        "deleted_applicants": deleted_applicants,
        "deleted_attachments": deleted_attachments,
    }


@router.get("/{conference_id}/delete-preview", dependencies=[Depends(require_module(MODULE_CODE))])
async def delete_conference_preview(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> dict:
    """
    Preview what will be deleted when a conference is removed.

    Returns:
    - Conference status (is_active, can_delete)
    - Counts of entities that will be deleted
    - Export options for data that should be downloaded before deletion
    - Orphaned applicants that will be removed
    """
    result = await db.execute(
        select(Conference)
        .where(Conference.id == conference_id)
        .where(_tenant_filter(current_user))
    )
    conference = result.scalar_one_or_none()
    if not conference:
        raise NotFoundError("Conference not found")

    # Check if user can delete
    can_delete = False
    if current_user.is_super_admin:
        can_delete = True
    else:
        tenant_result = await db.execute(
            select(Tenant.super_user_id).where(Tenant.id == current_user.tenant_id)
        )
        tenant_super_user_id = tenant_result.scalar_one_or_none()
        can_delete = tenant_super_user_id == current_user.user_id

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

    # Invoice count
    invoice_count = (await db.execute(
        select(func.count()).where(Invoice.conference_id == conference_id)
    )).scalar() or 0

    # Get CFP IDs for this conference
    cfp_ids_result = await db.execute(
        select(ConferenceCFP.cfp_id).where(ConferenceCFP.conference_id == conference_id)
    )
    cfp_ids = list(cfp_ids_result.scalars().all())

    # Paper count
    paper_count = 0
    if cfp_ids:
        paper_count = (await db.execute(
            select(func.count()).where(CFPPaper.cfp_id.in_(cfp_ids))
        )).scalar() or 0

    # Sponsor count
    sponsor_count = (await db.execute(
        select(func.count()).where(Sponsor.conference_id == conference_id)
    )).scalar() or 0

    # Count orphaned applicants (applicants with papers only in this conference's CFPs)
    orphaned_applicant_count = 0
    if cfp_ids:
        applicant_ids_in_conf_result = await db.execute(
            select(CFPPaper.main_speaker_id).where(CFPPaper.cfp_id.in_(cfp_ids)).distinct()
        )
        applicant_ids_in_conf = list(applicant_ids_in_conf_result.scalars().all())

        if applicant_ids_in_conf:
            applicants_with_other_papers = await db.execute(
                select(CFPPaper.main_speaker_id)
                .where(CFPPaper.main_speaker_id.in_(applicant_ids_in_conf))
                .where(~CFPPaper.cfp_id.in_(cfp_ids))
                .distinct()
            )
            applicants_with_other_papers_ids = set(applicants_with_other_papers.scalars().all())
            orphaned_applicant_count = len([
                aid for aid in applicant_ids_in_conf
                if aid not in applicants_with_other_papers_ids
            ])

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
        "is_active": conference.is_active,
        "can_delete": can_delete,
        "must_deactivate_first": conference.is_active,
        "volunteers": {
            "total_linked": total_vols,
            "will_delete": exclusive_vols,
            "will_unlink": total_vols - exclusive_vols,
        },
        "locations": {
            "total_linked": total_locs,
            "will_delete": exclusive_locs,
            "will_unlink": total_locs - exclusive_locs,
        },
        "cfps": {
            "total_linked": total_cfps,
            "will_delete": exclusive_cfps,
            "will_unlink": total_cfps - exclusive_cfps,
        },
        "invoices": {
            "count": invoice_count,
            "export_available": invoice_count > 0,
            "export_url": f"/api/v1/conferences/{conference_id}/export/invoices" if invoice_count > 0 else None,
        },
        "papers": {
            "count": paper_count,
            "export_available": paper_count > 0,
            "export_url": f"/api/v1/conferences/{conference_id}/export/papers" if paper_count > 0 else None,
        },
        "sponsors": {
            "count": sponsor_count,
        },
        "applicants": {
            "orphaned_count": orphaned_applicant_count,
            "note": "Applicants with papers only in this conference will be deleted",
        },
    }


@router.get("/{conference_id}/export/invoices", dependencies=[Depends(require_module(MODULE_CODE))])
async def export_conference_invoices(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> StreamingResponse:
    """
    Export all invoices for a conference as CSV.

    This endpoint should be used before deleting a conference to preserve invoice data.
    Requires admin access to the conference.
    """
    # Check access
    if not current_user.is_super_admin and not current_user.is_tenant_admin:
        has_access = await check_conference_admin_access(db, current_user.user_id, conference_id)
        if not has_access:
            raise AuthorizationError("Admin access to this conference required")

    # Verify conference exists
    result = await db.execute(
        select(Conference)
        .where(Conference.id == conference_id)
        .where(_tenant_filter(current_user))
    )
    conference = result.scalar_one_or_none()
    if not conference:
        raise NotFoundError("Conference not found")

    # Get all invoices for this conference
    invoices_result = await db.execute(
        select(Invoice)
        .where(Invoice.conference_id == conference_id)
        .order_by(Invoice.invoice_number)
    )
    invoices = invoices_result.scalars().all()

    # Create CSV
    output = io.StringIO()
    writer = csv.writer(output)

    # Header row
    writer.writerow([
        "Invoice Number", "Status", "Issue Date", "Due Date",
        "Recipient Name", "Recipient Email", "Recipient Address Line 1",
        "Recipient Address Line 2", "Recipient City", "Recipient State",
        "Recipient Postal Code", "Recipient Country", "Recipient VAT Number",
        "Subtotal", "Tax Rate (%)", "Tax Amount", "Total", "Currency",
        "Notes", "Created At",
    ])

    # Data rows
    for inv in invoices:
        writer.writerow([
            inv.invoice_number,
            inv.status,
            inv.issue_date.isoformat() if inv.issue_date else "",
            inv.due_date.isoformat() if inv.due_date else "",
            inv.recipient_name,
            inv.recipient_email or "",
            inv.recipient_address_line1 or "",
            inv.recipient_address_line2 or "",
            inv.recipient_city or "",
            inv.recipient_state or "",
            inv.recipient_postal_code or "",
            inv.recipient_country or "",
            inv.recipient_vat_number or "",
            str(inv.subtotal) if inv.subtotal else "",
            str(inv.tax_rate) if inv.tax_rate else "",
            str(inv.tax_amount) if inv.tax_amount else "",
            str(inv.total) if inv.total else "",
            inv.currency or "",
            inv.notes or "",
            inv.created_at.isoformat() if inv.created_at else "",
        ])

    output.seek(0)
    filename = f"{conference.abbreviation or conference.name}_invoices.csv".replace(" ", "_")

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": safe_content_disposition(filename)},
    )


@router.get("/{conference_id}/export/papers", dependencies=[Depends(require_module(MODULE_CODE))])
async def export_conference_papers(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> StreamingResponse:
    """
    Export all paper submissions for a conference as CSV.

    This endpoint should be used before deleting a conference to preserve submission data.
    Requires admin access to the conference.
    """
    # Check access
    if not current_user.is_super_admin and not current_user.is_tenant_admin:
        has_access = await check_conference_admin_access(db, current_user.user_id, conference_id)
        if not has_access:
            raise AuthorizationError("Admin access to this conference required")

    # Verify conference exists
    result = await db.execute(
        select(Conference)
        .where(Conference.id == conference_id)
        .where(_tenant_filter(current_user))
    )
    conference = result.scalar_one_or_none()
    if not conference:
        raise NotFoundError("Conference not found")

    # Get CFP IDs for this conference
    cfp_ids_result = await db.execute(
        select(ConferenceCFP.cfp_id).where(ConferenceCFP.conference_id == conference_id)
    )
    cfp_ids = list(cfp_ids_result.scalars().all())

    if not cfp_ids:
        # No CFPs, return empty CSV
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["No papers found for this conference"])
        output.seek(0)
        filename = f"{conference.abbreviation or conference.name}_papers.csv".replace(" ", "_")
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": safe_content_disposition(filename)},
        )

    # Get all papers with speaker info
    papers_result = await db.execute(
        select(CFPPaper)
        .options(selectinload(CFPPaper.main_speaker))
        .options(selectinload(CFPPaper.cfp))
        .where(CFPPaper.cfp_id.in_(cfp_ids))
        .order_by(CFPPaper.created_at)
    )
    papers = papers_result.scalars().all()

    # Create CSV
    output = io.StringIO()
    writer = csv.writer(output)

    # Header row
    writer.writerow([
        "Paper ID", "Title", "Status", "CFP Title",
        "Speaker First Name", "Speaker Last Name", "Speaker Email",
        "Speaker Company", "Speaker Title",
        "Abstract (Short)", "Level", "Learning Objectives",
        "Submitted At", "Created At",
    ])

    # Data rows
    for paper in papers:
        speaker = paper.main_speaker
        writer.writerow([
            str(paper.id),
            paper.title,
            paper.status,
            paper.cfp.title if paper.cfp else "",
            speaker.first_name if speaker else "",
            speaker.last_name if speaker else "",
            speaker.email if speaker else "",
            speaker.company or "" if speaker else "",
            speaker.title or "" if speaker else "",
            paper.abstract_short or "",
            paper.level or "",
            paper.learning_objectives or "",
            paper.submitted_at.isoformat() if paper.submitted_at else "",
            paper.created_at.isoformat() if paper.created_at else "",
        ])

    output.seek(0)
    filename = f"{conference.abbreviation or conference.name}_papers.csv".replace(" ", "_")

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": safe_content_disposition(filename)},
    )


@router.post("/{conference_id}/publish", response_model=ConferenceResponse, dependencies=[Depends(require_module(MODULE_CODE))])
async def publish_conference(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> ConferenceResponse:
    """
    Publish a conference (make it visible).

    Requires the 'conferences' module and admin access to the conference.
    """
    # Check admin access: tenant admin OR conference-specific admin
    if not current_user.is_super_admin and not current_user.is_tenant_admin:
        has_access = await check_conference_admin_access(db, current_user.user_id, conference_id)
        if not has_access:
            raise AuthorizationError("Admin access to this conference required")

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

    # Get tenant slug for the response
    tenant_result = await db.execute(select(Tenant.slug).where(Tenant.id == conference.tenant_id))
    tenant_slug = tenant_result.scalar_one_or_none()

    return _build_conference_response(conference, tenant_slug)


@router.post("/{conference_id}/unpublish", response_model=ConferenceResponse, dependencies=[Depends(require_module(MODULE_CODE))])
async def unpublish_conference(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> ConferenceResponse:
    """
    Unpublish a conference (hide it).

    Requires the 'conferences' module and admin access to the conference.
    """
    # Check admin access: tenant admin OR conference-specific admin
    if not current_user.is_super_admin and not current_user.is_tenant_admin:
        has_access = await check_conference_admin_access(db, current_user.user_id, conference_id)
        if not has_access:
            raise AuthorizationError("Admin access to this conference required")

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

    # Get tenant slug for the response
    tenant_result = await db.execute(select(Tenant.slug).where(Tenant.id == conference.tenant_id))
    tenant_slug = tenant_result.scalar_one_or_none()

    return _build_conference_response(conference, tenant_slug)
