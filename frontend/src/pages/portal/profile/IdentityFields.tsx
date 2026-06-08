interface Props {
  firstName: string;
  lastName: string;
  pronouns: string;
  phone: string;
  title: string;
  company: string;
  pronounOptions: { id: string; name: string }[];
  requiredFields?: string[];
  onFirstNameChange: (v: string) => void;
  onLastNameChange: (v: string) => void;
  onPronounsChange: (v: string) => void;
  onPhoneChange: (v: string) => void;
  onTitleChange: (v: string) => void;
  onCompanyChange: (v: string) => void;
}

const inputClass =
  'w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100';

const Req = () => <span className="text-red-500"> *</span>;

export default function IdentityFields({
  firstName,
  lastName,
  pronouns,
  phone,
  title,
  company,
  pronounOptions,
  requiredFields = [],
  onFirstNameChange,
  onLastNameChange,
  onPronounsChange,
  onPhoneChange,
  onTitleChange,
  onCompanyChange,
}: Props) {
  const req = (field: string) => requiredFields.includes(field);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          First Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          required
          value={firstName}
          onChange={(e) => onFirstNameChange(e.target.value)}
          className={inputClass}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Last Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          required
          value={lastName}
          onChange={(e) => onLastNameChange(e.target.value)}
          className={inputClass}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Pronouns
        </label>
        <select
          value={pronouns}
          onChange={(e) => onPronounsChange(e.target.value)}
          className={inputClass}
        >
          <option value="">Select pronouns...</option>
          {pronounOptions.map((opt) => (
            <option key={opt.id} value={opt.name}>
              {opt.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Phone{req('phone') && <Req />}
        </label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => onPhoneChange(e.target.value)}
          className={inputClass}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Title / Position{req('title') && <Req />}
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          className={inputClass}
          placeholder="e.g., Senior Engineer"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Company / Organization{req('company') && <Req />}
        </label>
        <input
          type="text"
          value={company}
          onChange={(e) => onCompanyChange(e.target.value)}
          className={inputClass}
        />
      </div>
    </div>
  );
}
