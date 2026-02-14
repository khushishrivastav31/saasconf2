// Volunteer types
export type VolunteerStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "active"
  | "inactive";

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
