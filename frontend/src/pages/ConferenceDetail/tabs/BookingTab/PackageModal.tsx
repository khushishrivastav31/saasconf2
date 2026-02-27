import { useState, useEffect } from 'react';
import Modal from '../../../../components/Modal';
import type { BookingOption, BookingPackage, BookingPackageCreate } from '../../../../types';

interface PackageModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (data: BookingPackageCreate) => void;
  onEdit: (id: string, data: Record<string, unknown>) => void;
  pkg?: BookingPackage | null;
  bookingOptions: BookingOption[];
  existingCount: number;
}

export default function PackageModal({
  open,
  onClose,
  onAdd,
  onEdit,
  pkg,
  bookingOptions,
  existingCount,
}: PackageModalProps) {
  const isEditMode = !!pkg;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);

  // Reset / populate form when modal opens or package changes
  useEffect(() => {
    if (!open) return;

    if (pkg) {
      setName(pkg.name);
      setDescription(pkg.description || '');
      setSelectedOptionIds([...pkg.option_ids]);
      setIsActive(pkg.is_active);
    } else {
      setName('');
      setDescription('');
      setSelectedOptionIds([]);
      setIsActive(true);
    }
  }, [open, pkg]);

  const handleToggleOption = (optionId: string) => {
    setSelectedOptionIds((prev) =>
      prev.includes(optionId) ? prev.filter((id) => id !== optionId) : [...prev, optionId]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || selectedOptionIds.length === 0) return;

    if (isEditMode) {
      onEdit(pkg.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        option_ids: selectedOptionIds,
        is_active: isActive,
      });
    } else {
      onAdd({
        name: name.trim(),
        description: description.trim() || undefined,
        sort_order: existingCount,
        option_ids: selectedOptionIds,
      });
    }
  };

  const handleClose = () => {
    onClose();
  };

  const isValid = name.trim() && selectedOptionIds.length > 0;
  const idPrefix = isEditMode ? 'edit-package' : 'package';

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={isEditMode ? 'Edit Booking Package' : 'Add Booking Package'}
      size="max-w-sm"
    >
      <form onSubmit={handleSubmit}>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label
              htmlFor={`${idPrefix}-name`}
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Package Name <span className="text-red-500">*</span>
            </label>
            <input
              id={`${idPrefix}-name`}
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Tutorial Only, Full Conference"
              className="block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm dark:bg-gray-800 dark:text-gray-100"
            />
          </div>

          <div>
            <label
              htmlFor={`${idPrefix}-description`}
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Description
            </label>
            <textarea
              id={`${idPrefix}-description`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description for this package"
              rows={2}
              className="block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm dark:bg-gray-800 dark:text-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Included Options <span className="text-red-500">*</span>
            </label>
            {bookingOptions.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                {isEditMode
                  ? 'No booking options available.'
                  : 'No booking options available. Create booking options first.'}
              </p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-md p-3">
                {bookingOptions.map((option) => (
                  <label
                    key={option.id}
                    className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 p-1.5 rounded"
                  >
                    <input
                      type="checkbox"
                      checked={selectedOptionIds.includes(option.id)}
                      onChange={() => handleToggleOption(option.id)}
                      className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{option.name}</span>
                  </label>
                ))}
              </div>
            )}
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
              Select at least one option. Package price = sum of selected options.
            </p>
          </div>

          {isEditMode && (
            <div className="flex items-center gap-3">
              <input
                id={`${idPrefix}-active`}
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
              />
              <label
                htmlFor={`${idPrefix}-active`}
                className="text-sm text-gray-700 dark:text-gray-300"
              >
                Package is active
              </label>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!isValid}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md shadow-sm hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isEditMode ? 'Save Changes' : 'Add Package'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
