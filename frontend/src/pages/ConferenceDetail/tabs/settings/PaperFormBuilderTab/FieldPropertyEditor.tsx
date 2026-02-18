import { useState, useEffect } from 'react';
import type {
  PaperFormField,
  PaperFormFieldUpdate,
  PaperFormFieldType,
  FieldOption,
  ValidationRules,
} from '../../../../../types';

interface FieldPropertyEditorProps {
  field: PaperFormField | null;
  onUpdate: (id: string, data: PaperFormFieldUpdate) => void;
  isAdmin: boolean;
}

const FIELD_TYPE_OPTIONS: { value: PaperFormFieldType; label: string }[] = [
  { value: 'text', label: 'Text Field' },
  { value: 'textarea', label: 'Text Area' },
  { value: 'richtext', label: 'Rich Text' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'checkbox_group', label: 'Checkbox Group' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'file_upload', label: 'File Upload' },
];

export default function FieldPropertyEditor({
  field,
  onUpdate,
  isAdmin,
}: FieldPropertyEditorProps) {
  const [localField, setLocalField] = useState<PaperFormField | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // Sync local state when a different field is selected (intentionally keyed on
  // field.id rather than the object reference to avoid resetting local edits)
  useEffect(() => {
    setLocalField(field);
    setIsDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field?.id]);

  if (!field || !localField) {
    return (
      <div className="bg-gray-50 shadow rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-2">Field Properties</h3>
        <p className="text-sm text-gray-500">
          Select a field from the canvas to edit its properties
        </p>
      </div>
    );
  }

  const handleChange = <K extends keyof PaperFormField>(key: K, value: PaperFormField[K]) => {
    setLocalField((prev) => (prev ? { ...prev, [key]: value } : null));
    setIsDirty(true);
  };

  const handleSave = () => {
    if (!localField) return;

    const updateData: PaperFormFieldUpdate = {
      field_key: localField.field_key,
      field_type: localField.field_type,
      label: localField.label,
      description: localField.description || undefined,
      placeholder: localField.placeholder || undefined,
      help_text: localField.help_text || undefined,
      is_visible: localField.is_visible,
      is_required: localField.is_required,
      validation_rules: localField.validation_rules || undefined,
      options: localField.options || undefined,
    };

    onUpdate(field.id, updateData);
    setIsDirty(false);
  };

  const handleAddOption = () => {
    const options = localField.options || [];
    const newOption: FieldOption = {
      value: `option_${options.length + 1}`,
      label: `Option ${options.length + 1}`,
    };
    handleChange('options', [...options, newOption]);
  };

  const handleUpdateOption = (index: number, optionUpdate: Partial<FieldOption>) => {
    const options = [...(localField.options || [])];
    options[index] = { ...options[index], ...optionUpdate };
    handleChange('options', options);
  };

  const handleRemoveOption = (index: number) => {
    const options = (localField.options || []).filter((_, i) => i !== index);
    handleChange('options', options);
  };

  const handleValidationChange = (key: keyof ValidationRules, value: unknown) => {
    const rules = { ...(localField.validation_rules || {}) };
    if (value === null || value === undefined || value === '') {
      delete rules[key];
    } else {
      (rules as Record<string, unknown>)[key] = value;
    }
    handleChange('validation_rules', Object.keys(rules).length > 0 ? rules : null);
  };

  const showOptions = ['dropdown', 'checkbox_group'].includes(localField.field_type);
  const showTextValidation = ['text', 'textarea', 'richtext'].includes(localField.field_type);
  const showFileValidation = localField.field_type === 'file_upload';

  return (
    <div className="bg-white shadow rounded-lg p-4 h-full overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-900">Field Properties</h3>
        {isDirty && isAdmin && (
          <button
            onClick={handleSave}
            className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
          >
            Save Changes
          </button>
        )}
      </div>

      <div className="space-y-4">
        {/* Field Key */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Field Key</label>
          <input
            type="text"
            value={localField.field_key}
            onChange={(e) => handleChange('field_key', e.target.value)}
            disabled={!isAdmin}
            className="w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm disabled:bg-gray-100"
            pattern="^[a-z][a-z0-9_]*$"
          />
          <p className="mt-1 text-xs text-gray-400">Lowercase letters, numbers, underscores only</p>
        </div>

        {/* Field Type */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Field Type</label>
          <select
            value={localField.field_type}
            onChange={(e) => handleChange('field_type', e.target.value as PaperFormFieldType)}
            disabled={!isAdmin}
            className="w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm disabled:bg-gray-100"
          >
            {FIELD_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Label */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Label</label>
          <input
            type="text"
            value={localField.label}
            onChange={(e) => handleChange('label', e.target.value)}
            disabled={!isAdmin}
            className="w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm disabled:bg-gray-100"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
          <textarea
            value={localField.description || ''}
            onChange={(e) => handleChange('description', e.target.value || null)}
            disabled={!isAdmin}
            rows={2}
            className="w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm disabled:bg-gray-100"
          />
        </div>

        {/* Placeholder */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Placeholder</label>
          <input
            type="text"
            value={localField.placeholder || ''}
            onChange={(e) => handleChange('placeholder', e.target.value || null)}
            disabled={!isAdmin}
            className="w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm disabled:bg-gray-100"
          />
        </div>

        {/* Help Text */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Help Text</label>
          <input
            type="text"
            value={localField.help_text || ''}
            onChange={(e) => handleChange('help_text', e.target.value || null)}
            disabled={!isAdmin}
            className="w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm disabled:bg-gray-100"
          />
        </div>

        {/* Visibility & Required */}
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={localField.is_visible}
              onChange={(e) => handleChange('is_visible', e.target.checked)}
              disabled={!isAdmin}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-gray-700">Visible</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={localField.is_required}
              onChange={(e) => handleChange('is_required', e.target.checked)}
              disabled={!isAdmin}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-gray-700">Required</span>
          </label>
        </div>

        {/* Options for dropdown/checkbox_group */}
        {showOptions && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">Options</label>
            <div className="space-y-2">
              {(localField.options || []).map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={opt.value}
                    onChange={(e) => handleUpdateOption(idx, { value: e.target.value })}
                    disabled={!isAdmin}
                    placeholder="Value"
                    className="flex-1 border border-gray-300 rounded-md shadow-sm p-1.5 text-sm disabled:bg-gray-100"
                  />
                  <input
                    type="text"
                    value={opt.label}
                    onChange={(e) => handleUpdateOption(idx, { label: e.target.value })}
                    disabled={!isAdmin}
                    placeholder="Label"
                    className="flex-1 border border-gray-300 rounded-md shadow-sm p-1.5 text-sm disabled:bg-gray-100"
                  />
                  {isAdmin && (
                    <button
                      onClick={() => handleRemoveOption(idx)}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
              {isAdmin && (
                <button
                  onClick={handleAddOption}
                  className="text-sm text-primary-600 hover:text-primary-700"
                >
                  + Add Option
                </button>
              )}
            </div>
          </div>
        )}

        {/* Text Validation */}
        {showTextValidation && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">Validation</label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Min Length</label>
                <input
                  type="number"
                  value={localField.validation_rules?.min_length || ''}
                  onChange={(e) =>
                    handleValidationChange(
                      'min_length',
                      e.target.value ? parseInt(e.target.value) : null
                    )
                  }
                  disabled={!isAdmin}
                  min={0}
                  className="w-full border border-gray-300 rounded-md shadow-sm p-1.5 text-sm disabled:bg-gray-100"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Max Length</label>
                <input
                  type="number"
                  value={localField.validation_rules?.max_length || ''}
                  onChange={(e) =>
                    handleValidationChange(
                      'max_length',
                      e.target.value ? parseInt(e.target.value) : null
                    )
                  }
                  disabled={!isAdmin}
                  min={0}
                  className="w-full border border-gray-300 rounded-md shadow-sm p-1.5 text-sm disabled:bg-gray-100"
                />
              </div>
            </div>
          </div>
        )}

        {/* File Validation */}
        {showFileValidation && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">File Validation</label>
            <div className="space-y-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Max File Size (MB)</label>
                <input
                  type="number"
                  value={localField.validation_rules?.max_file_size_mb || ''}
                  onChange={(e) =>
                    handleValidationChange(
                      'max_file_size_mb',
                      e.target.value ? parseInt(e.target.value) : null
                    )
                  }
                  disabled={!isAdmin}
                  min={1}
                  className="w-full border border-gray-300 rounded-md shadow-sm p-1.5 text-sm disabled:bg-gray-100"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Allowed File Types (comma-separated)
                </label>
                <input
                  type="text"
                  value={(localField.validation_rules?.allowed_file_types || []).join(', ')}
                  onChange={(e) =>
                    handleValidationChange(
                      'allowed_file_types',
                      e.target.value ? e.target.value.split(',').map((s) => s.trim()) : null
                    )
                  }
                  disabled={!isAdmin}
                  placeholder="pdf, doc, docx"
                  className="w-full border border-gray-300 rounded-md shadow-sm p-1.5 text-sm disabled:bg-gray-100"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
