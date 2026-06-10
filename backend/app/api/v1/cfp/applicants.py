"""Applicant management (admin) endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    TenantAdminDep,
    require_module,
)
from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.core.security import hash_password
from app.core.security.pii_crypto import hash_email
from app.models.applicant_activity import ApplicantActivityLog, ApplicantActivityType
from app.models.associations import ConferenceCFP
from app.models.attachment import Attachment
from app.models.cfp import (
    CallForPapers,
    CFPApplicant,
    CFPCommitteeMember,
    CFPPaper,
    CFPPaperCospeaker,
)
from app.models.settings import UserRole, UserRoleAssignment
from app.schemas.cfp import (
    ApplicantCreate,
    ApplicantListResponse,
    ApplicantResponse,
    ApplicantUpdate,
)
from app.schemas.cfp_applicants import ApplicantRoleInfo

from .shared import (
    MODULE_CODE,
    _batch_get_attachment_urls,
    _get_applicant_picture_url,
    _get_applicant_video_url,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Role helpers
# ---------------------------------------------------------------------------


async def _get_applicant_roles(
    db: DbSessionDep,
    applicant_id: UUID,
) -> list[ApplicantRoleInfo]:
    """Fetch roles assigned to an applicant."""
    result = await db.execute(
        select(UserRole.id, UserRole.name)
        .join(UserRoleAssignment, UserRole.id == UserRoleAssignment.user_role_id)
        .where(UserRoleAssignment.applicant_id == applicant_id)
        .order_by(UserRole.name)
    )
    return [ApplicantRoleInfo(id=row.id, name=row.name) for row in result.all()]


async def _batch_get_applicant_roles(
    db: DbSessionDep,
    applicant_ids: list[UUID],
) -> dict[UUID, list[ApplicantRoleInfo]]:
    """Batch-fetch roles for multiple applicants to avoid N+1."""
    if not applicant_ids:
        return {}
    result = await db.execute(
        select(UserRoleAssignment.applicant_id, UserRole.id, UserRole.name)
        .join(UserRole, UserRole.id == UserRoleAssignment.user_role_id)
        .where(UserRoleAssignment.applicant_id.in_(applicant_ids))
        .order_by(UserRole.name)
    )
    roles_map: dict[UUID, list[ApplicantRoleInfo]] = {}
    for row in result.all():
        roles_map.setdefault(row.applicant_id, []).append(ApplicantRoleInfo(id=row.id, name=row.name))
    return roles_map


async def _sync_role_assignments(
    db: DbSessionDep,
    applicant_id: UUID,
    tenant_id: UUID,
    role_ids: list[UUID],
    assigned_by: UUID,
) -> None:
    """Replace an applicant's role assignments with the given role_ids."""
    # Validate all role_ids exist and belong to tenant
    if role_ids:
        result = await db.execute(
            select(UserRole.id).where(
                UserRole.id.in_(role_ids),
                UserRole.tenant_id == tenant_id,
            )
        )
        valid_ids = {row.id for row in result.all()}
        invalid = set(role_ids) - valid_ids
        if invalid:
            raise ValidationError(f"Invalid role IDs: {', '.join(str(i) for i in invalid)}")

    # Delete existing assignments (scoped to tenant)
    existing = await db.execute(
        select(UserRoleAssignment).where(
            UserRoleAssignment.applicant_id == applicant_id,
            UserRoleAssignment.tenant_id == tenant_id,
        )
    )
    for assignment in existing.scalars().all():
        await db.delete(assignment)
    await db.flush()  # Process DELETEs before INSERTs to avoid unique constraint violations

    # Create new assignments
    for role_id in role_ids:
        db.add(
            UserRoleAssignment(
                tenant_id=tenant_id,
                user_role_id=role_id,
                applicant_id=applicant_id,
                assigned_by=assigned_by,
            )
        )
    await db.flush()


@router.get("/applicants", response_model=ApplicantListResponse, dependencies=[Depends(require_module(MODULE_CODE))])
async def list_applicants(
    current_user: CurrentUserDep,
    db: DbSessionDep,
    conference_id: UUID | None = Query(None, description="Filter applicants by conference"),
    skip: int = Query(0, ge=0, description="Rows to skip for pagination"),
    limit: int = Query(100, ge=1, le=500, description="Rows per page (max 500)"),
) -> ApplicantListResponse:
    """List applicants for the current tenant, optionally filtered by conference.

    When conference_id is provided, only returns applicants who are either
    the main speaker of a paper belonging to a CFP linked to that conference,
    or an accepted co-speaker on such a paper.

    Paginated: defaults to 100 per page, hard-capped at 500 (per CLAUDE.md
    performance rules). Returns ``total`` = full filtered count so clients
    can render a pager.
    """
    tenant_id = current_user.require_tenant_id()
    base_filters = [CFPApplicant.tenant_id == tenant_id, CFPApplicant.is_deleted.is_(False)]

    if conference_id is not None:
        # Sub-query: CFP IDs linked to this conference
        cfp_ids_subq = (
            select(ConferenceCFP.cfp_id).where(ConferenceCFP.conference_id == conference_id).scalar_subquery()
        )
        # Main speakers of papers in those CFPs
        main_speaker_ids = select(CFPPaper.main_speaker_id).where(CFPPaper.cfp_id.in_(cfp_ids_subq)).scalar_subquery()
        # Accepted co-speakers of papers in those CFPs
        cospeaker_ids = (
            select(CFPPaperCospeaker.applicant_id)
            .join(CFPPaper, CFPPaper.id == CFPPaperCospeaker.paper_id)
            .where(
                CFPPaper.cfp_id.in_(cfp_ids_subq),
                CFPPaperCospeaker.invitation_status == "accepted",
            )
            .scalar_subquery()
        )
        base_filters.append(CFPApplicant.id.in_(main_speaker_ids) | CFPApplicant.id.in_(cospeaker_ids))

    count_stmt = select(func.count()).select_from(CFPApplicant).where(*base_filters)
    total = (await db.execute(count_stmt)).scalar() or 0

    query = (
        select(CFPApplicant)
        .where(*base_filters)
        .order_by(CFPApplicant.last_name, CFPApplicant.first_name)
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(query)
    applicants = list(result.scalars().all())

    # Batch-fetch picture URLs, video URLs, and roles to avoid N+1
    applicant_ids = [a.id for a in applicants]
    picture_urls = await _batch_get_attachment_urls(
        db, applicant_ids, "applicant_picture", current_user.require_tenant_id()
    )
    video_urls = await _batch_get_attachment_urls(
        db, applicant_ids, "applicant_video", current_user.require_tenant_id()
    )
    roles_map = await _batch_get_applicant_roles(db, applicant_ids)

    items = [
        ApplicantResponse(
            id=a.id,
            tenant_id=a.tenant_id,
            portal_user_id=a.portal_user_id,
            first_name=a.first_name,
            last_name=a.last_name,
            pronouns=a.pronouns,
            email=a.email or "",
            phone=a.phone,
            title=a.title,
            company=a.company,
            address_line_1=a.address_line_1,
            address_line_2=a.address_line_2,
            city=a.city,
            postal_code=a.postal_code,
            country=a.country,
            bio=a.bio,
            allow_out_of_timeframe=a.allow_out_of_timeframe,
            social_links=a.social_links or {},
            needs_accessibility=a.needs_accessibility,
            accessibility_details=a.accessibility_details,
            agrees_to_recording=a.agrees_to_recording,
            roles=roles_map.get(a.id, []),
            picture_url=picture_urls.get(a.id),
            video_url=video_urls.get(a.id),
            created_at=a.created_at,
            updated_at=a.updated_at,
        )
        for a in applicants
    ]

    return ApplicantListResponse(items=items, total=total)


@router.post(
    "/applicants",
    response_model=ApplicantResponse,
    status_code=201,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def create_applicant(
    applicant_data: ApplicantCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> ApplicantResponse:
    """Create a new applicant."""
    # Check for duplicate email within tenant
    existing = await db.execute(
        select(CFPApplicant.id).where(
            CFPApplicant.tenant_id == current_user.require_tenant_id(),
            CFPApplicant.email_hash == hash_email(applicant_data.email),
        )
    )
    if existing.scalar_one_or_none():
        raise ConflictError(f"An applicant with email '{applicant_data.email}' already exists")

    social_links_dict = applicant_data.social_links.model_dump() if applicant_data.social_links else {}
    applicant = CFPApplicant(
        tenant_id=current_user.require_tenant_id(),
        first_name=applicant_data.first_name,
        last_name=applicant_data.last_name,
        email=applicant_data.email,
        phone=applicant_data.phone,
        title=applicant_data.title,
        company=applicant_data.company,
        address_line_1=applicant_data.address_line_1,
        address_line_2=applicant_data.address_line_2,
        city=applicant_data.city,
        postal_code=applicant_data.postal_code,
        country=applicant_data.country,
        bio=applicant_data.bio,
        allow_out_of_timeframe=applicant_data.allow_out_of_timeframe,
        social_links=social_links_dict,
        needs_accessibility=applicant_data.needs_accessibility,
        accessibility_details=applicant_data.accessibility_details,
        agrees_to_recording=applicant_data.agrees_to_recording,
        password_hash=hash_password(applicant_data.password),
    )
    db.add(applicant)
    await db.flush()

    # Sync role assignments if provided
    roles: list[ApplicantRoleInfo] = []
    if applicant_data.role_ids:
        await _sync_role_assignments(
            db, applicant.id, current_user.require_tenant_id(), applicant_data.role_ids, current_user.user_id
        )
        roles = await _get_applicant_roles(db, applicant.id)

    await db.commit()
    await db.refresh(applicant)

    return ApplicantResponse(
        id=applicant.id,
        tenant_id=applicant.tenant_id,
        portal_user_id=applicant.portal_user_id,
        first_name=applicant.first_name,
        last_name=applicant.last_name,
        pronouns=applicant.pronouns,
        email=applicant.email or "",
        phone=applicant.phone,
        title=applicant.title,
        company=applicant.company,
        address_line_1=applicant.address_line_1,
        address_line_2=applicant.address_line_2,
        city=applicant.city,
        postal_code=applicant.postal_code,
        country=applicant.country,
        bio=applicant.bio,
        allow_out_of_timeframe=applicant.allow_out_of_timeframe,
        social_links=applicant.social_links or {},
        needs_accessibility=applicant.needs_accessibility,
        accessibility_details=applicant.accessibility_details,
        agrees_to_recording=applicant.agrees_to_recording,
        roles=roles,
        picture_url=None,
        video_url=None,
        created_at=applicant.created_at,
        updated_at=applicant.updated_at,
    )


@router.put(
    "/applicants/{applicant_id}", response_model=ApplicantResponse, dependencies=[Depends(require_module(MODULE_CODE))]
)
async def update_applicant(
    applicant_id: UUID,
    applicant_data: ApplicantUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> ApplicantResponse:
    """Update an applicant."""
    result = await db.execute(
        select(CFPApplicant).where(
            CFPApplicant.id == applicant_id,
            CFPApplicant.tenant_id == current_user.require_tenant_id(),
        )
    )
    applicant = result.scalar_one_or_none()

    if not applicant:
        raise NotFoundError(f"Applicant with ID '{applicant_id}' not found")

    update_data = applicant_data.model_dump(exclude_unset=True)

    # Handle password separately — hash if provided
    if "password" in update_data:
        password = update_data.pop("password")
        if password:
            applicant.password_hash = hash_password(password)

    # Handle social_links separately — convert from model to dict
    if "social_links" in update_data:
        social_links = update_data.pop("social_links")
        if social_links is not None:
            applicant.social_links = social_links if isinstance(social_links, dict) else social_links.model_dump()

    # Handle role_ids separately — sync assignments
    role_ids = update_data.pop("role_ids", None)
    if role_ids is not None:
        await _sync_role_assignments(db, applicant.id, current_user.require_tenant_id(), role_ids, current_user.user_id)

    for field, value in update_data.items():
        setattr(applicant, field, value)

    await db.commit()
    await db.refresh(applicant)

    picture_url = await _get_applicant_picture_url(db, applicant.id, current_user.require_tenant_id())
    video_url = await _get_applicant_video_url(db, applicant.id, current_user.require_tenant_id())
    roles = await _get_applicant_roles(db, applicant.id)

    return ApplicantResponse(
        id=applicant.id,
        tenant_id=applicant.tenant_id,
        portal_user_id=applicant.portal_user_id,
        first_name=applicant.first_name,
        last_name=applicant.last_name,
        pronouns=applicant.pronouns,
        email=applicant.email or "",
        phone=applicant.phone,
        title=applicant.title,
        company=applicant.company,
        address_line_1=applicant.address_line_1,
        address_line_2=applicant.address_line_2,
        city=applicant.city,
        postal_code=applicant.postal_code,
        country=applicant.country,
        bio=applicant.bio,
        allow_out_of_timeframe=applicant.allow_out_of_timeframe,
        social_links=applicant.social_links or {},
        needs_accessibility=applicant.needs_accessibility,
        accessibility_details=applicant.accessibility_details,
        agrees_to_recording=applicant.agrees_to_recording,
        roles=roles,
        picture_url=picture_url,
        video_url=video_url,
        created_at=applicant.created_at,
        updated_at=applicant.updated_at,
    )


@router.delete("/applicants/{applicant_id}", dependencies=[Depends(require_module(MODULE_CODE))])
async def delete_applicant(
    applicant_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    mode: str = Query(
        "default",
        description="default=block if papers exist; anonymize=redact PII keep papers; cascade=delete speaker+papers",
    ),
) -> dict:
    """Delete or anonymize an applicant.

    - ``default``: fails with 409 listing dependencies when papers/cospeaker/committee records exist.
    - ``anonymize``: redacts all PII and marks the record as deleted; papers remain with a generic
      "Deleted User" speaker entry that is hidden from all applicant list views.
    - ``cascade``: permanently deletes the speaker together with all their papers (and paper attachments).
    """
    tenant_id = current_user.require_tenant_id()
    result = await db.execute(
        select(CFPApplicant).where(
            CFPApplicant.id == applicant_id,
            CFPApplicant.tenant_id == tenant_id,
        )
    )
    applicant = result.scalar_one_or_none()

    if not applicant:
        raise NotFoundError(f"Applicant with ID '{applicant_id}' not found")

    applicant_name = f"{applicant.first_name} {applicant.last_name}"

    if mode == "anonymize":
        return await _anonymize_applicant(applicant, tenant_id, db)

    if mode == "cascade":
        return await _cascade_delete_applicant(applicant, applicant_name, tenant_id, db)

    # --- default mode: block if dependencies exist ---
    papers_result = await db.execute(
        select(CFPPaper.id, CFPPaper.title, CFPPaper.status, CFPPaper.cfp_id).where(
            CFPPaper.main_speaker_id == applicant_id
        )
    )
    papers = papers_result.all()

    cospeaker_count_result = await db.execute(
        select(func.count()).where(CFPPaperCospeaker.applicant_id == applicant_id)
    )
    cospeaker_count = cospeaker_count_result.scalar() or 0

    committee_count_result = await db.execute(
        select(func.count()).where(CFPCommitteeMember.applicant_id == applicant_id)
    )
    committee_count = committee_count_result.scalar() or 0

    if papers or cospeaker_count > 0 or committee_count > 0:
        # Enrich papers with CFP title for the frontend list
        paper_list: list[dict] = []
        if papers:
            cfp_ids = list({p.cfp_id for p in papers})
            cfp_result = await db.execute(
                select(CallForPapers.id, CallForPapers.title).where(CallForPapers.id.in_(cfp_ids))
            )
            cfp_titles = {row.id: row.title for row in cfp_result.all()}
            for p in papers:
                paper_list.append(
                    {
                        "id": str(p.id),
                        "title": p.title,
                        "status": p.status,
                        "cfp_title": cfp_titles.get(p.cfp_id, ""),
                    }
                )

        dep_parts: list[str] = []
        if paper_list:
            dep_parts.append(f"{len(paper_list)} paper{'s' if len(paper_list) > 1 else ''} as main speaker")
        if cospeaker_count > 0:
            dep_parts.append(f"{cospeaker_count} co-speaker invitation{'s' if cospeaker_count > 1 else ''}")
        if committee_count > 0:
            dep_parts.append(f"{committee_count} committee membership{'s' if committee_count > 1 else ''}")

        raise ConflictError(
            f"Cannot delete '{applicant_name}'. This speaker has: {', '.join(dep_parts)}.",
            details={
                "error_type": "speaker_has_dependencies",
                "papers": paper_list,
                "cospeaker_count": cospeaker_count,
                "committee_count": committee_count,
            },
        )

    # No dependencies — plain delete
    await _delete_applicant_attachments(applicant_id, tenant_id, db)
    _log_account_deleted(applicant, tenant_id, db)
    await db.delete(applicant)
    await db.commit()

    return {"message": f"Applicant '{applicant_name}' deleted successfully"}


async def _anonymize_applicant(applicant: CFPApplicant, tenant_id: UUID, db: AsyncSession) -> dict:
    """Redact all PII and mark the applicant as deleted (papers are preserved)."""
    original_name = f"{applicant.first_name} {applicant.last_name}"
    applicant.first_name = "Deleted"
    applicant.last_name = "User"
    applicant.pronouns = None
    applicant.email = None
    applicant.phone = None
    applicant.title = None
    applicant.company = None
    applicant.bio = None
    applicant.social_links = {}
    applicant.needs_accessibility = False
    applicant.accessibility_details = None
    applicant.agrees_to_recording = False
    applicant.address_line_1 = None
    applicant.address_line_2 = None
    applicant.city = None
    applicant.postal_code = None
    applicant.country = None
    applicant.is_deleted = True

    await db.commit()
    return {"message": f"Applicant '{original_name}' has been anonymized"}


async def _cascade_delete_applicant(
    applicant: CFPApplicant,
    applicant_name: str,
    tenant_id: UUID,
    db: AsyncSession,
) -> dict:
    """Delete the applicant together with all their papers and paper attachments."""
    applicant_id = applicant.id

    # Collect paper IDs for the applicant
    paper_ids_result = await db.execute(select(CFPPaper.id).where(CFPPaper.main_speaker_id == applicant_id))
    paper_ids = [row[0] for row in paper_ids_result.all()]

    # Delete paper attachments (videos) for all those papers
    if paper_ids:
        paper_attachments_result = await db.execute(
            select(Attachment).where(
                Attachment.tenant_id == tenant_id,
                Attachment.entity_type == "paper_video",
                Attachment.entity_id.in_(paper_ids),
            )
        )
        for att in paper_attachments_result.scalars().all():
            await db.delete(att)

        # Delete the papers themselves (cascade in DB removes cospeakers/comments/assignments)
        await db.execute(delete(CFPPaper).where(CFPPaper.id.in_(paper_ids)))

    # Delete cospeaker invitations where this applicant is a co-speaker
    await db.execute(delete(CFPPaperCospeaker).where(CFPPaperCospeaker.applicant_id == applicant_id))

    # Delete committee memberships
    await db.execute(delete(CFPCommitteeMember).where(CFPCommitteeMember.applicant_id == applicant_id))

    # Delete the applicant's own profile attachments
    await _delete_applicant_attachments(applicant_id, tenant_id, db)

    _log_account_deleted(applicant, tenant_id, db)
    await db.delete(applicant)
    await db.commit()

    paper_word = "paper" if len(paper_ids) == 1 else "papers"
    return {"message": f"Applicant '{applicant_name}' and {len(paper_ids)} {paper_word} deleted successfully"}


async def _delete_applicant_attachments(applicant_id: UUID, tenant_id: UUID, db: AsyncSession) -> None:
    attachments_result = await db.execute(
        select(Attachment).where(
            Attachment.tenant_id == tenant_id,
            Attachment.entity_type.in_(["applicant_picture", "applicant_video"]),
            Attachment.entity_id == applicant_id,
        )
    )
    for att in attachments_result.scalars().all():
        await db.delete(att)


def _log_account_deleted(applicant: CFPApplicant, tenant_id: UUID, db: AsyncSession) -> None:
    activity_log = ApplicantActivityLog(
        tenant_id=tenant_id,
        applicant_id=None,
        applicant_email=applicant.email,
        applicant_first_name=applicant.first_name,
        applicant_last_name=applicant.last_name,
        activity_type=ApplicantActivityType.ACCOUNT_DELETED.value,
    )
    db.add(activity_log)
