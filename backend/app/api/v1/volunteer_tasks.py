"""Volunteer task assignment endpoints (conference-scoped).

Manages:
- Session-task assignments (linking volunteer tasks to program sessions)
- Volunteer assignments (linking volunteers to session-tasks)
- Volunteer schedules (read-only view + PDF export)
- Volunteer colors (per-conference identification)
"""

import io
import zipfile
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.conference_helpers import check_conference_admin, get_conference_for_tenant
from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    TenantAdminDep,
    get_client_ip,
    require_module,
)
from app.core.exceptions import NotFoundError, ValidationError
from app.models.associations import ConferenceVolunteer
from app.models.audit import AuditLog
from app.models.program import ProgramDay, ProgramSession, ProgramTimeSlot, ProgramTrack
from app.models.settings import VolunteerRole
from app.models.volunteer import Volunteer
from app.models.volunteer_tasks import SessionVolunteerTask, VolunteerAssignment
from app.schemas.volunteer_tasks import (
    AssignedVolunteerBrief,
    SessionTasksBriefResponse,
    SessionTasksListResponse,
    SessionVolunteerTaskCreate,
    SessionVolunteerTaskResponse,
    SessionVolunteerTaskUpdate,
    TaskAssignmentOverview,
    TaskAssignmentOverviewList,
    TaskSessionDetail,
    UnassignedSessionResponse,
    UnassignedSessionsListResponse,
    VolunteerAssignmentCreate,
    VolunteerAssignmentResponse,
    VolunteerColorUpdate,
    VolunteerScheduleEntry,
    VolunteerScheduleListResponse,
    VolunteerScheduleResponse,
)

router = APIRouter()
MODULE_CODE = "volunteers"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _resolve_session_time(db: DbSessionDep, session: ProgramSession) -> tuple[str, str, str, str, str | None]:
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

        # Calculate end_time from slot_span
        if session.slot_span > 1:
            # Find the last slot in the span
            day_result = await db.execute(
                select(ProgramTimeSlot)
                .where(ProgramTimeSlot.program_day_id == slot.program_day_id)
                .order_by(ProgramTimeSlot.sort_order)
            )
            day_slots = day_result.scalars().all()
            slot_idx = next((i for i, s in enumerate(day_slots) if s.id == slot.id), 0)
            last_slot_idx = min(slot_idx + session.slot_span - 1, len(day_slots) - 1)
            end_time = day_slots[last_slot_idx].end_time.strftime("%H:%M") if day_slots[last_slot_idx].end_time else ""
        else:
            end_time = slot.end_time.strftime("%H:%M") if slot.end_time else ""

        # Get day info
        day_result = await db.execute(select(ProgramDay).where(ProgramDay.id == slot.program_day_id))
        day = day_result.scalar_one_or_none()
        if day:
            day_name = day.name or f"Day {day.sort_order + 1}"
            day_date = day.date.isoformat() if day.date else ""

    # Get track name
    if session.start_track_id:
        track_result = await db.execute(select(ProgramTrack).where(ProgramTrack.id == session.start_track_id))
        track = track_result.scalar_one_or_none()
        if track:
            track_name = track.name

    return day_name, day_date, start_time, end_time, track_name


async def _get_volunteer_color(db: DbSessionDep, volunteer_id: UUID, conference_id: UUID) -> str | None:
    """Get a volunteer's color for a specific conference."""
    result = await db.execute(
        select(ConferenceVolunteer.color).where(
            ConferenceVolunteer.volunteer_id == volunteer_id,
            ConferenceVolunteer.conference_id == conference_id,
        )
    )
    row = result.first()
    return row[0] if row else None


# ---------------------------------------------------------------------------
# Session-Task Assignments
# ---------------------------------------------------------------------------


@router.get(
    "/session-tasks",
    response_model=SessionTasksListResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def list_session_tasks(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> SessionTasksListResponse:
    """List all session-task assignments for a conference, grouped by session."""
    await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    result = await db.execute(
        select(SessionVolunteerTask)
        .where(SessionVolunteerTask.conference_id == conference_id)
        .options(selectinload(SessionVolunteerTask.volunteer_task))
        .options(selectinload(SessionVolunteerTask.session))
        .options(selectinload(SessionVolunteerTask.assignments))
    )
    svts = result.scalars().all()

    # Group by session_id
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


@router.post(
    "/session-tasks",
    response_model=SessionVolunteerTaskResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def create_session_task(
    conference_id: UUID,
    data: SessionVolunteerTaskCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> SessionVolunteerTaskResponse:
    """Assign a volunteer task to a program session."""
    await get_conference_for_tenant(db, conference_id, current_user.tenant_id)
    await check_conference_admin(conference_id, current_user, db)

    # Verify session exists and belongs to conference
    session_result = await db.execute(
        select(ProgramSession).where(
            ProgramSession.id == data.session_id,
            ProgramSession.conference_id == conference_id,
        )
    )
    session = session_result.scalar_one_or_none()
    if not session:
        raise NotFoundError("Program session not found")

    # Verify task exists and belongs to conference
    task_result = await db.execute(
        select(VolunteerRole).where(
            VolunteerRole.id == data.volunteer_task_id,
            VolunteerRole.conference_id == conference_id,
        )
    )
    task = task_result.scalar_one_or_none()
    if not task:
        raise NotFoundError("Volunteer task not found")

    # Check for duplicate
    existing = await db.execute(
        select(SessionVolunteerTask).where(
            SessionVolunteerTask.session_id == data.session_id,
            SessionVolunteerTask.volunteer_task_id == data.volunteer_task_id,
        )
    )
    if existing.scalar_one_or_none():
        raise ValidationError("This task is already assigned to this session")

    svt = SessionVolunteerTask(
        tenant_id=current_user.tenant_id,
        conference_id=conference_id,
        session_id=data.session_id,
        volunteer_task_id=data.volunteer_task_id,
        required_count=data.required_count,
    )
    db.add(svt)
    await db.flush()  # Populate svt.id before audit log

    # Audit log
    db.add(
        AuditLog(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action="session_volunteer_task.create",
            resource_type="session_volunteer_task",
            resource_id=str(svt.id),
            details={
                "conference_id": str(conference_id),
                "session_title": session.title,
                "task_name": task.name,
                "required_count": data.required_count,
            },
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("user-agent", ""),
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


@router.put(
    "/session-tasks/{svt_id}",
    response_model=SessionVolunteerTaskResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def update_session_task(
    conference_id: UUID,
    svt_id: UUID,
    data: SessionVolunteerTaskUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> SessionVolunteerTaskResponse:
    """Update the required volunteer count for a session-task."""
    await get_conference_for_tenant(db, conference_id, current_user.tenant_id)
    await check_conference_admin(conference_id, current_user, db)

    result = await db.execute(
        select(SessionVolunteerTask)
        .where(
            SessionVolunteerTask.id == svt_id,
            SessionVolunteerTask.conference_id == conference_id,
        )
        .options(selectinload(SessionVolunteerTask.volunteer_task))
        .options(selectinload(SessionVolunteerTask.session))
        .options(selectinload(SessionVolunteerTask.assignments))
    )
    svt = result.scalar_one_or_none()
    if not svt:
        raise NotFoundError("Session task assignment not found")

    svt.required_count = data.required_count

    db.add(
        AuditLog(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action="session_volunteer_task.update",
            resource_type="session_volunteer_task",
            resource_id=str(svt.id),
            details={"conference_id": str(conference_id), "required_count": data.required_count},
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("user-agent", ""),
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


@router.delete(
    "/session-tasks/{svt_id}",
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def delete_session_task(
    conference_id: UUID,
    svt_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Remove a task from a session (cascades volunteer assignments)."""
    await get_conference_for_tenant(db, conference_id, current_user.tenant_id)
    await check_conference_admin(conference_id, current_user, db)

    result = await db.execute(
        select(SessionVolunteerTask)
        .where(
            SessionVolunteerTask.id == svt_id,
            SessionVolunteerTask.conference_id == conference_id,
        )
        .options(selectinload(SessionVolunteerTask.volunteer_task))
        .options(selectinload(SessionVolunteerTask.session))
    )
    svt = result.scalar_one_or_none()
    if not svt:
        raise NotFoundError("Session task assignment not found")

    task_name = svt.volunteer_task.name if svt.volunteer_task else "Unknown"
    session_title = svt.session.title if svt.session else "Unknown"

    db.add(
        AuditLog(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action="session_volunteer_task.delete",
            resource_type="session_volunteer_task",
            resource_id=str(svt.id),
            details={"conference_id": str(conference_id), "task_name": task_name, "session_title": session_title},
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("user-agent", ""),
        )
    )

    await db.delete(svt)
    await db.commit()

    return {"message": f"Task '{task_name}' removed from session '{session_title}'"}


# ---------------------------------------------------------------------------
# Volunteer Assignments
# ---------------------------------------------------------------------------


@router.get(
    "/volunteer-assignments",
    response_model=TaskAssignmentOverviewList,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def list_volunteer_assignments(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> TaskAssignmentOverviewList:
    """Get task overview with sessions and assigned volunteers."""
    await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    # Get all session-tasks with their assignments
    result = await db.execute(
        select(SessionVolunteerTask)
        .where(SessionVolunteerTask.conference_id == conference_id)
        .options(
            selectinload(SessionVolunteerTask.volunteer_task),
            selectinload(SessionVolunteerTask.session),
            selectinload(SessionVolunteerTask.assignments).selectinload(VolunteerAssignment.volunteer),
        )
    )
    svts = result.scalars().all()

    # Group by task
    task_map: dict[UUID, list[SessionVolunteerTask]] = {}
    for svt in svts:
        task_map.setdefault(svt.volunteer_task_id, []).append(svt)

    items: list[TaskAssignmentOverview] = []
    for task_id, task_svts in task_map.items():
        task_name = task_svts[0].volunteer_task.name if task_svts[0].volunteer_task else "Unknown"

        sessions: list[TaskSessionDetail] = []
        for svt in task_svts:
            day_name, _day_date, start_time, end_time, track_name = await _resolve_session_time(db, svt.session)

            assigned_vols: list[AssignedVolunteerBrief] = []
            for assignment in svt.assignments:
                vol = assignment.volunteer
                color = await _get_volunteer_color(db, vol.id, conference_id)
                assigned_vols.append(
                    AssignedVolunteerBrief(
                        assignment_id=assignment.id,
                        volunteer_id=vol.id,
                        volunteer_name=vol.full_name,
                        volunteer_color=color,
                    )
                )

            sessions.append(
                TaskSessionDetail(
                    session_volunteer_task_id=svt.id,
                    session_id=svt.session_id,
                    session_title=svt.session.title if svt.session else "Unknown",
                    day_name=day_name,
                    start_time=start_time,
                    end_time=end_time,
                    track_name=track_name,
                    required_count=svt.required_count,
                    assigned_volunteers=assigned_vols,
                )
            )

        items.append(
            TaskAssignmentOverview(
                volunteer_task_id=task_id,
                volunteer_task_name=task_name,
                sessions=sessions,
            )
        )

    return TaskAssignmentOverviewList(items=items)


@router.post(
    "/volunteer-assignments",
    response_model=VolunteerAssignmentResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def create_volunteer_assignment(
    conference_id: UUID,
    data: VolunteerAssignmentCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> VolunteerAssignmentResponse:
    """Assign a volunteer to a session-task."""
    await get_conference_for_tenant(db, conference_id, current_user.tenant_id)
    await check_conference_admin(conference_id, current_user, db)

    # Verify session-task exists
    svt_result = await db.execute(
        select(SessionVolunteerTask)
        .where(
            SessionVolunteerTask.id == data.session_volunteer_task_id,
            SessionVolunteerTask.conference_id == conference_id,
        )
        .options(selectinload(SessionVolunteerTask.volunteer_task))
        .options(selectinload(SessionVolunteerTask.session))
    )
    svt = svt_result.scalar_one_or_none()
    if not svt:
        raise NotFoundError("Session task assignment not found")

    # Verify volunteer exists and is linked to conference
    vol_result = await db.execute(
        select(Volunteer).where(
            Volunteer.id == data.volunteer_id,
            Volunteer.tenant_id == current_user.tenant_id,
        )
    )
    volunteer = vol_result.scalar_one_or_none()
    if not volunteer:
        raise NotFoundError("Volunteer not found")

    cv_result = await db.execute(
        select(ConferenceVolunteer).where(
            ConferenceVolunteer.volunteer_id == data.volunteer_id,
            ConferenceVolunteer.conference_id == conference_id,
        )
    )
    if not cv_result.scalar_one_or_none():
        raise ValidationError("Volunteer is not linked to this conference")

    # Check for duplicate
    existing = await db.execute(
        select(VolunteerAssignment).where(
            VolunteerAssignment.session_volunteer_task_id == data.session_volunteer_task_id,
            VolunteerAssignment.volunteer_id == data.volunteer_id,
        )
    )
    if existing.scalar_one_or_none():
        raise ValidationError("Volunteer is already assigned to this task at this session")

    assignment = VolunteerAssignment(
        tenant_id=current_user.tenant_id,
        conference_id=conference_id,
        session_volunteer_task_id=data.session_volunteer_task_id,
        volunteer_id=data.volunteer_id,
    )
    db.add(assignment)
    await db.flush()  # Populate assignment.id before audit log

    db.add(
        AuditLog(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action="volunteer_assignment.create",
            resource_type="volunteer_assignment",
            resource_id=str(assignment.id),
            details={
                "conference_id": str(conference_id),
                "volunteer_name": volunteer.full_name,
                "task_name": svt.volunteer_task.name if svt.volunteer_task else "",
                "session_title": svt.session.title if svt.session else "",
            },
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("user-agent", ""),
        )
    )

    await db.commit()
    await db.refresh(assignment)

    color = await _get_volunteer_color(db, volunteer.id, conference_id)

    return VolunteerAssignmentResponse(
        id=assignment.id,
        session_volunteer_task_id=assignment.session_volunteer_task_id,
        volunteer_id=assignment.volunteer_id,
        volunteer_name=volunteer.full_name,
        volunteer_color=color,
        created_at=assignment.created_at,
    )


@router.delete(
    "/volunteer-assignments/{assignment_id}",
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def delete_volunteer_assignment(
    conference_id: UUID,
    assignment_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Remove a volunteer from a session-task."""
    await get_conference_for_tenant(db, conference_id, current_user.tenant_id)
    await check_conference_admin(conference_id, current_user, db)

    result = await db.execute(
        select(VolunteerAssignment)
        .where(
            VolunteerAssignment.id == assignment_id,
            VolunteerAssignment.conference_id == conference_id,
        )
        .options(selectinload(VolunteerAssignment.volunteer))
    )
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise NotFoundError("Volunteer assignment not found")

    vol_name = assignment.volunteer.full_name if assignment.volunteer else "Unknown"

    db.add(
        AuditLog(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action="volunteer_assignment.delete",
            resource_type="volunteer_assignment",
            resource_id=str(assignment.id),
            details={"conference_id": str(conference_id), "volunteer_name": vol_name},
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("user-agent", ""),
        )
    )

    await db.delete(assignment)
    await db.commit()

    return {"message": f"Volunteer '{vol_name}' unassigned"}


# ---------------------------------------------------------------------------
# Volunteer Color
# ---------------------------------------------------------------------------


@router.patch(
    "/volunteers/{volunteer_id}/color",
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def update_volunteer_color(
    conference_id: UUID,
    volunteer_id: UUID,
    data: VolunteerColorUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Set a volunteer's color for this conference."""
    await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    result = await db.execute(
        select(ConferenceVolunteer).where(
            ConferenceVolunteer.conference_id == conference_id,
            ConferenceVolunteer.volunteer_id == volunteer_id,
        )
    )
    cv = result.scalar_one_or_none()
    if not cv:
        raise NotFoundError("Volunteer not linked to this conference")

    cv.color = data.color
    await db.commit()

    return {"message": "Volunteer color updated", "color": data.color}


# ---------------------------------------------------------------------------
# Volunteer Schedule
# ---------------------------------------------------------------------------


async def _build_schedule(
    db: DbSessionDep, conference_id: UUID, volunteer_id: UUID | None = None
) -> list[VolunteerScheduleResponse]:
    """Build schedule(s) for one or all volunteers in a conference."""
    query = (
        select(VolunteerAssignment)
        .where(VolunteerAssignment.conference_id == conference_id)
        .options(
            selectinload(VolunteerAssignment.volunteer),
            selectinload(VolunteerAssignment.session_volunteer_task).selectinload(SessionVolunteerTask.session),
            selectinload(VolunteerAssignment.session_volunteer_task).selectinload(SessionVolunteerTask.volunteer_task),
        )
    )
    if volunteer_id:
        query = query.where(VolunteerAssignment.volunteer_id == volunteer_id)

    result = await db.execute(query)
    assignments = result.scalars().all()

    # Group by volunteer
    vol_map: dict[UUID, list[VolunteerAssignment]] = {}
    for a in assignments:
        vol_map.setdefault(a.volunteer_id, []).append(a)

    schedules: list[VolunteerScheduleResponse] = []
    for vid, vol_assignments in vol_map.items():
        vol = vol_assignments[0].volunteer
        color = await _get_volunteer_color(db, vid, conference_id)

        entries: list[VolunteerScheduleEntry] = []
        for a in vol_assignments:
            svt = a.session_volunteer_task
            session = svt.session
            if not session:
                continue

            day_name, day_date, start_time, end_time, track_name = await _resolve_session_time(db, session)
            task_name = svt.volunteer_task.name if svt.volunteer_task else "Unknown"

            entries.append(
                VolunteerScheduleEntry(
                    session_id=session.id,
                    session_title=session.title,
                    day_name=day_name,
                    day_date=day_date,
                    start_time=start_time,
                    end_time=end_time,
                    track_name=track_name,
                    task_name=task_name,
                )
            )

        # Sort by day_date then start_time
        entries.sort(key=lambda e: (e.day_date, e.start_time))

        schedules.append(
            VolunteerScheduleResponse(
                volunteer_id=vid,
                volunteer_name=vol.full_name,
                volunteer_color=color,
                entries=entries,
            )
        )

    schedules.sort(key=lambda s: s.volunteer_name)
    return schedules


@router.get(
    "/volunteer-schedule",
    response_model=VolunteerScheduleListResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def list_volunteer_schedules(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> VolunteerScheduleListResponse:
    """Get schedules for all volunteers in a conference."""
    await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    schedules = await _build_schedule(db, conference_id)

    # Count unassigned
    unassigned_result = await db.execute(
        select(func.count())
        .select_from(SessionVolunteerTask)
        .where(SessionVolunteerTask.conference_id == conference_id)
        .outerjoin(VolunteerAssignment)
        .group_by(SessionVolunteerTask.id, SessionVolunteerTask.required_count)
        .having(func.count(VolunteerAssignment.id) < SessionVolunteerTask.required_count)
    )
    unassigned_count = len(unassigned_result.all())

    return VolunteerScheduleListResponse(items=schedules, unassigned_count=unassigned_count)


@router.get(
    "/volunteer-schedule/unassigned",
    response_model=UnassignedSessionsListResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def list_unassigned_sessions(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> UnassignedSessionsListResponse:
    """List session-tasks that still need more volunteers."""
    await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

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

    items: list[UnassignedSessionResponse] = []
    for svt in svts:
        assigned = len(svt.assignments)
        if assigned < svt.required_count:
            session = svt.session
            if not session:
                continue
            day_name, _day_date, start_time, end_time, track_name = await _resolve_session_time(db, session)
            items.append(
                UnassignedSessionResponse(
                    session_volunteer_task_id=svt.id,
                    session_id=svt.session_id,
                    session_title=session.title,
                    day_name=day_name,
                    start_time=start_time,
                    end_time=end_time,
                    track_name=track_name,
                    task_name=svt.volunteer_task.name if svt.volunteer_task else "Unknown",
                    required_count=svt.required_count,
                    assigned_count=assigned,
                )
            )

    return UnassignedSessionsListResponse(items=items, total=len(items))


@router.get(
    "/volunteer-schedule/{volunteer_id}",
    response_model=VolunteerScheduleResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def get_volunteer_schedule(
    conference_id: UUID,
    volunteer_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> VolunteerScheduleResponse:
    """Get a single volunteer's schedule."""
    await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    schedules = await _build_schedule(db, conference_id, volunteer_id)
    if not schedules:
        # Return empty schedule
        vol_result = await db.execute(
            select(Volunteer).where(
                Volunteer.id == volunteer_id,
                Volunteer.tenant_id == current_user.tenant_id,
            )
        )
        vol = vol_result.scalar_one_or_none()
        if not vol:
            raise NotFoundError("Volunteer not found")

        color = await _get_volunteer_color(db, volunteer_id, conference_id)
        return VolunteerScheduleResponse(
            volunteer_id=volunteer_id,
            volunteer_name=vol.full_name,
            volunteer_color=color,
            entries=[],
        )

    return schedules[0]


# ---------------------------------------------------------------------------
# PDF Export
# ---------------------------------------------------------------------------


def _sanitize_for_pdf(text: str) -> str:
    """Replace Unicode characters unsupported by fpdf2 built-in fonts."""
    replacements = {
        "\u2013": "-",
        "\u2014": "--",
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u2026": "...",
        "\u2022": "*",
        "\u00a0": " ",
    }
    for char, replacement in replacements.items():
        text = text.replace(char, replacement)
    return text


def _generate_schedule_pdf(
    volunteer_name: str,
    volunteer_color: str | None,
    entries: list[VolunteerScheduleEntry],
    conference_name: str,
) -> bytes:
    """Generate a PDF schedule for a single volunteer."""
    from fpdf import FPDF

    pdf = FPDF()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=20)

    # Header
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, _sanitize_for_pdf(conference_name), new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("Helvetica", "B", 14)
    header_text = f"Volunteer Schedule: {volunteer_name}"

    # Color indicator
    if volunteer_color:
        try:
            r = int(volunteer_color[1:3], 16)
            g = int(volunteer_color[3:5], 16)
            b = int(volunteer_color[5:7], 16)
            pdf.set_fill_color(r, g, b)
            pdf.cell(8, 8, "", fill=True)
            pdf.cell(4, 8, "")
        except (ValueError, IndexError):
            pass

    pdf.cell(0, 8, _sanitize_for_pdf(header_text), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    if not entries:
        pdf.set_font("Helvetica", "", 12)
        pdf.cell(0, 8, "No assignments yet.", new_x="LMARGIN", new_y="NEXT")
        return bytes(pdf.output())

    # Group by day
    day_groups: dict[str, list[VolunteerScheduleEntry]] = {}
    for entry in entries:
        key = f"{entry.day_name} ({entry.day_date})" if entry.day_date else entry.day_name
        day_groups.setdefault(key, []).append(entry)

    # Table for each day
    col_widths = [30, 50, 50, 50]  # Time, Session, Track, Task

    for day_label, day_entries in day_groups.items():
        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 8, _sanitize_for_pdf(day_label), new_x="LMARGIN", new_y="NEXT")

        # Table header
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_fill_color(240, 240, 240)
        pdf.cell(col_widths[0], 7, "Time", border=1, fill=True)
        pdf.cell(col_widths[1], 7, "Session", border=1, fill=True)
        pdf.cell(col_widths[2], 7, "Track", border=1, fill=True)
        pdf.cell(col_widths[3], 7, "Task", border=1, fill=True, new_x="LMARGIN", new_y="NEXT")

        # Table rows
        pdf.set_font("Helvetica", "", 9)
        for entry in day_entries:
            time_str = f"{entry.start_time}-{entry.end_time}" if entry.end_time else entry.start_time
            pdf.cell(col_widths[0], 7, _sanitize_for_pdf(time_str), border=1)
            pdf.cell(col_widths[1], 7, _sanitize_for_pdf(entry.session_title[:30]), border=1)
            pdf.cell(col_widths[2], 7, _sanitize_for_pdf((entry.track_name or "-")[:30]), border=1)
            pdf.cell(
                col_widths[3],
                7,
                _sanitize_for_pdf(entry.task_name[:30]),
                border=1,
                new_x="LMARGIN",
                new_y="NEXT",
            )

        pdf.ln(4)

    return bytes(pdf.output())


@router.get(
    "/volunteer-schedule/{volunteer_id}/pdf",
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def download_volunteer_schedule_pdf(
    conference_id: UUID,
    volunteer_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> StreamingResponse:
    """Download a single volunteer's schedule as PDF."""
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    schedules = await _build_schedule(db, conference_id, volunteer_id)
    if not schedules:
        vol_result = await db.execute(
            select(Volunteer).where(Volunteer.id == volunteer_id, Volunteer.tenant_id == current_user.tenant_id)
        )
        vol = vol_result.scalar_one_or_none()
        if not vol:
            raise NotFoundError("Volunteer not found")
        # Generate empty schedule PDF
        pdf_bytes = _generate_schedule_pdf(vol.full_name, None, [], conference.name)
        filename = f"schedule_{vol.first_name}_{vol.last_name}.pdf"
    else:
        schedule = schedules[0]
        pdf_bytes = _generate_schedule_pdf(
            schedule.volunteer_name,
            schedule.volunteer_color,
            schedule.entries,
            conference.name,
        )
        name_parts = schedule.volunteer_name.replace(" ", "_")
        filename = f"schedule_{name_parts}.pdf"

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get(
    "/volunteer-schedules-pdf",
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def download_all_schedules_pdf(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> StreamingResponse:
    """Download all volunteer schedules as a ZIP of PDFs."""
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    schedules = await _build_schedule(db, conference_id)

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for schedule in schedules:
            pdf_bytes = _generate_schedule_pdf(
                schedule.volunteer_name,
                schedule.volunteer_color,
                schedule.entries,
                conference.name,
            )
            name_parts = schedule.volunteer_name.replace(" ", "_")
            zf.writestr(f"schedule_{name_parts}.pdf", pdf_bytes)

    zip_buffer.seek(0)
    conf_name = conference.name.replace(" ", "_")[:30]

    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="volunteer_schedules_{conf_name}.zip"'},
    )
