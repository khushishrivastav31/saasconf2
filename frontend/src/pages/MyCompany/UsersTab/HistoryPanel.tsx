import { useQuery } from '@tanstack/react-query';
import api from '../../../config/api';
import type { CustomerEventEntry } from '../types';
import {
  DOMAIN_COLORS,
  DOMAIN_LABELS,
  EVENT_COLORS,
  EVENT_LABELS,
  formatDateTime,
} from './constants';

interface Props {
  userId: string;
}

export default function HistoryPanel({ userId }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['portal-user-history', userId],
    queryFn: async () => {
      const res = await api.get(`/portal-users/${userId}/history`);
      return res.data as { items: CustomerEventEntry[]; total: number };
    },
    staleTime: 10_000,
  });

  const entries = data?.items ?? [];

  if (isLoading) {
    return <div className="p-6 text-sm text-gray-400 dark:text-gray-500">Loading history...</div>;
  }
  if (isError) {
    return (
      <div className="p-6 text-sm text-red-600 dark:text-red-400">Failed to load history.</div>
    );
  }
  if (entries.length === 0) {
    return (
      <div className="p-6 text-sm text-gray-500 dark:text-gray-400 italic">
        No history recorded yet.
      </div>
    );
  }

  return (
    <ol className="divide-y divide-gray-100 dark:divide-gray-800">
      {entries.map((entry) => {
        const label = EVENT_LABELS[entry.event_type] ?? entry.event_type;
        const color = EVENT_COLORS[entry.event_type] ?? 'text-gray-600 dark:text-gray-300';
        const domainLabel = DOMAIN_LABELS[entry.domain] ?? entry.domain;
        const domainColor =
          DOMAIN_COLORS[entry.domain] ??
          'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
        return (
          <li key={`${entry.domain}-${entry.id}`} className="px-6 py-4">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span
                className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${domainColor}`}
              >
                {domainLabel}
              </span>
              <span className={`text-sm font-semibold ${color}`}>{label}</span>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {formatDateTime(entry.created_at)}
              </span>
            </div>
            {entry.notes && (
              <p className="text-sm text-gray-700 dark:text-gray-300">{entry.notes}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
