"""Conference management endpoints."""

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile
from fastapi.responses import Response
import csv
import io
from sqlalchemy import delete, func, literal, select
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import flag_modified
from fastapi.responses import StreamingResponse

from app.api.v1.service_providers import build_service_provider_response
from app.config import get_settings
from app.core.file_validation import sanitize_filename, validate_upload
from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    TenantAdminDep,
    check_conference_admin_access,
    get_client_ip,
    require_module,
)
from app.core.default_settings import seed_default_settings
from app.core.exceptions import AuthorizationError
from app.core.exceptions import NotFoundError, ValidationError
from app.core.pagination import paginate
from app.models.associations import ConferenceCFP, ConferenceLocation, ConferenceVolunteer
from app.models.attachment import Attachment
from app.models.audit import AuditAction, AuditLog
from app.models.cfp import CallForPapers, CFPApplicant, CFPPaper
from app.models.conference import Conference
from app.models.invoice import Invoice
from app.models.sponsor import Sponsor
from app.models.location import Location
from app.models.tenant import Tenant
from app.models.service_provider import ServiceProvider
from app.models.user import User
from app.models.user_conference_access import UserConferenceAccess
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


async def _get_accessible_conference_ids(
    db: DbSessionDep, current_user: CurrentUserDep
) -> list[UUID] | None:
    """
    Get list of conference IDs the user can access.

    Returns None if user has access to all conferences (tenant_admin, super_admin,
    or has_all_conference_access=True).

    Returns list of conference IDs if user has restricted access.
    """
    # Super admins and tenant admins can see all conferences
    if current_user.is_super_admin or current_user.is_tenant_admin:
        return None

    # Check if user has all conference access
    user_result = await db.execute(
        select(User.has_all_conference_access).where(User.id == current_user.user_id)
    )
    has_all_access = user_result.scalar_one_or_none()

    if has_all_access is True:
        return None

    # Get explicit conference access records
    access_result = await db.execute(
        select(UserConferenceAccess.conference_id).where(
            UserConferenceAccess.user_id == current_user.user_id
        )
    )
    conference_ids = list(access_result.scalars().all())
    return conference_ids


def _build_conference_response(conf: Conference, tenant_slug: str | None = None) -> ConferenceResponse:
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

    # Parse team members (informational only, no user linking)
    team_members = []
    for tm in (conf.team_members or []):
        # first_name is required with min_length=1, ensure we have a valid value
        first_name = tm.get("first_name") or "(Unknown)"
        team_members.append(TeamMember(
            first_name=first_name,
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
        tenant_slug=tenant_slug,
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


# --- Conference Logo Endpoints ---


@router.post("/{conference_id}/logo", dependencies=[Depends(require_module(MODULE_CODE))])
async def upload_conference_logo(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
    file: UploadFile = File(...),
) -> dict:
    """
    Upload or replace the conference logo.

    Only image files (JPEG, PNG, WebP, GIF) are allowed.
    Replaces any existing logo.
    """
    # Check conference exists and user has admin access
    await check_conference_admin_access(db, current_user.user_id, conference_id)

    result = await db.execute(
        select(Conference).where(Conference.id == conference_id)
    )
    conference = result.scalar_one_or_none()
    if not conference:
        raise NotFoundError("Conference not found")

    # Read and validate file
    file_data = await file.read()
    file_size = len(file_data)

    settings = get_settings()
    max_size = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if file_size > max_size:
        raise ValidationError(
            f"File size ({file_size // (1024 * 1024)}MB) exceeds maximum allowed ({settings.MAX_UPLOAD_SIZE_MB}MB)"
        )

    content_type = file.content_type or "application/octet-stream"
    verified_type = validate_upload(file_data, content_type, "conference_logo")
    safe_filename = sanitize_filename(file.filename or "logo")

    # Delete existing logo if any
    existing_logo = await db.execute(
        select(Attachment).where(
            Attachment.tenant_id == conference.tenant_id,
            Attachment.entity_type == "conference_logo",
            Attachment.entity_id == conference_id,
        )
    )
    old_logo = existing_logo.scalar_one_or_none()
    if old_logo:
        await db.delete(old_logo)

    # Create new attachment
    attachment = Attachment(
        tenant_id=conference.tenant_id,
        entity_type="conference_logo",
        entity_id=conference_id,
        filename=safe_filename,
        content_type=verified_type,
        file_size=file_size,
        file_data=file_data,
        description="Conference logo",
        uploaded_by=current_user.user_id,
    )
    db.add(attachment)

    # Update conference logo_url to point to download endpoint (relative to /api/v1)
    conference.logo_url = f"/conferences/{conference_id}/logo"
    flag_modified(conference, "logo_url")

    # Audit log
    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action=AuditAction.CONFERENCE_UPDATE,
        resource_type="conference",
        resource_id=conference_id,
        details={"action": "logo_upload", "filename": safe_filename, "file_size": file_size},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()

    return {
        "message": "Logo uploaded successfully",
        "logo_url": conference.logo_url,
        "filename": safe_filename,
        "content_type": verified_type,
        "file_size": file_size,
    }


@router.get("/{conference_id}/logo")
async def get_conference_logo(
    conference_id: UUID,
    db: DbSessionDep,
) -> Response:
    """
    Download the conference logo (public endpoint).

    Returns the logo image file. No authentication required since logos
    are typically public content displayed on conference pages.
    """
    # Find logo attachment directly by conference_id
    logo_result = await db.execute(
        select(Attachment).where(
            Attachment.entity_type == "conference_logo",
            Attachment.entity_id == conference_id,
        )
    )
    logo = logo_result.scalar_one_or_none()
    if not logo:
        raise NotFoundError("Conference logo not found")

    return Response(
        content=logo.file_data,
        media_type=logo.content_type,
        headers={
            "Content-Disposition": f'inline; filename="{logo.filename}"',
            "Content-Length": str(logo.file_size),
            "Cache-Control": "public, max-age=86400",
        },
    )


@router.delete("/{conference_id}/logo", dependencies=[Depends(require_module(MODULE_CODE))])
async def delete_conference_logo(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """
    Delete the conference logo.
    """
    # Check conference exists and user has admin access
    await check_conference_admin_access(db, current_user.user_id, conference_id)

    result = await db.execute(
        select(Conference).where(Conference.id == conference_id)
    )
    conference = result.scalar_one_or_none()
    if not conference:
        raise NotFoundError("Conference not found")

    # Find and delete logo attachment (if exists)
    logo_result = await db.execute(
        select(Attachment).where(
            Attachment.tenant_id == conference.tenant_id,
            Attachment.entity_type == "conference_logo",
            Attachment.entity_id == conference_id,
        )
    )
    logo = logo_result.scalar_one_or_none()
    if logo:
        await db.delete(logo)

    # Always clear logo_url (handles both actual attachments and stale URL data)
    conference.logo_url = None
    flag_modified(conference, "logo_url")

    # Audit log
    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action=AuditAction.CONFERENCE_UPDATE,
        resource_type="conference",
        resource_id=conference_id,
        details={"action": "logo_delete"},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()

    return {"message": "Logo deleted successfully"}


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
        headers={"Content-Disposition": f"attachment; filename={filename}"},
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
            headers={"Content-Disposition": f"attachment; filename={filename}"},
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
        headers={"Content-Disposition": f"attachment; filename={filename}"},
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
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Link an existing volunteer to a conference."""
    # Check admin access: tenant admin OR conference-specific admin
    if not current_user.is_super_admin and not current_user.is_tenant_admin:
        has_access = await check_conference_admin_access(db, current_user.user_id, conference_id)
        if not has_access:
            raise AuthorizationError("Admin access to this conference required")

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
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Unlink a volunteer from a conference. Blocked if it's the volunteer's only conference."""
    # Check admin access: tenant admin OR conference-specific admin
    if not current_user.is_super_admin and not current_user.is_tenant_admin:
        has_access = await check_conference_admin_access(db, current_user.user_id, conference_id)
        if not has_access:
            raise AuthorizationError("Admin access to this conference required")

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
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Link an existing location to a conference."""
    # Check admin access: tenant admin OR conference-specific admin
    if not current_user.is_super_admin and not current_user.is_tenant_admin:
        has_access = await check_conference_admin_access(db, current_user.user_id, conference_id)
        if not has_access:
            raise AuthorizationError("Admin access to this conference required")

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
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Unlink a location from a conference. Blocked if it's the location's only conference."""
    # Check admin access: tenant admin OR conference-specific admin
    if not current_user.is_super_admin and not current_user.is_tenant_admin:
        has_access = await check_conference_admin_access(db, current_user.user_id, conference_id)
        if not has_access:
            raise AuthorizationError("Admin access to this conference required")

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
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Link an existing CFP to a conference."""
    # Check admin access: tenant admin OR conference-specific admin
    if not current_user.is_super_admin and not current_user.is_tenant_admin:
        has_access = await check_conference_admin_access(db, current_user.user_id, conference_id)
        if not has_access:
            raise AuthorizationError("Admin access to this conference required")

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
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Unlink a CFP from a conference. Blocked if it's the CFP's only conference."""
    # Check admin access: tenant admin OR conference-specific admin
    if not current_user.is_super_admin and not current_user.is_tenant_admin:
        has_access = await check_conference_admin_access(db, current_user.user_id, conference_id)
        if not has_access:
            raise AuthorizationError("Admin access to this conference required")

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
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> ServiceProviderResponse:
    """Create a service provider directly linked to a conference (no location)."""
    # Check admin access: tenant admin OR conference-specific admin
    if not current_user.is_super_admin and not current_user.is_tenant_admin:
        has_access = await check_conference_admin_access(db, current_user.user_id, conference_id)
        if not has_access:
            raise AuthorizationError("Admin access to this conference required")

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
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> ServiceProviderResponse:
    """Update a conference service provider."""
    # Check admin access: tenant admin OR conference-specific admin
    if not current_user.is_super_admin and not current_user.is_tenant_admin:
        has_access = await check_conference_admin_access(db, current_user.user_id, conference_id)
        if not has_access:
            raise AuthorizationError("Admin access to this conference required")

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
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete a conference service provider and its attachments."""
    from app.models.attachment import Attachment

    # Check admin access: tenant admin OR conference-specific admin
    if not current_user.is_super_admin and not current_user.is_tenant_admin:
        has_access = await check_conference_admin_access(db, current_user.user_id, conference_id)
        if not has_access:
            raise AuthorizationError("Admin access to this conference required")

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
