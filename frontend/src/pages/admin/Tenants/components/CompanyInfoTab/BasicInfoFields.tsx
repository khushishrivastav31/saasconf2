import { useFormContext } from 'react-hook-form';
import type { CompanyFormData } from './schema';

export default function BasicInfoFields() {
  const { register } = useFormContext<CompanyFormData>();
  const inputClass =
    'mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100';
  const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300';

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className={labelClass}>Company Name</label>
        <input type="text" className={inputClass} {...register('name')} />
      </div>
      <div>
        <label className={labelClass}>Website</label>
        <input
          type="text"
          placeholder="www.example.com"
          className={inputClass}
          {...register('website')}
        />
      </div>
      <div>
        <label className={labelClass}>VAT Number</label>
        <input type="text" className={inputClass} {...register('vat_number')} />
      </div>
      <div>
        <label className={labelClass}>Email Domain</label>
        <input
          type="text"
          placeholder="example.com"
          className={inputClass}
          {...register('email_domain')}
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          When set, outgoing emails will be sent from noreply@[domain].
        </p>
      </div>
    </div>
  );
}
