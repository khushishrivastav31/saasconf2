/**
 * Shared policy types, labels, and constants used by both
 * conference and training policy settings tabs.
 */

export interface PolicyEntry {
  type: 'url' | 'content' | null;
  url: string | null;
  content: string | null;
  enabled: boolean;
}

export const DEFAULT_ENTRY: PolicyEntry = { type: null, url: null, content: null, enabled: false };

export const POLICY_LABELS: Record<string, { label: string; description: string }> = {
  privacy_policy: {
    label: 'Privacy Policy',
    description: 'Data protection and privacy information for attendees.',
  },
  cookies_policy: {
    label: 'Cookies Policy',
    description: 'Information about cookie usage on the registration portal.',
  },
  imprint: {
    label: 'Imprint',
    description: 'Legal notice with company/organization details (required in some jurisdictions).',
  },
  terms_and_conditions: {
    label: 'Terms and Conditions',
    description:
      'Registration terms that attendees must accept. When enabled, a consent checkbox is shown during registration.',
  },
  code_of_conduct: {
    label: 'Code of Conduct',
    description: 'Expected behavior standards for participants.',
  },
};

export const POLICY_ORDER = [
  'privacy_policy',
  'cookies_policy',
  'imprint',
  'terms_and_conditions',
  'code_of_conduct',
] as const;
