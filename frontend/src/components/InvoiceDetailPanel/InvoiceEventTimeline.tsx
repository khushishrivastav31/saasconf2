import type { Invoice } from '../../types';

interface Props {
  events: Invoice['events'];
}

export default function InvoiceEventTimeline({ events }: Props) {
  if (!events || !Array.isArray(events) || events.length === 0) return null;

  return (
    <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
      <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
        Payment & Refund History
      </h4>
      <div className="space-y-3">
        {events.map((event) => {
          const isError = event.status === 'failed';
          const isSuccess = event.status === 'succeeded';
          const isPending = event.status === 'pending';

          return (
            <div
              key={event.id}
              className="flex gap-3 text-sm border border-gray-200 dark:border-gray-700 rounded-md p-3 bg-gray-50 dark:bg-gray-900"
            >
              <div className="shrink-0 mt-0.5">
                {isError && (
                  <svg
                    className="w-5 h-5 text-red-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                )}
                {isSuccess && (
                  <svg
                    className="w-5 h-5 text-green-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
                {isPending && (
                  <svg
                    className="w-5 h-5 text-yellow-500 animate-spin"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <p
                    className={`font-medium ${
                      isError
                        ? 'text-red-700 dark:text-red-400'
                        : isSuccess
                          ? 'text-green-700 dark:text-green-400'
                          : 'text-gray-900 dark:text-gray-100'
                    }`}
                  >
                    {event.event_type
                      .split('_')
                      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                      .join(' ')}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {new Date(event.created_at).toLocaleDateString()} at{' '}
                    {new Date(event.created_at).toLocaleTimeString()}
                  </p>
                </div>

                {event.amount && event.currency && (
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                    Amount: {event.currency} {event.amount.toFixed(2)}
                  </p>
                )}

                {event.user_email && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    By: {event.user_email}
                  </p>
                )}

                {event.stripe_object_id && (
                  <p className="text-xs font-mono text-gray-500 dark:text-gray-400 mt-1">
                    Stripe ID: {event.stripe_object_id}
                  </p>
                )}

                {event.error_message && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                    Error: {event.error_message}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
