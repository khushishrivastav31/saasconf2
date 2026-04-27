export type RecipientMode = 'session' | 'search';

interface Props {
  mode: RecipientMode;
  onChange: (mode: RecipientMode) => void;
}

/**
 * Pill toggle that picks how the admin chooses Compose recipients:
 *   - ``session``: pick a training session, then all-or-specific attendees.
 *   - ``search``: type a name/email and pick attendees across sessions.
 *
 * Extracted from ``TrainingComposePlacementDialog`` to keep that file
 * under the project's 400-LOC ceiling.
 */
export default function ComposeRecipientModeToggle({ mode, onChange }: Props) {
  return (
    <div>
      <div className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
        Pick recipients
      </div>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => onChange('session')}
          className={`text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
            mode === 'session'
              ? 'bg-primary-600 text-white'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          By training session
        </button>
        <button
          type="button"
          onClick={() => onChange('search')}
          className={`text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
            mode === 'search'
              ? 'bg-primary-600 text-white'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          Search by name / email
        </button>
      </div>
    </div>
  );
}
