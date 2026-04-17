"""Volunteer task CRUD + shared helpers.

Pure business logic extracted from ``app/api/v1/volunteer_tasks.py``. All
functions operate on ``AsyncSession`` and plain values — no FastAPI
``Request``/``HTTPException`` coupling. The router parses params, verifies
tenant/admin access, then delegates here.

Read-only aggregation logic (schedule building, unassigned sessions) lives
in :mod:`app.services.volunteer_schedule_service` to keep each module
under the 600-LOC guardrail.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import NotFoundError, ValidationError
from app.models.audit import AuditLog
from app.models.cfp_applicants import CFPApplicant
from app.models.program import ProgramDay, ProgramSession, ProgramTimeSlot, ProgramTrack
from app.models.settings import UserRole, UserRoleAssignment, VolunteerRole
from app.models.volunteer_profile import VolunteerProfile
from app.models.volunteer_tasks import SessionVolunteerTask, VolunteerAssignment
from app.schemas.volunteer_tasks import (
    SessionTasksBriefResponse,
    SessionTasksListResponse,
    SessionVolunteerTaskCreate,
    SessionVolunteerTaskResponse,
    SessionVolunteerTaskUpdate,
    VolunteerAssignmentCreate,
    VolunteerAssignmentResponse,
    VolunteerColorUpdate,
)

# =============================================================================
# Shared helpers (used by volunteer_service + volunteer_schedule_service)
# =============================================================================


async def resolve_session_time(db: AsyncSession, session: ProgramSession) -> tuple[str, str, str, str, str | None]:
    """Resolve a session's day name, date, start_time, end_time, and track name."""
    slot_result = await db.execute(select(ProgramTimeSlot).where(ProgramTimeSlot.id == session.start_slot_id))
    slot = slot_result.scalar_one_or_none()

    day_name = ""
    day_date = ""
    start_time = ""
    end_time = ""
    track_name: str | None = None

    if slot:
        start_time = slot.start_time.strftime("%H:%M") if slot.start_time else ""

        if session.slot_span > 1:
            day_slots_result = await db.execute(
                select(ProgramTimeSlot)
                .where(ProgramTimeSlot.program_day_id == slot.program_day_id)
                .order_by(ProgramTimeSlot.sort_order)
            )
            day_slots = day_slots_result.scalars().all()
            slot_idx = next((i for i, s in enumerate(day_slots) if s.id == slot.id), 0)
            last_slot_idx = min(slot_idx + session.slot_span - 1, len(day_slots) - 1)
            end_time = day_slots[last_slot_idx].end_time.strftime("%H:%M") if day_slots[last_slot_idx].end_time else ""
        else:
            end_time = slot.end_time.strftime("%H:%M") if slot.end_time else ""

        day_result = await db.execute(select(ProgramDay).where(ProgramDay.id == slot.program_day_id))
        day = day_result.scalar_one_or_none()
        if day:
            day_name = day.name or f"Day {day.sort_order + 1}"
            day_date = day.date.isoformat() if day.date else ""

    if session.start_track_id:
        track_result = await db.execute(select(ProgramTrack).where(ProgramTrack.id == session.start_track_id))
        track = track_result.scalar_one_or_none()
        if track:
            track_name = track.name

    return day_name, day_date, start_time, end_time, track_name


async def get_volunteer_color(db: AsyncSession, applicant_id: UUID, conference_id: UUID) -> str | None:
    """Look up a volunteer's per-conference color (None if unset)."""
    result = await db.execute(
        select(VolunteerProfile.color).where(
            VolunteerProfile.applicant_id == applicant_id,
            VolunteerProfile.conference_id == conference_id,
        )
    )
    row = result.first()
    return row[0] if row else None


def _audit_log(
    *,
    tenant_id: UUID,
    user_id: UUID,
    action: str,
    resource_type: str,
    resource_id: UUID,
    details: dict,
    ip_address: str | None,
    user_agent: str | None,
) -> AuditLog:
    return AuditLog(
        tenant_id=tenant_id,
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id),
        details=details,
        ip_address=ip_address,
        user_agent=user_agent,
    )


async def resolve_applicant_name(db: AsyncSession, applicant_id: UUID, tenant_id: UUID) -> str:
    """Fetch an applicant's ``First Last`` name; raise NotFoundError if missing."""
    result = await db.execute(
        select(CFPApplicant).where(
            CFPApplicant.id == applicant_id,
            CFPApplicant.tenant_id == tenant_id,
        )
    )
    applicant = result.scalar_one_or_none()
    if not applicant:
        raise NotFoundError("Volunteer not found")
    return f"{applicant.first_name} {applicant.last_name}"


# =============================================================================
# Session-Task Assignments
# =============================================================================


async def list_session_tasks(db: AsyncSession, conference_id: UUID) -> SessionTasksListResponse:
    """Return all session-task assignments for a conference grouped by session."""
    result = await db.execute(
        select(SessionVolunteerTask)
        .where(SessionVolunteerTask.conference_id == conference_id)
        .options(
            selectinload(SessionVolunteerTask.volunteer_task),
            selectinload(SessionVolunteerTask.session),
            selectinload(SessionVolunteerTask.assignments),
        )
    )
    svts = result.scalars().all()

    session_map: dict[UUID, list[SessionVolunteerTaskResponse]] = {}
    for svt in svts:
        task_resp = SessionVolunteerTaskResponse(
            id=svt.id,
            session_id=svt.session_id,
            volunteer_task_id=svt.volunteer_task_id,
            volunteer_task_name=svt.volunteer_task.name if svt.volunteer_task else "Unknown",
            required_count=svt.required_count,
            assigned_count=len(svt.assignments),
            created_at=svt.created_at,
        )
        session_map.setdefault(svt.session_id, []).append(task_resp)

    items = [SessionTasksBriefResponse(session_id=sid, tasks=tasks) for sid, tasks in session_map.items()]
    return SessionTasksListResponse(items=items, total=len(svts))


async def create_session_task(
    db: AsyncSession,
    *,
    tenant_id: UUID,
    user_id: UUID,
    conference_id: UUID,
    data: SessionVolunteerTaskCreate,
    ip_address: str | None,
    user_agent: str | None,
) -> SessionVolunteerTaskResponse:
    """Assign a volunteer task to a program session."""
    session_result = await db.execute(
        select(ProgramSession).where(
            ProgramSession.id == data.session_id,
            ProgramSession.conference_id == conference_id,
        )
    )
    session = session_result.scalar_one_or_none()
    if not session:
        raise NotFoundError("Program session not found")

    task_result = await db.execute(
        select(VolunteerRole).where(
            VolunteerRole.id == data.volunteer_task_id,
            VolunteerRole.conference_id == conference_id,
        )
    )
    task = task_result.scalar_one_or_none()
    if not task:
        raise NotFoundError("Volunteer task not found")

    existing = await db.execute(
        select(SessionVolunteerTask).where(
            SessionVolunteerTask.session_id == data.session_id,
            SessionVolunteerTask.volunteer_task_id == data.volunteer_task_id,
        )
    )
    if existing.scalar_one_or_none():
        raise ValidationError("This task is already assigned to this session")

    svt = SessionVolunteerTask(
        tenant_id=tenant_id,
        conference_id=conference_id,
        session_id=data.session_id,
        volunteer_task_id=data.volunteer_task_id,
        required_count=data.required_count,
    )
    db.add(svt)
    await db.flush()

    db.add(
        _audit_log(
            tenant_id=tenant_id,
            user_id=user_id,
            action="session_volunteer_task.create",
            resource_type="session_volunteer_task",
            resource_id=svt.id,
            details={
                "conference_id": str(conference_id),
                "session_title": session.title,
                "task_name": task.name,
                "required_count": data.required_count,
            },
            ip_address=ip_address,
            user_agent=user_agent,
        )
    )

    await db.commit()
    await db.refresh(svt)

    return SessionVolunteerTaskResponse(
        id=svt.id,
        session_id=svt.session_id,
        volunteer_task_id=svt.volunteer_task_id,
        volunteer_task_name=task.name,
        required_count=svt.required_count,
        assigned_count=0,
        created_at=svt.created_at,
    )


async def update_session_task(
    db: AsyncSession,
    *,
    tenant_id: UUID,
    user_id: UUID,
    conference_id: UUID,
    svt_id: UUID,
    data: SessionVolunteerTaskUpdate,
    ip_address: str | None,
    user_agent: str | None,
) -> SessionVolunteerTaskResponse:
    """Update the required volunteer count for a session-task."""
    result = await db.execute(
        select(SessionVolunteerTask)
        .where(
            SessionVolunteerTask.id == svt_id,
            SessionVolunteerTask.conference_id == conference_id,
        )
        .options(
            selectinload(SessionVolunteerTask.volunteer_task),
            selectinload(SessionVolunteerTask.session),
            selectinload(SessionVolunteerTask.assignments),
        )
    )
    svt = result.scalar_one_or_none()
    if not svt:
        raise NotFoundError("Session task assignment not found")

    svt.required_count = data.required_count

    db.add(
        _audit_log(
            tenant_id=tenant_id,
            user_id=user_id,
            action="session_volunteer_task.update",
            resource_type="session_volunteer_task",
            resource_id=svt.id,
            details={
                "conference_id": str(conference_id),
                "required_count": data.required_count,
            },
            ip_address=ip_address,
            user_agent=user_agent,
        )
    )

    await db.commit()
    await db.refresh(svt)

    return SessionVolunteerTaskResponse(
        id=svt.id,
        session_id=svt.session_id,
        volunteer_task_id=svt.volunteer_task_id,
        volunteer_task_name=svt.volunteer_task.name if svt.volunteer_task else "Unknown",
        required_count=svt.required_count,
        assigned_count=len(svt.assignments),
        created_at=svt.created_at,
    )


async def delete_session_task(
    db: AsyncSession,
    *,
    tenant_id: UUID,
    user_id: UUID,
    conference_id: UUID,
    svt_id: UUID,
    ip_address: str | None,
    user_agent: str | None,
) -> dict:
    """Remove a task from a session (cascades volunteer assignments)."""
    result = await db.execute(
        select(SessionVolunteerTask)
        .where(
            SessionVolunteerTask.id == svt_id,
            SessionVolunteerTask.conference_id == conference_id,
        )
        .options(
            selectinload(SessionVolunteerTask.volunteer_task),
            selectinload(SessionVolunteerTask.session),
        )
    )
    svt = result.scalar_one_or_none()
    if not svt:
        raise NotFoundError("Session task assignment not found")

    task_name = svt.volunteer_task.name if svt.volunteer_task else "Unknown"
    session_title = svt.session.title if svt.session else "Unknown"

    db.add(
        _audit_log(
            tenant_id=tenant_id,
            user_id=user_id,
            action="session_volunteer_task.delete",
            resource_type="session_volunteer_task",
            resource_id=svt.id,
            details={
                "conference_id": str(conference_id),
                "task_name": task_name,
                "session_title": session_title,
            },
            ip_address=ip_address,
            user_agent=user_agent,
        )
    )

    await db.delete(svt)
    await db.commit()

    return {"message": f"Task '{task_name}' removed from session '{session_title}'"}


# =============================================================================
# Volunteer Assignments
# =============================================================================


async def create_volunteer_assignment(
    db: AsyncSession,
    *,
    tenant_id: UUID,
    user_id: UUID,
    conference_id: UUID,
    data: VolunteerAssignmentCreate,
    ip_address: str | None,
    user_agent: str | None,
) -> VolunteerAssignmentResponse:
    """Assign a volunteer to a session-task."""
    svt_result = await db.execute(
        select(SessionVolunteerTask)
        .where(
            SessionVolunteerTask.id == data.session_volunteer_task_id,
            SessionVolunteerTask.conference_id == conference_id,
        )
        .options(
            selectinload(SessionVolunteerTask.volunteer_task),
            selectinload(SessionVolunteerTask.session),
        )
    )
    svt = svt_result.scalar_one_or_none()
    if not svt:
        raise NotFoundError("Session task assignment not found")

    app_result = await db.execute(
        select(CFPApplicant).where(
            CFPApplicant.id == data.applicant_id,
            CFPApplicant.tenant_id == tenant_id,
        )
    )
    applicant = app_result.scalar_one_or_none()
    if not applicant:
        raise NotFoundError("Applicant not found")

    role_check = await db.execute(
        select(UserRoleAssignment)
        .join(UserRole, UserRoleAssignment.user_role_id == UserRole.id)
        .where(
            UserRoleAssignment.applicant_id == data.applicant_id,
            UserRole.conference_id == conference_id,
            UserRole.name == "Volunteer",
        )
    )
    if not role_check.scalar_one_or_none():
        raise ValidationError("Applicant does not have the Volunteer role for this conference")

    existing = await db.execute(
        select(VolunteerAssignment).where(
            VolunteerAssignment.session_volunteer_task_id == data.session_volunteer_task_id,
            VolunteerAssignment.applicant_id == data.applicant_id,
        )
    )
    if existing.scalar_one_or_none():
        raise ValidationError("Volunteer is already assigned to this task at this session")

    assignment = VolunteerAssignment(
        tenant_id=tenant_id,
        conference_id=conference_id,
        session_volunteer_task_id=data.session_volunteer_task_id,
        applicant_id=data.applicant_id,
    )
    db.add(assignment)
    await db.flush()

    vol_name = f"{applicant.first_name} {applicant.last_name}"
    db.add(
        _audit_log(
            tenant_id=tenant_id,
            user_id=user_id,
            action="volunteer_assignment.create",
            resource_type="volunteer_assignment",
            resource_id=assignment.id,
            details={
                "conference_id": str(conference_id),
                "volunteer_name": vol_name,
                "task_name": svt.volunteer_task.name if svt.volunteer_task else "",
                "session_title": svt.session.title if svt.session else "",
            },
            ip_address=ip_address,
            user_agent=user_agent,
        )
    )

    await db.commit()
    await db.refresh(assignment)

    color = await get_volunteer_color(db, applicant.id, conference_id)

    return VolunteerAssignmentResponse(
        id=assignment.id,
        session_volunteer_task_id=assignment.session_volunteer_task_id,
        applicant_id=assignment.applicant_id,
        volunteer_name=vol_name,
        volunteer_color=color,
        created_at=assignment.created_at,
    )


async def delete_volunteer_assignment(
    db: AsyncSession,
    *,
    tenant_id: UUID,
    user_id: UUID,
    conference_id: UUID,
    assignment_id: UUID,
    ip_address: str | None,
    user_agent: str | None,
) -> dict:
    """Remove a volunteer from a session-task."""
    result = await db.execute(
        select(VolunteerAssignment)
        .where(
            VolunteerAssignment.id == assignment_id,
            VolunteerAssignment.conference_id == conference_id,
        )
        .options(selectinload(VolunteerAssignment.applicant))
    )
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise NotFoundError("Volunteer assignment not found")

    applicant = assignment.applicant
    vol_name = f"{applicant.first_name} {applicant.last_name}" if applicant else "Unknown"

    db.add(
        _audit_log(
            tenant_id=tenant_id,
            user_id=user_id,
            action="volunteer_assignment.delete",
            resource_type="volunteer_assignment",
            resource_id=assignment.id,
            details={"conference_id": str(conference_id), "volunteer_name": vol_name},
            ip_address=ip_address,
            user_agent=user_agent,
        )
    )

    await db.delete(assignment)
    await db.commit()

    return {"message": f"Volunteer '{vol_name}' unassigned"}


# =============================================================================
# Volunteer Color
# =============================================================================


async def update_volunteer_color(
    db: AsyncSession,
    *,
    tenant_id: UUID,
    conference_id: UUID,
    applicant_id: UUID,
    data: VolunteerColorUpdate,
) -> dict:
    """Set a volunteer's color for this conference (upsert VolunteerProfile)."""
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
        raise NotFoundError("Volunteer not found")

    result = await db.execute(
        select(VolunteerProfile).where(
            VolunteerProfile.conference_id == conference_id,
            VolunteerProfile.applicant_id == applicant_id,
        )
    )
    profile = result.scalar_one_or_none()
    if not profile:
        profile = VolunteerProfile(
            tenant_id=tenant_id,
            conference_id=conference_id,
            applicant_id=applicant_id,
            color=data.color,
        )
        db.add(profile)
    else:
        profile.color = data.color

    await db.commit()

    return {"message": "Volunteer color updated", "color": data.color}
