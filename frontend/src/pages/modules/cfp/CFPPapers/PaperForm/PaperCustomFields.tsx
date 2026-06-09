import api from '../../../../../config/api';
import RichTextEditor from '../../../../../components/common/RichTextEditor';
import type { UnifiedFormField } from './schema';

interface Props {
  field: UnifiedFormField;
  canEdit: boolean;
  value: unknown;
  onChange: (value: unknown) => void;
}

async function downloadAdminAttachment(attachmentId: string, filename: string) {
  try {
    const res = await api.get(`/attachments/${attachmentId}/download`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    // silent
  }
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
      {cf.field_type === 'file_upload' &&
        (() => {
          const fileVal = value as { attachment_id?: string; filename?: string } | undefined;
          const filename = fileVal?.filename;
          const attachmentId = fileVal?.attachment_id;
          if (!filename) {
            return (
              <p className="text-sm text-gray-400 dark:text-gray-500 italic">No file uploaded</p>
            );
          }
          return (
            <div className="flex items-center gap-2">
              <svg
                className="w-4 h-4 text-gray-400 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                />
              </svg>
              <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{filename}</span>
              {attachmentId && (
                <button
                  type="button"
                  onClick={() => downloadAdminAttachment(attachmentId, filename)}
                  className="inline-flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400 hover:underline"
                >
                  Download
                </button>
              )}
            </div>
          );
        })()}
      {cf.help_text && cf.field_type !== 'file_upload' && (
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{cf.help_text}</p>
      )}
    </div>
  );
}
