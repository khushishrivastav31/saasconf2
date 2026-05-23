import type { ApplicantFormData } from './ApplicantForm/types';

export function buildApplicantPayload(data: ApplicantFormData): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    first_name: data.first_name,
    last_name: data.last_name,
    email: data.email,
    allow_out_of_timeframe: data.allow_out_of_timeframe,
    needs_accessibility: data.needs_accessibility,
    agrees_to_recording: data.agrees_to_recording,
  };

  payload.pronouns = data.pronouns.trim() || null;
  payload.phone = data.phone.trim() || '';
  payload.title = data.title.trim() || '';
  payload.company = data.company.trim() || '';
  payload.address_line_1 = data.address_line_1.trim();
  payload.address_line_2 = data.address_line_2.trim();
  payload.city = data.city.trim();
  payload.postal_code = data.postal_code.trim();
  payload.country = data.country;
  payload.bio = data.bio.trim() || '';
  payload.accessibility_details = data.needs_accessibility ? data.accessibility_details.trim() : '';

  if (data.password.trim()) payload.password = data.password.trim();

  const socialLinks: Record<string, string> = {};
  Object.entries(data.social_links).forEach(([key, value]) => {
    if (value && value.trim()) {
      socialLinks[key] = value.trim();
    }
  });
  payload.social_links = socialLinks;
  payload.role_ids = data.role_ids;

  return payload;
}
