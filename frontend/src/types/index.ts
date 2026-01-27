// User types
export interface User {
  id: string;
  email: string;
  full_name: string | null;
  role: "super_admin" | "tenant_admin" | "user";
  tenant_id: string | null;
  tenant_name: string | null;
  modules: string[];
  is_active: boolean;
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
  name: string;
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
  // Contact persons
  contact_persons: ContactPerson[];
  // Comments
  comments: string | null;
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
  admin_name?: string;
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
  name: string;
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
  max_submissions_per_speaker: number | null;
  require_abstract: boolean;
  require_bio: boolean;
  allowed_formats: string[];
  tracks: string[];
  custom_fields: Record<string, unknown>;
  settings: Record<string, unknown>;
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
  require_abstract?: boolean;
  require_bio?: boolean;
  allowed_formats?: string[];
  tracks?: string[];
  custom_fields?: Record<string, unknown>;
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
  speaker_name: string;
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
  speaker_name: string;
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

// Tenant User types
export interface TenantUser {
  id: string;
  email: string;
  full_name: string | null;
  role: "tenant_admin" | "user";
  is_active: boolean;
  last_login: string | null;
  created_at: string;
  updated_at: string;
}

export interface TenantUserCreate {
  email: string;
  password: string;
  full_name?: string;
  role?: "tenant_admin" | "user";
}

export interface TenantUserUpdate {
  email?: string;
  full_name?: string;
  role?: "tenant_admin" | "user";
  is_active?: boolean;
  password?: string;
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
  user_id?: string;
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  is_manager: boolean;
}

export interface Conference {
  id: string;
  tenant_id: string;
  name: string;
  abbreviation: string | null;
  description: string | null;
  website: string | null;
  logo_url: string | null;
  // Dates
  start_date: string | null;
  end_date: string | null;
  // Location
  venue_name: string | null;
  venue_address: string | null;
  city: string | null;
  country: string | null;
  timezone: string | null;
  is_virtual: boolean;
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
  start_date?: string;
  end_date?: string;
  venue_name?: string;
  venue_address?: string;
  city?: string;
  country?: string;
  timezone?: string;
  is_virtual?: boolean;
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
  start_date?: string;
  end_date?: string;
  venue_name?: string;
  venue_address?: string;
  city?: string;
  country?: string;
  timezone?: string;
  is_virtual?: boolean;
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

// Tenant Settings types
export interface VolunteerRole {
  id: string;
  tenant_id: string;
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
  contact_persons: LocationContactPerson[];
  created_at: string;
  updated_at: string;
}

export interface ServiceProviderCreate {
  company_name: string;
  service_description?: string;
  contact_persons?: LocationContactPerson[];
}

export interface ServiceProviderUpdate {
  company_name?: string;
  service_description?: string;
  contact_persons?: LocationContactPerson[];
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
