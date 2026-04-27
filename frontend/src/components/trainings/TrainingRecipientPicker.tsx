interface AttendeeShape {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

export type RecipientScope = 'all' | 'specific';

interface Props {
  attendees: AttendeeShape[];
  scope: RecipientScope;
  onScopeChange: (scope: RecipientScope) => void;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}

/**
 * Recipients section of the training Compose dialog.
 *
 * Two modes:
 *   - ``all``: every attendee on the placement gets the broadcast.
 *   - ``specific``: only the checked subset. Empty subset disables Send
 *     in the parent dialog.
 *
 * Extracted from ``TrainingComposePlacementDialog`` so that file stays
 * under the 400-LOC ceiling — and so the picker can later be reused in
 * other Compose flows (e.g. inhouse trainings) without duplication.
 */
export default function TrainingRecipientPicker({
  attendees,
  scope,
  onScopeChange,
  selectedIds,
  onToggle,
}: Props) {
  return (
    <div>
      <div className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
        Recipients
      </div>
      <div className="flex gap-4 text-sm mb-2">
        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <input type="radio" checked={scope === 'all'} onChange={() => onScopeChange('all')} />
          All attendees ({attendees.length})
        </label>
        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <input
            type="radio"
            checked={scope === 'specific'}
            onChange={() => onScopeChange('specific')}
          />
          Specific attendees
        </label>
      </div>
      {scope === 'specific' && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-md max-h-40 overflow-y-auto">
          {attendees.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
              No attendees on this session.
            </p>
          ) : (
            attendees.map((a) => (
              <label
                key={a.id}
                className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(a.id)}
                  onChange={() => onToggle(a.id)}
                />
                <span className="text-gray-900 dark:text-gray-100">
                  {a.first_name} {a.last_name}
                </span>
                <span className="text-gray-500 dark:text-gray-400 text-xs">{a.email}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}
