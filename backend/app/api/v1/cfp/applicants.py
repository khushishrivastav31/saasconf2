"""Applicant management (admin) endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select

from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    TenantAdminDep,
    require_module,
)
from app.core.exceptions import NotFoundError
from app.core.security import hash_password
from app.models.associations import ConferenceCFP
from app.models.attachment import Attachment
from app.models.cfp import (
    CFPApplicant,
    CFPPaper,
    CFPPaperCospeaker,
)
from app.schemas.cfp import (
    ApplicantCreate,
    ApplicantListResponse,
    ApplicantResponse,
    ApplicantUpdate,
)

from .shared import (
    MODULE_CODE,
    _get_applicant_picture_url,
    _get_applicant_video_url,
)

router = APIRouter()


@router.get("/applicants", response_model=ApplicantListResponse, dependencies=[Depends(require_module(MODULE_CODE))])
async def list_applicants(
    current_user: CurrentUserDep,
    db: DbSessionDep,
    conference_id: UUID | None = Query(None, description="Filter applicants by conference"),
) -> ApplicantListResponse:
    """List applicants for the current tenant, optionally filtered by conference.

    When conference_id is provided, only returns applicants who are either
    the main speaker of a paper belonging to a CFP linked to that conference,
    or an accepted co-speaker on such a paper.
    """
    query = (
        select(CFPApplicant)
        .where(CFPApplicant.tenant_id == current_user.tenant_id)
        .order_by(CFPApplicant.last_name, CFPApplicant.first_name)
    )

    if conference_id is not None:
        # Sub-query: CFP IDs linked to this conference
        cfp_ids_subq = (
            select(ConferenceCFP.cfp_id)
            .where(ConferenceCFP.conference_id == conference_id)
            .scalar_subquery()
        )
        # Main speakers of papers in those CFPs
        main_speaker_ids = (
            select(CFPPaper.main_speaker_id)
            .where(CFPPaper.cfp_id.in_(cfp_ids_subq))
            .scalar_subquery()
        )
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
        query = query.where(
            CFPApplicant.id.in_(main_speaker_ids) | CFPApplicant.id.in_(cospeaker_ids)
        )

    result = await db.execute(query)
    applicants = list(result.scalars().all())

    items = []
    for a in applicants:
        picture_url = await _get_applicant_picture_url(db, a.id, current_user.tenant_id)
        video_url = await _get_applicant_video_url(db, a.id, current_user.tenant_id)
        items.append(
            ApplicantResponse(
                id=a.id,
                tenant_id=a.tenant_id,
                first_name=a.first_name,
                last_name=a.last_name,
                email=a.email,
                phone=a.phone,
                title=a.title,
                company=a.company,
                bio=a.bio,
                allow_out_of_timeframe=a.allow_out_of_timeframe,
                social_links=a.social_links or {},
                needs_accessibility=a.needs_accessibility,
                accessibility_details=a.accessibility_details,
                agrees_to_recording=a.agrees_to_recording,
                picture_url=picture_url,
                video_url=video_url,
                created_at=a.created_at,
                updated_at=a.updated_at,
            )
        )

    return ApplicantListResponse(items=items, total=len(items))


@router.post("/applicants", response_model=ApplicantResponse, status_code=201, dependencies=[Depends(require_module(MODULE_CODE))])
async def create_applicant(
    applicant_data: ApplicantCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> ApplicantResponse:
    """Create a new applicant."""
    social_links_dict = applicant_data.social_links.model_dump() if applicant_data.social_links else {}
    applicant = CFPApplicant(
        tenant_id=current_user.tenant_id,
        first_name=applicant_data.first_name,
        last_name=applicant_data.last_name,
        email=applicant_data.email,
        phone=applicant_data.phone,
        title=applicant_data.title,
        company=applicant_data.company,
        bio=applicant_data.bio,
        allow_out_of_timeframe=applicant_data.allow_out_of_timeframe,
        social_links=social_links_dict,
        needs_accessibility=applicant_data.needs_accessibility,
        accessibility_details=applicant_data.accessibility_details,
        agrees_to_recording=applicant_data.agrees_to_recording,
        password_hash=hash_password(applicant_data.password),
    )
    db.add(applicant)
    await db.commit()
    await db.refresh(applicant)

    return ApplicantResponse(
        id=applicant.id,
        tenant_id=applicant.tenant_id,
        first_name=applicant.first_name,
        last_name=applicant.last_name,
        email=applicant.email,
        phone=applicant.phone,
        title=applicant.title,
        company=applicant.company,
        bio=applicant.bio,
        allow_out_of_timeframe=applicant.allow_out_of_timeframe,
        social_links=applicant.social_links or {},
        needs_accessibility=applicant.needs_accessibility,
        accessibility_details=applicant.accessibility_details,
        agrees_to_recording=applicant.agrees_to_recording,
        picture_url=None,
        video_url=None,
        created_at=applicant.created_at,
        updated_at=applicant.updated_at,
    )


@router.put("/applicants/{applicant_id}", response_model=ApplicantResponse, dependencies=[Depends(require_module(MODULE_CODE))])
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
            CFPApplicant.tenant_id == current_user.tenant_id,
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

    for field, value in update_data.items():
        setattr(applicant, field, value)

    await db.commit()
    await db.refresh(applicant)

    picture_url = await _get_applicant_picture_url(db, applicant.id, current_user.tenant_id)
    video_url = await _get_applicant_video_url(db, applicant.id, current_user.tenant_id)

    return ApplicantResponse(
        id=applicant.id,
        tenant_id=applicant.tenant_id,
        first_name=applicant.first_name,
        last_name=applicant.last_name,
        email=applicant.email,
        phone=applicant.phone,
        title=applicant.title,
        company=applicant.company,
        bio=applicant.bio,
        allow_out_of_timeframe=applicant.allow_out_of_timeframe,
        social_links=applicant.social_links or {},
        needs_accessibility=applicant.needs_accessibility,
        accessibility_details=applicant.accessibility_details,
        agrees_to_recording=applicant.agrees_to_recording,
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
) -> dict:
    """Delete an applicant and their attachments."""
    result = await db.execute(
        select(CFPApplicant).where(
            CFPApplicant.id == applicant_id,
            CFPApplicant.tenant_id == current_user.tenant_id,
        )
    )
    applicant = result.scalar_one_or_none()

    if not applicant:
        raise NotFoundError(f"Applicant with ID '{applicant_id}' not found")

    # Delete any associated attachments (pictures and videos)
    attachments_result = await db.execute(
        select(Attachment).where(
            Attachment.tenant_id == current_user.tenant_id,
            Attachment.entity_type.in_(["applicant_picture", "applicant_video"]),
            Attachment.entity_id == applicant_id,
        )
    )
    for attachment in attachments_result.scalars().all():
        await db.delete(attachment)

    applicant_name = f"{applicant.first_name} {applicant.last_name}"
    await db.delete(applicant)
    await db.commit()

    return {"message": f"Applicant '{applicant_name}' deleted successfully"}
