// Email Template types
export type EmailTemplateType =
  | 'tenant_user_welcome'
  | 'conference_team_invitation'
  | 'applicant_verification'
  | 'committee_verification'
  | 'submission_confirmation'
  | 'co_speaker_invitation'
  | 'password_reset'
  | 'new_message_notification'
  | 'paper_acceptance'
  | 'paper_rejection'
  | 'sponsor_contract_send'
  | 'registration_invoice'
  | 'attendee_welcome'
  | 'registration_cancellation'
  | 'payment_reminder_first'
  | 'payment_reminder_second'
  | 'invoice_send'
  | 'direct_message'
  | 'deadline_reminder'
  | 'payment_overdue_admin';

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
    'sponsor_contract_send',
    'registration_invoice',
    'attendee_welcome',
    'registration_cancellation',
    'payment_reminder_first',
    'payment_reminder_second',
    'conference_team_invitation',
    'invoice_send',
    'direct_message',
    'deadline_reminder',
    'payment_overdue_admin',
  ] as const,
};

export const EMAIL_TEMPLATE_LABELS: Record<EmailTemplateType, string> = {
  tenant_user_welcome: 'User Invitation',
  conference_team_invitation: 'Conference Team Invitation',
  applicant_verification: 'Speaker Email Verification',
  committee_verification: 'Committee Email Verification',
  submission_confirmation: 'Paper Submission Confirmation',
  co_speaker_invitation: 'Co-Speaker Invitation',
  password_reset: 'Password Reset',
  new_message_notification: 'New Message Notification',
  paper_acceptance: 'Paper Accepted (Program Published)',
  paper_rejection: 'Paper Rejected (Program Published)',
  sponsor_contract_send: 'Sponsor Contract Delivery',
  registration_invoice: 'Registration Invoice',
  attendee_welcome: 'Attendee Welcome & Portal Setup',
  registration_cancellation: 'Registration Cancellation',
  payment_reminder_first: 'Payment Reminder (1st)',
  payment_reminder_second: 'Payment Reminder (2nd)',
  invoice_send: 'Invoice Email',
  direct_message: 'Direct Message (Email-Only Mode)',
  deadline_reminder: 'Deadline Reminder',
  payment_overdue_admin: 'Overdue Invoice Admin Alert',
};

export const EMAIL_TEMPLATE_DESCRIPTIONS: Record<EmailTemplateType, string> = {
  tenant_user_welcome: 'Sent when a new user is invited to the organization',
  conference_team_invitation: 'Sent when a team member is added to a conference',
  applicant_verification: 'Sent to speakers after they register on the CFP portal',
  committee_verification: 'Sent to committee members to verify their email',
  submission_confirmation: 'Sent after a speaker submits a paper',
  co_speaker_invitation: 'Sent when a speaker adds a co-speaker to their paper',
  password_reset: 'Sent when a portal user requests a password reset',
  new_message_notification: 'Sent when a new message is received in the portal',
  paper_acceptance: 'Sent to speakers whose papers were accepted when program is published',
  paper_rejection: 'Sent to speakers whose papers were rejected when program is published',
  sponsor_contract_send: 'Sent when a sponsorship contract is sent to a sponsor',
  registration_invoice: 'Sent with the invoice PDF after registration',
  attendee_welcome: 'Sent to attendees after registration with portal setup link',
  registration_cancellation: 'Sent when a registration is cancelled',
  payment_reminder_first: 'First reminder for overdue invoice payment',
  payment_reminder_second: 'Second reminder for overdue invoice payment',
  invoice_send: 'Sent when an invoice or credit note is emailed to a recipient',
  direct_message: 'Wraps admin messages sent via email-only messaging mode',
  deadline_reminder: 'Automated reminder for approaching conference deadlines',
  payment_overdue_admin: 'Sent to conference admins when invoices remain unpaid after reminders',
};

export interface EmailTemplate {
  id: string | null;
  tenant_id: string | null;
  conference_id: string | null;
  template_type: EmailTemplateType;
  display_name: string | null;
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
  display_name?: string;
  subject: string;
  body_html: string;
  body_text?: string;
  is_active?: boolean;
  screen_overlay_id?: string | null;
}

export interface EmailTemplateUpdate {
  display_name?: string;
  subject?: string;
  body_html?: string;
  body_text?: string;
  is_active?: boolean;
  screen_overlay_id?: string | null;
}
