// Call for Papers types
export type CFPStatus = "draft" | "open" | "closed" | "review" | "completed";
export type SubmissionStatus =
  | "submitted"
  | "under_review"
  | "accepted"
  | "rejected"
  | "waitlisted"
  | "withdrawn";

export interface CallForPapers {
  id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  status: CFPStatus;
  open_date: string | null;
  close_date: string | null;
  notification_date: string | null;
  program_announcement_date: string | null;
  max_submissions_per_speaker: number | null;
  required_speaker_fields: string[];
  required_paper_fields: string[];
  allowed_formats: string[];
  tracks: string[];
  custom_fields: Record<string, unknown>;
  is_anonymous_review: boolean;
  reviewers_per_paper: number;
  settings: Record<string, unknown>;
  code_of_conduct: string | null;
  incentives_conditions: string | null;
  tips_for_submission: string | null;
  guidelines_for_submissions: string | null;
  faqs: string | null;
  submission_count: number;
  created_at: string;
  updated_at: string;
  conference_ids: string[];
}

export interface CFPCreate {
  title: string;
  description?: string;
  open_date?: string;
  close_date?: string;
  max_submissions_per_speaker?: number;
  required_speaker_fields?: string[];
  required_paper_fields?: string[];
  allowed_formats?: string[];
  tracks?: string[];
  custom_fields?: Record<string, unknown>;
  is_anonymous_review?: boolean;
  reviewers_per_paper?: number;
  notification_date?: string;
  program_announcement_date?: string;
  code_of_conduct?: string;
  incentives_conditions?: string;
  tips_for_submission?: string;
  guidelines_for_submissions?: string;
  faqs?: string;
  conference_id: string;
}

export interface CFPStats {
  total: number;
  draft: number;
  open: number;
  closed: number;
  review: number;
  completed: number;
  total_submissions: number;
}

export interface Submission {
  id: string;
  tenant_id: string;
  cfp_id: string;
  speaker_email: string;
  speaker_first_name: string;
  speaker_last_name: string;
  speaker_bio: string | null;
  speaker_company: string | null;
  speaker_title: string | null;
  title: string;
  abstract: string | null;
  description: string | null;
  format: string | null;
  track: string | null;
  level: string | null;
  duration: number | null;
  language: string | null;
  tags: string[];
  custom_answers: Record<string, unknown>;
  status: SubmissionStatus;
  review_notes: string | null;
  review_score: number | null;
  submitted_at: string;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubmissionCreate {
  cfp_id: string;
  speaker_email: string;
  speaker_first_name: string;
  speaker_last_name: string;
  speaker_bio?: string;
  speaker_company?: string;
  speaker_title?: string;
  title: string;
  abstract?: string;
  description?: string;
  format?: string;
  track?: string;
  level?: string;
  duration?: number;
  language?: string;
  tags?: string[];
  custom_answers?: Record<string, unknown>;
}

export interface SubmissionStats {
  total: number;
  submitted: number;
  under_review: number;
  accepted: number;
  rejected: number;
  waitlisted: number;
  withdrawn: number;
}

// CFP Topic types
export interface CFPTopic {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface CFPTopicCreate {
  name: string;
  description?: string;
}

// CFP Committee Member types

export interface CommitteeMember {
  id: string;
  tenant_id: string;
  conference_id: string;
  applicant_id: string;
  role: string;
  expertise_areas: string[];
  // Flattened from applicant
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  title: string | null;
  company: string | null;
  picture_url: string | null;
  // Committee-specific
  topics: CFPTopic[];
  created_at: string;
  updated_at: string;
}

export interface CommitteeMemberCreate {
  conference_id: string;
  applicant_id?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  password?: string;
  role?: string;
  expertise_areas?: string[];
  topic_ids?: string[];
}

// CFP Committee Role settings types

export interface CFPCommitteeRole {
  id: string;
  tenant_id: string;
  conference_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CFPCommitteeRoleCreate {
  name: string;
  description?: string;
  is_active?: boolean;
}

export interface CFPCommitteeRoleUpdate {
  name?: string;
  description?: string;
  is_active?: boolean;
}

// CFP Applicant types
export interface ApplicantSocialLinks {
  linkedin?: string | null;
  bluesky?: string | null;
  mastodon?: string | null;
  twitter?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  youtube?: string | null;
  tiktok?: string | null;
  github?: string | null;
  website?: string | null;
}

export interface Applicant {
  id: string;
  tenant_id: string;
  first_name: string;
  last_name: string;
  pronouns: string | null;
  email: string;
  phone: string | null;
  title: string | null;
  company: string | null;
  bio: string | null;
  allow_out_of_timeframe: boolean;
  social_links: ApplicantSocialLinks;
  needs_accessibility: boolean;
  accessibility_details: string | null;
  agrees_to_recording: boolean;
  picture_url: string | null;
  video_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApplicantCreate {
  first_name: string;
  last_name: string;
  pronouns?: string;
  email: string;
  phone?: string;
  title?: string;
  company?: string;
  bio?: string;
  allow_out_of_timeframe?: boolean;
  social_links?: ApplicantSocialLinks;
  needs_accessibility?: boolean;
  accessibility_details?: string;
  agrees_to_recording?: boolean;
  password: string;
}

// Paper types
export type PaperStatus =
  | "draft"
  | "submitted"
  | "in_evaluation"
  | "evaluated"
  | "final_consideration"
  | "rejected"
  | "accepted";

export type PaperLevel =
  | "beginner"
  | "intermediate"
  | "advanced"
  | "all_levels";

export type CospeakerInvitationStatus = "pending" | "accepted" | "declined";

export interface Cospeaker {
  applicant: Applicant;
  invitation_status: CospeakerInvitationStatus;
  invited_at: string | null;
  responded_at: string | null;
}

export interface PaperComment {
  id: string;
  committee_member_id: string | null;
  committee_member_first_name: string | null;
  committee_member_last_name: string | null;
  committee_member_role: string | null;
  content: string;
  created_at: string;
}

export interface Paper {
  id: string;
  tenant_id: string;
  cfp_id: string;
  cfp_title: string | null;
  cfp_status: string | null;
  conference_name: string | null;
  main_speaker_id: string;
  main_speaker: Applicant | null;
  cospeakers: Cospeaker[];
  session_type_id: string | null;
  session_type_name: string | null;
  session_type_duration: number | null;
  topics: CFPTopic[];
  title: string;
  abstract_short: string | null;
  abstract_long: string | null;
  level: PaperLevel | null;
  learning_objectives: string | null;
  importance: string | null;
  status: PaperStatus;
  display_status: PaperStatus | null;
  video_url: string | null;
  comments: PaperComment[];
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaperCreate {
  cfp_id: string;
  main_speaker_id: string;
  co_speaker_ids?: string[];
  session_type_id?: string;
  topic_ids?: string[];
  title: string;
  abstract_short?: string;
  abstract_long?: string;
  level?: PaperLevel;
  learning_objectives?: string;
  importance?: string;
}

export interface PaperUpdate {
  main_speaker_id?: string;
  co_speaker_ids?: string[];
  session_type_id?: string | null;
  topic_ids?: string[];
  title?: string;
  abstract_short?: string;
  abstract_long?: string;
  level?: PaperLevel;
  learning_objectives?: string;
  importance?: string;
  status?: PaperStatus;
}

export interface PaperStats {
  total: number;
  draft: number;
  submitted: number;
  in_evaluation: number;
  evaluated: number;
  final_consideration: number;
  rejected: number;
  accepted: number;
}
