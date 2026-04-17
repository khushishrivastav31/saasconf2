import { useFormContext } from 'react-hook-form';
import { COUNTRIES_BY_CONTINENT } from '../../../../../config/countries';
import type { CompanyFormData } from './schema';

export default function AddressFields() {
  const { register } = useFormContext<CompanyFormData>();
  const inputClass =
    'block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100';

  return (
    <div className="border-t dark:border-gray-700 pt-4">
      <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Address</h5>
      <div className="space-y-3">
        <input
          type="text"
          placeholder="Street Address"
          className={inputClass}
          {...register('address')}
        />
        <div className="grid grid-cols-3 gap-3">
          <input
            type="text"
            placeholder="Postal Code"
            className={inputClass}
            {...register('postal_code')}
          />
          <input type="text" placeholder="City" className={inputClass} {...register('city')} />
          <select className={inputClass} {...register('country')}>
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
      </div>
    </div>
  );
}
