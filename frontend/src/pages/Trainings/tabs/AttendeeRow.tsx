import {
  type Attendee,
  STATUS_COLORS,
  EVENT_LABELS,
  EVENT_COLORS,
  formatDate,
} from './attendeeShared';

export default function AttendeeRow({
  att,
  expanded,
  onToggle,
  onPark,
  onCancel,
  cancelling,
}: {
  att: Attendee;
  expanded: boolean;
  onToggle: () => void;
  onPark: () => void;
  onCancel: () => void;
  cancelling: boolean;
}) {
  return (
    <>
      <tr
        className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
        onClick={onToggle}
        tabIndex={0}
        role="button"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <td className="px-3 py-2 text-gray-400">
          <svg
            className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </td>
        <td className="px-3 py-2 text-gray-900 dark:text-gray-100 font-medium">
          {att.first_name} {att.last_name}
        </td>
        <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{att.email}</td>
        <td className="px-3 py-2">
          <span
            className={`inline-flex px-2 py-0.5 rounded text-[11px] font-semibold ${STATUS_COLORS[att.status] ?? ''}`}
          >
            {att.status === 'parked' ? '🅿️ Parked' : 'Active'}
          </span>
        </td>
        <td className="px-3 py-2 text-gray-600 dark:text-gray-400 text-sm">
          {att.current_training}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={5} className="px-0 py-0">
            <div className="bg-gray-50 dark:bg-gray-900/50 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                History
              </h4>
              {att.history.length === 0 ? (
                <p className="text-sm text-gray-400">No history yet.</p>
              ) : (
                <div className="space-y-2">
                  {att.history.map((h) => (
                    <div key={h.id} className="flex items-start gap-3 text-sm">
                      <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap tabular-nums w-20 shrink-0">
                        {formatDate(h.created_at)}
                      </span>
                      <span
                        className={`font-medium ${EVENT_COLORS[h.event_type] ?? 'text-gray-600'}`}
                      >
                        {EVENT_LABELS[h.event_type] ?? h.event_type}
                      </span>
                      {h.training_name !== '—' && (
                        <span className="text-gray-600 dark:text-gray-400">{h.training_name}</span>
                      )}
                      {h.notes && (
                        <span className="text-gray-400 dark:text-gray-500 italic">— {h.notes}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 flex items-center gap-2">
                {att.status === 'active' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onPark();
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700 rounded-md hover:bg-amber-50 dark:hover:bg-amber-900/20"
                  >
                    Park Attendee
                  </button>
                )}
                {att.cancellable && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCancel();
                    }}
                    disabled={cancelling}
                    className="px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-400 border border-red-300 dark:border-red-800 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Cancel Registration
                  </button>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
