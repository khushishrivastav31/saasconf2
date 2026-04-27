// Variables the backend's ``substitute_training_variables()`` knows.
const TRAINING_TEMPLATE_VARIABLES: { label: string; token: string }[] = [
  { label: 'First Name', token: '[First Name]' },
  { label: 'Last Name', token: '[Last Name]' },
  { label: 'Email', token: '[Email]' },
  { label: 'Training Name', token: '[Training Name]' },
  { label: 'Placement Date', token: '[Placement Date]' },
  { label: 'Company Name', token: '[Company Name]' },
];

interface Props {
  onInsert: (token: string, target: 'subject' | 'body') => void;
}

/**
 * Cluster of click-to-insert variable pills used by both the Compose
 * dialog and the template editor in trainings settings. Extracted to
 * a shared component so the variable list stays in one place — keeps
 * the picker UI in sync with the backend's substitution helper.
 */
export default function TrainingVariableButtons({ onInsert }: Props) {
  return (
    <div>
      <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
        Variables (click to insert)
      </div>
      <div className="flex flex-wrap gap-1.5">
        {TRAINING_TEMPLATE_VARIABLES.map((v) => (
          <div key={v.token} className="flex gap-0.5">
            <button
              type="button"
              onClick={() => onInsert(v.token, 'subject')}
              title={`Insert ${v.token} into subject`}
              className="px-2 py-0.5 text-[11px] font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              {v.label}
            </button>
            <button
              type="button"
              onClick={() => onInsert(v.token, 'body')}
              title={`Insert ${v.token} into body`}
              className="px-2 py-0.5 text-[11px] font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              ↓
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
