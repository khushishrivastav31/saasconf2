"""Committee member management endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    TenantAdminDep,
    require_module,
)
from app.core.exceptions import NotFoundError
from app.core.security import hash_password
from app.core.security.pii_crypto import hash_email
from app.models.cfp import (
    CFPApplicant,
    CFPCommitteeMember,
    CFPPaper,
    CFPPaperCospeaker,
    CFPTopic,
)
from app.models.conference import Conference
from app.models.settings import UserRole, UserRoleAssignment
from app.schemas.cfp import (
    CommitteeMemberCreate,
    CommitteeMemberListResponse,
    CommitteeMemberResponse,
    CommitteeMemberUpdate,
    TopicResponse,
)

from .shared import MODULE_CODE, _batch_get_attachment_urls, _get_applicant_picture_url

PROGRAM_COMMITTEE_ROLE = "Program Committee"

router = APIRouter()


def _build_committee_member_response(
    member: CFPCommitteeMember,
    picture_url: str | None = None,
) -> CommitteeMemberResponse:
    """Build a CommitteeMemberResponse from a CFPCommitteeMember model."""
    applicant = member.applicant
    return CommitteeMemberResponse(
        id=member.id,
        tenant_id=member.tenant_id,
        conference_id=member.conference_id,
        applicant_id=member.applicant_id,
        role=member.role,
        expertise_areas=member.expertise_areas or [],
        first_name=applicant.first_name,
        last_name=applicant.last_name,
        email=applicant.email or "",
        phone=applicant.phone,
        title=applicant.title,
        company=applicant.company,
        picture_url=picture_url,
        topics=[
            TopicResponse(
                id=t.id,
                tenant_id=t.tenant_id,
                name=t.name,
                description=t.description,
                created_at=t.created_at,
                updated_at=t.updated_at,
            )
            for t in member.topics
        ],
        created_at=member.created_at,
        updated_at=member.updated_at,
    )


async def _check_committee_conflict(db: DbSessionDep, applicant_id: UUID, paper_id: UUID) -> bool:
    """Check if an applicant has a conflict of interest for a given paper."""
    paper_result = await db.execute(select(CFPPaper).where(CFPPaper.id == paper_id))
    paper = paper_result.scalar_one_or_none()
    if not paper:
        return False

    # Is main speaker?
    if paper.main_speaker_id == applicant_id:
        return True

    # Is co-speaker?
    cospeaker_result = await db.execute(
        select(CFPPaperCospeaker).where(
            CFPPaperCospeaker.paper_id == paper_id,
            CFPPaperCospeaker.applicant_id == applicant_id,
        )
    )
    return cospeaker_result.scalar_one_or_none() is not None


@router.get(
    "/committee-members",
    response_model=CommitteeMemberListResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def list_committee_members(
    current_user: CurrentUserDep,
    db: DbSessionDep,
    conference_id: UUID | None = Query(None, description="Filter by conference"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(100, ge=1, le=500, description="Max records to return"),
) -> CommitteeMemberListResponse:
    """List committee members for the current tenant, optionally filtered by conference."""
    base_filter = CFPCommitteeMember.tenant_id == current_user.tenant_id
    filters = [base_filter]
    if conference_id:
        filters.append(CFPCommitteeMember.conference_id == conference_id)

    # Total count
    count_result = await db.execute(select(func.count()).select_from(CFPCommitteeMember).where(*filters))
    total = count_result.scalar() or 0

    # Paginated data
    query = (
        select(CFPCommitteeMember)
        .options(selectinload(CFPCommitteeMember.applicant))
        .where(*filters)
        .order_by(CFPCommitteeMember.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await db.execute(query)
    members = list(result.scalars().all())

    # Batch-fetch picture URLs to avoid N+1
    applicant_ids = [m.applicant_id for m in members]
    picture_urls = await _batch_get_attachment_urls(db, applicant_ids, "applicant_picture", current_user.tenant_id)

    items = [_build_committee_member_response(m, picture_urls.get(m.applicant_id)) for m in members]

    return CommitteeMemberListResponse(items=items, total=total)


@router.post(
    "/committee-members",
    response_model=CommitteeMemberResponse,
    status_code=201,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def create_committee_member(
    member_data: CommitteeMemberCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> CommitteeMemberResponse:
    """Create a new committee member.

    Either link an existing applicant (via applicant_id) or create a new
    applicant inline (via name/email/password).
    """
    # Verify conference belongs to this tenant
    conf_result = await db.execute(
        select(Conference).where(
            Conference.id == member_data.conference_id,
            Conference.tenant_id == current_user.tenant_id,
        )
    )
    if not conf_result.scalar_one_or_none():
        raise NotFoundError(f"Conference with ID '{member_data.conference_id}' not found")

    if member_data.applicant_id:
        # Mode 1: Link existing applicant
        applicant_result = await db.execute(
            select(CFPApplicant).where(
                CFPApplicant.id == member_data.applicant_id,
                CFPApplicant.tenant_id == current_user.tenant_id,
            )
        )
        applicant = applicant_result.scalar_one_or_none()
        if not applicant:
            raise NotFoundError(f"User with ID '{member_data.applicant_id}' not found")

        # Check for existing committee membership in this conference
        existing = await db.execute(
            select(CFPCommitteeMember).where(
                CFPCommitteeMember.tenant_id == current_user.tenant_id,
                CFPCommitteeMember.conference_id == member_data.conference_id,
                CFPCommitteeMember.applicant_id == member_data.applicant_id,
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="This user is already a committee member for this conference")
    else:
        # Mode 2: Create new applicant, then link
        if not member_data.email or not member_data.password:
            raise HTTPException(status_code=400, detail="email and password are required when applicant_id is not set")
        normalized_email = member_data.email.strip().lower()
        existing_applicant = await db.execute(
            select(CFPApplicant).where(
                CFPApplicant.tenant_id == current_user.tenant_id,
                CFPApplicant.email_hash == hash_email(normalized_email),
            )
        )
        if existing_applicant.scalar_one_or_none():
            raise HTTPException(
                status_code=409,
                detail="A user with this email already exists. Use applicant_id to link them instead.",
            )

        applicant = CFPApplicant(
            tenant_id=current_user.tenant_id,
            first_name=member_data.first_name,
            last_name=member_data.last_name,
            email=normalized_email,
            phone=member_data.phone,
            password_hash=hash_password(member_data.password),
        )
        db.add(applicant)
        await db.flush()

    # Create committee member record
    member = CFPCommitteeMember(
        tenant_id=current_user.tenant_id,
        conference_id=member_data.conference_id,
        applicant_id=applicant.id,
        role=member_data.role,
        expertise_areas=member_data.expertise_areas,
    )
    db.add(member)
    await db.flush()

    # Assign topics
    if member_data.topic_ids:
        topic_result = await db.execute(
            select(CFPTopic).where(
                CFPTopic.id.in_(member_data.topic_ids),
                CFPTopic.tenant_id == current_user.tenant_id,
            )
        )
        member.topics = list(topic_result.scalars().all())

    # Auto-assign the "Program Committee" user role to this applicant
    role_result = await db.execute(
        select(UserRole).where(
            UserRole.tenant_id == current_user.tenant_id,
            UserRole.conference_id == member_data.conference_id,
            UserRole.name == PROGRAM_COMMITTEE_ROLE,
        )
    )
    pc_role = role_result.scalar_one_or_none()
    if pc_role:
        # Check if assignment already exists
        existing_assignment = await db.execute(
            select(UserRoleAssignment).where(
                UserRoleAssignment.user_role_id == pc_role.id,
                UserRoleAssignment.applicant_id == applicant.id,
            )
        )
        if not existing_assignment.scalar_one_or_none():
            db.add(
                UserRoleAssignment(
                    tenant_id=current_user.tenant_id,
                    user_role_id=pc_role.id,
                    applicant_id=applicant.id,
                    assigned_by=current_user.user_id,
                )
            )

    await db.commit()
    await db.refresh(member)
    await db.refresh(applicant)

    return _build_committee_member_response(member, picture_url=None)


@router.put(
    "/committee-members/{member_id}",
    response_model=CommitteeMemberResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def update_committee_member(
    member_id: UUID,
    member_data: CommitteeMemberUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> CommitteeMemberResponse:
    """Update a committee member's role, expertise areas, or topics."""
    result = await db.execute(
        select(CFPCommitteeMember)
        .options(selectinload(CFPCommitteeMember.applicant))
        .where(
            CFPCommitteeMember.id == member_id,
            CFPCommitteeMember.tenant_id == current_user.tenant_id,
        )
    )
    member = result.scalar_one_or_none()

    if not member:
        raise NotFoundError(f"Committee member with ID '{member_id}' not found")

    update_data = member_data.model_dump(exclude_unset=True)

    # Handle topic_ids separately
    topic_ids = update_data.pop("topic_ids", None)
    if topic_ids is not None:
        if topic_ids:
            topic_result = await db.execute(
                select(CFPTopic).where(
                    CFPTopic.id.in_(topic_ids),
                    CFPTopic.tenant_id == current_user.tenant_id,
                )
            )
            member.topics = list(topic_result.scalars().all())
        else:
            member.topics = []

    # Handle role
    if "role" in update_data:
        member.role = update_data.pop("role")

    # Handle expertise_areas
    if "expertise_areas" in update_data:
        member.expertise_areas = update_data.pop("expertise_areas")

    await db.commit()
    await db.refresh(member)

    picture_url = await _get_applicant_picture_url(db, member.applicant_id, current_user.tenant_id)

    return _build_committee_member_response(member, picture_url)


@router.delete("/committee-members/{member_id}", dependencies=[Depends(require_module(MODULE_CODE))])
async def delete_committee_member(
    member_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Remove a committee member. Does NOT delete the underlying user."""
    result = await db.execute(
        select(CFPCommitteeMember)
        .options(selectinload(CFPCommitteeMember.applicant))
        .where(
            CFPCommitteeMember.id == member_id,
            CFPCommitteeMember.tenant_id == current_user.tenant_id,
        )
    )
    member = result.scalar_one_or_none()

    if not member:
        raise NotFoundError(f"Committee member with ID '{member_id}' not found")

    member_name = f"{member.applicant.first_name} {member.applicant.last_name}"
    applicant_id = member.applicant_id
    conference_id = member.conference_id

    await db.delete(member)

    # Remove "Program Committee" role if the user has no other committee memberships
    remaining = await db.execute(
        select(func.count()).where(
            CFPCommitteeMember.applicant_id == applicant_id,
            CFPCommitteeMember.id != member_id,
        )
    )
    if (remaining.scalar() or 0) == 0:
        role_result = await db.execute(
            select(UserRole).where(
                UserRole.tenant_id == current_user.tenant_id,
                UserRole.conference_id == conference_id,
                UserRole.name == PROGRAM_COMMITTEE_ROLE,
            )
        )
        pc_role = role_result.scalar_one_or_none()
        if pc_role:
            assignment_result = await db.execute(
                select(UserRoleAssignment).where(
                    UserRoleAssignment.user_role_id == pc_role.id,
                    UserRoleAssignment.applicant_id == applicant_id,
                )
            )
            assignment = assignment_result.scalar_one_or_none()
            if assignment:
                await db.delete(assignment)

    await db.commit()

    return {"message": f"Committee member '{member_name}' removed successfully"}
