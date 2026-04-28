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
  /** Insert ``token`` at the parent's current cursor position. The
   *  parent is expected to track which input (subject vs body) was last
   *  focused and route the insertion accordingly. */
  onInsert: (token: string) => void;
}

/**
 * Cluster of click-to-insert variable pills used by the Compose dialog
 * and the template editor in trainings settings. One button per variable
 * — clicking it inserts the placeholder at whichever input (subject or
 * body) the user touched last. Lives in one component so the variable
 * list stays in sync with the backend's substitution helper.
 */
export default function TrainingVariableButtons({ onInsert }: Props) {
  return (
    <div>
      <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
        Variables (click to insert)
      </div>
      <div className="flex flex-wrap gap-1.5">
        {TRAINING_TEMPLATE_VARIABLES.map((v) => (
          <button
            key={v.token}
            type="button"
            onMouseDown={(e) => {
              // Avoid stealing focus from the input the user was editing
              // — we want to insert into the field they just left, not
              // into the button itself.
              e.preventDefault();
              onInsert(v.token);
            }}
            title={`Insert ${v.token}`}
            className="px-2 py-0.5 text-[11px] font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}
