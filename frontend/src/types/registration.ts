// Registration module types

export type RegistrationStatus = 'registered_pending_invoice' | 'invoiced' | 'paid' | 'cancelled';

export type RegistrationMode = 'individual' | 'company_single' | 'company_bulk';

export type RegistrationItemType = 'booking_option' | 'tutorial';

// Billing Profile
export interface BillingProfile {
  id: string;
  tenant_id: string;
  conference_id: string;
  company_name: string | null;
  street: string;
  postal_code: string;
  city: string;
  country: string;
  contact_first_name: string;
  contact_last_name: string;
  contact_phone: string;
  contact_email: string;
  vat_number: string | null;
  vat_validated: boolean | null;
  procurement_code: string | null;
  payment_method?: string | null;
  discount_code?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BillingProfileCreate {
  company_name?: string | null;
  street: string;
  postal_code: string;
  city: string;
  country: string;
  contact_first_name: string;
  contact_last_name: string;
  contact_phone: string;
  contact_email: string;
  vat_number?: string | null;
  vat_validated?: boolean | null;
  procurement_code?: string | null;
  payment_method?: string | null;
  discount_code?: string | null;
}

export interface BillingProfileUpdate {
  company_name?: string | null;
  street?: string;
  postal_code?: string;
  city?: string;
  country?: string;
  contact_first_name?: string;
  contact_last_name?: string;
  contact_phone?: string;
  contact_email?: string;
  vat_number?: string | null;
  procurement_code?: string | null;
  payment_method?: string | null;
  discount_code?: string | null;
}

// Registration Item (add-on)
export interface RegistrationItem {
  id: string;
  item_type: RegistrationItemType;
  booking_option_id: string | null;
  program_session_id: string | null;
  item_name: string;
  pending: boolean;
  notes: string | null;
  created_at: string;
}

export interface RegistrationItemCreate {
  item_type: RegistrationItemType;
  booking_option_id?: string | null;
  program_session_id?: string | null;
  notes?: string | null;
}

// Attendee data (used in create payloads)
export interface AttendeeData {
  first_name: string;
  last_name: string;
  email: string;
  pronouns?: string | null;
  job_title?: string | null;
  department?: string | null;
  phone?: string | null;
}

// Registration response
export interface Registration {
  id: string;
  tenant_id: string;
  conference_id: string;
  billing_profile_id: string;
  first_name: string;
  last_name: string;
  email: string;
  pronouns: string | null;
  job_title: string | null;
  department: string | null;
  phone: string | null;
  booking_option_id: string;
  booking_option_name: string | null;
  main_session_id: string | null;
  main_session_name: string | null;
  items: RegistrationItem[];
  registration_mode: RegistrationMode;
  status: RegistrationStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  billing_company_name: string | null;
  billing_contact_email: string | null;
}

export interface RegistrationListResponse {
  items: Registration[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

// Create payloads
export interface IndividualRegistrationCreate {
  attendee: AttendeeData;
  billing: BillingProfileCreate;
  booking_option_id: string;
  items?: RegistrationItemCreate[];
  notes?: string | null;
}

export interface CompanySingleRegistrationCreate {
  attendee: AttendeeData;
  billing: BillingProfileCreate;
  booking_option_id: string;
  items?: RegistrationItemCreate[];
  notes?: string | null;
}

export interface BulkAttendeeData extends AttendeeData {
  booking_option_id: string;
  main_session_id?: string;
  items?: RegistrationItemCreate[];
  notes?: string | null;
}

export interface BulkRegistrationCreate {
  billing: BillingProfileCreate;
  attendees: BulkAttendeeData[];
}

export interface BulkRegistrationResponse {
  billing_profile_id: string;
  registrations: Registration[];
  total_created: number;
}

// Unified registration (replaces individual + company + bulk)
export type UnifiedAttendeeData = BulkAttendeeData;
export type UnifiedRegistrationCreate = BulkRegistrationCreate;
export type UnifiedRegistrationResponse = BulkRegistrationResponse;

// Update payload
export interface RegistrationUpdate {
  first_name?: string;
  last_name?: string;
  email?: string;
  pronouns?: string | null;
  job_title?: string | null;
  department?: string | null;
  phone?: string | null;
  booking_option_id?: string;
  status?: RegistrationStatus;
  notes?: string | null;
}

// Bookable session selection types (for registration)
export interface BookableSessionInfo {
  id: string;
  title: string;
  description: string | null;
  speaker_name: string | null;
  has_paper: boolean;
  max_attendees: number | null;
  current_count: number;
  available_spots: number | null;
  is_full: boolean;
}

export interface BookableSlot {
  slot_id: string;
  start_time: string;
  end_time: string;
  label: string;
  sessions: BookableSessionInfo[];
}

export interface BookableSessionGroup {
  session_type_id: string | null;
  session_type_name: string;
  slots: BookableSlot[];
}

export interface BookableSessionsResponse {
  day_name: string | null;
  groups: BookableSessionGroup[];
}
