import { describe, it, expect } from 'vitest';
import { buildApplicantPayload } from '../utils';
import type { ApplicantFormData } from '../ApplicantForm/types';

const baseForm: ApplicantFormData = {
  first_name: 'Ada',
  last_name: 'Lovelace',
  pronouns: '',
  email: 'ada@example.com',
  phone: '',
  title: '',
  company: 'ACME',
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

describe('buildApplicantPayload', () => {
  it('includes bio in the payload', () => {
    const payload = buildApplicantPayload({ ...baseForm, bio: 'My bio' });
    expect(payload.bio).toBe('My bio');
  });

  it('includes all address fields in the payload', () => {
    const form: ApplicantFormData = {
      ...baseForm,
      address_line_1: '1 Main St',
      address_line_2: 'Apt 2',
      city: 'London',
      postal_code: 'W1A 1AA',
      country: 'GB',
    };
    const payload = buildApplicantPayload(form);
    expect(payload.address_line_1).toBe('1 Main St');
    expect(payload.address_line_2).toBe('Apt 2');
    expect(payload.city).toBe('London');
    expect(payload.postal_code).toBe('W1A 1AA');
    expect(payload.country).toBe('GB');
  });

  it('sends empty string for blank address fields', () => {
    const payload = buildApplicantPayload(baseForm);
    expect(payload).toHaveProperty('address_line_1');
    expect(payload).toHaveProperty('city');
    expect(payload).toHaveProperty('postal_code');
    expect(payload).toHaveProperty('country');
  });
});
