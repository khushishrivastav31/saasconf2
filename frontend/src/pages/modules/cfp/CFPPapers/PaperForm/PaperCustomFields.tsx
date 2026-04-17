import RichTextEditor from '../../../../../components/common/RichTextEditor';
import type { UnifiedFormField } from './schema';

interface Props {
  field: UnifiedFormField;
  canEdit: boolean;
  value: unknown;
  onChange: (value: unknown) => void;
}

export default function PaperCustomField({ field, canEdit, value, onChange }: Props) {
  const cf = field.customField;
  if (!cf) return null;

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {field.label}
        {field.is_required && <span className="text-red-500"> *</span>}
      </label>
      {cf.description && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{cf.description}</p>
      )}
      {cf.field_type === 'text' && (
        <input
          type="text"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder={cf.placeholder || ''}
          disabled={!canEdit}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed"
        />
      )}
      {cf.field_type === 'textarea' && (
        <textarea
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder={cf.placeholder || ''}
          disabled={!canEdit}
          rows={3}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed"
        />
      )}
      {cf.field_type === 'richtext' && (
        <RichTextEditor
          value={String(value ?? '')}
          onChange={(html) => onChange(html)}
          placeholder={cf.placeholder || ''}
          rows={4}
          disabled={!canEdit}
        />
      )}
      {cf.field_type === 'dropdown' && (
        <select
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          disabled={!canEdit}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed"
        >
          <option value="">{cf.placeholder || 'Select...'}</option>
          {(cf.options || []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}
      {cf.field_type === 'checkbox' && (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            disabled={!canEdit}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            {cf.placeholder || 'Yes'}
          </span>
        </label>
      )}
      {cf.field_type === 'checkbox_group' && (
        <div className="space-y-2">
          {(cf.options || []).map((opt) => {
            const selectedValues = Array.isArray(value) ? (value as string[]) : [];
            return (
              <label key={opt.value} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedValues.includes(opt.value)}
                  onChange={(e) => {
                    const newValues = e.target.checked
                      ? [...selectedValues, opt.value]
                      : selectedValues.filter((v) => v !== opt.value);
                    onChange(newValues);
                  }}
                  disabled={!canEdit}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">{opt.label}</span>
              </label>
            );
          })}
        </div>
      )}
      {cf.help_text && (
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{cf.help_text}</p>
      )}
    </div>
  );
}
