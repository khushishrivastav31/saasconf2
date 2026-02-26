"""Shared helpers and constants for conference endpoints."""

from datetime import date
from uuid import UUID

from sqlalchemy import literal, select

from app.core.dependencies import CurrentUserDep, DbSessionDep
from app.models.cfp import CallForPapers
from app.models.conference import Conference
from app.models.location import Location
from app.models.user import User
from app.models.user_conference_access import UserConferenceAccess
from app.models.volunteer import Volunteer
from app.schemas.cfp import CFPResponse
from app.schemas.conference import ConferenceResponse, TeamMember
from app.schemas.location import LocationResponse
from app.schemas.volunteer import VolunteerResponse

MODULE_CODE = "conferences"


def _tenant_filter(current_user: CurrentUserDep):
    """Return a tenant filter clause. Super admins bypass the filter."""
    if current_user.is_super_admin:
        return literal(True)
    return Conference.tenant_id == current_user.tenant_id


async def _get_accessible_conference_ids(db: DbSessionDep, current_user: CurrentUserDep) -> list[UUID] | None:
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
    user_result = await db.execute(select(User.has_all_conference_access).where(User.id == current_user.user_id))
    has_all_access = user_result.scalar_one_or_none()

    if has_all_access is True:
        return None

    # Get explicit conference access records
    access_result = await db.execute(
        select(UserConferenceAccess.conference_id).where(UserConferenceAccess.user_id == current_user.user_id)
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
    for tm in conf.team_members or []:
        # first_name is required with min_length=1, ensure we have a valid value
        first_name = tm.get("first_name") or "(Unknown)"
        team_members.append(
            TeamMember(
                first_name=first_name,
                last_name=tm.get("last_name", ""),
                email=tm.get("email"),
                phone=tm.get("phone"),
                role=tm.get("role"),
                is_manager=tm.get("is_manager", False),
            )
        )

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
        support_email=conf.support_email,
        contact_email=conf.contact_email,
        start_date=conf.start_date,
        end_date=conf.end_date,
        venue_name=conf.venue_name,
        venue_address=conf.venue_address,
        city=conf.city,
        state=conf.state,
        postal_code=conf.postal_code,
        country=conf.country,
        timezone=conf.timezone,
        locale=conf.locale,
        venue_type=conf.venue_type,
        venue_url=conf.venue_url,
        virtual_platform_url=conf.virtual_platform_url,
        social_links=conf.social_links or {},
        team_members=team_members,
        settings=conf.settings or {},
        currency=conf.currency,
        invoice_currency=conf.invoice_currency,
        is_active=conf.is_active,
        is_published=conf.is_published,
        program_published_at=conf.program_published_at,
        created_at=conf.created_at,
        updated_at=conf.updated_at,
        managers_count=managers_count,
        team_count=len(team_members),
        status=status,
    )


def _build_volunteer_response(v: Volunteer, conference_ids: list[UUID] | None = None) -> VolunteerResponse:
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


def _build_location_response_assoc(loc: Location, conference_ids: list[UUID] | None = None) -> LocationResponse:
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
