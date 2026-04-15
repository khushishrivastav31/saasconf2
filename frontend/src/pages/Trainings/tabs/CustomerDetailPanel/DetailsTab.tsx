import { COUNTRIES_BY_CONTINENT } from '../../../../config/countries';
import VatNumberInput from '../../../../components/common/VatNumberInput';
import RichTextEditor from '../../../../components/common/RichTextEditor';

function DetailsTab({
  form,
  updateField,
  inputClass,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: Record<string, any>;
  updateField: (key: string, value: unknown) => void;
  inputClass: string;
}) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Company Name *
          </label>
          <input
            type="text"
            className={inputClass}
            value={form.name}
            onChange={(e) => updateField('name', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Email
          </label>
          <input
            type="email"
            className={inputClass}
            value={form.email ?? ''}
            onChange={(e) => updateField('email', e.target.value || null)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Phone
          </label>
          <input
            type="text"
            placeholder="+491234545 or 00491234566"
            className={inputClass}
            value={form.phone ?? ''}
            onChange={(e) => updateField('phone', e.target.value || null)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Website
          </label>
          <input
            type="text"
            placeholder="example.com"
            className={inputClass}
            value={form.website ?? ''}
            onChange={(e) => updateField('website', e.target.value || null)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Address Line 1
          </label>
          <input
            type="text"
            className={inputClass}
            value={form.address_line1 ?? ''}
            onChange={(e) => updateField('address_line1', e.target.value || null)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Address Line 2
          </label>
          <input
            type="text"
            className={inputClass}
            value={form.address_line2 ?? ''}
            onChange={(e) => updateField('address_line2', e.target.value || null)}
          />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            City
          </label>
          <input
            type="text"
            className={inputClass}
            value={form.city ?? ''}
            onChange={(e) => updateField('city', e.target.value || null)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            State
          </label>
          <input
            type="text"
            className={inputClass}
            value={form.state ?? ''}
            onChange={(e) => updateField('state', e.target.value || null)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Postal Code
          </label>
          <input
            type="text"
            className={inputClass}
            value={form.postal_code ?? ''}
            onChange={(e) => updateField('postal_code', e.target.value || null)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Country
          </label>
          <select
            className={inputClass}
            value={form.country ?? ''}
            onChange={(e) => updateField('country', e.target.value || null)}
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
      </div>

      <VatNumberInput
        value={form.vat_number ?? ''}
        onChange={(val) => updateField('vat_number', val || null)}
        country={form.country || undefined}
        placeholder="e.g., DE123456789"
      />

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Comments
        </label>
        <RichTextEditor
          value={form.comments ?? ''}
          onChange={(html) => updateField('comments', html || null)}
          rows={2}
        />
      </div>
    </div>
  );
}

export default DetailsTab;
