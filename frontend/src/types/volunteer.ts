// Volunteer profile types (applicant-based, role-driven)

export interface VolunteerProfile {
  id: string;
  conference_id: string;
  applicant_id: string;
  first_name: string;
  last_name: string;
  email: string;
  tshirt_size: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  skills: string[];
  availability: Record<string, unknown>;
  notes: string | null;
  color: string | null;
  total_hours: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface VolunteerProfileUpdate {
  tshirt_size?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  skills?: string[];
  availability?: Record<string, unknown>;
  notes?: string | null;
  color?: string | null;
  total_hours?: number;
}

export interface VolunteerProfileListResponse {
  items: VolunteerProfile[];
  total: number;
}

// ---------------------------------------------------------------------------
// Volunteer Task Assignment System
// ---------------------------------------------------------------------------

export interface SessionVolunteerTask {
  id: string;
  session_id: string;
  volunteer_task_id: string;
  volunteer_task_name: string;
  required_count: number;
  assigned_count: number;
  created_at: string;
}

export interface SessionTasksBrief {
  session_id: string;
  tasks: SessionVolunteerTask[];
}

export interface SessionTasksListResponse {
  items: SessionTasksBrief[];
  total: number;
}

export interface AssignedVolunteerBrief {
  assignment_id: string;
  applicant_id: string;
  volunteer_name: string;
  volunteer_color: string | null;
}

export interface TaskSessionDetail {
  session_volunteer_task_id: string;
  session_id: string;
  session_title: string;
  day_name: string;
  start_time: string;
  end_time: string;
  track_name: string | null;
  required_count: number;
  assigned_volunteers: AssignedVolunteerBrief[];
}

export interface TaskAssignmentOverview {
  volunteer_task_id: string;
  volunteer_task_name: string;
  sessions: TaskSessionDetail[];
}

export interface TaskAssignmentOverviewList {
  items: TaskAssignmentOverview[];
}

export interface VolunteerScheduleEntry {
  session_id: string;
  session_title: string;
  day_name: string;
  day_date: string;
  start_time: string;
  end_time: string;
  track_name: string | null;
  task_name: string;
}

export interface VolunteerScheduleResponse {
  applicant_id: string;
  volunteer_name: string;
  volunteer_color: string | null;
  entries: VolunteerScheduleEntry[];
}

export interface VolunteerScheduleListResponse {
  items: VolunteerScheduleResponse[];
  unassigned_count: number;
}

export interface UnassignedSession {
  session_volunteer_task_id: string;
  session_id: string;
  session_title: string;
  day_name: string;
  start_time: string;
  end_time: string;
  track_name: string | null;
  task_name: string;
  required_count: number;
  assigned_count: number;
}

export interface UnassignedSessionsListResponse {
  items: UnassignedSession[];
  total: number;
}
