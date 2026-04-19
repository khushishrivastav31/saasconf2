import { DeleteIcon } from '../../../../ConferenceDetail/icons';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface Props {
  isEditing: boolean;
  isSaving: boolean;
  isDeleting?: boolean;
  onCancel: () => void;
  onDelete?: () => void;
  saveStatus: SaveStatus;
  submitDisabled: boolean;
}

export default function FormActions({
  isEditing,
  isSaving,
  isDeleting,
  onCancel,
  onDelete,
  saveStatus,
  submitDisabled,
}: Props) {
  const statusColor =
    saveStatus === 'saved'
      ? 'bg-green-600 hover:bg-green-700'
      : saveStatus === 'error'
        ? 'bg-red-600 hover:bg-red-700'
        : 'bg-primary-600 hover:bg-primary-700';

  return (
    <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
      <div>
        {isEditing && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={isDeleting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 transition-colors disabled:opacity-50"
          >
            <DeleteIcon />
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSaving || submitDisabled}
          className={`px-4 py-2 text-sm font-medium text-white rounded-md disabled:opacity-50 transition-all duration-300 inline-flex items-center gap-2 ${statusColor}`}
        >
          {saveStatus === 'saving' && (
            <svg
              className="animate-spin h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
          )}
          {saveStatus === 'saved' && (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          )}
          {saveStatus === 'error' && (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          )}
          {saveStatus === 'saving'
            ? 'Saving...'
            : saveStatus === 'saved'
              ? 'Saved!'
              : saveStatus === 'error'
                ? 'Error'
                : isEditing
                  ? 'Save Changes'
                  : 'Create User'}
        </button>
      </div>
    </div>
  );
}
