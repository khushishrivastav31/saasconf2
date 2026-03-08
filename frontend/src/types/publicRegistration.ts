/**
 * Public Registration Portal Types
 */

export interface PublicConference {
  id: string;
  name: string;
  abbreviation: string;
  description: string | null;
  start_date: string;
  end_date: string;
  location: string | null;
  website: string | null;
  booking_options: PublicBookingOption[];
  currency: string;
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
  booking_option_id: string;
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
  tax_id?: string;
  vat_number?: string;

  // Address
  address_line1: string;
  address_line2?: string;
  city: string;
  state_province?: string;
  postal_code: string;
  country: string;

  // Contact
  contact_name: string;
  contact_email: string;
  contact_phone?: string;

  // Payment
  payment_method: 'credit_card' | 'bank_transfer';

  // Optional
  purchase_order_number?: string;
  notes?: string;
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
