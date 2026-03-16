"""Schemas for volunteer task assignment system."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

# ---------------------------------------------------------------------------
# Session-Task Assignment (linking tasks to sessions)
# ---------------------------------------------------------------------------


class SessionVolunteerTaskCreate(BaseModel):
    """Create a task assignment for a session."""

    session_id: UUID
    volunteer_task_id: UUID
    required_count: int = Field(default=1, ge=1, le=50)


class SessionVolunteerTaskUpdate(BaseModel):
    """Update a session-task assignment (only required_count)."""

    required_count: int = Field(..., ge=1, le=50)


class SessionVolunteerTaskResponse(BaseModel):
    """Response for a single session-task assignment."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    session_id: UUID
    volunteer_task_id: UUID
    volunteer_task_name: str
    required_count: int
    assigned_count: int
    created_at: datetime


class SessionTasksBriefResponse(BaseModel):
    """Brief summary of tasks for a session (used in grid overlay)."""

    session_id: UUID
    tasks: list[SessionVolunteerTaskResponse]


class SessionTasksListResponse(BaseModel):
    """All session-task assignments for a conference."""

    items: list[SessionTasksBriefResponse]
    total: int


# ---------------------------------------------------------------------------
# Volunteer Assignment (linking volunteers to session-tasks)
# ---------------------------------------------------------------------------


class VolunteerAssignmentCreate(BaseModel):
    """Assign a volunteer to a session-task."""

    session_volunteer_task_id: UUID
    applicant_id: UUID


class VolunteerAssignmentResponse(BaseModel):
    """Response for a volunteer assignment."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    session_volunteer_task_id: UUID
    applicant_id: UUID
    volunteer_name: str
    volunteer_color: str | None
    created_at: datetime


# ---------------------------------------------------------------------------
# Task Overview (for Volunteer Assignment tab)
# ---------------------------------------------------------------------------


class AssignedVolunteerBrief(BaseModel):
    """Brief volunteer info within a task-session context."""

    assignment_id: UUID
    applicant_id: UUID
    volunteer_name: str
    volunteer_color: str | None


class TaskSessionDetail(BaseModel):
    """A session that has a specific task, with assignment info."""

    session_volunteer_task_id: UUID
    session_id: UUID
    session_title: str
    day_name: str
    start_time: str
    end_time: str
    track_name: str | None
    required_count: int
    assigned_volunteers: list[AssignedVolunteerBrief]


class TaskAssignmentOverview(BaseModel):
    """Overview of a task across all sessions it's assigned to."""

    volunteer_task_id: UUID
    volunteer_task_name: str
    sessions: list[TaskSessionDetail]


class TaskAssignmentOverviewList(BaseModel):
    """Full overview of all tasks with sessions and assignments."""

    items: list[TaskAssignmentOverview]


# ---------------------------------------------------------------------------
# Volunteer Schedule
# ---------------------------------------------------------------------------


class VolunteerScheduleEntry(BaseModel):
    """A single entry in a volunteer's schedule."""

    session_id: UUID
    session_title: str
    day_name: str
    day_date: str
    start_time: str
    end_time: str
    track_name: str | None
    task_name: str


class VolunteerScheduleResponse(BaseModel):
    """A volunteer's full schedule."""

    applicant_id: UUID
    volunteer_name: str
    volunteer_color: str | None
    entries: list[VolunteerScheduleEntry]


class VolunteerScheduleListResponse(BaseModel):
    """All volunteers' schedules."""

    items: list[VolunteerScheduleResponse]
    unassigned_count: int


# ---------------------------------------------------------------------------
# Unassigned sessions
# ---------------------------------------------------------------------------


class UnassignedSessionResponse(BaseModel):
    """A session-task that still needs more volunteers."""

    session_volunteer_task_id: UUID
    session_id: UUID
    session_title: str
    day_name: str
    start_time: str
    end_time: str
    track_name: str | None
    task_name: str
    required_count: int
    assigned_count: int


class UnassignedSessionsListResponse(BaseModel):
    """List of session-tasks needing more volunteers."""

    items: list[UnassignedSessionResponse]
    total: int


# ---------------------------------------------------------------------------
# Volunteer Color
# ---------------------------------------------------------------------------


class VolunteerColorUpdate(BaseModel):
    """Update a volunteer's color for a conference."""

    color: str = Field(..., pattern=r"^#[0-9A-Fa-f]{6}$")
