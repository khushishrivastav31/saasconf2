import { useState } from 'react';
import VatNumberInput from '../common/VatNumberInput';
import { COUNTRIES_BY_CONTINENT } from '../../config/countries';
import { validateEmail } from '../../utils/validators';
import type { InvoiceUpdate } from '../../types';

interface Props {
  formData: InvoiceUpdate;
  setFormData: (data: InvoiceUpdate) => void;
  readOnly: boolean;
}

export default function InvoiceRecipientSection({ formData, setFormData, readOnly }: Props) {
  const [emailError, setEmailError] = useState<string | null>(null);

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
      <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
        Recipient Information
      </h4>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Recipient Name *
            </label>
            <input
              type="text"
              required
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
              value={formData.recipient_name}
              onChange={(e) => setFormData({ ...formData, recipient_name: e.target.value })}
              disabled={readOnly}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Recipient Email
            </label>
            <input
              type="email"
              className={`mt-1 block w-full border ${emailError ? 'border-red-500 dark:border-red-500' : 'border-gray-300 dark:border-gray-600'} rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white dark:bg-gray-800 dark:text-gray-100`}
              value={formData.recipient_email || ''}
              onChange={(e) => setFormData({ ...formData, recipient_email: e.target.value })}
              onBlur={(e) => setEmailError(validateEmail(e.target.value))}
              disabled={readOnly}
            />
            {emailError && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{emailError}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Address Line 1 *
            </label>
            <input
              type="text"
              required
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
              value={formData.recipient_address_line1 || ''}
              onChange={(e) =>
                setFormData({ ...formData, recipient_address_line1: e.target.value })
              }
              disabled={readOnly}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Address Line 2
            </label>
            <input
              type="text"
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
              value={formData.recipient_address_line2 || ''}
              onChange={(e) =>
                setFormData({ ...formData, recipient_address_line2: e.target.value })
              }
              disabled={readOnly}
            />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              City *
            </label>
            <input
              type="text"
              required
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
              value={formData.recipient_city || ''}
              onChange={(e) => setFormData({ ...formData, recipient_city: e.target.value })}
              disabled={readOnly}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Postal Code *
            </label>
            <input
              type="text"
              required
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
              value={formData.recipient_postal_code || ''}
              onChange={(e) => setFormData({ ...formData, recipient_postal_code: e.target.value })}
              disabled={readOnly}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Country *
            </label>
            <select
              required
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
              value={formData.recipient_country || ''}
              onChange={(e) => setFormData({ ...formData, recipient_country: e.target.value })}
              disabled={readOnly}
            >
              <option value="">Select a country</option>
              {COUNTRIES_BY_CONTINENT.map((group) => (
                <optgroup key={group.continent} label={group.continent}>
                  {group.countries.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <VatNumberInput
            value={formData.recipient_vat_number || ''}
            onChange={(val) => setFormData({ ...formData, recipient_vat_number: val })}
            country={formData.recipient_country || undefined}
            disabled={readOnly}
          />
        </div>
      </div>
    </div>
  );
}
