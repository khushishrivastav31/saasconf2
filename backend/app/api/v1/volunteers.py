"""Volunteer management endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    TenantAdminDep,
    get_client_ip,
    require_module,
)
from app.core.exceptions import NotFoundError, ValidationError
from app.core.pagination import calculate_pages, paginate
from app.core.search import unaccent_ilike
from app.core.utils import utcnow
from app.models.associations import ConferenceVolunteer
from app.models.audit import AuditLog
from app.models.conference import Conference
from app.models.volunteer import Volunteer, VolunteerStatus
from app.schemas.volunteer import (
    VolunteerCreate,
    VolunteerListResponse,
    VolunteerResponse,
    VolunteerStats,
    VolunteerUpdate,
)

router = APIRouter()

MODULE_CODE = "volunteers"


@router.get("", response_model=VolunteerListResponse, dependencies=[Depends(require_module(MODULE_CODE))])
async def list_volunteers(
    current_user: CurrentUserDep,
    db: DbSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = None,
    search: str | None = None,
    role: str | None = None,
    conference_id: UUID | None = None,
) -> VolunteerListResponse:
    """
    List volunteers for the current tenant.

    Requires the 'volunteers' module.
    """
    query = (
        select(Volunteer)
        .where(Volunteer.tenant_id == current_user.tenant_id)
        .options(selectinload(Volunteer.conferences))
    )

    if conference_id:
        query = query.join(ConferenceVolunteer, ConferenceVolunteer.volunteer_id == Volunteer.id).where(
            ConferenceVolunteer.conference_id == conference_id
        )

    if status:
        query = query.where(Volunteer.status == status)

    if role:
        query = query.where(Volunteer.role == role)

    if search:
        search_filter = (
            unaccent_ilike(Volunteer.first_name, search)
            | unaccent_ilike(Volunteer.last_name, search)
            | unaccent_ilike(Volunteer.email, search)
        )
        query = query.where(search_filter)

    # Apply ordering before pagination
    query = query.order_by(Volunteer.created_at.desc())

    # Paginate
    result = await paginate(db, query, page, page_size)
    volunteers = result.items
    total = result.total

    items = [
        VolunteerResponse(
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
            conference_ids=[c.id for c in v.conferences],
        )
        for v in volunteers
    ]

    return VolunteerListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=calculate_pages(total, page_size),
    )


@router.get("/stats", response_model=VolunteerStats, dependencies=[Depends(require_module(MODULE_CODE))])
async def get_volunteer_stats(
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> VolunteerStats:
    """Get volunteer statistics for the current tenant."""

    base_query = select(Volunteer).where(Volunteer.tenant_id == current_user.tenant_id)

    # Total count
    total = (await db.execute(select(func.count()).select_from(base_query.subquery()))).scalar() or 0

    # Count by status
    status_counts = {}
    for status in VolunteerStatus:
        count = (
            await db.execute(
                select(func.count()).where(
                    Volunteer.tenant_id == current_user.tenant_id,
                    Volunteer.status == status.value,
                )
            )
        ).scalar() or 0
        status_counts[status.value] = count

    # Total hours
    total_hours = (
        await db.execute(select(func.sum(Volunteer.total_hours)).where(Volunteer.tenant_id == current_user.tenant_id))
    ).scalar() or 0.0

    return VolunteerStats(
        total=total,
        pending=status_counts.get("pending", 0),
        approved=status_counts.get("approved", 0),
        active=status_counts.get("active", 0),
        inactive=status_counts.get("inactive", 0),
        rejected=status_counts.get("rejected", 0),
        total_hours=total_hours,
    )


@router.post("", response_model=VolunteerResponse, status_code=201, dependencies=[Depends(require_module(MODULE_CODE))])
async def create_volunteer(
    volunteer_data: VolunteerCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> VolunteerResponse:
    """Create a new volunteer."""

    # Validate conference exists and belongs to tenant
    conf_result = await db.execute(
        select(Conference).where(
            Conference.id == volunteer_data.conference_id,
            Conference.tenant_id == current_user.tenant_id,
        )
    )
    if not conf_result.scalar_one_or_none():
        raise NotFoundError(f"Conference with ID '{volunteer_data.conference_id}' not found")

    # Check for duplicate email within tenant
    existing = await db.execute(
        select(Volunteer).where(
            Volunteer.tenant_id == current_user.tenant_id,
            func.lower(Volunteer.email) == volunteer_data.email.strip().lower(),
        )
    )
    if existing.scalar_one_or_none():
        raise ValidationError(f"Volunteer with email '{volunteer_data.email}' already exists")

    volunteer = Volunteer(
        tenant_id=current_user.tenant_id,
        email=volunteer_data.email,
        first_name=volunteer_data.first_name,
        last_name=volunteer_data.last_name,
        phone=volunteer_data.phone,
        role=volunteer_data.role,
        skills=volunteer_data.skills,
        availability=volunteer_data.availability,
        notes=volunteer_data.notes,
        emergency_contact_name=volunteer_data.emergency_contact_name,
        emergency_contact_phone=volunteer_data.emergency_contact_phone,
        tshirt_size=volunteer_data.tshirt_size,
        status=VolunteerStatus.PENDING.value,
    )
    db.add(volunteer)
    await db.flush()  # Get volunteer.id before creating association

    # Create conference association
    db.add(
        ConferenceVolunteer(
            conference_id=volunteer_data.conference_id,
            volunteer_id=volunteer.id,
        )
    )

    # Audit log
    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="volunteer.create",
        resource_type="volunteer",
        resource_id=volunteer.id,
        details={"email": volunteer.email, "name": volunteer.full_name},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(volunteer)

    return VolunteerResponse(
        id=volunteer.id,
        tenant_id=volunteer.tenant_id,
        email=volunteer.email,
        first_name=volunteer.first_name,
        last_name=volunteer.last_name,
        full_name=volunteer.full_name,
        phone=volunteer.phone,
        status=volunteer.status,
        role=volunteer.role,
        skills=volunteer.skills,
        availability=volunteer.availability,
        notes=volunteer.notes,
        emergency_contact_name=volunteer.emergency_contact_name,
        emergency_contact_phone=volunteer.emergency_contact_phone,
        tshirt_size=volunteer.tshirt_size,
        application_date=volunteer.application_date,
        approved_date=volunteer.approved_date,
        total_hours=volunteer.total_hours,
        created_at=volunteer.created_at,
        updated_at=volunteer.updated_at,
        conference_ids=[volunteer_data.conference_id],
    )


@router.get("/{volunteer_id}", response_model=VolunteerResponse, dependencies=[Depends(require_module(MODULE_CODE))])
async def get_volunteer(
    volunteer_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> VolunteerResponse:
    """Get volunteer by ID."""

    result = await db.execute(
        select(Volunteer)
        .where(
            Volunteer.id == volunteer_id,
            Volunteer.tenant_id == current_user.tenant_id,
        )
        .options(selectinload(Volunteer.conferences))
    )
    volunteer = result.scalar_one_or_none()

    if not volunteer:
        raise NotFoundError(f"Volunteer with ID '{volunteer_id}' not found")

    return VolunteerResponse(
        id=volunteer.id,
        tenant_id=volunteer.tenant_id,
        email=volunteer.email,
        first_name=volunteer.first_name,
        last_name=volunteer.last_name,
        full_name=volunteer.full_name,
        phone=volunteer.phone,
        status=volunteer.status,
        role=volunteer.role,
        skills=volunteer.skills,
        availability=volunteer.availability,
        notes=volunteer.notes,
        emergency_contact_name=volunteer.emergency_contact_name,
        emergency_contact_phone=volunteer.emergency_contact_phone,
        tshirt_size=volunteer.tshirt_size,
        application_date=volunteer.application_date,
        approved_date=volunteer.approved_date,
        total_hours=volunteer.total_hours,
        created_at=volunteer.created_at,
        updated_at=volunteer.updated_at,
        conference_ids=[c.id for c in volunteer.conferences],
    )


@router.put("/{volunteer_id}", response_model=VolunteerResponse, dependencies=[Depends(require_module(MODULE_CODE))])
async def update_volunteer(
    volunteer_id: UUID,
    volunteer_data: VolunteerUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> VolunteerResponse:
    """Update volunteer details."""

    result = await db.execute(
        select(Volunteer).where(
            Volunteer.id == volunteer_id,
            Volunteer.tenant_id == current_user.tenant_id,
        )
    )
    volunteer = result.scalar_one_or_none()

    if not volunteer:
        raise NotFoundError(f"Volunteer with ID '{volunteer_id}' not found")

    # Track status change for approved_date
    old_status = volunteer.status
    update_data = volunteer_data.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        setattr(volunteer, field, value)

    # Set approved_date when status changes to approved
    if "status" in update_data:
        new_status = update_data["status"]
        if new_status == VolunteerStatus.APPROVED.value and old_status != VolunteerStatus.APPROVED.value:
            volunteer.approved_date = utcnow()

    # Audit log
    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="volunteer.update",
        resource_type="volunteer",
        resource_id=volunteer.id,
        details=update_data,
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()

    # Re-fetch with eager-loaded conferences
    refreshed_result = await db.execute(
        select(Volunteer).where(Volunteer.id == volunteer_id).options(selectinload(Volunteer.conferences))
    )
    volunteer = refreshed_result.scalar_one()

    return VolunteerResponse(
        id=volunteer.id,
        tenant_id=volunteer.tenant_id,
        email=volunteer.email,
        first_name=volunteer.first_name,
        last_name=volunteer.last_name,
        full_name=volunteer.full_name,
        phone=volunteer.phone,
        status=volunteer.status,
        role=volunteer.role,
        skills=volunteer.skills,
        availability=volunteer.availability,
        notes=volunteer.notes,
        emergency_contact_name=volunteer.emergency_contact_name,
        emergency_contact_phone=volunteer.emergency_contact_phone,
        tshirt_size=volunteer.tshirt_size,
        application_date=volunteer.application_date,
        approved_date=volunteer.approved_date,
        total_hours=volunteer.total_hours,
        created_at=volunteer.created_at,
        updated_at=volunteer.updated_at,
        conference_ids=[c.id for c in volunteer.conferences],
    )


@router.delete("/{volunteer_id}", dependencies=[Depends(require_module(MODULE_CODE))])
async def delete_volunteer(
    volunteer_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
    conference_id: UUID | None = Query(
        None,
        description="Conference to unlink from. If volunteer is only in this conference, they will be deleted entirely.",
    ),
) -> dict:
    """
    Delete or unlink a volunteer.

    If conference_id is provided:
    - If volunteer is linked to multiple conferences, only unlinks from the specified conference
    - If volunteer is only linked to this conference, deletes the volunteer entirely

    If conference_id is not provided:
    - Deletes the volunteer entirely (legacy behavior)
    """

    result = await db.execute(
        select(Volunteer).where(
            Volunteer.id == volunteer_id,
            Volunteer.tenant_id == current_user.tenant_id,
        )
    )
    volunteer = result.scalar_one_or_none()

    if not volunteer:
        raise NotFoundError(f"Volunteer with ID '{volunteer_id}' not found")

    volunteer_name = volunteer.full_name

    # If conference_id is provided, check how many conferences this volunteer is linked to
    if conference_id:
        # Verify the conference exists and belongs to the tenant
        conf_result = await db.execute(
            select(Conference).where(
                Conference.id == conference_id,
                Conference.tenant_id == current_user.tenant_id,
            )
        )
        conference = conf_result.scalar_one_or_none()
        if not conference:
            raise NotFoundError(f"Conference with ID '{conference_id}' not found")

        # Check if volunteer is linked to this conference
        link_result = await db.execute(
            select(ConferenceVolunteer).where(
                ConferenceVolunteer.volunteer_id == volunteer_id,
                ConferenceVolunteer.conference_id == conference_id,
            )
        )
        link = link_result.scalar_one_or_none()
        if not link:
            raise ValidationError(f"Volunteer is not linked to conference '{conference.name}'")

        # Count how many conferences this volunteer is linked to
        count_result = await db.execute(select(func.count()).where(ConferenceVolunteer.volunteer_id == volunteer_id))
        link_count = count_result.scalar() or 0

        if link_count > 1:
            # Volunteer is in multiple conferences - just unlink from this one
            await db.delete(link)

            # Audit log for unlink
            audit_log = AuditLog(
                tenant_id=current_user.tenant_id,
                user_id=current_user.user_id,
                action="volunteer.unlink",
                resource_type="volunteer",
                resource_id=volunteer_id,
                details={
                    "email": volunteer.email,
                    "name": volunteer_name,
                    "conference_id": str(conference_id),
                    "conference_name": conference.name,
                },
                ip_address=get_client_ip(request),
                user_agent=request.headers.get("User-Agent"),
            )
            db.add(audit_log)

            await db.commit()
            return {"message": f"Volunteer '{volunteer_name}' unlinked from conference '{conference.name}'"}

    # Delete volunteer entirely (either no conference_id, or this is the only conference)
    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="volunteer.delete",
        resource_type="volunteer",
        resource_id=volunteer_id,
        details={"email": volunteer.email, "name": volunteer_name},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.delete(volunteer)
    await db.commit()

    return {"message": f"Volunteer '{volunteer_name}' deleted successfully"}


@router.post(
    "/{volunteer_id}/approve", response_model=VolunteerResponse, dependencies=[Depends(require_module(MODULE_CODE))]
)
async def approve_volunteer(
    volunteer_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> VolunteerResponse:
    """Approve a volunteer application."""

    result = await db.execute(
        select(Volunteer).where(
            Volunteer.id == volunteer_id,
            Volunteer.tenant_id == current_user.tenant_id,
        )
    )
    volunteer = result.scalar_one_or_none()

    if not volunteer:
        raise NotFoundError(f"Volunteer with ID '{volunteer_id}' not found")

    volunteer.status = VolunteerStatus.APPROVED.value
    volunteer.approved_date = utcnow()

    # Audit log
    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="volunteer.approve",
        resource_type="volunteer",
        resource_id=volunteer.id,
        details={"name": volunteer.full_name},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()

    # Re-fetch with eager-loaded conferences
    refreshed_result = await db.execute(
        select(Volunteer).where(Volunteer.id == volunteer_id).options(selectinload(Volunteer.conferences))
    )
    volunteer = refreshed_result.scalar_one()

    return VolunteerResponse(
        id=volunteer.id,
        tenant_id=volunteer.tenant_id,
        email=volunteer.email,
        first_name=volunteer.first_name,
        last_name=volunteer.last_name,
        full_name=volunteer.full_name,
        phone=volunteer.phone,
        status=volunteer.status,
        role=volunteer.role,
        skills=volunteer.skills,
        availability=volunteer.availability,
        notes=volunteer.notes,
        emergency_contact_name=volunteer.emergency_contact_name,
        emergency_contact_phone=volunteer.emergency_contact_phone,
        tshirt_size=volunteer.tshirt_size,
        application_date=volunteer.application_date,
        approved_date=volunteer.approved_date,
        total_hours=volunteer.total_hours,
        created_at=volunteer.created_at,
        updated_at=volunteer.updated_at,
        conference_ids=[c.id for c in volunteer.conferences],
    )
