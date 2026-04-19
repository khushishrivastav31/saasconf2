import { COUNTRY_OPTIONS } from '../../../../../config/countries';
import type { ApplicantFormData } from './types';

interface Props {
  formData: ApplicantFormData;
  setFormData: React.Dispatch<React.SetStateAction<ApplicantFormData>>;
}

export default function AddressFields({ formData, setFormData }: Props) {
  return (
    <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Address</h3>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Address Line 1
            </label>
            <input
              type="text"
              value={formData.address_line_1}
              onChange={(e) => setFormData((d) => ({ ...d, address_line_1: e.target.value }))}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Address Line 2
            </label>
            <input
              type="text"
              value={formData.address_line_2}
              onChange={(e) => setFormData((d) => ({ ...d, address_line_2: e.target.value }))}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
              placeholder="Apartment, suite, etc. (optional)"
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              City
            </label>
            <input
              type="text"
              value={formData.city}
              onChange={(e) => setFormData((d) => ({ ...d, city: e.target.value }))}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Postal Code
            </label>
            <input
              type="text"
              value={formData.postal_code}
              onChange={(e) => setFormData((d) => ({ ...d, postal_code: e.target.value }))}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Country
            </label>
            <select
              value={formData.country}
              onChange={(e) => setFormData((d) => ({ ...d, country: e.target.value }))}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
            >
              <option value="">Select country...</option>
              {COUNTRY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
