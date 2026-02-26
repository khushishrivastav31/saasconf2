import type { LocationContactPerson, SocialLinks } from './common';

// Conference types
export type ConferenceStatus = 'draft' | 'upcoming' | 'ongoing' | 'past';

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
  // Currency (ISO 4217 code)
  currency: string | null;
  // Optional second currency for invoices
  invoice_currency: string | null;
  // Status
  is_active: boolean;
  is_published: boolean;
  // Program publication
  program_published_at: string | null;
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
  separately_bookable: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SessionTypeCreate {
  name: string;
  slug: string;
  duration_minutes: number;
  cfp_eligible?: boolean;
  separately_bookable?: boolean;
  is_active?: boolean;
}

export interface SessionTypeUpdate {
  name?: string;
  slug?: string;
  duration_minutes?: number;
  cfp_eligible?: boolean;
  separately_bookable?: boolean;
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

// Sponsor contract types
export type ContractStatus = 'draft' | 'sent' | 'signed';

export interface SponsorContract {
  id: string;
  tenant_id: string;
  sponsor_id: string;
  conference_id: string;
  source_package_id: string | null;
  filename: string;
  content_type: string;
  file_size: number;
  html_content: string | null;
  is_editable: boolean;
  version: number;
  version_count: number;
  status: ContractStatus;
  last_sent_at: string | null;
  sent_to: Array<{ email: string; sent_at: string; version: number }> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SponsorContractVersion {
  id: string;
  version: number;
  filename: string;
  content_type: string;
  file_size: number;
  html_content: string | null;
  created_by: string | null;
  created_at: string;
}

// Invoice types
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';

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

// Screen Overlay types
export type OverlayTriggerType = 'first_registration' | 'scheduled' | 'always';
export type OverlayAnimationStyle =
  | 'confetti'
  | 'fireworks'
  | 'balloons'
  | 'sparkle'
  | 'spotlight'
  | 'snow'
  | 'stars';

export interface ScreenOverlay {
  id: string;
  tenant_id: string;
  conference_id: string;
  trigger_type: OverlayTriggerType;
  title: string;
  body_text: string | null;
  animation_style: OverlayAnimationStyle;
  duration_seconds: number;
  is_active: boolean;
  schedule_date: string | null;
  display_order: number;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScreenOverlayCreate {
  trigger_type: OverlayTriggerType;
  title: string;
  body_text?: string;
  animation_style?: OverlayAnimationStyle;
  duration_seconds?: number;
  is_active?: boolean;
  schedule_date?: string;
  display_order?: number;
}

export interface ScreenOverlayUpdate {
  trigger_type?: OverlayTriggerType;
  title?: string;
  body_text?: string | null;
  animation_style?: OverlayAnimationStyle;
  duration_seconds?: number;
  is_active?: boolean;
  schedule_date?: string | null;
  display_order?: number;
}

export interface SuggestedNumberFormat {
  decimal_separator: string;
  thousands_separator: string;
  currency_position: string;
  decimal_places: number;
}

export interface NumberFormatPreset {
  code: string;
  label: string;
  decimal_separator: string;
  thousands_separator: string;
  currency_position: string;
  decimal_places: number;
}
