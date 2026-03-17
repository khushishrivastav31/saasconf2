// ============================================================================
// Program Design types
// ============================================================================

export interface ProgramDay {
  id: string;
  tenant_id: string;
  conference_id: string;
  date: string;
  name: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ProgramDayCreate {
  date: string;
  name?: string;
  sort_order?: number;
}

export interface ProgramDayUpdate {
  date?: string;
  name?: string;
  sort_order?: number;
}

export interface ProgramTimeSlot {
  id: string;
  tenant_id: string;
  program_day_id: string;
  start_time: string;
  end_time: string;
  sort_order: number;
  is_session_free: boolean; // Marks as break/lunch - no regular sessions allowed
  created_at: string;
  updated_at: string;
}

export interface ProgramTimeSlotCreate {
  start_time: string;
  end_time: string;
  sort_order?: number;
  is_session_free?: boolean;
}

export interface ProgramTimeSlotUpdate {
  start_time?: string;
  end_time?: string;
  sort_order?: number;
  is_session_free?: boolean;
}

export interface ProgramTrack {
  id: string;
  tenant_id: string;
  conference_id: string;
  program_day_id: string | null;
  name: string;
  color: string | null;
  location_id: string | null;
  location_name: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProgramTrackCreate {
  program_day_id: string;
  name: string;
  color?: string;
  location_id?: string;
  sort_order?: number;
  is_active?: boolean;
}

export interface ProgramTrackUpdate {
  name?: string;
  color?: string;
  location_id?: string;
  sort_order?: number;
  is_active?: boolean;
}

export interface ProgramSession {
  id: string;
  tenant_id: string;
  conference_id: string;
  start_slot_id: string;
  start_track_id: string | null;
  slot_span: number;
  track_span: number;
  title: string;
  description: string | null;
  session_type_id: string | null;
  session_type_name: string | null;
  is_general_event: boolean;
  allow_in_session_free: boolean; // Override to allow in session-free slots
  separately_bookable: boolean;
  color: string | null;
  paper_id: string | null;
  paper_title: string | null;
  speaker_name: string | null;
  notes: string | null;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ProgramSessionCreate {
  start_slot_id: string;
  start_track_id?: string;
  slot_span?: number;
  track_span?: number;
  title: string;
  description?: string;
  session_type_id?: string;
  is_general_event?: boolean;
  allow_in_session_free?: boolean;
  color?: string;
  paper_id?: string;
  notes?: string;
  settings?: Record<string, unknown>;
}

export interface ProgramSessionUpdate {
  start_slot_id?: string;
  start_track_id?: string;
  slot_span?: number;
  track_span?: number;
  title?: string;
  description?: string;
  session_type_id?: string;
  is_general_event?: boolean;
  allow_in_session_free?: boolean;
  color?: string;
  paper_id?: string | null;
  notes?: string;
  settings?: Record<string, unknown>;
}

export interface ProgramSessionMove {
  start_slot_id: string;
  start_track_id?: string;
}

export interface ProgramGrid {
  day: ProgramDay;
  slots: ProgramTimeSlot[];
  tracks: ProgramTrack[];
  sessions: ProgramSession[];
}

export interface ProgramFullGrid {
  days: ProgramGrid[];
  total_days: number;
}

// ============================================================================
// Enriched Sessions types (for customizable Sessions tab)
// ============================================================================

export interface CustomFieldMeta {
  field_key: string;
  label: string;
  field_type: string;
}

export interface EnrichedSession {
  id: string;
  title: string;
  description: string | null;
  session_type_id: string | null;
  session_type_name: string | null;
  is_general_event: boolean;
  color: string | null;
  notes: string | null;
  paper_id: string | null;
  paper_title: string | null;
  paper_abstract_short: string | null;
  paper_level: string | null;
  paper_learning_objectives: string | null;
  paper_status: string | null;
  paper_custom_field_answers: Record<string, unknown> | null;
  speaker_name: string | null;
  speaker_email: string | null;
  speaker_company: string | null;
  cospeakers: string | null;
  day_id: string | null;
  day_name: string | null;
  day_date: string | null;
  start_time: string | null;
  end_time: string | null;
  track_name: string | null;
}

export interface EnrichedSessionsResponse {
  items: EnrichedSession[];
  total: number;
  custom_fields: CustomFieldMeta[];
}
