import { useQuery } from '@tanstack/react-query';
import api from '../../../config/api';
import { formatDateTime } from '../../../utils/formatDate';

interface BroadcastSummary {
  bulk_id: string;
  subject: string;
  registration_id: string;
  training_name: string | null;
  placement_date: string | null;
  recipient_count: number;
  last_sent_at: string;
}

interface BroadcastListResponse {
  items: BroadcastSummary[];
  total: number;
}

export default function MessagesTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['training-broadcasts'],
    queryFn: async () => {
      const resp = await api.get<BroadcastListResponse>('/trainings/messaging/broadcasts');
      return resp.data;
    },
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="text-center py-12 text-sm text-gray-500 dark:text-gray-400">Loading…</div>
    );
  }

  const items = data?.items ?? [];

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">No broadcasts yet</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
          Send your first message from <span className="font-medium">Training Registrations</span> —
          expand a registration row and click <span className="font-medium">Message attendees</span>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Messages</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Every broadcast you've sent to training attendees. New broadcasts start from a
        registration's <span className="font-medium">Message attendees</span> button.
      </p>
      <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800/50">
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <th className="px-4 py-2 font-medium">Subject</th>
              <th className="px-4 py-2 font-medium">Training</th>
              <th className="px-4 py-2 font-medium">Recipients</th>
              <th className="px-4 py-2 font-medium">Sent</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900">
            {items.map((b) => (
              <tr key={b.bulk_id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="px-4 py-2 text-gray-900 dark:text-gray-100">{b.subject}</td>
                <td className="px-4 py-2 text-gray-700 dark:text-gray-300">
                  {b.training_name || '—'}
                  {b.placement_date && (
                    <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                      {b.placement_date}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-gray-700 dark:text-gray-300 tabular-nums">
                  {b.recipient_count}
                </td>
                <td className="px-4 py-2 text-gray-500 dark:text-gray-400 tabular-nums">
                  {formatDateTime(b.last_sent_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
