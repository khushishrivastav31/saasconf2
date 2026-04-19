import { validateEmail, validatePhone } from '../../../../../utils/validators';
import type { PronounOption } from '../../../../../types';
import type { ApplicantFormData } from './types';

interface Props {
  formData: ApplicantFormData;
  setFormData: React.Dispatch<React.SetStateAction<ApplicantFormData>>;
  emailError: string | null;
  setEmailError: (err: string | null) => void;
  phoneError: string | null;
  setPhoneError: (err: string | null) => void;
  pronounOptions: PronounOption[] | undefined;
}

export default function IdentityFields({
  formData,
  setFormData,
  emailError,
  setEmailError,
  phoneError,
  setPhoneError,
  pronounOptions,
}: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          First Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={formData.first_name}
          onChange={(e) => setFormData((d) => ({ ...d, first_name: e.target.value }))}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Last Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={formData.last_name}
          onChange={(e) => setFormData((d) => ({ ...d, last_name: e.target.value }))}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Pronouns
        </label>
        <select
          value={formData.pronouns}
          onChange={(e) => setFormData((d) => ({ ...d, pronouns: e.target.value }))}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
        >
          <option value="">Select pronouns...</option>
          {pronounOptions?.map((opt) => (
            <option key={opt.id} value={opt.name}>
              {opt.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Email <span className="text-red-500">*</span>
        </label>
        <input
          type="email"
          value={formData.email}
          onChange={(e) => setFormData((d) => ({ ...d, email: e.target.value }))}
          onBlur={(e) => setEmailError(validateEmail(e.target.value))}
          className={`w-full border ${emailError ? 'border-red-500 dark:border-red-500' : 'border-gray-300 dark:border-gray-600'} rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100`}
          required
        />
        {emailError && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{emailError}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Phone
        </label>
        <input
          type="tel"
          value={formData.phone}
          onChange={(e) => {
            const value = e.target.value;
            setFormData((d) => ({ ...d, phone: value }));
            setPhoneError(validatePhone(value));
          }}
          className={`w-full border rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 ${
            phoneError ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'
          }`}
          placeholder="+491234545 or 00491234566"
        />
        {phoneError && <p className="mt-1 text-xs text-red-600">{phoneError}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Title
        </label>
        <input
          type="text"
          value={formData.title}
          onChange={(e) => setFormData((d) => ({ ...d, title: e.target.value }))}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
          placeholder="e.g. Senior Developer"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Company
        </label>
        <input
          type="text"
          value={formData.company}
          onChange={(e) => setFormData((d) => ({ ...d, company: e.target.value }))}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
        />
      </div>
    </div>
  );
}
