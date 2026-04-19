export interface ApplicantFormData {
  first_name: string;
  last_name: string;
  pronouns: string;
  email: string;
  phone: string;
  title: string;
  company: string;
  address_line_1: string;
  address_line_2: string;
  city: string;
  postal_code: string;
  country: string;
  bio: string;
  password: string;
  allow_out_of_timeframe: boolean;
  social_links: Record<string, string>;
  needs_accessibility: boolean;
  accessibility_details: string;
  agrees_to_recording: boolean;
  role_ids: string[];
}

export const emptyForm: ApplicantFormData = {
  first_name: '',
  last_name: '',
  pronouns: '',
  email: '',
  phone: '',
  title: '',
  company: '',
  address_line_1: '',
  address_line_2: '',
  city: '',
  postal_code: '',
  country: '',
  bio: '',
  password: '',
  allow_out_of_timeframe: false,
  social_links: {},
  needs_accessibility: false,
  accessibility_details: '',
  agrees_to_recording: false,
  role_ids: [],
};

export function convertSocialLinks(links: object | null | undefined): Record<string, string> {
  if (!links) return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(links)) {
    if (value && typeof value === 'string' && value.trim()) {
      result[key] = value;
    }
  }
  return result;
}
