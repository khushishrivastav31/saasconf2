import { ButtonSpinner } from "./LoadingSpinner";

export default function ModalFooter({
  onCancel,
  isLoading,
  submitLabel = "Save",
}: {
  onCancel: () => void;
  isLoading: boolean;
  submitLabel?: string;
}) {
  return (
    <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
      <button
        type="button"
        onClick={onCancel}
        className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
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
