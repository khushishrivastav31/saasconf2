// --- Auth ---

export interface ApplicantLoginRequest {
  email: string;
  password: string;
}

export interface ApplicantRegisterRequest {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
}

export interface ApplicantTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

// --- Profile ---

export interface ApplicantProfile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  pronouns: string | null;
  phone: string | null;
  title: string | null;
  company: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  bio: string | null;
  social_links: Record<string, string>;
  needs_accessibility: boolean;
  accessibility_details: string | null;
  agrees_to_recording: boolean;
  allow_out_of_timeframe: boolean;
  message_notifications_enabled: boolean;
  theme_preference: 'light' | 'dark' | null;
  picture_url: string | null;
  video_url: string | null;
  created_at: string;
}

export interface ApplicantProfileUpdate {
  first_name?: string;
  last_name?: string;
  pronouns?: string;
  phone?: string;
  title?: string;
  company?: string;
  address_line_1?: string;
  address_line_2?: string;
  city?: string;
  postal_code?: string;
  country?: string;
  bio?: string;
  social_links?: Record<string, string>;
  needs_accessibility?: boolean;
  accessibility_details?: string;
  agrees_to_recording?: boolean;
  message_notifications_enabled?: boolean;
  theme_preference?: 'light' | 'dark' | null;
}

// --- Conference / CFP ---

export interface PortalCFP {
  id: string;
  title: string;
  description: string | null;
  status: string;
  open_date: string | null;
  close_date: string | null;
  required_speaker_fields: string[];
  required_paper_fields: string[];
  guidelines_for_submissions: string | null;
  tips_for_submission: string | null;
  code_of_conduct: string | null;
  incentives_conditions: string | null;
  faqs: string | null;
}

export interface PortalSessionType {
  id: string;
  name: string;
  duration_minutes: number;
}

export interface PortalConferenceSummary {
  id: string;
  name: string;
  abbreviation: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  city: string | null;
  country: string | null;
  venue_type: 'onsite' | 'virtual' | 'hybrid';
  logo_url: string | null;
  cfps: PortalCFP[];
  registration_open: boolean;
  is_registered: boolean;
  is_speaker: boolean;
  expenses_enabled: boolean;
}

export interface PortalLandingData {
  conference: PortalConferenceSummary;
  tenant_name: string;
}

export interface PortalTenantPolicyEntry {
  type: 'url' | 'content' | null;
  url?: string | null;
  content?: string | null;
}

export interface PortalTenant {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  policies?: Record<string, PortalTenantPolicyEntry> | null;
}

export interface PortalConferenceDetail {
  id: string;
  name: string;
  abbreviation: string | null;
  cfps: PortalCFP[];
  session_types: PortalSessionType[];
}

// --- Paper ---

export interface PortalCospeaker {
  applicant_id: string;
  first_name: string;
  last_name: string;
  email: string;
  invitation_status: string;
  invited_at: string | null;
  responded_at: string | null;
}

export interface PortalPaper {
  id: string;
  cfp_id: string;
  cfp_title: string | null;
  conference_id: string | null;
  conference_name: string | null;
  session_type_id: string | null;
  session_type_name: string | null;
  form_variant_id: string | null;
  form_variant_name: string | null;
  title: string;
  abstract_short: string | null;
  abstract_long: string | null;
  level: string | null;
  learning_objectives: string | null;
  status: string;
  video_url: string | null;
  is_main_speaker: boolean;
  main_speaker_first_name: string | null;
  main_speaker_last_name: string | null;
  cospeakers: PortalCospeaker[];
  custom_field_answers: Record<string, unknown> | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PortalPaperListResponse {
  items: PortalPaper[];
  total: number;
}

export interface PortalPaperCreateRequest {
  cfp_id: string;
  session_type_id?: string;
  form_variant_id?: string;
  title: string;
  abstract_short?: string;
  abstract_long?: string;
  level?: string;
  learning_objectives?: string;
  cospeaker_emails?: string[];
  custom_field_answers?: Record<string, unknown>;
}

export interface PortalPaperUpdateRequest {
  session_type_id?: string;
  title?: string;
  abstract_short?: string;
  abstract_long?: string;
  level?: string;
  learning_objectives?: string;
  cospeaker_emails?: string[];
  custom_field_answers?: Record<string, unknown>;
}

// --- Invitation ---

export interface PortalInvitation {
  paper_id: string;
  paper_title: string;
  cfp_title: string | null;
  conference_name: string | null;
  main_speaker_first_name: string;
  main_speaker_last_name: string;
  main_speaker_email: string;
  invitation_status: string;
  invited_at: string | null;
}

export interface PortalInvitationListResponse {
  items: PortalInvitation[];
  total: number;
}

// --- Committee Membership ---

export interface PortalTopic {
  id: string;
  name: string;
  description: string | null;
}

export interface PortalCommitteeMembership {
  id: string;
  conference_id: string;
  conference_name: string;
  role: string;
  topics: PortalTopic[];
  created_at: string;
}

export interface PortalCommitteeMembershipListResponse {
  items: PortalCommitteeMembership[];
  total: number;
}

// --- Assigned Paper (committee member view) ---

export interface PortalAssignedPaper {
  id: string;
  assignment_id: string;
  is_anonymous: boolean;
  assigned_at: string;
  conference_id: string | null;
  conference_name: string | null;
  cfp_id: string;
  cfp_title: string | null;
  title: string;
  abstract_short: string | null;
  abstract_long: string | null;
  level: string | null;
  learning_objectives: string | null;
  status: string;
  session_type_name: string | null;
  topics: PortalTopic[];
  video_url: string | null;
  main_speaker_first_name: string | null;
  main_speaker_last_name: string | null;
  cospeakers: PortalCospeaker[];
  review_status: string | null;
}

export interface PortalAssignedPaperListResponse {
  items: PortalAssignedPaper[];
  total: number;
}

// --- Review Config (for reviewer form) ---

export interface PortalReviewScaleOption {
  id: string;
  label: string;
  numeric_value: number | null;
  is_unsure: boolean;
  display_order: number;
}

export interface PortalReviewScale {
  id: string;
  name: string;
  scale_type: string;
  options: PortalReviewScaleOption[];
}

export interface PortalReviewQuestion {
  id: string;
  text: string;
  help_text: string | null;
  question_type: string;
  weight: number;
  comment_requirement: string;
  low_score_threshold: number | null;
  count_in_score: boolean;
  display_order: number;
  scale: PortalReviewScale | null;
}

export interface PortalReviewCriterion {
  id: string;
  title: string;
  description: string | null;
  display_order: number;
  questions: PortalReviewQuestion[];
}

export interface PortalReviewAnswer {
  question_id: string;
  selected_option_id: string | null;
  comment: string | null;
}

export interface PortalExistingReview {
  id: string;
  status: string;
  total_score: number | null;
  speaker_feedback: string | null;
  internal_comment: string | null;
  must_have: boolean;
  answers: PortalReviewAnswer[];
  submitted_at: string | null;
}

export interface PortalReviewFormSettings {
  enable_speaker_feedback: boolean;
  enable_internal_comment: boolean;
  enable_must_have: boolean;
}

export interface PortalReviewConfig {
  criteria: PortalReviewCriterion[];
  existing_review: PortalExistingReview | null;
  form_settings: PortalReviewFormSettings;
}

export interface PortalReviewSubmitRequest {
  answers: {
    question_id: string;
    selected_option_id?: string | null;
    comment?: string | null;
  }[];
  speaker_feedback?: string | null;
  internal_comment?: string | null;
  must_have?: boolean;
}

// --- Speaker Feedback ---

export interface PortalSpeakerFeedback {
  speaker_feedback: string;
  total_score: number | null;
}

export interface PortalSpeakerFeedbackListResponse {
  items: PortalSpeakerFeedback[];
  total: number;
}

// --- Paper Form Schema ---

export type PortalFieldType =
  | 'text'
  | 'textarea'
  | 'richtext'
  | 'checkbox'
  | 'checkbox_group'
  | 'dropdown'
  | 'file_upload';

export interface PortalFieldOption {
  value: string;
  label: string;
}

export interface PortalValidationRules {
  min_length?: number;
  max_length?: number;
  allowed_file_types?: string[];
  max_file_size_mb?: number;
}

export interface PortalBuiltinFieldConfig {
  visible: boolean;
  required: boolean;
  display_order?: number;
  help_text?: string | null;
  min_chars?: number | null;
  max_chars?: number | null;
  options?: { value: string; label: string }[] | null;
}

export interface PortalPaperFormField {
  id: string;
  field_key: string;
  field_type: PortalFieldType;
  label: string;
  description: string | null;
  placeholder: string | null;
  help_text: string | null;
  display_order: number;
  is_visible: boolean;
  is_required: boolean;
  validation_rules: PortalValidationRules | null;
  options: PortalFieldOption[] | null;
}

export interface PortalPaperFormVariant {
  id: string;
  schema_id: string;
  user_role_id: string;
  role_name: string;
  name: string;
  description: string | null;
  builtin_fields_config: Record<string, PortalBuiltinFieldConfig>;
  is_active: boolean;
  fields: PortalPaperFormField[];
}

export interface PortalPaperFormSchema {
  id: string;
  conference_id: string;
  version: number;
  builtin_fields_config: Record<string, PortalBuiltinFieldConfig>;
  fields: PortalPaperFormField[];
  variants: PortalPaperFormVariant[];
}

// Portal messaging types
export interface PortalSenderInfo {
  id: string;
  type: 'user' | 'applicant';
  first_name: string;
  last_name: string;
  email: string;
}

export interface PortalMessageAttachmentInfo {
  id: string;
  filename: string;
  content_type: string;
  file_size: number;
}

export interface PortalMessageResponse {
  id: string;
  thread_id: string;
  sender: PortalSenderInfo;
  body_html: string;
  attachments: PortalMessageAttachmentInfo[];
  created_at: string;
}

export interface PortalThreadListItem {
  id: string;
  subject: string;
  last_message_at: string;
  last_message_preview: string;
  last_message_sender: PortalSenderInfo;
  other_participants: PortalSenderInfo[];
  unread: boolean;
  message_count: number;
  created_at: string;
  archived_at: string | null;
}

export interface PortalThreadListResponse {
  items: PortalThreadListItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface PortalParticipantInfo {
  id: string;
  type: 'user' | 'applicant';
  first_name: string;
  last_name: string;
  email: string;
  last_read_at: string | null;
}

export interface PortalThreadDetailResponse {
  id: string;
  subject: string;
  archived_at: string | null;
  participants: PortalParticipantInfo[];
  messages: PortalMessageResponse[];
  created_at: string;
  updated_at: string;
}

export interface PortalUnreadCountResponse {
  unread_count: number;
}

// --- News ---

export interface PortalNewsArticle {
  id: string;
  conference_id: string;
  conference_name: string;
  title: string;
  body_html: string;
  published_at: string;
}

export interface PortalNewsListResponse {
  items: PortalNewsArticle[];
  total: number;
}

// --- Screen Overlays ---

export interface PortalScreenOverlay {
  id: string;
  conference_id: string;
  conference_name: string;
  trigger_type: 'first_registration' | 'scheduled' | 'always';
  title: string;
  body_text: string | null;
  animation_style:
    | 'confetti'
    | 'fireworks'
    | 'balloons'
    | 'sparkle'
    | 'spotlight'
    | 'snow'
    | 'stars';
  duration_seconds: number;
  image_url: string | null;
  source: string;
}

export interface PortalScreenOverlayListResponse {
  items: PortalScreenOverlay[];
  total: number;
}
