"""Volunteer profile endpoints (conference-scoped).

Manages volunteer-specific fields (t-shirt, emergency contact, etc.) for
applicants assigned to the Volunteer role.
"""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.core.conference_helpers import get_conference_for_tenant
from app.core.dependencies import CurrentUserDep, DbSessionDep, TenantAdminDep, require_module
from app.core.exceptions import NotFoundError
from app.models.cfp_applicants import CFPApplicant
from app.models.settings import UserRole, UserRoleAssignment
from app.models.volunteer_profile import VolunteerProfile
from app.schemas.volunteer import VolunteerProfileListResponse, VolunteerProfileResponse, VolunteerProfileUpdate

router = APIRouter()
MODULE_CODE = "volunteers"


@router.get(
    "",
    response_model=VolunteerProfileListResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def list_volunteer_profiles(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> VolunteerProfileListResponse:
    """List volunteer profiles for a conference (only for applicants with Volunteer role)."""
    await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    # Get all applicants with the Volunteer role for this conference
    role_result = await db.execute(
        select(UserRoleAssignment.applicant_id)
        .join(UserRole, UserRoleAssignment.user_role_id == UserRole.id)
        .where(
            UserRole.conference_id == conference_id,
            UserRole.name == "Volunteer",
        )
    )
    applicant_ids = [row[0] for row in role_result.all()]

    if not applicant_ids:
        return VolunteerProfileListResponse(items=[], total=0)

    # Get applicant details
    app_result = await db.execute(select(CFPApplicant).where(CFPApplicant.id.in_(applicant_ids)))
    applicants = {a.id: a for a in app_result.scalars().all()}

    # Get existing profiles
    prof_result = await db.execute(
        select(VolunteerProfile).where(
            VolunteerProfile.conference_id == conference_id,
            VolunteerProfile.applicant_id.in_(applicant_ids),
        )
    )
    profiles = {p.applicant_id: p for p in prof_result.scalars().all()}

    items: list[VolunteerProfileResponse] = []
    for aid in applicant_ids:
        applicant = applicants.get(aid)
        if not applicant:
            continue
        profile = profiles.get(aid)
        items.append(
            VolunteerProfileResponse(
                id=profile.id if profile else aid,  # Use applicant_id as fallback
                conference_id=conference_id,
                applicant_id=aid,
                first_name=applicant.first_name,
                last_name=applicant.last_name,
                email=applicant.email or "",
                tshirt_size=profile.tshirt_size if profile else None,
                emergency_contact_name=profile.emergency_contact_name if profile else None,
                emergency_contact_phone=profile.emergency_contact_phone if profile else None,
                skills=profile.skills if profile else [],
                availability=profile.availability if profile else {},
                notes=profile.notes if profile else None,
                color=profile.color if profile else None,
                total_hours=profile.total_hours if profile else 0.0,
                created_at=profile.created_at if profile else None,
                updated_at=profile.updated_at if profile else None,
            )
        )

    return VolunteerProfileListResponse(items=items, total=len(items))


@router.get(
    "/{applicant_id}",
    response_model=VolunteerProfileResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def get_volunteer_profile(
    conference_id: UUID,
    applicant_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> VolunteerProfileResponse:
    """Get a single volunteer profile."""
    await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    app_result = await db.execute(
        select(CFPApplicant).where(
            CFPApplicant.id == applicant_id,
            CFPApplicant.tenant_id == current_user.tenant_id,
        )
    )
    applicant = app_result.scalar_one_or_none()
    if not applicant:
        raise NotFoundError("Applicant not found")

    prof_result = await db.execute(
        select(VolunteerProfile).where(
            VolunteerProfile.conference_id == conference_id,
            VolunteerProfile.applicant_id == applicant_id,
        )
    )
    profile = prof_result.scalar_one_or_none()

    return VolunteerProfileResponse(
        id=profile.id if profile else applicant_id,
        conference_id=conference_id,
        applicant_id=applicant_id,
        first_name=applicant.first_name,
        last_name=applicant.last_name,
        email=applicant.email or "",
        tshirt_size=profile.tshirt_size if profile else None,
        emergency_contact_name=profile.emergency_contact_name if profile else None,
        emergency_contact_phone=profile.emergency_contact_phone if profile else None,
        skills=profile.skills if profile else [],
        availability=profile.availability if profile else {},
        notes=profile.notes if profile else None,
        color=profile.color if profile else None,
        total_hours=profile.total_hours if profile else 0.0,
        created_at=profile.created_at if profile else None,
        updated_at=profile.updated_at if profile else None,
    )


@router.put(
    "/{applicant_id}",
    response_model=VolunteerProfileResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def update_volunteer_profile(
    conference_id: UUID,
    applicant_id: UUID,
    data: VolunteerProfileUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> VolunteerProfileResponse:
    """Update a volunteer profile (creates if not exists)."""
    await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    app_result = await db.execute(
        select(CFPApplicant).where(
            CFPApplicant.id == applicant_id,
            CFPApplicant.tenant_id == current_user.tenant_id,
        )
    )
    applicant = app_result.scalar_one_or_none()
    if not applicant:
        raise NotFoundError("Applicant not found")

    # Verify applicant has the Volunteer role for this conference
    role_check = await db.execute(
        select(UserRoleAssignment.id)
        .join(UserRole, UserRoleAssignment.user_role_id == UserRole.id)
        .where(
            UserRole.conference_id == conference_id,
            UserRole.name == "Volunteer",
            UserRoleAssignment.applicant_id == applicant_id,
        )
    )
    if not role_check.scalar_one_or_none():
        raise NotFoundError("Applicant does not have the Volunteer role")

    prof_result = await db.execute(
        select(VolunteerProfile).where(
            VolunteerProfile.conference_id == conference_id,
            VolunteerProfile.applicant_id == applicant_id,
        )
    )
    profile = prof_result.scalar_one_or_none()

    update_dict = data.model_dump(exclude_unset=True)

    if not profile:
        profile = VolunteerProfile(
            tenant_id=current_user.tenant_id,
            conference_id=conference_id,
            applicant_id=applicant_id,
            **update_dict,
        )
        db.add(profile)
    else:
        for key, value in update_dict.items():
            setattr(profile, key, value)

    await db.commit()
    await db.refresh(profile)

    return VolunteerProfileResponse(
        id=profile.id,
        conference_id=conference_id,
        applicant_id=applicant_id,
        first_name=applicant.first_name,
        last_name=applicant.last_name,
        email=applicant.email or "",
        tshirt_size=profile.tshirt_size,
        emergency_contact_name=profile.emergency_contact_name,
        emergency_contact_phone=profile.emergency_contact_phone,
        skills=profile.skills,
        availability=profile.availability,
        notes=profile.notes,
        color=profile.color,
        total_hours=profile.total_hours,
        created_at=profile.created_at,
        updated_at=profile.updated_at,
    )
