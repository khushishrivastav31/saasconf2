// User types
export interface User {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  pronouns: string | null;
  role: "super_admin" | "tenant_admin" | "user";
  tenant_id: string | null;
  tenant_name: string | null;
  modules: string[];
  is_active: boolean;
  is_tenant_super_user: boolean;
  last_login: string | null;
  created_at: string;
}

// Auth types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

// Tenant types
export interface ContactPerson {
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  role?: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  settings: Record<string, unknown>;
  // Address fields
  address: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  // Business fields
  vat_number: string | null;
  website: string | null;
  logo_url: string | null;
  // Contact persons
  contact_persons: ContactPerson[];
  // Comments
  comments: string | null;
  // Super user (designated by SaaS admin to delete conferences)
  super_user_id: string | null;
  created_at: string;
  updated_at: string;
  user_count: number;
  module_count: number;
}

export interface TenantCreate {
  name: string;
  slug: string;
  settings?: Record<string, unknown>;
  // Address fields
  address?: string;
  postal_code?: string;
  city?: string;
  country?: string;
  // Business fields
  vat_number?: string;
  website?: string;
  // Contact persons
  contact_persons?: ContactPerson[];
  // Comments
  comments?: string;
  // Admin user
  admin_email?: string;
  admin_password?: string;
  admin_first_name?: string;
  admin_last_name?: string;
}

export interface TenantUpdate {
  name?: string;
  slug?: string;
  is_active?: boolean;
  settings?: Record<string, unknown>;
  address?: string;
  postal_code?: string;
  city?: string;
  country?: string;
  vat_number?: string;
  website?: string;
  contact_persons?: ContactPerson[];
  comments?: string;
}

// Module types
export interface Module {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  config_schema: Record<string, unknown>;
  created_at: string;
  tenant_count: number;
}

export interface TenantModule {
  id: string;
  tenant_id: string;
  module_id: string;
  module_code: string;
  module_name: string;
  is_enabled: boolean;
  config: Record<string, unknown>;
  granted_at: string;
  granted_by: string | null;
  // Subscription dates
  start_date: string | null;
  end_date: string | null;
  // Pricing
  price: number | null;
  currency: string | null;
  // Resource limits
  max_papers: number | null;
  max_speakers: number | null;
  max_attendees: number | null;
  max_volunteers: number | null;
  // Computed field
  is_active_subscription: boolean;
}

export interface TenantModuleAssign {
  module_id: string;
  config?: Record<string, unknown>;
  start_date?: string;
  end_date?: string;
  price?: number;
  currency?: string;
  max_papers?: number;
  max_speakers?: number;
  max_attendees?: number;
  max_volunteers?: number;
}

export interface TenantModuleUpdate {
  is_enabled?: boolean;
  config?: Record<string, unknown>;
  start_date?: string;
  end_date?: string;
  price?: number;
  currency?: string;
  max_papers?: number;
  max_speakers?: number;
  max_attendees?: number;
  max_volunteers?: number;
}

// Audit types
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
}

// Pagination types
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

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

export interface VolunteerStats {
  total: number;
  pending: number;
  approved: number;
  active: number;
  inactive: number;
  rejected: number;
  total_hours: number;
}

// Location types (values come from tenant configuration)
export type LocationType = string;

export interface LocationContactPerson {
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  comment?: string;
}

export interface Location {
  id: string;
  tenant_id: string;
  parent_id: string | null;
  name: string;
  code: string | null;
  location_type: LocationType;
  description: string | null;
  capacity: number | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  full_address: string | null;
  latitude: number | null;
  longitude: number | null;
  building: string | null;
  floor: string | null;
  phone: string | null;
  website: string | null;
  vat_number: string | null;
  amenities: string[];
  accessibility_features: string[];
  virtual_url: string | null;
  virtual_platform: string | null;
  is_active: boolean;
  settings: Record<string, unknown>;
  contact_persons: LocationContactPerson[];
  created_at: string;
  updated_at: string;
  children_count: number;
  conference_ids: string[];
}

export interface LocationCreate {
  name: string;
  code?: string;
  location_type: LocationType;
  description?: string;
  capacity?: number;
  parent_id?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  building?: string;
  floor?: string;
  phone?: string;
  website?: string;
  vat_number?: string;
  amenities?: string[];
  accessibility_features?: string[];
  virtual_url?: string;
  virtual_platform?: string;
  contact_persons?: LocationContactPerson[];
  conference_id: string;
}

export interface LocationUpdate {
  name?: string;
  code?: string;
  location_type?: LocationType;
  description?: string;
  capacity?: number;
  parent_id?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  building?: string;
  floor?: string;
  phone?: string;
  website?: string;
  vat_number?: string;
  amenities?: string[];
  accessibility_features?: string[];
  virtual_url?: string;
  virtual_platform?: string;
  contact_persons?: LocationContactPerson[];
  is_active?: boolean;
}

export interface LocationTypeCount {
  slug: string;
  name: string;
  count: number;
}

export interface LocationStats {
  total: number;
  total_capacity: number;
  type_counts: LocationTypeCount[];
}

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

// Tenant User types
export interface TenantUser {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  pronouns: string | null;
  role: "tenant_admin" | "user";
  is_active: boolean;
  has_all_conference_access: boolean;
  last_login: string | null;
  created_at: string;
  updated_at: string;
}

export interface TenantUserCreate {
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
  pronouns?: string;
  role?: "tenant_admin" | "user";
}

export interface TenantUserUpdate {
  email?: string;
  first_name?: string;
  last_name?: string;
  pronouns?: string;
  role?: "tenant_admin" | "user";
  is_active?: boolean;
  has_all_conference_access?: boolean;
  password?: string;
}

// User Conference Access types
export interface UserConferenceAccess {
  id: string;
  user_id: string;
  conference_id: string;
  access_level: "admin" | "read_only";
  granted_by: string | null;
  granted_at: string;
}

export interface UserConferenceAccessWithDetails extends UserConferenceAccess {
  conference_name: string;
  conference_abbreviation: string | null;
  user_email: string;
  user_name: string | null;
}

// Conference types
export type ConferenceStatus = "draft" | "upcoming" | "ongoing" | "past";

export interface SocialLinks {
  linkedin?: string;
  bluesky?: string;
  mastodon?: string;
  reddit?: string;
  tiktok?: string;
  instagram?: string;
  facebook?: string;
  twitter?: string;
  youtube?: string;
  [key: string]: string | undefined;
}

export interface TeamMember {
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  role?: string;
  is_manager: boolean;
}

export interface Conference {
  id: string;
  tenant_id: string;
  tenant_slug: string | null;
  name: string;
  abbreviation: string | null;
  description: string | null;
  website: string | null;
  logo_url: string | null;
  // Contact emails
  support_email: string | null;
  contact_email: string | null;
  // Dates
  start_date: string | null;
  end_date: string | null;
  // Location
  venue_name: string | null;
  venue_address: string | null;
  city: string | null;
  country: string | null;
  timezone: string | null;
  venue_type: "onsite" | "virtual" | "hybrid";
  virtual_platform_url: string | null;
  // Social links
  social_links: SocialLinks;
  // Team
  team_members: TeamMember[];
  // Settings
  settings: Record<string, unknown>;
  // Status
  is_active: boolean;
  is_published: boolean;
  // Timestamps
  created_at: string;
  updated_at: string;
  // Computed
  managers_count: number;
  team_count: number;
  status: ConferenceStatus;
}

export interface ConferenceCreate {
  name: string;
  abbreviation?: string;
  description?: string;
  website?: string;
  logo_url?: string;
  support_email?: string;
  contact_email?: string;
  start_date?: string;
  end_date?: string;
  venue_name?: string;
  venue_address?: string;
  city?: string;
  country?: string;
  timezone?: string;
  venue_type?: "onsite" | "virtual" | "hybrid";
  virtual_platform_url?: string;
  social_links?: SocialLinks;
  team_members?: TeamMember[];
  settings?: Record<string, unknown>;
}

export interface ConferenceUpdate {
  name?: string;
  abbreviation?: string;
  description?: string;
  website?: string;
  logo_url?: string;
  support_email?: string;
  contact_email?: string;
  start_date?: string;
  end_date?: string;
  venue_name?: string;
  venue_address?: string;
  city?: string;
  country?: string;
  timezone?: string;
  venue_type?: "onsite" | "virtual" | "hybrid";
  virtual_platform_url?: string;
  social_links?: SocialLinks;
  team_members?: TeamMember[];
  settings?: Record<string, unknown>;
  is_active?: boolean;
  is_published?: boolean;
}

export interface ConferenceStats {
  total: number;
  active: number;
  published: number;
  upcoming: number;
  ongoing: number;
  past: number;
}

export interface ConferenceAssociationRequest {
  id: string;
}

// Conference Settings types
export interface VolunteerRole {
  id: string;
  tenant_id: string;
  conference_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface VolunteerRoleCreate {
  name: string;
  description?: string;
  is_active?: boolean;
}

export interface VolunteerRoleUpdate {
  name?: string;
  description?: string;
  is_active?: boolean;
}

export interface TenantLocationType {
  id: string;
  tenant_id: string;
  conference_id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  usage_count: number;
}

export interface TenantLocationTypeCreate {
  name: string;
  slug: string;
  description?: string;
  is_active?: boolean;
}

export interface TenantLocationTypeUpdate {
  name?: string;
  slug?: string;
  description?: string;
  is_active?: boolean;
}

export interface ConferenceCurrency {
  id: string;
  tenant_id: string;
  conference_id: string;
  code: string;
  name: string;
  symbol: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ConferenceCurrencyCreate {
  code: string;
  name: string;
  symbol: string;
  is_active?: boolean;
}

export interface ConferenceCurrencyUpdate {
  code?: string;
  name?: string;
  symbol?: string;
  is_active?: boolean;
}

export interface SponsorPackage {
  id: string;
  tenant_id: string;
  conference_id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SponsorPackageCreate {
  name: string;
  description?: string;
  price: number;
  currency?: string;
  is_active?: boolean;
}

export interface SponsorPackageUpdate {
  name?: string;
  description?: string;
  price?: number;
  currency?: string;
  is_active?: boolean;
}

// Session Type types
export interface SessionType {
  id: string;
  tenant_id: string;
  conference_id: string;
  name: string;
  slug: string;
  duration_minutes: number;
  cfp_eligible: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SessionTypeCreate {
  name: string;
  slug: string;
  duration_minutes: number;
  cfp_eligible?: boolean;
  is_active?: boolean;
}

export interface SessionTypeUpdate {
  name?: string;
  slug?: string;
  duration_minutes?: number;
  cfp_eligible?: boolean;
  is_active?: boolean;
}

// Pronoun Option types (conference-scoped settings)
export interface PronounOption {
  id: string;
  tenant_id: string;
  conference_id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PronounOptionCreate {
  name: string;
  is_active?: boolean;
}

export interface PronounOptionUpdate {
  name?: string;
  is_active?: boolean;
}

// Sponsor types
export interface Sponsor {
  id: string;
  tenant_id: string;
  conference_id: string;
  sponsor_package_id: string | null;
  sponsor_package_name: string | null;
  company_name: string;
  phone: string | null;
  website: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  vat_number: string | null;
  price: number | null;
  currency: string | null;
  comments: string | null;
  contact_persons: LocationContactPerson[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SponsorCreate {
  company_name: string;
  sponsor_package_id?: string;
  phone?: string;
  website?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  vat_number?: string;
  price?: number;
  currency?: string;
  comments?: string;
  contact_persons?: LocationContactPerson[];
  is_active?: boolean;
}

export interface SponsorUpdate {
  company_name?: string;
  sponsor_package_id?: string | null;
  phone?: string;
  website?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  vat_number?: string;
  price?: number;
  currency?: string;
  comments?: string;
  contact_persons?: LocationContactPerson[];
  is_active?: boolean;
}

// Invoice types
export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface Invoice {
  id: string;
  tenant_id: string;
  conference_id: string;
  invoice_number: string;
  status: InvoiceStatus;
  issue_date: string | null;
  due_date: string | null;
  recipient_name: string;
  recipient_email: string | null;
  recipient_address_line1: string | null;
  recipient_address_line2: string | null;
  recipient_city: string | null;
  recipient_state: string | null;
  recipient_postal_code: string | null;
  recipient_country: string | null;
  recipient_vat_number: string | null;
  line_items: InvoiceLineItem[];
  subtotal: number | null;
  tax_rate: number | null;
  tax_amount: number | null;
  total: number | null;
  currency: string | null;
  notes: string | null;
  contact_persons: LocationContactPerson[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface InvoiceCreate {
  invoice_number: string;
  status?: InvoiceStatus;
  issue_date?: string;
  due_date?: string;
  recipient_name: string;
  recipient_email?: string;
  recipient_address_line1?: string;
  recipient_address_line2?: string;
  recipient_city?: string;
  recipient_state?: string;
  recipient_postal_code?: string;
  recipient_country?: string;
  recipient_vat_number?: string;
  line_items?: InvoiceLineItem[];
  subtotal?: number;
  tax_rate?: number;
  tax_amount?: number;
  total?: number;
  currency?: string;
  notes?: string;
  contact_persons?: LocationContactPerson[];
  is_active?: boolean;
}

export interface InvoiceUpdate {
  invoice_number?: string;
  status?: InvoiceStatus;
  issue_date?: string;
  due_date?: string;
  recipient_name?: string;
  recipient_email?: string;
  recipient_address_line1?: string;
  recipient_address_line2?: string;
  recipient_city?: string;
  recipient_state?: string;
  recipient_postal_code?: string;
  recipient_country?: string;
  recipient_vat_number?: string;
  line_items?: InvoiceLineItem[];
  subtotal?: number;
  tax_rate?: number;
  tax_amount?: number;
  total?: number;
  currency?: string;
  notes?: string;
  contact_persons?: LocationContactPerson[];
  is_active?: boolean;
}

// Volunteer Update type
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

// Service Provider types
export interface ServiceProvider {
  id: string;
  tenant_id: string;
  location_id: string | null;
  conference_id: string | null;
  company_name: string;
  service_description: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  vat_number: string | null;
  contact_persons: LocationContactPerson[];
  created_at: string;
  updated_at: string;
}

export interface ServiceProviderCreate {
  company_name: string;
  service_description?: string;
  phone?: string;
  email?: string;
  website?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  vat_number?: string;
  contact_persons?: LocationContactPerson[];
}

export interface ServiceProviderUpdate {
  company_name?: string;
  service_description?: string;
  phone?: string;
  email?: string;
  website?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  vat_number?: string;
  contact_persons?: LocationContactPerson[];
}

// Platform Currency types (admin settings)
export interface PlatformCurrency {
  id: string;
  code: string;
  name: string;
  symbol: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PlatformCurrencyCreate {
  code: string;
  name: string;
  symbol: string;
  is_active?: boolean;
}

export interface PlatformCurrencyUpdate {
  code?: string;
  name?: string;
  symbol?: string;
  is_active?: boolean;
}

// Booking Options types
export interface BookingPeriod {
  id: string;
  tenant_id: string;
  conference_id: string;
  name: string;
  start_date: string;
  end_date: string;
  sort_order: number;
  prices: Record<string, number> | null;
  currency: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BookingPeriodCreate {
  name: string;
  start_date: string;
  end_date: string;
  sort_order?: number;
  prices?: Record<string, number>;
  currency?: string;
  is_active?: boolean;
}

export interface BookingPeriodUpdate {
  name?: string;
  start_date?: string;
  end_date?: string;
  sort_order?: number;
  prices?: Record<string, number>;
  currency?: string;
  is_active?: boolean;
}

export interface BookingPackage {
  id: string;
  tenant_id: string;
  conference_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BookingPackageCreate {
  name: string;
  description?: string;
  sort_order?: number;
  is_active?: boolean;
}

export interface BookingPackageUpdate {
  name?: string;
  description?: string;
  sort_order?: number;
  is_active?: boolean;
}

export interface BookingMatrix {
  periods: BookingPeriod[];
  packages: BookingPackage[];
}

// Discount Code types
export interface DiscountCode {
  id: string;
  tenant_id: string;
  conference_id: string;
  name: string;
  code: string;
  discount_type: "fixed" | "percentage";
  discount_value: number;
  currency: string | null;
  start_date: string | null;
  end_date: string | null;
  max_uses: number;
  usage_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DiscountCodeCreate {
  name: string;
  code: string;
  discount_type: "fixed" | "percentage";
  discount_value: number;
  currency?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  max_uses?: number;
  is_active?: boolean;
}

export interface DiscountCodeUpdate {
  name?: string;
  code?: string;
  discount_type?: "fixed" | "percentage";
  discount_value?: number;
  currency?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  max_uses?: number;
  is_active?: boolean;
}

// Paper Assignment types
export interface PaperAssignment {
  id: string;
  paper_id: string;
  paper_title: string;
  committee_member_id: string;
  committee_member_first_name: string;
  committee_member_last_name: string;
  is_anonymous: boolean;
  assigned_at: string;
}

export interface PaperAssignmentCreate {
  paper_id: string;
  committee_member_id: string;
  is_anonymous?: boolean;
}

export interface PaperAssignmentListResponse {
  items: PaperAssignment[];
  total: number;
}

export interface AutoAssignRequest {
  conference_id: string;
  reviewers_per_paper: number;
  is_anonymous: boolean;
  only_submitted?: boolean;
}

export interface AutoAssignResponse {
  assignments_created: number;
  papers_processed: number;
  papers_skipped: number;
  skipped_details: string[];
}

// --- Review Score Scales ---

export interface ReviewScaleOption {
  id: string;
  label: string;
  numeric_value: number | null;
  is_unsure: boolean;
  display_order: number;
}

export interface ReviewScoreScale {
  id: string;
  tenant_id: string;
  conference_id: string;
  name: string;
  scale_type: "numeric_range" | "custom" | "binary";
  is_active: boolean;
  options: ReviewScaleOption[];
  created_at: string;
  updated_at: string;
}

export interface ReviewScoreScaleCreate {
  name: string;
  scale_type: "numeric_range" | "custom" | "binary";
  is_active?: boolean;
  options: Omit<ReviewScaleOption, "id">[];
}

export interface ReviewScoreScaleUpdate {
  name?: string;
  scale_type?: "numeric_range" | "custom" | "binary";
  is_active?: boolean;
  options?: Omit<ReviewScaleOption, "id">[];
}

// --- Review Criteria & Questions ---

export interface ReviewQuestion {
  id: string;
  criterion_id: string;
  text: string;
  help_text: string | null;
  question_type: "scored" | "non_scored";
  score_scale_id: string | null;
  score_scale: ReviewScoreScale | null;
  weight: number;
  comment_requirement: "optional" | "required" | "required_if_low_score";
  low_score_threshold: number | null;
  show_to_reviewers: boolean;
  count_in_score: boolean;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReviewQuestionCreate {
  text: string;
  help_text?: string;
  question_type?: "scored" | "non_scored";
  score_scale_id?: string;
  weight?: number;
  comment_requirement?: "optional" | "required" | "required_if_low_score";
  low_score_threshold?: number;
  show_to_reviewers?: boolean;
  count_in_score?: boolean;
  display_order?: number;
  is_active?: boolean;
}

export interface ReviewQuestionUpdate {
  text?: string;
  help_text?: string;
  question_type?: "scored" | "non_scored";
  score_scale_id?: string;
  weight?: number;
  comment_requirement?: "optional" | "required" | "required_if_low_score";
  low_score_threshold?: number;
  show_to_reviewers?: boolean;
  count_in_score?: boolean;
  display_order?: number;
  is_active?: boolean;
}

export interface ReviewCriterion {
  id: string;
  tenant_id: string;
  conference_id: string;
  title: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
  questions: ReviewQuestion[];
  created_at: string;
  updated_at: string;
}

export interface ReviewCriterionCreate {
  title: string;
  description?: string;
  display_order?: number;
  is_active?: boolean;
}

export interface ReviewCriterionUpdate {
  title?: string;
  description?: string;
  display_order?: number;
  is_active?: boolean;
}

// Review Form Settings types
export interface ReviewFormSettings {
  id: string;
  conference_id: string;
  enable_speaker_feedback: boolean;
  enable_internal_comment: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReviewFormSettingsUpdate {
  enable_speaker_feedback?: boolean;
  enable_internal_comment?: boolean;
}

// Attachment types
export interface Attachment {
  id: string;
  tenant_id: string;
  entity_type: string;
  entity_id: string;
  filename: string;
  content_type: string;
  file_size: number;
  description: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

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
