"""Volunteer task assignment endpoints (conference-scoped).

Thin router — business logic lives in :mod:`app.services.volunteer_service`
and PDF rendering in :mod:`app.core.volunteer_pdf`. Endpoints parse params,
verify tenant/admin access, delegate to the service, and shape responses.

Covers:
- Session-task assignments (linking volunteer tasks to program sessions)
- Volunteer assignments (linking volunteers to session-tasks)
- Volunteer schedules (read-only + PDF/ZIP export)
- Volunteer colors (per-conference identification)
"""

import io
import zipfile
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from app.core.conference_helpers import check_conference_admin, get_conference_for_tenant
from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    TenantAdminDep,
    get_client_ip,
    require_module,
)
from app.core.volunteer_pdf import generate_schedule_pdf
from app.schemas.volunteer_tasks import (
    SessionTasksListResponse,
    SessionVolunteerTaskCreate,
    SessionVolunteerTaskResponse,
    SessionVolunteerTaskUpdate,
    TaskAssignmentOverviewList,
    UnassignedSessionsListResponse,
    VolunteerAssignmentCreate,
    VolunteerAssignmentResponse,
    VolunteerColorUpdate,
    VolunteerScheduleListResponse,
    VolunteerScheduleResponse,
)
from app.services import volunteer_schedule_service, volunteer_service

router = APIRouter()
MODULE_CODE = "volunteers"


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
    return await volunteer_service.list_session_tasks(db, conference_id)


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
    return await volunteer_service.create_session_task(
        db,
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        conference_id=conference_id,
        data=data,
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent", ""),
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
    return await volunteer_service.update_session_task(
        db,
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        conference_id=conference_id,
        svt_id=svt_id,
        data=data,
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent", ""),
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
    return await volunteer_service.delete_session_task(
        db,
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        conference_id=conference_id,
        svt_id=svt_id,
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent", ""),
    )


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
    return await volunteer_schedule_service.list_volunteer_assignments(db, conference_id)


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
    return await volunteer_service.create_volunteer_assignment(
        db,
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        conference_id=conference_id,
        data=data,
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent", ""),
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
    return await volunteer_service.delete_volunteer_assignment(
        db,
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        conference_id=conference_id,
        assignment_id=assignment_id,
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent", ""),
    )


# ---------------------------------------------------------------------------
# Volunteer Color
# ---------------------------------------------------------------------------


@router.patch(
    "/volunteers/{applicant_id}/color",
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def update_volunteer_color(
    conference_id: UUID,
    applicant_id: UUID,
    data: VolunteerColorUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Set a volunteer's color for this conference."""
    await get_conference_for_tenant(db, conference_id, current_user.tenant_id)
    return await volunteer_service.update_volunteer_color(
        db,
        tenant_id=current_user.tenant_id,
        conference_id=conference_id,
        applicant_id=applicant_id,
        data=data,
    )


# ---------------------------------------------------------------------------
# Volunteer Schedule
# ---------------------------------------------------------------------------


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
    return await volunteer_schedule_service.list_all_schedules(db, conference_id)


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
    return await volunteer_schedule_service.list_unassigned_sessions(db, conference_id)


@router.get(
    "/volunteer-schedule/{applicant_id}",
    response_model=VolunteerScheduleResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def get_volunteer_schedule(
    conference_id: UUID,
    applicant_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> VolunteerScheduleResponse:
    """Get a single volunteer's schedule."""
    await get_conference_for_tenant(db, conference_id, current_user.tenant_id)
    return await volunteer_schedule_service.get_schedule_or_empty(
        db, conference_id, applicant_id, current_user.tenant_id
    )


# ---------------------------------------------------------------------------
# PDF Export
# ---------------------------------------------------------------------------


@router.get(
    "/volunteer-schedule/{applicant_id}/pdf",
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def download_volunteer_schedule_pdf(
    conference_id: UUID,
    applicant_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> StreamingResponse:
    """Download a single volunteer's schedule as PDF."""
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    schedules = await volunteer_schedule_service.build_schedules(db, conference_id, applicant_id)
    if schedules:
        schedule = schedules[0]
        pdf_bytes = generate_schedule_pdf(
            schedule.volunteer_name,
            schedule.volunteer_color,
            schedule.entries,
            conference.name,
        )
        filename = f"schedule_{schedule.volunteer_name.replace(' ', '_')}.pdf"
    else:
        vol_name = await volunteer_service.resolve_applicant_name(db, applicant_id, current_user.tenant_id)
        pdf_bytes = generate_schedule_pdf(vol_name, None, [], conference.name)
        filename = f"schedule_{vol_name.replace(' ', '_')}.pdf"

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

    schedules = await volunteer_schedule_service.build_schedules(db, conference_id)

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for schedule in schedules:
            pdf_bytes = generate_schedule_pdf(
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
