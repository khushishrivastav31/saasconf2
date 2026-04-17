"""Volunteer schedule read-only aggregations.

Keeps ``volunteer_service.py`` under the 600-LOC guardrail. Shared helpers
(``resolve_session_time``, ``get_volunteer_color``) are reused from
:mod:`app.services.volunteer_service`.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import NotFoundError
from app.models.cfp_applicants import CFPApplicant
from app.models.volunteer_tasks import SessionVolunteerTask, VolunteerAssignment
from app.schemas.volunteer_tasks import (
    AssignedVolunteerBrief,
    TaskAssignmentOverview,
    TaskAssignmentOverviewList,
    TaskSessionDetail,
    UnassignedSessionResponse,
    UnassignedSessionsListResponse,
    VolunteerScheduleEntry,
    VolunteerScheduleListResponse,
    VolunteerScheduleResponse,
)
from app.services.volunteer_service import get_volunteer_color, resolve_session_time


async def list_volunteer_assignments(db: AsyncSession, conference_id: UUID) -> TaskAssignmentOverviewList:
    """Return the task→session→volunteer overview for a conference."""
    result = await db.execute(
        select(SessionVolunteerTask)
        .where(SessionVolunteerTask.conference_id == conference_id)
        .options(
            selectinload(SessionVolunteerTask.volunteer_task),
            selectinload(SessionVolunteerTask.session),
            selectinload(SessionVolunteerTask.assignments).selectinload(VolunteerAssignment.applicant),
        )
    )
    svts = result.scalars().all()

    task_map: dict[UUID, list[SessionVolunteerTask]] = {}
    for svt in svts:
        task_map.setdefault(svt.volunteer_task_id, []).append(svt)

    items: list[TaskAssignmentOverview] = []
    for task_id, task_svts in task_map.items():
        task_name = task_svts[0].volunteer_task.name if task_svts[0].volunteer_task else "Unknown"

        sessions: list[TaskSessionDetail] = []
        for svt in task_svts:
            day_name, _day_date, start_time, end_time, track_name = await resolve_session_time(db, svt.session)

            assigned_vols: list[AssignedVolunteerBrief] = []
            for assignment in svt.assignments:
                applicant = assignment.applicant
                color = await get_volunteer_color(db, applicant.id, conference_id)
                assigned_vols.append(
                    AssignedVolunteerBrief(
                        assignment_id=assignment.id,
                        applicant_id=applicant.id,
                        volunteer_name=f"{applicant.first_name} {applicant.last_name}",
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


async def build_schedules(
    db: AsyncSession,
    conference_id: UUID,
    applicant_id: UUID | None = None,
) -> list[VolunteerScheduleResponse]:
    """Build schedule(s) for one or all volunteers in a conference."""
    query = (
        select(VolunteerAssignment)
        .where(VolunteerAssignment.conference_id == conference_id)
        .options(
            selectinload(VolunteerAssignment.applicant),
            selectinload(VolunteerAssignment.session_volunteer_task).selectinload(SessionVolunteerTask.session),
            selectinload(VolunteerAssignment.session_volunteer_task).selectinload(SessionVolunteerTask.volunteer_task),
        )
    )
    if applicant_id:
        query = query.where(VolunteerAssignment.applicant_id == applicant_id)

    result = await db.execute(query)
    assignments = result.scalars().all()

    vol_map: dict[UUID, list[VolunteerAssignment]] = {}
    for a in assignments:
        vol_map.setdefault(a.applicant_id, []).append(a)

    schedules: list[VolunteerScheduleResponse] = []
    for aid, vol_assignments in vol_map.items():
        applicant = vol_assignments[0].applicant
        color = await get_volunteer_color(db, aid, conference_id)
        vol_name = f"{applicant.first_name} {applicant.last_name}"

        entries: list[VolunteerScheduleEntry] = []
        for a in vol_assignments:
            svt = a.session_volunteer_task
            session = svt.session
            if not session:
                continue

            day_name, day_date, start_time, end_time, track_name = await resolve_session_time(db, session)
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

        entries.sort(key=lambda e: (e.day_date, e.start_time))

        schedules.append(
            VolunteerScheduleResponse(
                applicant_id=aid,
                volunteer_name=vol_name,
                volunteer_color=color,
                entries=entries,
            )
        )

    schedules.sort(key=lambda s: s.volunteer_name)
    return schedules


async def list_all_schedules(db: AsyncSession, conference_id: UUID) -> VolunteerScheduleListResponse:
    """All volunteer schedules + count of session-tasks still needing volunteers."""
    schedules = await build_schedules(db, conference_id)

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


async def list_unassigned_sessions(db: AsyncSession, conference_id: UUID) -> UnassignedSessionsListResponse:
    """List session-tasks that still need more volunteers."""
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
            day_name, _day_date, start_time, end_time, track_name = await resolve_session_time(db, session)
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


async def get_schedule_or_empty(
    db: AsyncSession, conference_id: UUID, applicant_id: UUID, tenant_id: UUID
) -> VolunteerScheduleResponse:
    """Single volunteer's schedule — returns an empty one for volunteers with no assignments."""
    schedules = await build_schedules(db, conference_id, applicant_id)
    if schedules:
        return schedules[0]

    app_result = await db.execute(
        select(CFPApplicant).where(
            CFPApplicant.id == applicant_id,
            CFPApplicant.tenant_id == tenant_id,
        )
    )
    applicant = app_result.scalar_one_or_none()
    if not applicant:
        raise NotFoundError("Volunteer not found")

    color = await get_volunteer_color(db, applicant_id, conference_id)
    return VolunteerScheduleResponse(
        applicant_id=applicant_id,
        volunteer_name=f"{applicant.first_name} {applicant.last_name}",
        volunteer_color=color,
        entries=[],
    )
