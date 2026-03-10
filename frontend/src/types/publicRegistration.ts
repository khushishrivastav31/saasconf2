/**
 * Public Registration Portal Types
 */

export interface PublicBookingPeriod {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  prices: Record<string, number>;
  sort_order: number;
}

export interface PublicConference {
  id: string;
  name: string;
  abbreviation: string;
  description: string | null;
  start_date: string;
  end_date: string;
  location: string | null;
  website: string | null;
  logo_url?: string | null;
  booking_options: PublicBookingOption[];
  booking_periods: PublicBookingPeriod[];
  currency: string;
  country?: string | null;
  venue_type?: string | null;
  registration_start_date?: string | null;
  registration_end_date?: string | null;
  success_message?: string | null;
  policies?: Record<string, PolicyEntry> | null;
}

export interface PolicyEntry {
  type: 'url' | 'content' | null;
  url?: string | null;
  content?: string | null;
}

export interface PublicBookingOption {
  id: string;
  name: string;
  description: string | null;
  price: number;
  capacity: number | null;
  current_registrations: number;
  is_sold_out: boolean;
  conference_day_id: string | null;
}

export interface PortalAttendee {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  pronouns?: string;
  job_title?: string;
  department?: string;
  booking_option_ids: string[]; // Multi-select support
  items?: AttendeeItem[];
  notes?: string;
}

export interface AttendeeItem {
  item_type: 'booking_option' | 'tutorial';
  booking_option_id?: string;
  program_session_id?: string;
  item_name?: string;
}

export interface PortalBilling {
  // Company info
  company_name?: string;
  vat_number?: string;

  // Address
  street: string;
  postal_code: string;
  city: string;
  country: string;

  // Contact
  contact_first_name: string;
  contact_last_name: string;
  contact_email: string;
  contact_phone: string; // REQUIRED - must match backend schema

  // Payment
  payment_method: 'credit_card' | 'bank_transfer';

  // Optional
  discount_code?: string;
  procurement_code?: string;
}

export interface PortalRegistrationRequest {
  billing: PortalBilling;
  attendees: PortalAttendee[];
  recaptcha_token: string;
  honeypot_field?: string;
  form_start_timestamp?: number;
}

export interface PortalRegistrationResponse {
  billing_profile_id: string;
  registrations: PortalRegistration[];
  payment_required: boolean;
  payment_client_secret?: string;
  stripe_publishable_key?: string;
  success_url: string;
}

export interface PortalRegistration {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  booking_option_name: string;
  status: string;
}

export interface WizardStep {
  number: number;
  label: string;
  path: string;
}

export const WIZARD_STEPS: WizardStep[] = [
  { number: 1, label: 'Welcome', path: 'welcome' },
  { number: 2, label: 'Attendees', path: 'attendees' },
  { number: 3, label: 'Billing', path: 'billing' },
  { number: 4, label: 'Review', path: 'review' },
  { number: 5, label: 'Payment', path: 'payment' },
  { number: 6, label: 'Confirmation', path: 'confirmation' },
];

export interface DiscountCodeValidation {
  valid: boolean;
  message?: string;
  discount_type?: 'fixed' | 'percentage';
  discount_value?: number;
  currency?: string;
  description?: string;
  applicable_option_ids?: string[] | null;
  applicable_period_ids?: string[] | null;
  is_combinable?: boolean;
}

export interface VatCalculation {
  vat_rate: number;
  vat_amount: number;
  total: number;
  notes?: string | null;
}
