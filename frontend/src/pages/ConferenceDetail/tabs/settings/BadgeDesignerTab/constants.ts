export const BADGE_TYPES = [
  { key: 'attendee', label: 'Attendee' },
  { key: 'speaker', label: 'Speaker' },
  { key: 'sponsor', label: 'Sponsor' },
  { key: 'volunteer', label: 'Volunteer' },
  { key: 'committee', label: 'Program Committee' },
  { key: 'organizer', label: 'Organizer' },
] as const;

export type BadgeTypeKey = (typeof BADGE_TYPES)[number]['key'];

export const QR_FIELD_OPTIONS = [
  { key: 'first_name', label: 'First Name' },
  { key: 'last_name', label: 'Last Name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'job_title', label: 'Job Title' },
  { key: 'department', label: 'Department' },
  { key: 'company_name', label: 'Company' },
  { key: 'street', label: 'Street' },
  { key: 'postal_code', label: 'Postal Code' },
  { key: 'city', label: 'City' },
  { key: 'country', label: 'Country' },
] as const;

export interface ConditionalImage {
  id: string;
  name: string;
  placeholder: string;
  condition_type: string;
  condition_value: string;
  attachment_id: string | null;
  condition_field?: string | null;
  condition_operator?: string | null;
}

export const CONDITION_TYPES = [
  { key: 'booking_option', label: 'Booking Option' },
  { key: 'conference_day', label: 'Conference Day' },
  { key: 'field', label: 'Field Condition' },
] as const;

// Legacy display label for existing registration_item conditions
export const CONDITION_TYPE_LABELS: Record<string, string> = {
  booking_option: 'Booking Option',
  conference_day: 'Conference Day',
  registration_item: 'Booking Option',
  field: 'Field Condition',
};

export const CONDITION_FIELDS = [
  { key: 'first_name', label: 'First Name' },
  { key: 'last_name', label: 'Last Name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'job_title', label: 'Job Title' },
  { key: 'department', label: 'Department' },
  { key: 'pronouns', label: 'Pronouns' },
  { key: 'company_name', label: 'Company' },
  { key: 'country', label: 'Country' },
  { key: 'city', label: 'City' },
  { key: 'booking_option', label: 'Booking Option (name)' },
  { key: 'badge_type', label: 'Badge Type' },
] as const;

export const CONDITION_OPERATORS = [
  { key: 'eq', label: 'equals' },
  { key: 'neq', label: 'not equals' },
  { key: 'contains', label: 'contains' },
  { key: 'not_empty', label: 'is not empty' },
  { key: 'empty', label: 'is empty' },
] as const;

export const NO_VALUE_OPERATORS = new Set(['not_empty', 'empty']);
