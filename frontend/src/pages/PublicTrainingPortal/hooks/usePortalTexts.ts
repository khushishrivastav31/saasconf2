/**
 * Portal Texts Translation Hook
 *
 * Fetches portal configuration (languages, texts) and provides a t() function
 * that returns the text for the current language with EN fallback.
 */
import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import publicApi from '../../../config/publicApi';

interface VatRule {
  attendance_type: string;
  customer_type: string;
  customer_location: string;
  charge_vat: boolean;
  vat_rate_source: string;
  reverse_charge: boolean;
  oss: boolean;
}

export interface VatConfig {
  vat_rates: Record<string, number>;
  vat_rules: VatRule[];
  eu_countries: string[];
  tenant_country: string;
}

interface ExamLanguage {
  id: string;
  name: string;
}

interface PortalConfig {
  default_language: string;
  available_languages: string[];
  portal_texts: Record<string, Record<string, string>>;
  exam_languages: ExamLanguage[];
  vat_rates: Record<string, number>;
  vat_rules: VatRule[];
  eu_countries: string[];
  tenant_country: string;
  stripe_enabled: boolean;
  stripe_publishable_key: string;
  bank_transfer_countries: string[];
}

/** Default EN texts used when API hasn't loaded yet */
const FALLBACK_EN: Record<string, string> = {
  search_title: 'Training Catalog',
  search_subtitle: 'Browse available trainings and register',
  search_placeholder: 'Search trainings by name, location, certification...',
  filter_date: 'Date Range',
  filter_location: 'Location',
  filter_language: 'Language',
  filter_syllabus: 'Syllabus',
  filter_clear: 'Clear all',
  btn_register: 'Register',
  btn_add_attendee: '+ Add',
  btn_bulk_add: 'Bulk add',
  btn_submit: 'Register & Pay',
  section_attendees: 'Attendees',
  section_billing: 'Billing Information',
  section_contact: 'Contact Person',
  section_payment: 'Payment Method',
  section_summary: 'Order Summary',
  section_terms: 'I agree to the terms and conditions and acknowledge the privacy policy.',
  label_first_name: 'First name',
  label_last_name: 'Last name',
  label_email: 'Email',
  label_company: 'Company name (optional)',
  label_street: 'Street address',
  label_postal: 'Postal code',
  label_city: 'City',
  label_country: 'Country',
  label_vat: 'VAT number (optional)',
  label_phone: 'Phone',
  label_bank_transfer: 'Bank Transfer',
  label_credit_card: 'Credit Card',
  per_person: 'per person',
  total: 'Total',
  confirmation_title: 'Registration Successful!',
  confirmation_message: 'Thank you for registering. You will receive a confirmation email.',
  btn_browse_more: 'Browse more trainings',
  no_results: 'No trainings found',
  no_results_hint: 'Try adjusting your filters or search terms.',
  showing_results: 'Showing {count} of {total} trainings',
  filters: 'Filters',
  copy_from_attendee: 'Copy from first attendee',
  processing: 'Processing...',
  days: 'days',
  guaranteed: 'Guaranteed',
  label_certification_exam: 'Certification Exam',
  label_exam_none: 'No exam',
  label_exam_onsite: 'On-site',
  label_exam_online: 'Online',
  label_exam_language: 'Exam language',
  label_extra_time: 'Extra time (foreign language)',
  label_subtotal: 'Subtotal',
  label_vat_amount: 'VAT ({rate}%)',
  label_total: 'Total',
  attendee: 'attendee',
  attendees_plural: 'attendees',
  label_description: 'Description',
  label_content: 'Content',
  label_hide_description: 'Hide Description',
  label_hide_content: 'Hide Content',
};

export function usePortalTexts(tenantSlug: string, lang: string) {
  const { data: config } = useQuery<PortalConfig>({
    queryKey: ['portal-config', tenantSlug],
    queryFn: async () => {
      const res = await publicApi.get(`/portal/${tenantSlug}/trainings/portal-config`);
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!tenantSlug,
  });

  const texts = useMemo(() => {
    if (!config?.portal_texts) return FALLBACK_EN;
    // Try requested language, fall back to EN, fall back to hardcoded
    const langTexts = config.portal_texts[lang] || config.portal_texts['en'] || {};
    return { ...FALLBACK_EN, ...langTexts };
  }, [config, lang]);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>): string => {
      let text = texts[key] || FALLBACK_EN[key] || key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          text = text.replace(`{${k}}`, String(v));
        }
      }
      return text;
    },
    [texts]
  );

  return {
    t,
    config,
    defaultLanguage: config?.default_language || 'en',
    availableLanguages: config?.available_languages || ['en', 'de'],
    examLanguages: config?.exam_languages || [],
    stripeEnabled: config?.stripe_enabled ?? false,
    stripePublishableKey: config?.stripe_publishable_key ?? '',
    bankTransferCountries: config?.bank_transfer_countries ?? [],
    vatConfig: {
      vat_rates: config?.vat_rates || {},
      vat_rules: config?.vat_rules || [],
      eu_countries: config?.eu_countries || [],
      tenant_country: config?.tenant_country || '',
    } as VatConfig,
  };
}
