// Email Template types
export type EmailTemplateType =
  | "tenant_user_welcome"
  | "applicant_verification"
  | "committee_verification"
  | "submission_confirmation"
  | "co_speaker_invitation"
  | "password_reset";

export const EMAIL_TEMPLATE_TYPES = {
  SYSTEM: ["tenant_user_welcome"] as const,
  CONFERENCE: [
    "applicant_verification",
    "committee_verification",
    "submission_confirmation",
    "co_speaker_invitation",
    "password_reset",
  ] as const,
};

export const EMAIL_TEMPLATE_LABELS: Record<EmailTemplateType, string> = {
  tenant_user_welcome: "Tenant User Welcome",
  applicant_verification: "Applicant Verification",
  committee_verification: "Committee Member Verification",
  submission_confirmation: "Submission Confirmation",
  co_speaker_invitation: "Co-Speaker Invitation",
  password_reset: "Password Reset",
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
  created_at?: string;
  updated_at?: string;
}

export interface EmailTemplateCreate {
  template_type: EmailTemplateType;
  subject: string;
  body_html: string;
  body_text?: string;
  is_active?: boolean;
}

export interface EmailTemplateUpdate {
  subject?: string;
  body_html?: string;
  body_text?: string;
  is_active?: boolean;
}
