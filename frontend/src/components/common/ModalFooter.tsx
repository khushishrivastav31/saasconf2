import { ButtonSpinner } from './LoadingSpinner';

export default function ModalFooter({
  onCancel,
  isLoading,
  submitLabel = 'Save',
}: {
  onCancel: () => void;
  isLoading: boolean;
  submitLabel?: string;
}) {
  return (
    <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3">
      <button
        type="button"
        onClick={onCancel}
        className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={isLoading}
        className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50"
      >
        {isLoading ? <ButtonSpinner /> : submitLabel}
      </button>
    </div>
  );
}
