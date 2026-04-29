"""User Roles CRUD endpoints with system role seeding."""

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request
from sqlalchemy import ColumnElement, func, select
from sqlalchemy.exc import IntegrityError

from app.core.attachment_urls import batch_get_attachment_urls
from app.core.dependencies import CurrentUserDep, DbSessionDep, get_client_ip
from app.core.exceptions import NotFoundError, ValidationError
from app.core.html_sanitize import sanitize_html
from app.core.security.pii_crypto import hash_email
from app.models.audit import AuditLog
from app.models.cfp import CFPApplicant, CFPCommitteeMember, CFPPaper, CFPPaperCospeaker, PaperStatus
from app.models.program import ProgramSession
from app.models.settings import SessionType, UserRole, UserRoleAssignment
from app.schemas.settings import (
    AssignableApplicantItem,
    AssignableApplicantListResponse,
    RoleAssignmentCreate,
    RoleAssignmentListResponse,
    RoleAssignmentResponse,
    UserRoleCreate,
    UserRoleListResponse,
    UserRoleResponse,
    UserRoleUpdate,
)

from ._shared import _check_conference_admin, _resolve_conference

router = APIRouter(prefix="/user-roles", tags=["user-roles"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _ensure_system_roles(
    conference_id: UUID,
    tenant_id: UUID,
    db: DbSessionDep,
) -> None:
    """Seed the fixed system roles if they don't exist for this conference."""
    result = await db.execute(
        select(UserRole).where(
            UserRole.tenant_id == tenant_id,
            UserRole.conference_id == conference_id,
            UserRole.name.in_(UserRole.SYSTEM_ROLES),
        )
    )
    existing_roles = list(result.scalars().all())
    existing_names = {r.name for r in existing_roles}

    # Mark any existing roles with system names as is_system=True
    for role in existing_roles:
        if not role.is_system:
            role.is_system = True

    # Create missing system roles
    for role_name in UserRole.SYSTEM_ROLES:
        if role_name not in existing_names:
            db.add(
                UserRole(
                    tenant_id=tenant_id,
                    conference_id=conference_id,
                    name=role_name,
                    is_system=True,
                    is_active=True,
                )
            )

    await db.flush()

    # Backfill: ensure all committee members have the "Program Committee" role assigned
    pc_result = await db.execute(
        select(UserRole).where(
            UserRole.tenant_id == tenant_id,
            UserRole.conference_id == conference_id,
            UserRole.name == "Program Committee",
        )
    )
    pc_role = pc_result.scalar_one_or_none()
    if pc_role:
        # Get all committee member applicant IDs for this conference
        cm_result = await db.execute(
            select(CFPCommitteeMember.applicant_id).where(
                CFPCommitteeMember.tenant_id == tenant_id,
                CFPCommitteeMember.conference_id == conference_id,
            )
        )
        committee_applicant_ids = set(cm_result.scalars().all())

        if committee_applicant_ids:
            # Get existing assignments for this role
            existing_result = await db.execute(
                select(UserRoleAssignment.applicant_id).where(
                    UserRoleAssignment.user_role_id == pc_role.id,
                    UserRoleAssignment.applicant_id.in_(committee_applicant_ids),
                )
            )
            already_assigned = set(existing_result.scalars().all())

            # Create missing assignments
            for applicant_id in committee_applicant_ids - already_assigned:
                db.add(
                    UserRoleAssignment(
                        tenant_id=tenant_id,
                        user_role_id=pc_role.id,
                        applicant_id=applicant_id,
                    )
                )
            await db.flush()

    # Backfill: ensure all speakers of accepted papers have the "Speaker" role assigned
    speaker_result = await db.execute(
        select(UserRole).where(
            UserRole.tenant_id == tenant_id,
            UserRole.conference_id == conference_id,
            UserRole.name == "Speaker",
        )
    )
    speaker_role = speaker_result.scalar_one_or_none()
    if speaker_role:
        from app.models.associations import ConferenceCFP

        # Get CFP IDs for this conference
        cfp_ids_result = await db.execute(
            select(ConferenceCFP.cfp_id).where(
                ConferenceCFP.conference_id == conference_id,
            )
        )
        cfp_ids = list(cfp_ids_result.scalars().all())

        if cfp_ids:
            # Get main speakers of accepted papers
            main_speakers_result = await db.execute(
                select(CFPPaper.main_speaker_id).where(
                    CFPPaper.tenant_id == tenant_id,
                    CFPPaper.cfp_id.in_(cfp_ids),
                    CFPPaper.status == PaperStatus.ACCEPTED.value,
                    CFPPaper.main_speaker_id.isnot(None),
                )
            )
            speaker_applicant_ids = set(main_speakers_result.scalars().all())

            # Get co-speakers of accepted papers
            cospeaker_result = await db.execute(
                select(CFPPaperCospeaker.applicant_id).where(
                    CFPPaperCospeaker.paper_id.in_(
                        select(CFPPaper.id).where(
                            CFPPaper.tenant_id == tenant_id,
                            CFPPaper.cfp_id.in_(cfp_ids),
                            CFPPaper.status == PaperStatus.ACCEPTED.value,
                        )
                    )
                )
            )
            speaker_applicant_ids.update(cospeaker_result.scalars().all())

            if speaker_applicant_ids:
                existing_result = await db.execute(
                    select(UserRoleAssignment.applicant_id).where(
                        UserRoleAssignment.user_role_id == speaker_role.id,
                        UserRoleAssignment.applicant_id.in_(speaker_applicant_ids),
                    )
                )
                already_assigned = set(existing_result.scalars().all())

                for applicant_id in speaker_applicant_ids - already_assigned:
                    db.add(
                        UserRoleAssignment(
                            tenant_id=tenant_id,
                            user_role_id=speaker_role.id,
                            applicant_id=applicant_id,
                        )
                    )
                await db.flush()

    # Backfill: per-session role assignments. The user-visible model
    # is "speakers in a session with this user role appear in this
    # list" — so we anchor on ``program_sessions`` (the actual
    # placement on the program grid), not on accepted-paper status.
    # A session has a user_role via its session_type's
    # ``user_role_id`` (Settings → Session Types → "Speaker Role"
    # dropdown); the session's paper supplies the main_speaker +
    # co-speakers; both get the role assigned. Sessions whose
    # session_type has ``user_role_id IS NULL`` are no-ops. Sessions
    # without a paper_id contribute no speakers (no speaker source to
    # assign yet — invited-keynote-style paths would need a separate
    # per-session speaker table).
    mapped_sessions = await db.execute(
        select(
            CFPPaper.id,
            CFPPaper.main_speaker_id,
            SessionType.user_role_id,
        )
        .join(ProgramSession, ProgramSession.paper_id == CFPPaper.id)
        .join(SessionType, SessionType.id == ProgramSession.session_type_id)
        .where(
            ProgramSession.tenant_id == tenant_id,
            ProgramSession.conference_id == conference_id,
            SessionType.user_role_id.isnot(None),
        )
    )
    # Group applicant IDs per role.
    wanted: dict[UUID, set[UUID]] = {}
    paper_ids_by_role: dict[UUID, set[UUID]] = {}
    for paper_id, main_speaker_id, user_role_id in mapped_sessions.all():
        bucket = wanted.setdefault(user_role_id, set())
        paper_bucket = paper_ids_by_role.setdefault(user_role_id, set())
        paper_bucket.add(paper_id)
        if main_speaker_id is not None:
            bucket.add(main_speaker_id)

    # Add co-speakers per role.
    for role_id, paper_ids in paper_ids_by_role.items():
        if not paper_ids:
            continue
        cs_result = await db.execute(
            select(CFPPaperCospeaker.applicant_id).where(
                CFPPaperCospeaker.paper_id.in_(paper_ids),
            )
        )
        wanted[role_id].update(cs_result.scalars().all())

    for role_id, applicant_ids in wanted.items():
        if not applicant_ids:
            continue
        existing_result = await db.execute(
            select(UserRoleAssignment.applicant_id).where(
                UserRoleAssignment.user_role_id == role_id,
                UserRoleAssignment.applicant_id.in_(applicant_ids),
            )
        )
        already = set(existing_result.scalars().all())
        for applicant_id in applicant_ids - already:
            db.add(
                UserRoleAssignment(
                    tenant_id=tenant_id,
                    user_role_id=role_id,
                    applicant_id=applicant_id,
                )
            )
    await db.flush()


async def _get_role_for_conference(
    role_id: UUID,
    conference_id: UUID,
    tenant_id: UUID,
    db: DbSessionDep,
) -> UserRole:
    """Fetch a role, verifying it belongs to the given conference and tenant."""
    result = await db.execute(
        select(UserRole).where(
            UserRole.id == role_id,
            UserRole.tenant_id == tenant_id,
            UserRole.conference_id == conference_id,
        )
    )
    role = result.scalar_one_or_none()
    if not role:
        raise NotFoundError("User role not found")
    return role


# ---------------------------------------------------------------------------
# Role CRUD
# ---------------------------------------------------------------------------


@router.get("", response_model=UserRoleListResponse)
async def list_user_roles(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> UserRoleListResponse:
    """List all user roles for a conference, seeding system roles on first access."""
    conference = await _resolve_conference(conference_id, current_user, db)
    await _ensure_system_roles(conference.id, conference.tenant_id, db)
    try:
        await db.commit()
    except IntegrityError:
        # Race condition: concurrent request already created the assignments
        await db.rollback()

    # Subquery for assignment counts
    count_sq = (
        select(
            UserRoleAssignment.user_role_id,
            func.count(UserRoleAssignment.id).label("cnt"),
        )
        .group_by(UserRoleAssignment.user_role_id)
        .subquery()
    )

    result = await db.execute(
        select(UserRole, func.coalesce(count_sq.c.cnt, 0).label("assignment_count"))
        .outerjoin(count_sq, UserRole.id == count_sq.c.user_role_id)
        .where(
            UserRole.tenant_id == conference.tenant_id,
            UserRole.conference_id == conference.id,
        )
        .order_by(UserRole.is_system.desc(), UserRole.name)
    )
    rows = result.all()
    items = []
    for role, cnt in rows:
        resp = UserRoleResponse.model_validate(role)
        resp.assignment_count = cnt
        items.append(resp)

    return UserRoleListResponse(items=items, total=len(items))


@router.post("", response_model=UserRoleResponse, status_code=201)
async def create_user_role(
    conference_id: UUID,
    data: UserRoleCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> UserRoleResponse:
    """Create a custom user role."""
    conference = await _resolve_conference(conference_id, current_user, db)
    await _check_conference_admin(conference_id, current_user, db)

    # Check name uniqueness
    result = await db.execute(
        select(UserRole).where(
            UserRole.tenant_id == conference.tenant_id,
            UserRole.conference_id == conference.id,
            UserRole.name == data.name,
        )
    )
    if result.scalar_one_or_none():
        raise ValidationError(f"A user role named '{data.name}' already exists")

    role = UserRole(
        tenant_id=conference.tenant_id,
        conference_id=conference.id,
        name=data.name,
        description=sanitize_html(data.description) if data.description else data.description,
        is_system=False,
        is_active=data.is_active,
    )
    db.add(role)

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="user_role.create",
        resource_type="user_role",
        resource_id=None,
        details={"name": data.name, "conference_id": str(conference.id)},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()
    await db.refresh(role)

    return UserRoleResponse.model_validate(role)


@router.put("/{role_id}", response_model=UserRoleResponse)
async def update_user_role(
    conference_id: UUID,
    role_id: UUID,
    data: UserRoleUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> UserRoleResponse:
    """Update a user role. System roles cannot be renamed."""
    conference = await _resolve_conference(conference_id, current_user, db)
    await _check_conference_admin(conference_id, current_user, db)

    role = await _get_role_for_conference(role_id, conference.id, conference.tenant_id, db)

    # System roles cannot be renamed
    if role.is_system and data.name is not None and data.name != role.name:
        raise ValidationError("System roles cannot be renamed")

    # Check name uniqueness if changing name
    if data.name is not None and data.name != role.name:
        dup = await db.execute(
            select(UserRole).where(
                UserRole.tenant_id == conference.tenant_id,
                UserRole.conference_id == conference.id,
                UserRole.name == data.name,
                UserRole.id != role_id,
            )
        )
        if dup.scalar_one_or_none():
            raise ValidationError(f"A user role named '{data.name}' already exists")
        role.name = data.name

    if data.description is not None:
        role.description = sanitize_html(data.description) if data.description else data.description
    if data.is_active is not None:
        role.is_active = data.is_active

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="user_role.update",
        resource_type="user_role",
        resource_id=role.id,
        details={"name": role.name, "conference_id": str(conference.id)},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()
    await db.refresh(role)

    return UserRoleResponse.model_validate(role)


@router.delete("/{role_id}")
async def delete_user_role(
    conference_id: UUID,
    role_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete a custom user role. System roles cannot be deleted."""
    conference = await _resolve_conference(conference_id, current_user, db)
    await _check_conference_admin(conference_id, current_user, db)

    role = await _get_role_for_conference(role_id, conference.id, conference.tenant_id, db)

    if role.is_system:
        raise ValidationError("System roles cannot be deleted")

    role_name = role.name
    await db.delete(role)

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="user_role.delete",
        resource_type="user_role",
        resource_id=role_id,
        details={"name": role_name, "conference_id": str(conference.id)},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()

    return {"message": f"User role '{role_name}' deleted"}


# ---------------------------------------------------------------------------
# Role Assignment Management
# ---------------------------------------------------------------------------


@router.get("/{role_id}/assignments", response_model=RoleAssignmentListResponse)
async def list_role_assignments(
    conference_id: UUID,
    role_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    search: str | None = Query(None, max_length=200, description="Search by name or email"),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
) -> RoleAssignmentListResponse:
    """List users assigned to a specific role."""
    conference = await _resolve_conference(conference_id, current_user, db)
    role = await _get_role_for_conference(role_id, conference.id, conference.tenant_id, db)

    # Join assignments to applicants
    query = (
        select(UserRoleAssignment, CFPApplicant)
        .join(CFPApplicant, CFPApplicant.id == UserRoleAssignment.applicant_id)
        .where(UserRoleAssignment.user_role_id == role.id)
        .order_by(CFPApplicant.last_name, CFPApplicant.first_name)
    )

    # Email is encrypted — exact-match on email_hash when the query contains
    # '@', else name substring only.
    search_clause: ColumnElement[bool] | None = None
    if search:
        search_normalized = search.strip().lower()
        search_term = f"%{search_normalized}%"
        name_like = func.lower(func.concat(CFPApplicant.first_name, " ", CFPApplicant.last_name)).like(search_term)
        if "@" in search_normalized:
            search_clause = name_like | (CFPApplicant.email_hash == hash_email(search_normalized))
        else:
            search_clause = name_like
        query = query.where(search_clause)

    # Count
    count_query = (
        select(func.count())
        .select_from(UserRoleAssignment)
        .join(CFPApplicant, CFPApplicant.id == UserRoleAssignment.applicant_id)
        .where(UserRoleAssignment.user_role_id == role.id)
    )
    if search_clause is not None:
        count_query = count_query.where(search_clause)
    total = (await db.execute(count_query)).scalar() or 0

    result = await db.execute(query.offset((page - 1) * page_size).limit(page_size))
    rows = result.all()

    # Batch-fetch picture URLs
    applicant_ids = [row.CFPApplicant.id for row in rows]
    picture_urls = await batch_get_attachment_urls(db, applicant_ids, "applicant_picture", conference.tenant_id)

    items = [
        RoleAssignmentResponse(
            id=row.UserRoleAssignment.id,
            applicant_id=row.CFPApplicant.id,
            first_name=row.CFPApplicant.first_name,
            last_name=row.CFPApplicant.last_name,
            email=row.CFPApplicant.email or "",
            company=row.CFPApplicant.company,
            picture_url=picture_urls.get(row.CFPApplicant.id),
            created_at=row.UserRoleAssignment.created_at,
        )
        for row in rows
    ]

    return RoleAssignmentListResponse(items=items, total=total)


@router.post("/{role_id}/assignments", response_model=RoleAssignmentResponse, status_code=201)
async def create_role_assignment(
    conference_id: UUID,
    role_id: UUID,
    data: RoleAssignmentCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> RoleAssignmentResponse:
    """Assign an applicant to a role."""
    conference = await _resolve_conference(conference_id, current_user, db)
    await _check_conference_admin(conference_id, current_user, db)
    role = await _get_role_for_conference(role_id, conference.id, conference.tenant_id, db)

    # Verify applicant exists and belongs to tenant
    applicant_result = await db.execute(
        select(CFPApplicant).where(
            CFPApplicant.id == data.applicant_id,
            CFPApplicant.tenant_id == conference.tenant_id,
        )
    )
    applicant = applicant_result.scalar_one_or_none()
    if not applicant:
        raise NotFoundError("Applicant not found")

    # Check for duplicate
    existing = await db.execute(
        select(UserRoleAssignment).where(
            UserRoleAssignment.user_role_id == role.id,
            UserRoleAssignment.applicant_id == data.applicant_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="User is already assigned to this role")

    assignment = UserRoleAssignment(
        tenant_id=conference.tenant_id,
        user_role_id=role.id,
        applicant_id=data.applicant_id,
        assigned_by=current_user.user_id,
    )
    db.add(assignment)

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="user_role_assignment.create",
        resource_type="user_role_assignment",
        resource_id=None,
        details={
            "role_name": role.name,
            "applicant_id": str(data.applicant_id),
            "applicant_name": f"{applicant.first_name} {applicant.last_name}",
        },
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="User is already assigned to this role") from None
    await db.refresh(assignment)

    return RoleAssignmentResponse(
        id=assignment.id,
        applicant_id=applicant.id,
        first_name=applicant.first_name,
        last_name=applicant.last_name,
        email=applicant.email or "",
        company=applicant.company,
        picture_url=None,
        created_at=assignment.created_at,
    )


@router.delete("/{role_id}/assignments/{assignment_id}")
async def delete_role_assignment(
    conference_id: UUID,
    role_id: UUID,
    assignment_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Remove a user from a role."""
    conference = await _resolve_conference(conference_id, current_user, db)
    await _check_conference_admin(conference_id, current_user, db)
    role = await _get_role_for_conference(role_id, conference.id, conference.tenant_id, db)

    result = await db.execute(
        select(UserRoleAssignment).where(
            UserRoleAssignment.id == assignment_id,
            UserRoleAssignment.user_role_id == role.id,
        )
    )
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise NotFoundError("Assignment not found")

    # Get applicant name for audit log
    applicant_result = await db.execute(select(CFPApplicant).where(CFPApplicant.id == assignment.applicant_id))
    applicant = applicant_result.scalar_one_or_none()
    applicant_name = f"{applicant.first_name} {applicant.last_name}" if applicant else "Unknown"

    await db.delete(assignment)

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="user_role_assignment.delete",
        resource_type="user_role_assignment",
        resource_id=assignment_id,
        details={
            "role_name": role.name,
            "applicant_name": applicant_name,
        },
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()

    return {"message": f"'{applicant_name}' removed from '{role.name}'"}


@router.get("/{role_id}/assignable-applicants", response_model=AssignableApplicantListResponse)
async def list_assignable_applicants(
    conference_id: UUID,
    role_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    search: str | None = Query(None, max_length=200, description="Search by name or email"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
) -> AssignableApplicantListResponse:
    """List applicants NOT already assigned to this role (for the picker)."""
    conference = await _resolve_conference(conference_id, current_user, db)
    role = await _get_role_for_conference(role_id, conference.id, conference.tenant_id, db)

    # Subquery: applicant IDs already assigned to this role
    assigned_sq = (
        select(UserRoleAssignment.applicant_id).where(UserRoleAssignment.user_role_id == role.id).scalar_subquery()
    )

    query = (
        select(CFPApplicant)
        .where(
            CFPApplicant.tenant_id == conference.tenant_id,
            CFPApplicant.id.notin_(assigned_sq),
        )
        .order_by(CFPApplicant.last_name, CFPApplicant.first_name)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )

    # Email is encrypted — exact-match on email_hash when the query contains
    # '@', else name substring only.
    if search:
        search_normalized = search.strip().lower()
        search_term = f"%{search_normalized}%"
        name_clause = func.lower(func.concat(CFPApplicant.first_name, " ", CFPApplicant.last_name)).like(search_term)
        if "@" in search_normalized:
            query = query.where(name_clause | (CFPApplicant.email_hash == hash_email(search_normalized)))
        else:
            query = query.where(name_clause)

    result = await db.execute(query)
    applicants = list(result.scalars().all())

    items = [
        AssignableApplicantItem(
            id=a.id,
            first_name=a.first_name,
            last_name=a.last_name,
            email=a.email or "",
        )
        for a in applicants
    ]

    return AssignableApplicantListResponse(items=items, total=len(items))
