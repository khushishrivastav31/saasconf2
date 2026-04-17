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

export type MyCompanyTab = 'company' | 'email';
