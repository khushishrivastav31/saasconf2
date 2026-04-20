import type { SaveStatus } from '../../../hooks/useSaveStatus';

interface Props {
  saveStatus: SaveStatus;
  disabled: boolean;
}

export default function SaveButton({ saveStatus, disabled }: Props) {
  return (
    <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
      <button
        type="submit"
        disabled={disabled}
        className={`px-4 py-2 text-white rounded-md text-sm font-medium transition-colors duration-200 disabled:opacity-50 ${
          saveStatus === 'saved'
            ? 'bg-green-600'
            : saveStatus === 'error'
              ? 'bg-red-600'
              : 'bg-primary-600 hover:bg-primary-700'
        }`}
      >
        {saveStatus === 'saving' ? (
          <span className="inline-flex items-center gap-1.5">
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Saving...
          </span>
        ) : saveStatus === 'saved' ? (
          <span className="inline-flex items-center gap-1.5">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            Saved
          </span>
        ) : saveStatus === 'error' ? (
          'Save failed'
        ) : (
          'Save Profile'
        )}
      </button>
    </div>
  );
}
