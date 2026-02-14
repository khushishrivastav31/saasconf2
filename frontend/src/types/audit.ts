// Audit types
export interface AuditLogUser {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
}

export interface AuditLogTenant {
  id: string;
  name: string;
  slug: string;
}

export interface AuditLog {
  id: string;
  tenant_id: string | null;
  user_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  user: AuditLogUser | null;
  tenant: AuditLogTenant | null;
}

// Applicant Activity Log types
export type ApplicantActivityType =
  | "registered"
  | "confirmation_sent"
  | "email_verified"
  | "account_deleted";

export interface ApplicantActivityLog {
  id: string;
  tenant_id: string;
  applicant_id: string | null;
  applicant_email: string;
  applicant_first_name: string;
  applicant_last_name: string;
  activity_type: ApplicantActivityType;
  created_at: string;
}

export interface ApplicantGroupedActivity {
  applicant_email: string;
  applicant_first_name: string;
  applicant_last_name: string;
  applicant_id: string | null;
  activities: ApplicantActivityLog[];
}
