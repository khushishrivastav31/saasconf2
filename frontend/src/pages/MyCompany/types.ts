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

export type MyCompanyTab = 'company' | 'email' | 'privacy';

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
