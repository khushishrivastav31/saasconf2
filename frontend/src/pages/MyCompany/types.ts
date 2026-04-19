export interface EmailFailure {
  id: string;
  recipient_email: string;
  subject: string;
  email_type: string;
  status: string;
  error_message: string | null;
  acknowledged: boolean;
  created_at: string;
}

export interface EmailFailureList {
  items: EmailFailure[];
  total: number;
  total_unacknowledged: number;
  page: number;
  page_size: number;
}

export interface EmailDefaults {
  resend_from_email: string;
  resend_from_name: string;
  resend_api_key_set: boolean;
  tenant_api_key_set: boolean;
}

export type MyCompanyTab = 'company' | 'email' | 'privacy' | 'users';

// ── Portal Users (tenant admin) ───────────────────────────────────────

export interface PortalUserListItem {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  is_active: boolean;
  has_password: boolean;
  email_verified: boolean;
  last_login_at: string | null;
  created_at: string | null;
  training_attendee_status: string | null;
  has_cfp_link: boolean;
  has_registration_link: boolean;
}

export interface PortalUserListResponse {
  items: PortalUserListItem[];
  total: number;
  page: number;
  per_page: number;
}

export interface PortalUserLinkages {
  training_attendee_count: number;
  training_attendee_status: string | null;
  cfp_applicant_count: number;
  registration_count: number;
}

export interface PortalUserDetail {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  pronouns: string | null;
  title: string | null;
  company: string | null;
  bio: string | null;
  social_links: Record<string, string>;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  is_active: boolean;
  has_password: boolean;
  email_verified: boolean;
  last_login_at: string | null;
  created_at: string | null;
  picture_id?: string;
  picture_filename?: string;
  video_id?: string;
  video_filename?: string;
  linkages: PortalUserLinkages;
}

export type CustomerEventDomain =
  | 'portal'
  | 'training'
  | 'cfp'
  | 'registration'
  | 'messaging'
  | 'billing';

export interface CustomerEventEntry {
  id: string;
  domain: CustomerEventDomain;
  event_type: string;
  notes: string | null;
  meta: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
}

// ── GDPR Privacy Requests (Art. 15 / 17) ──────────────────────────────

export type PrivacyRequestType = 'export' | 'erasure';
export type PrivacyRequestStatus =
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'executing'
  | 'completed'
  | 'failed';

export interface PrivacyRequestListItem {
  id: string;
  tenant_id: string;
  request_type: PrivacyRequestType;
  subject_count: number;
  status: PrivacyRequestStatus;
  created_by: string | null;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  executed_at: string | null;
}

export interface PrivacyRequestListResponse {
  items: PrivacyRequestListItem[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface PrivacyRequest {
  id: string;
  tenant_id: string;
  request_type: PrivacyRequestType;
  subject_emails: string[];
  status: PrivacyRequestStatus;
  created_by: string | null;
  portal_user_id: string | null;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  executed_at: string | null;
  completion_artifact_url: string | null;
  execution_manifest: Record<string, unknown> | null;
  rejection_reason: string | null;
  notes: string | null;
}

export interface PrivacyRequestCreateInput {
  request_type: PrivacyRequestType;
  subject_emails: string[];
  notes?: string | null;
}

export interface GenerateExportResponse {
  download_url: string;
  record_counts: Record<string, number>;
  executed_at: string;
}

export type ErasureAction = 'delete' | 'anonymize' | 'skip';

export interface ErasureTableEntry {
  table: string;
  count: number;
  row_ids: string[];
  default_action: ErasureAction;
  allowed_actions: ErasureAction[];
  locked_reason: string | null;
}

export interface ErasurePreviewResponse {
  entries: ErasureTableEntry[];
  summary: { to_delete: number; to_anonymize: number; to_skip: number };
}

export interface ErasureManifestEntry {
  action: ErasureAction;
  affected: number;
}

export interface ErasureExecuteResponse {
  executed_at: string;
  manifest: Record<string, ErasureManifestEntry>;
}

// ── Portal self-service (GDPR Phase 4) ────────────────────────────────

export interface PortalPrivacyRequestResponse {
  id: string;
  request_type: PrivacyRequestType;
  status: PrivacyRequestStatus;
  created_at: string;
  reviewed_at: string | null;
  executed_at: string | null;
  completion_artifact_url: string | null;
  rejection_reason: string | null;
  notes: string | null;
}

export interface PortalPrivacyRequestListResponse {
  items: PortalPrivacyRequestResponse[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface PortalExportCreateResponse {
  id: string;
  status: PrivacyRequestStatus;
  download_url: string;
  record_counts: Record<string, number>;
  executed_at: string;
}

export interface PortalPrivacyRequestCreateInput {
  request_type: PrivacyRequestType;
  notes?: string | null;
}
