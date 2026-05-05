import type { SocialLinks } from './common';
import type { TeamMember } from './conference';

// Training types
export type TrainingStatus = 'draft' | 'upcoming' | 'ongoing' | 'past';

export { TeamMember };

export interface Training {
  id: string;
  tenant_id: string;
  name: string;
  slug: string | null;
  abbreviation: string | null;
  description: string | null;
  content: string | null;
  duration: number | null;
  color: string | null;
  website: string | null;
  logo_url: string | null;
  // Pricing
  regular_price: number | null;
  early_bird_price: number | null;
  // Catalog references
  language_id: string | null;
  language_name: string | null;
  second_language_id: string | null;
  second_language_name: string | null;
  syllabus_id: string | null;
  syllabus_name: string | null;
  theme_id: string | null;
  theme_name: string | null;
  certification_body_id: string | null;
  certification_body_name: string | null;
  // Contact info
  support_email: string | null;
  contact_email: string | null;
  phone: string | null;
  // Dates
  start_date: string | null;
  end_date: string | null;
  // Location
  venue_name: string | null;
  venue_address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  timezone: string | null;
  locale: string | null;
  venue_type: 'onsite' | 'virtual' | 'hybrid';
  venue_url: string | null;
  virtual_platform_url: string | null;
  // Social links
  social_links: SocialLinks;
  // Team
  team_members: TeamMember[];
  // Settings
  settings: Record<string, unknown>;
  // Currency
  currency: string | null;
  invoice_currency: string | null;
  // Status
  is_active: boolean;
  is_published: boolean;
  // Timestamps
  created_at: string;
  updated_at: string;
  // Computed
  managers_count: number;
  team_count: number;
  status: TrainingStatus;
}

export interface TrainingCreate {
  name: string;
  slug?: string;
  abbreviation?: string;
  description?: string;
  content?: string;
  duration?: number;
  website?: string;
  color?: string;
  regular_price?: number | null;
  early_bird_price?: number | null;
  language_id?: string | null;
  second_language_id?: string | null;
  syllabus_id?: string | null;
  theme_id?: string | null;
  certification_body_id?: string | null;
  logo_url?: string;
  support_email?: string;
  contact_email?: string;
  phone?: string;
  start_date?: string;
  end_date?: string;
  venue_name?: string;
  venue_address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  timezone?: string;
  locale?: string;
  venue_type?: 'onsite' | 'virtual' | 'hybrid';
  venue_url?: string;
  virtual_platform_url?: string;
  social_links?: SocialLinks;
  team_members?: TeamMember[];
  settings?: Record<string, unknown>;
  currency?: string;
  invoice_currency?: string;
}

export interface TrainingUpdate {
  name?: string;
  slug?: string;
  abbreviation?: string;
  description?: string;
  content?: string;
  duration?: number;
  color?: string;
  website?: string;
  regular_price?: number | null;
  early_bird_price?: number | null;
  language_id?: string | null;
  second_language_id?: string | null;
  syllabus_id?: string | null;
  theme_id?: string | null;
  certification_body_id?: string | null;
  logo_url?: string;
  support_email?: string;
  contact_email?: string;
  phone?: string;
  start_date?: string;
  end_date?: string;
  venue_name?: string;
  venue_address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  timezone?: string;
  locale?: string;
  venue_type?: 'onsite' | 'virtual' | 'hybrid';
  venue_url?: string;
  virtual_platform_url?: string;
  social_links?: SocialLinks;
  team_members?: TeamMember[];
  settings?: Record<string, unknown>;
  currency?: string;
  invoice_currency?: string | null;
  is_active?: boolean;
  is_published?: boolean;
}

// Training Theme (like CFP Topics)
export interface TrainingTheme {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  language_id: string | null;
  language_name: string | null;
  created_at: string;
  updated_at: string;
}

// Training Language
export interface TrainingLanguage {
  id: string;
  tenant_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

// Certification Body (like Service Provider)
export interface CertificationBodyContact {
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  comment: string | null;
}

export interface CertificationBody {
  id: string;
  tenant_id: string;
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
  contact_persons: CertificationBodyContact[];
  created_at: string;
  updated_at: string;
}

export interface CertificationBodyCreate {
  company_name: string;
  service_description?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  vat_number?: string | null;
  contact_persons?: CertificationBodyContact[];
}

export interface CertificationBodyUpdate {
  company_name?: string;
  service_description?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  vat_number?: string | null;
  contact_persons?: CertificationBodyContact[];
}

// Syllabus
export interface Syllabus {
  id: string;
  tenant_id: string;
  slug: string;
  name: string;
  description: string | null;
  price: number | null;
  exam_cost: number | null;
  certification_body_id: string | null;
  certification_body_name: string | null;
  language_id: string | null;
  language_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface SyllabusCreate {
  slug: string;
  name: string;
  description?: string | null;
  price?: number | null;
  exam_cost?: number | null;
  certification_body_id?: string | null;
  language_id?: string | null;
}

export interface SyllabusUpdate {
  slug?: string;
  name?: string;
  description?: string | null;
  price?: number | null;
  exam_cost?: number | null;
  certification_body_id?: string | null;
  language_id?: string | null;
}

// Trainer
export interface TrainerNameRef {
  id: string;
  name: string;
}

export interface TrainerUnavailability {
  id: string;
  trainer_id: string;
  start_date: string;
  end_date: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Trainer {
  id: string;
  tenant_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  pronouns: string | null;
  vita: string | null;
  is_active: boolean;
  is_internal: boolean;
  training_ids: string[];
  language_ids: string[];
  trainings: TrainerNameRef[];
  languages: TrainerNameRef[];
  unavailability: TrainerUnavailability[];
  created_at: string;
  updated_at: string;
}

export interface TrainerCreate {
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  pronouns?: string | null;
  vita?: string | null;
  is_active?: boolean;
  is_internal?: boolean;
  training_ids?: string[];
  language_ids?: string[];
}

export interface TrainerUpdate {
  first_name?: string;
  last_name?: string;
  email?: string | null;
  phone?: string | null;
  pronouns?: string | null;
  vita?: string | null;
  is_active?: boolean;
  is_internal?: boolean;
  training_ids?: string[];
  language_ids?: string[];
}

// Holiday Config
export interface HolidayConfig {
  id: string;
  tenant_id: string;
  country_code: string;
  year: number;
  national_holidays_enabled: boolean;
  regional_holidays_enabled: boolean;
  regional_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublicHoliday {
  date: string;
  local_name: string;
  name: string;
  country_code: string;
  is_global: boolean;
  counties: string[] | null;
  types: string[];
}

export interface AvailableCountry {
  country_code: string;
  name: string;
}

export interface CountrySubdivision {
  code: string;
  name: string;
}

export interface CustomBlockedDay {
  id: string;
  tenant_id: string;
  date: string;
  name: string;
  year: number;
  is_recurring: boolean;
  created_at: string;
  updated_at: string;
}

// Aggregated holiday date (for calendar grid)
export interface HolidayDateEntry {
  date: string;
  name: string;
  type: 'public' | 'custom';
  country_code: string | null;
  is_national: boolean | null;
  counties: string[] | null;
}

// Training Program Year
export interface TrainingProgramYear {
  id: string;
  tenant_id: string;
  year: number;
  status: 'draft' | 'published';
  notes: string | null;
  published_version: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

// Training placement on program year calendar
export interface ProgramYearTraining {
  id: string;
  program_year_id: string;
  training_id: string;
  training_name: string;
  training_slug: string | null;
  training_abbreviation: string | null;
  training_duration: number | null;
  training_color: string | null;
  location_id: string | null;
  location_name: string | null;
  location_code: string | null;
  start_date: string;
  placement_type: 'open' | 'inhouse' | 'hybrid';
  customer_id?: string | null;
  customer_name?: string | null;
  offer_id?: string | null;
  is_guaranteed?: boolean;
  created_at: string;
  updated_at: string;
  trainer_assignments: PlacementTrainerAssignment[];
}

// Trainer assigned to a placement
export interface PlacementTrainerAssignment {
  id: string;
  placement_id: string;
  trainer_id: string;
  trainer_first_name: string;
  trainer_last_name: string;
  created_at: string;
}

// Conflict when assigning a trainer
export interface TrainerConflict {
  type: 'unavailability' | 'double_booking';
  description: string;
  start_date: string;
  end_date: string;
  other_training_name?: string;
  other_placement_id?: string;
}

export interface AvailabilityCheckResponse {
  available: boolean;
  conflicts: TrainerConflict[];
}

// Program snapshots & diff
export interface ProgramSnapshotListItem {
  id: string;
  version: number;
  published_at: string;
  published_by: string | null;
}

export interface ProgramSnapshot extends ProgramSnapshotListItem {
  program_year_id: string;
  snapshot_data: ProgramSnapshotEntry[];
}

export interface ProgramSnapshotEntry {
  placement_id: string;
  training_name: string;
  training_slug: string | null;
  training_abbreviation: string | null;
  training_color: string | null;
  start_date: string;
  duration: number;
  location_name: string | null;
  location_code: string | null;
  trainer_ids: string[];
  trainer_names: string[];
  placement_type?: string;
}

export interface PlacementChangeResponse {
  change_type: 'added' | 'removed' | 'modified';
  placement_id: string;
  training_name: string;
  training_slug: string | null;
  start_date: string;
  duration: number;
  location_name: string | null;
  location_code: string | null;
  changes: string[];
  old_trainer_names: string[];
  new_trainer_names: string[];
}

export interface TrainerChangeResponse {
  trainer_id: string;
  trainer_name: string;
  added_trainings: string[];
  removed_trainings: string[];
  modified_trainings: string[];
}

export interface ProgramDiffResponse {
  has_changes: boolean;
  placement_changes: PlacementChangeResponse[];
  affected_trainer_ids: string[];
  per_trainer_changes: TrainerChangeResponse[];
}

// Customer Offers
export interface OfferPlacementInfo {
  id: string;
  training_name: string;
  training_slug: string | null;
  start_date: string;
  location_name: string | null;
  placement_type: string;
  program_year: number;
}

export interface CustomerOffer {
  id: string;
  tenant_id: string;
  customer_id: string;
  customer_name: string;
  offer_type: 'inhouse' | 'open';
  offer_number: string;
  status: 'draft' | 'sent' | 'rejected' | 'accepted';
  attendees: number | null;
  training_price: number | null;
  certification_price: number | null;
  currency: string;
  comments: string | null;
  notes: string | null;
  po_number: string | null;
  placements: OfferPlacementInfo[];
  attendee_count: number;
  invoice_count: number;
  invoice_numbers: string[];
  invoice_ids: string[];
  invoiced_total: number;
  created_at: string;
  updated_at: string;
}

export interface OfferAttendee {
  id: string;
  tenant_id: string;
  offer_id: string;
  placement_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  certification: boolean;
  exam_mode: 'onsite' | 'online' | null;
  extra_time: boolean;
  exam_language: string | null;
  comments: string | null;
  created_at: string;
  updated_at: string;
}

export interface AvailablePlacement {
  id: string;
  training_name: string;
  training_slug: string | null;
  start_date: string;
  location_name: string | null;
  placement_type: string;
  program_year: number;
}

// Offer Documents
export interface OfferDocument {
  id: string;
  offer_id: string;
  filename: string;
  content_type: string | null;
  file_size: number | null;
  html_content: string | null;
  is_editable: boolean;
  version: number;
  version_count: number;
  status: string;
  last_sent_at: string | null;
  sent_to: Array<{ email: string; sent_at: string; version: number }> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface OfferDocumentVersion {
  id: string;
  version: number;
  filename: string;
  content_type: string | null;
  file_size: number | null;
  html_content: string | null;
  created_by: string | null;
  created_at: string;
}
