// Email Template types
export type EmailTemplateType =
  | 'tenant_user_welcome'
  | 'applicant_verification'
  | 'committee_verification'
  | 'submission_confirmation'
  | 'co_speaker_invitation'
  | 'password_reset'
  | 'new_message_notification'
  | 'paper_acceptance'
  | 'paper_rejection';

export const EMAIL_TEMPLATE_TYPES = {
  SYSTEM: ['tenant_user_welcome'] as const,
  CONFERENCE: [
    'applicant_verification',
    'committee_verification',
    'submission_confirmation',
    'co_speaker_invitation',
    'password_reset',
    'new_message_notification',
    'paper_acceptance',
    'paper_rejection',
  ] as const,
};

export const EMAIL_TEMPLATE_LABELS: Record<EmailTemplateType, string> = {
  tenant_user_welcome: 'Tenant User Welcome',
  applicant_verification: 'Applicant Verification',
  committee_verification: 'Committee Member Verification',
  submission_confirmation: 'Submission Confirmation',
  co_speaker_invitation: 'Co-Speaker Invitation',
  password_reset: 'Password Reset',
  new_message_notification: 'New Message Notification',
  paper_acceptance: 'Paper Acceptance',
  paper_rejection: 'Paper Rejection',
};

export interface EmailTemplate {
  id: string | null;
  tenant_id: string | null;
  conference_id: string | null;
  template_type: EmailTemplateType;
  subject: string;
  body_html: string;
  body_text: string | null;
  is_active: boolean;
  screen_overlay_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface EmailTemplateCreate {
  template_type: EmailTemplateType;
  subject: string;
  body_html: string;
  body_text?: string;
  is_active?: boolean;
  screen_overlay_id?: string | null;
}

export interface EmailTemplateUpdate {
  subject?: string;
  body_html?: string;
  body_text?: string;
  is_active?: boolean;
  screen_overlay_id?: string | null;
}
