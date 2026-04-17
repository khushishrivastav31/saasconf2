import type { HistoryEvent } from '../types';
import { EVENT_COLORS, EVENT_LABELS, formatDate } from '../constants';
import { sectionCls, sectionHeadingCls } from './styles';

interface Props {
  history: HistoryEvent[];
}

export default function ActivityHistory({ history }: Props) {
  return (
    <div className={sectionCls}>
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h4 className={sectionHeadingCls}>Activity History</h4>
      </div>
      <div className="px-6 py-5">
        {history.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">No history events.</p>
        ) : (
          <div className="relative pl-6 space-y-4">
            <div className="absolute left-2 top-1 bottom-1 w-px bg-gray-200 dark:bg-gray-700" />
            {history.map((event) => (
              <div key={event.id} className="relative">
                <div
                  className={`absolute -left-4 top-1 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-gray-800 ${
                    event.event_type === 'parked'
                      ? 'bg-amber-400'
                      : event.event_type === 'cancelled'
                        ? 'bg-red-400'
                        : 'bg-green-400'
                  }`}
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-medium ${EVENT_COLORS[event.event_type] ?? 'text-gray-600 dark:text-gray-400'}`}
                    >
                      {EVENT_LABELS[event.event_type] ?? event.event_type}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {formatDate(event.created_at)}
                    </span>
                  </div>
                  {event.training_name && event.training_name !== '—' && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                      {event.training_name}
                    </p>
                  )}
                  {event.notes && (
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5 italic">
                      {event.notes}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
