// Volunteer types
export type VolunteerStatus = 'pending' | 'approved' | 'rejected' | 'active' | 'inactive';

export interface Volunteer {
  id: string;
  tenant_id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string | null;
  status: VolunteerStatus;
  role: string | null;
  skills: string[];
  availability: Record<string, unknown>;
  notes: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  tshirt_size: string | null;
  application_date: string;
  approved_date: string | null;
  total_hours: number;
  created_at: string;
  updated_at: string;
  conference_ids: string[];
}

export interface VolunteerCreate {
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  role?: string;
  skills?: string[];
  availability?: Record<string, unknown>;
  notes?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  tshirt_size?: string;
  conference_id: string;
}

export interface VolunteerUpdate {
  email?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  status?: VolunteerStatus;
  role?: string;
  skills?: string[];
  availability?: Record<string, unknown>;
  notes?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  tshirt_size?: string;
  total_hours?: number;
}

export interface VolunteerStats {
  total: number;
  pending: number;
  approved: number;
  active: number;
  inactive: number;
  rejected: number;
  total_hours: number;
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
  volunteer_id: string;
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
  volunteer_id: string;
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
