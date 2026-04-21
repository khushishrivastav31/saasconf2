"""Portal endpoints for applicants to view/edit their own volunteer profiles."""

from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select

from app.core.applicant_dependencies import CurrentApplicantDep, DbSessionDep
from app.core.exceptions import NotFoundError
from app.models.settings import UserRole, UserRoleAssignment
from app.models.volunteer_profile import VolunteerProfile
from app.schemas.volunteer import VolunteerProfileResponse, VolunteerProfileUpdate

router = APIRouter(prefix="/portal", tags=["Portal – Volunteer"])


@router.get("/me/volunteer-profiles")
async def list_my_volunteer_profiles(
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> list[VolunteerProfileResponse]:
    """List all conferences where the applicant has the Volunteer role, with profile data."""
    applicant = current_applicant.applicant

    # Find all Volunteer role assignments for this applicant
    result = await db.execute(
        select(UserRoleAssignment.user_role_id, UserRole.conference_id)
        .join(UserRole, UserRoleAssignment.user_role_id == UserRole.id)
        .where(
            UserRoleAssignment.applicant_id == current_applicant.applicant_id,
            UserRole.name == "Volunteer",
        )
    )
    role_rows = result.all()

    if not role_rows:
        return []

    conference_ids = [row.conference_id for row in role_rows]

    # Get existing profiles
    prof_result = await db.execute(
        select(VolunteerProfile).where(
            VolunteerProfile.applicant_id == current_applicant.applicant_id,
            VolunteerProfile.conference_id.in_(conference_ids),
        )
    )
    profiles = {p.conference_id: p for p in prof_result.scalars().all()}

    items: list[VolunteerProfileResponse] = []
    for row in role_rows:
        conf_id = row.conference_id
        profile = profiles.get(conf_id)
        items.append(
            VolunteerProfileResponse(
                id=profile.id if profile else current_applicant.applicant_id,
                conference_id=conf_id,
                applicant_id=current_applicant.applicant_id,
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

    return items


@router.put("/me/volunteer-profiles/{conference_id}")
async def update_my_volunteer_profile(
    conference_id: UUID,
    data: VolunteerProfileUpdate,
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> VolunteerProfileResponse:
    """Update the applicant's own volunteer profile for a conference."""
    applicant = current_applicant.applicant

    # Verify the applicant has Volunteer role for this conference
    role_check = await db.execute(
        select(UserRoleAssignment.id)
        .join(UserRole, UserRoleAssignment.user_role_id == UserRole.id)
        .where(
            UserRoleAssignment.applicant_id == current_applicant.applicant_id,
            UserRole.conference_id == conference_id,
            UserRole.name == "Volunteer",
        )
    )
    if not role_check.scalar_one_or_none():
        raise NotFoundError("You are not assigned as a volunteer for this conference")

    # Find or create profile
    prof_result = await db.execute(
        select(VolunteerProfile).where(
            VolunteerProfile.conference_id == conference_id,
            VolunteerProfile.applicant_id == current_applicant.applicant_id,
        )
    )
    profile = prof_result.scalar_one_or_none()

    update_dict = data.model_dump(exclude_unset=True)
    # Don't allow applicant to set color (admin-only field)
    update_dict.pop("color", None)

    if not profile:
        profile = VolunteerProfile(
            tenant_id=current_applicant.tenant_id,
            conference_id=conference_id,
            applicant_id=current_applicant.applicant_id,
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
        applicant_id=current_applicant.applicant_id,
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
