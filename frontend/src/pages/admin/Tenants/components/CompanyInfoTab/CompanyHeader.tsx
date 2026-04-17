interface Props {
  isDirty: boolean;
  isSaving: boolean;
  onDiscard: () => void;
  onSave: () => void;
}

export default function CompanyHeader({ isDirty, isSaving, onDiscard, onSave }: Props) {
  return (
    <div className="flex justify-between items-center mb-4">
      <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Company Details</h4>
      <div className="flex items-center gap-2">
        {isDirty && (
          <button
            type="button"
            onClick={onDiscard}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Discard
          </button>
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={!isDirty || isSaving}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
