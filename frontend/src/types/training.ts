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
  duration: string | null;
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
  duration?: string;
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
  invoice_currency?: string;
}

export interface TrainingUpdate {
  name?: string;
  slug?: string;
  abbreviation?: string;
  description?: string;
  content?: string;
  duration?: string;
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
  certification_body_id?: string | null;
  language_id?: string | null;
}

export interface SyllabusUpdate {
  slug?: string;
  name?: string;
  description?: string | null;
  price?: number | null;
  certification_body_id?: string | null;
  language_id?: string | null;
}

// Trainer
export interface TrainerNameRef {
  id: string;
  name: string;
}

export interface Trainer {
  id: string;
  tenant_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  vita: string | null;
  is_active: boolean;
  is_internal: boolean;
  training_ids: string[];
  language_ids: string[];
  trainings: TrainerNameRef[];
  languages: TrainerNameRef[];
  created_at: string;
  updated_at: string;
}

export interface TrainerCreate {
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
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
  vita?: string | null;
  is_active?: boolean;
  is_internal?: boolean;
  training_ids?: string[];
  language_ids?: string[];
}
