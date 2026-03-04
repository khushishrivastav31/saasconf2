import { COUNTRY_OPTIONS } from '../../../../config/countries';
import VatNumberInput from '../../../../components/common/VatNumberInput';
import type { BillingProfileCreate } from '../../../../types';

interface BillingFieldsProps {
  data: BillingProfileCreate;
  onChange: (d: BillingProfileCreate) => void;
}

export default function BillingFields({ data, onChange }: BillingFieldsProps) {
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
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
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
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
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
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
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
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
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
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
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
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
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
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
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
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
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
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            value={data.contact_email}
            onChange={(e) => onChange({ ...data, contact_email: e.target.value })}
          />
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
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            value={data.procurement_code || ''}
            onChange={(e) => onChange({ ...data, procurement_code: e.target.value || null })}
          />
        </div>
      </div>
    </div>
  );
}
