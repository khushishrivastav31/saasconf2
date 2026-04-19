export interface HistoryEvent {
  id: string;
  event_type: string;
  placement_id: string | null;
  training_name: string;
  source_type: string | null;
  notes: string | null;
  created_at: string | null;
}

export interface PortalUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  status: string;
  notes: string | null;
  current_training: string;
  current_training_date: string | null;
  portal_user_id: string | null;
  created_at: string | null;
  history: HistoryEvent[];
}

export interface PortalAccount {
  id: string;
  email: string;
  is_active: boolean;
  has_password: boolean;
  email_verified: boolean;
  last_login_at: string | null;
  created_at: string | null;
}

export interface ProfileRegistration {
  registration_id: string;
  status: string;
  training_name: string;
  training_date: string | null;
  location_name: string | null;
  location_city: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  company_name: string | null;
  street: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  vat_number: string | null;
  payment_method: string | null;
  po_number: string | null;
  discount_code: string | null;
  subtotal: string | null;
  vat_amount: string | null;
  total: string | null;
  currency: string | null;
  exam_mode: string | null;
  exam_language: string | null;
  extra_time: boolean;
  notes: string | null;
  created_at: string | null;
}

export interface OfferLink {
  offer_number: string;
  training_name: string;
  exam_mode: string | null;
  exam_language: string | null;
  extra_time: boolean;
  certification: boolean;
  comments: string | null;
}

export interface UserProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  status: string;
  portal_user_id: string | null;
  portal_account: PortalAccount | null;
  registrations: ProfileRegistration[];
  offer_links: OfferLink[];
  history: HistoryEvent[];
}

export interface EditableProfile {
  first_name: string;
  last_name: string;
  email: string;
  pronouns: string;
  phone: string;
  title: string;
  company: string;
  bio: string;
  address_line1: string;
  address_line2: string;
  city: string;
  postal_code: string;
  country: string;
  picture_url: string | null;
  video_url: string | null;
}
