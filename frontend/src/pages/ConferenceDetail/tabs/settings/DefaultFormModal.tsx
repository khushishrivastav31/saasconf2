import { useState, useEffect } from 'react';
import Modal from '../../../../components/Modal';
import { ErrorBanner } from '../../../../components/common/ErrorBanner';
import ModalFooter from '../../../../components/common/ModalFooter';
import type { FormFieldConfig } from './CRUDSettingsTab';

// Default form modal (used when formFields are provided instead of renderForm)
export default function DefaultFormModal<TEntity extends { id: string; name: string }, TCreate>({
  open,
  item,
  entityName,
  modalSize,
  formFields,
  getInitialFormData,
  transformSubmitData,
  onClose,
  onSubmit,
  isLoading,
  error,
}: {
  open: boolean;
  item: TEntity | null;
  entityName: string;
  modalSize: string;
  formFields: FormFieldConfig[];
  getInitialFormData?: (item: TEntity | null) => Record<string, unknown>;
  transformSubmitData?: (data: Record<string, unknown>) => TCreate;
  onClose: () => void;
  onSubmit: (data: TCreate) => void;
  isLoading: boolean;
  error: string | null;
}) {
  const [formData, setFormData] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (open) {
      if (getInitialFormData) {
        setFormData(getInitialFormData(item));
      } else {
        // Fallback: build defaults from formFields
        const defaults: Record<string, unknown> = {};
        for (const field of formFields) {
          if (item) {
            defaults[field.key] =
              (item as Record<string, unknown>)[field.key] ?? field.defaultValue ?? '';
          } else {
            defaults[field.key] = field.defaultValue ?? (field.type === 'checkbox' ? true : '');
          }
        }
        setFormData(defaults);
      }
    }
  }, [open, item]); // eslint-disable-line react-hooks/exhaustive-deps

  const setField = (key: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = transformSubmitData
      ? transformSubmitData(formData)
      : (formData as unknown as TCreate);
    onSubmit(payload);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item ? `Edit ${entityName}` : `Add ${entityName}`}
      size={modalSize}
    >
      <form onSubmit={handleSubmit}>
        <div className="px-6 py-4 space-y-4">
          <ErrorBanner message={error} />

          {formFields.map((field) => {
            if (field.type === 'checkbox') {
              return (
                <div key={field.key} className="flex items-center">
                  <input
                    id={field.checkboxId ?? `crud-field-${field.key}`}
                    type="checkbox"
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded"
                    checked={!!formData[field.key]}
                    onChange={(e) => setField(field.key, e.target.checked)}
                  />
                  <label
                    htmlFor={field.checkboxId ?? `crud-field-${field.key}`}
                    className="ml-2 block text-sm text-gray-900 dark:text-gray-100"
                  >
                    {field.label}
                  </label>
                </div>
              );
            }

            return (
              <div key={field.key}>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {field.label}
                  {field.required ? ' *' : ''}
                </label>
                {field.type === 'textarea' ? (
                  <textarea
                    required={field.required}
                    rows={field.rows ?? 3}
                    placeholder={field.placeholder}
                    className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
                    value={String(formData[field.key] ?? '')}
                    onChange={(e) => setField(field.key, e.target.value)}
                  />
                ) : field.type === 'number' ? (
                  <input
                    type="number"
                    required={field.required}
                    min={field.min}
                    step={field.step}
                    placeholder={field.placeholder}
                    className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
                    value={String(formData[field.key] ?? '')}
                    onChange={(e) => setField(field.key, parseFloat(e.target.value) || 0)}
                  />
                ) : field.type === 'select' ? (
                  <select
                    required={field.required}
                    className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
                    value={String(formData[field.key] ?? '')}
                    onChange={(e) => setField(field.key, e.target.value)}
                  >
                    {field.options?.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  /* text (default) */
                  <>
                    <input
                      type="text"
                      required={field.required}
                      pattern={field.pattern}
                      title={field.title}
                      placeholder={field.placeholder}
                      className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
                      value={String(formData[field.key] ?? '')}
                      onChange={(e) => setField(field.key, e.target.value)}
                    />
                    {field.helpText && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {field.helpText}
                      </p>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

        <ModalFooter onCancel={onClose} isLoading={isLoading} />
      </form>
    </Modal>
  );
}
