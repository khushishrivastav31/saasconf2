import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../config/api';
import { formatDateTime } from '../../../utils/formatDate';
import TrainingComposePlacementDialog from '../../../components/trainings/TrainingComposePlacementDialog';

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
  const [composeOpen, setComposeOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['training-broadcasts'],
    queryFn: async () => {
      const resp = await api.get<BroadcastListResponse>('/trainings/messaging/broadcasts');
      return resp.data;
    },
    refetchInterval: 30_000,
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Messages</h2>
        <button
          type="button"
          onClick={() => setComposeOpen(true)}
          className="inline-flex items-center gap-1 px-4 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md"
        >
          + Compose
        </button>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Every broadcast you've sent to training attendees. Use{' '}
        <span className="font-medium">Compose</span> to message everyone on a training session, or
        the per-registration <span className="font-medium">Message attendees</span> button under{' '}
        <span className="font-medium">Training Registrations</span> for one booking at a time.
      </p>

      {isLoading ? (
        <div className="text-center py-12 text-sm text-gray-500 dark:text-gray-400">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
            No broadcasts yet
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
            Click <span className="font-medium">+ Compose</span> above to send your first message,
            or expand a registration row in{' '}
            <span className="font-medium">Training Registrations</span> and click{' '}
            <span className="font-medium">Message attendees</span>.
          </p>
        </div>
      ) : (
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
      )}

      <TrainingComposePlacementDialog open={composeOpen} onClose={() => setComposeOpen(false)} />
    </div>
  );
}
