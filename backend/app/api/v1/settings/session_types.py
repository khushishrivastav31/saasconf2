"""Session Types CRUD endpoints."""

from uuid import UUID

from fastapi import APIRouter, Request
from sqlalchemy import select

from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    TenantAdminDep,
    get_client_ip,
)
from app.core.exceptions import NotFoundError, ValidationError
from app.models.audit import AuditLog
from app.models.settings import SessionType
from app.schemas.settings import (
    SessionTypeCreate,
    SessionTypeListResponse,
    SessionTypeResponse,
    SessionTypeUpdate,
)

from ._shared import _resolve_conference

router = APIRouter()


@router.get("/session-types", response_model=SessionTypeListResponse)
async def list_session_types(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> SessionTypeListResponse:
    """List all session types for a conference."""
    conference = await _resolve_conference(conference_id, current_user, db)

    query = (
        select(SessionType)
        .where(
            SessionType.conference_id == conference.id,
            SessionType.tenant_id == conference.tenant_id,
        )
        .order_by(SessionType.duration_minutes.desc(), SessionType.name)
    )
    result = await db.execute(query)
    session_types = result.scalars().all()

    items = [
        SessionTypeResponse(
            id=st.id,
            tenant_id=st.tenant_id,
            conference_id=st.conference_id,
            name=st.name,
            slug=st.slug,
            duration_minutes=st.duration_minutes,
            cfp_eligible=st.cfp_eligible,
            is_active=st.is_active,
            created_at=st.created_at,
            updated_at=st.updated_at,
        )
        for st in session_types
    ]

    return SessionTypeListResponse(items=items, total=len(items))


@router.post("/session-types", response_model=SessionTypeResponse)
async def create_session_type(
    conference_id: UUID,
    st_data: SessionTypeCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> SessionTypeResponse:
    """Create a new session type for a conference."""
    conference = await _resolve_conference(conference_id, current_user, db)

    # Check unique slug within conference
    existing = await db.execute(
        select(SessionType).where(
            SessionType.conference_id == conference.id,
            SessionType.tenant_id == conference.tenant_id,
            SessionType.slug == st_data.slug,
        )
    )
    if existing.scalar_one_or_none():
        raise ValidationError(f"A session type with slug '{st_data.slug}' already exists")

    session_type = SessionType(
        tenant_id=conference.tenant_id,
        conference_id=conference.id,
        name=st_data.name,
        slug=st_data.slug,
        duration_minutes=st_data.duration_minutes,
        cfp_eligible=st_data.cfp_eligible,
        is_active=st_data.is_active,
    )
    db.add(session_type)

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="session_type.create",
        resource_type="session_type",
        resource_id=session_type.id,
        details={"name": session_type.name, "slug": session_type.slug, "conference_id": str(conference.id)},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(session_type)

    return SessionTypeResponse(
        id=session_type.id,
        tenant_id=session_type.tenant_id,
        conference_id=session_type.conference_id,
        name=session_type.name,
        slug=session_type.slug,
        duration_minutes=session_type.duration_minutes,
        cfp_eligible=session_type.cfp_eligible,
        is_active=session_type.is_active,
        created_at=session_type.created_at,
        updated_at=session_type.updated_at,
    )


@router.put("/session-types/{session_type_id}", response_model=SessionTypeResponse)
async def update_session_type(
    conference_id: UUID,
    session_type_id: UUID,
    st_data: SessionTypeUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> SessionTypeResponse:
    """Update an existing session type."""
    conference = await _resolve_conference(conference_id, current_user, db)

    result = await db.execute(
        select(SessionType).where(
            SessionType.id == session_type_id,
            SessionType.conference_id == conference.id,
        )
    )
    session_type = result.scalar_one_or_none()
    if not session_type:
        raise NotFoundError(f"Session type with ID '{session_type_id}' not found")

    # If slug is changing, check uniqueness
    if st_data.slug is not None and st_data.slug != session_type.slug:
        existing = await db.execute(
            select(SessionType).where(
                SessionType.conference_id == conference.id,
                SessionType.tenant_id == conference.tenant_id,
                SessionType.slug == st_data.slug,
                SessionType.id != session_type_id,
            )
        )
        if existing.scalar_one_or_none():
            raise ValidationError(f"A session type with slug '{st_data.slug}' already exists")

    update_data = st_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(session_type, field, value)

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="session_type.update",
        resource_type="session_type",
        resource_id=session_type.id,
        details={"updated_fields": list(update_data.keys())},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(session_type)

    return SessionTypeResponse(
        id=session_type.id,
        tenant_id=session_type.tenant_id,
        conference_id=session_type.conference_id,
        name=session_type.name,
        slug=session_type.slug,
        duration_minutes=session_type.duration_minutes,
        cfp_eligible=session_type.cfp_eligible,
        is_active=session_type.is_active,
        created_at=session_type.created_at,
        updated_at=session_type.updated_at,
    )


@router.delete("/session-types/{session_type_id}")
async def delete_session_type(
    conference_id: UUID,
    session_type_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete a session type."""
    conference = await _resolve_conference(conference_id, current_user, db)

    result = await db.execute(
        select(SessionType).where(
            SessionType.id == session_type_id,
            SessionType.conference_id == conference.id,
        )
    )
    session_type = result.scalar_one_or_none()
    if not session_type:
        raise NotFoundError(f"Session type with ID '{session_type_id}' not found")

    st_name = session_type.name

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="session_type.delete",
        resource_type="session_type",
        resource_id=session_type.id,
        details={"name": st_name, "slug": session_type.slug},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.delete(session_type)
    await db.commit()

    return {"message": f"Session type '{st_name}' deleted successfully"}
