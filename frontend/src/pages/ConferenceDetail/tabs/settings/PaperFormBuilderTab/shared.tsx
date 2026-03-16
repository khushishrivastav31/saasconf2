import { useState, useEffect, useCallback, useRef } from 'react';
import type { PaperFormField, PaperFormVariantField } from '../../../../../types';
import type { UnifiedField } from './UnifiedFieldCard';

// Fields that support min/max character limits
const CHAR_LIMIT_FIELDS = new Set([
  'title',
  'abstract_short',
  'abstract_long',
  'learning_objectives',
  'importance',
]);

export function BuiltinHelpTextPanel({
  fieldKey,
  initialValue,
  initialMinChars,
  initialMaxChars,
  onSave,
  onSaveCharLimits,
}: {
  fieldKey: string;
  initialValue: string;
  initialMinChars?: number | null;
  initialMaxChars?: number | null;
  onSave: (fieldKey: string, helpText: string) => void;
  onSaveCharLimits?: (fieldKey: string, minChars: number | null, maxChars: number | null) => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [minChars, setMinChars] = useState<string>(
    initialMinChars != null ? String(initialMinChars) : ''
  );
  const [maxChars, setMaxChars] = useState<string>(
    initialMaxChars != null ? String(initialMaxChars) : ''
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const charDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setValue(initialValue);
    setMinChars(initialMinChars != null ? String(initialMinChars) : '');
    setMaxChars(initialMaxChars != null ? String(initialMaxChars) : '');
  }, [fieldKey, initialValue, initialMinChars, initialMaxChars]);

  const handleChange = useCallback(
    (text: string) => {
      setValue(text);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => onSave(fieldKey, text), 600);
    },
    [fieldKey, onSave]
  );

  const handleCharLimitChange = useCallback(
    (newMin: string, newMax: string) => {
      if (charDebounceRef.current) clearTimeout(charDebounceRef.current);
      charDebounceRef.current = setTimeout(() => {
        onSaveCharLimits?.(
          fieldKey,
          newMin ? parseInt(newMin, 10) : null,
          newMax ? parseInt(newMax, 10) : null
        );
      }, 600);
    },
    [fieldKey, onSaveCharLimits]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (charDebounceRef.current) clearTimeout(charDebounceRef.current);
    };
  }, []);

  const supportsCharLimits = CHAR_LIMIT_FIELDS.has(fieldKey);

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
        Built-in Field Settings
      </h3>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            Help Text
          </label>
          <input
            type="text"
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="Optional help text shown below the field..."
            className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
          />
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            Displayed below the field on the submission form.
          </p>
        </div>

        {supportsCharLimits && (
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
              Character Limits
            </label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5">
                <span className="text-xs text-gray-500 dark:text-gray-400">Min</span>
                <input
                  type="number"
                  min={0}
                  value={minChars}
                  onChange={(e) => {
                    setMinChars(e.target.value);
                    handleCharLimitChange(e.target.value, maxChars);
                  }}
                  placeholder="—"
                  className="w-20 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded focus:ring-primary-500 focus:border-primary-500"
                />
              </label>
              <label className="flex items-center gap-1.5">
                <span className="text-xs text-gray-500 dark:text-gray-400">Max</span>
                <input
                  type="number"
                  min={1}
                  value={maxChars}
                  onChange={(e) => {
                    setMaxChars(e.target.value);
                    handleCharLimitChange(minChars, e.target.value);
                  }}
                  placeholder="—"
                  className="w-20 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded focus:ring-primary-500 focus:border-primary-500"
                />
              </label>
            </div>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              Enforced on submission. Leave empty for no limit.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Form Preview Component --------------------------------------------------

export function FormPreview({ unifiedFields }: { unifiedFields: UnifiedField[] }) {
  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 max-w-3xl mx-auto">
      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-6">Form Preview</h3>

      <div className="space-y-6">
        {unifiedFields
          .filter((f) => f.is_visible)
          .map((field) => (
            <div key={field.id}>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {field.label}
                {field.is_required && <span className="text-red-500 ml-1">*</span>}
              </label>
              {field.type === 'builtin' ? (
                <>
                  {renderBuiltinPreviewField(field.key)}
                  {field.builtinConfig?.help_text && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      {field.builtinConfig.help_text}
                    </p>
                  )}
                </>
              ) : field.customField ? (
                <>
                  {field.customField.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                      {field.customField.description}
                    </p>
                  )}
                  {renderCustomPreviewField(field.customField)}
                  {field.customField.help_text && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      {field.customField.help_text}
                    </p>
                  )}
                </>
              ) : null}
            </div>
          ))}
      </div>
    </div>
  );
}

function renderBuiltinPreviewField(key: string) {
  switch (key) {
    case 'abstract_long':
    case 'learning_objectives':
    case 'importance':
      return (
        <textarea
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm p-2 text-sm dark:bg-gray-800 dark:text-gray-100"
          rows={4}
          placeholder={`Enter ${key.replace('_', ' ')}...`}
          disabled
        />
      );
    case 'level':
      return (
        <select
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm p-2 text-sm dark:bg-gray-800 dark:text-gray-100"
          disabled
        >
          <option>Select level...</option>
          <option>Beginner</option>
          <option>Intermediate</option>
          <option>Advanced</option>
          <option>All Levels</option>
        </select>
      );
    case 'session_type':
    case 'topics':
      return (
        <select
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm p-2 text-sm dark:bg-gray-800 dark:text-gray-100"
          disabled
        >
          <option>Select {key.replace('_', ' ')}...</option>
        </select>
      );
    default:
      return (
        <input
          type="text"
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm p-2 text-sm dark:bg-gray-800 dark:text-gray-100"
          placeholder={`Enter ${key.replace('_', ' ')}...`}
          disabled
        />
      );
  }
}

function renderCustomPreviewField(field: PaperFormField | PaperFormVariantField) {
  switch (field.field_type) {
    case 'text':
      return (
        <input
          type="text"
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm p-2 text-sm dark:bg-gray-800 dark:text-gray-100"
          placeholder={field.placeholder || ''}
          disabled
        />
      );
    case 'textarea':
      return (
        <textarea
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm p-2 text-sm dark:bg-gray-800 dark:text-gray-100"
          rows={3}
          placeholder={field.placeholder || ''}
          disabled
        />
      );
    case 'richtext':
      return (
        <div className="w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm p-2 text-sm bg-gray-50 dark:bg-gray-900 h-24">
          <span className="text-gray-400 dark:text-gray-500">Rich text editor...</span>
        </div>
      );
    case 'checkbox':
      return (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="rounded border-gray-300 dark:border-gray-600"
            disabled
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            {field.placeholder || 'Yes'}
          </span>
        </label>
      );
    case 'checkbox_group':
      return (
        <div className="space-y-2">
          {(field.options || []).map((opt, idx) => (
            <label key={idx} className="flex items-center gap-2">
              <input
                type="checkbox"
                className="rounded border-gray-300 dark:border-gray-600"
                disabled
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">{opt.label}</span>
            </label>
          ))}
        </div>
      );
    case 'dropdown':
      return (
        <select
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm p-2 text-sm dark:bg-gray-800 dark:text-gray-100"
          disabled
        >
          <option>{field.placeholder || 'Select...'}</option>
          {(field.options || []).map((opt, idx) => (
            <option key={idx} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    case 'file_upload':
      return (
        <div className="flex items-center justify-center w-full h-24 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Drag and drop file here or click to browse
          </span>
        </div>
      );
    default:
      return null;
  }
}
