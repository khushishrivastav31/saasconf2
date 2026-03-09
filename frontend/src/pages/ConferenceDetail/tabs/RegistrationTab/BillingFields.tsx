import { useEffect, useMemo, useState } from 'react';
import { COUNTRY_OPTIONS, EU_COUNTRY_CODES } from '../../../../config/countries';
import { validateEmail } from '../../../../utils/validators';
import VatNumberInput from '../../../../components/common/VatNumberInput';
import type { BillingProfileCreate } from '../../../../types';

interface BillingFieldsProps {
  data: BillingProfileCreate;
  onChange: (d: BillingProfileCreate) => void;
  conference?: {
    country?: string | null;
    venue_type?: string | null;
  };
  // NEW props for portal pre-fill:
  initialValues?: Partial<BillingProfileCreate>; // Pre-fill from user profile
  readOnlyFields?: Array<keyof BillingProfileCreate>; // Lock specific fields
}

// Helper to determine VAT requirement client-side
function determineVatRequirement(
  country: string,
  conferenceCountry: string,
  conferenceVenue: string,
  hasCompanyName: boolean
): { level: 'required' | 'recommended' | 'optional'; reason?: string } {
  if (!country || !conferenceCountry) {
    return { level: 'optional' };
  }

  const isEU = EU_COUNTRY_CODES.has(country.toUpperCase());
  const isDomestic = country.toUpperCase() === conferenceCountry.toUpperCase();
  const isVirtual = conferenceVenue === 'virtual' || conferenceVenue === 'hybrid';

  // REQUIRED: Virtual/hybrid + EU (non-domestic) + has company name (B2B indicator)
  if (isVirtual && isEU && !isDomestic && hasCompanyName) {
    return {
      level: 'required',
      reason:
        'VAT number is required for reverse charge on virtual services to EU businesses (Article 196, VAT Directive).',
    };
  }

  // RECOMMENDED: B2B (has company name) in domestic or EU
  if (hasCompanyName && (isDomestic || isEU)) {
    return {
      level: 'recommended',
      reason: 'VAT number is recommended for B2B transactions to enable VAT reclaim.',
    };
  }

  return { level: 'optional' };
}

export default function BillingFields({
  data,
  onChange,
  conference,
  initialValues,
  readOnlyFields,
}: BillingFieldsProps) {
  const [emailError, setEmailError] = useState<string | null>(null);

  // On mount, merge initialValues with data (one-time pre-fill)
  useEffect(() => {
    if (initialValues && Object.keys(initialValues).length > 0) {
      onChange({ ...data, ...initialValues });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  // Helper to check if a field is read-only
  const isReadOnly = (field: keyof BillingProfileCreate): boolean =>
    readOnlyFields?.includes(field) ?? false;

  const vatRequirement = useMemo(() => {
    if (!conference) {
      return { level: 'optional' as const };
    }
    return determineVatRequirement(
      data.country,
      conference.country || '',
      conference.venue_type || 'in_person',
      !!data.company_name?.trim()
    );
  }, [data.country, data.company_name, conference]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label
            htmlFor="company_name"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Company Name
          </label>
          <input
            id="company_name"
            type="text"
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
            value={data.company_name || ''}
            onChange={(e) => onChange({ ...data, company_name: e.target.value || null })}
          />
        </div>
        <div className="md:col-span-2">
          <label
            htmlFor="street"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Street *
          </label>
          <input
            id="street"
            type="text"
            required
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
            value={data.street}
            onChange={(e) => onChange({ ...data, street: e.target.value })}
          />
        </div>
        <div>
          <label
            htmlFor="postal_code"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Postal Code *
          </label>
          <input
            id="postal_code"
            type="text"
            required
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
            value={data.postal_code}
            onChange={(e) => onChange({ ...data, postal_code: e.target.value })}
          />
        </div>
        <div>
          <label
            htmlFor="city"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            City *
          </label>
          <input
            id="city"
            type="text"
            required
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
            value={data.city}
            onChange={(e) => onChange({ ...data, city: e.target.value })}
          />
        </div>
        <div>
          <label
            htmlFor="country"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Country *
          </label>
          <select
            id="country"
            required
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
            value={data.country}
            onChange={(e) => {
              onChange({ ...data, country: e.target.value, vat_validated: null });
            }}
          >
            <option value="">Select a country</option>
            {COUNTRY_OPTIONS.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <VatNumberInput
            value={data.vat_number || ''}
            onChange={(val) => onChange({ ...data, vat_number: val || null, vat_validated: null })}
            onValidationResult={(valid) => onChange({ ...data, vat_validated: valid })}
            country={data.country}
            required={vatRequirement.level === 'required'}
            level={vatRequirement.level}
            requirementReason={vatRequirement.reason}
          />
        </div>
      </div>

      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 pt-2">
        Contact Person
      </h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="contact_first_name"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            First Name *
          </label>
          <input
            id="contact_first_name"
            type="text"
            required
            disabled={isReadOnly('contact_first_name')}
            className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100 ${isReadOnly('contact_first_name') ? 'bg-gray-100 dark:bg-gray-700 cursor-not-allowed' : ''}`}
            value={data.contact_first_name}
            onChange={(e) => onChange({ ...data, contact_first_name: e.target.value })}
          />
        </div>
        <div>
          <label
            htmlFor="contact_last_name"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Last Name *
          </label>
          <input
            id="contact_last_name"
            type="text"
            required
            disabled={isReadOnly('contact_last_name')}
            className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100 ${isReadOnly('contact_last_name') ? 'bg-gray-100 dark:bg-gray-700 cursor-not-allowed' : ''}`}
            value={data.contact_last_name}
            onChange={(e) => onChange({ ...data, contact_last_name: e.target.value })}
          />
        </div>
        <div>
          <label
            htmlFor="contact_phone"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Phone *
          </label>
          <input
            id="contact_phone"
            type="text"
            required
            disabled={isReadOnly('contact_phone')}
            className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100 ${isReadOnly('contact_phone') ? 'bg-gray-100 dark:bg-gray-700 cursor-not-allowed' : ''}`}
            value={data.contact_phone}
            onChange={(e) => onChange({ ...data, contact_phone: e.target.value })}
          />
        </div>
        <div>
          <label
            htmlFor="contact_email"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Email *
          </label>
          <input
            id="contact_email"
            type="email"
            required
            disabled={isReadOnly('contact_email')}
            className={`mt-1 block w-full rounded-md border ${emailError ? 'border-red-500 dark:border-red-500' : 'border-gray-300 dark:border-gray-600'} shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100 ${isReadOnly('contact_email') ? 'bg-gray-100 dark:bg-gray-700 cursor-not-allowed' : ''}`}
            value={data.contact_email}
            onChange={(e) => onChange({ ...data, contact_email: e.target.value })}
            onBlur={(e) => setEmailError(validateEmail(e.target.value))}
          />
          {emailError && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">{emailError}</p>
          )}
        </div>
        <div>
          <label
            htmlFor="procurement_code"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Procurement / PO Code
          </label>
          <input
            id="procurement_code"
            type="text"
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            value={data.procurement_code || ''}
            onChange={(e) => onChange({ ...data, procurement_code: e.target.value || null })}
          />
        </div>
        <div>
          <label
            htmlFor="payment_method"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Payment Method *
          </label>
          <select
            id="payment_method"
            required
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            value={data.payment_method || 'bank_transfer'}
            onChange={(e) => onChange({ ...data, payment_method: e.target.value })}
          >
            <option value="bank_transfer">Bank Transfer</option>
            <option value="credit_card">Credit Card</option>
          </select>
        </div>
        <div>
          <label
            htmlFor="discount_code"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Discount Code
          </label>
          <input
            id="discount_code"
            type="text"
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            value={data.discount_code || ''}
            onChange={(e) => onChange({ ...data, discount_code: e.target.value || null })}
            placeholder="Enter code if applicable"
          />
        </div>
      </div>
    </div>
  );
}
