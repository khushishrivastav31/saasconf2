import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../config/api';
import TrainingComposePlacementDialog from '../../../components/trainings/TrainingComposePlacementDialog';
import { formatDateTime } from '../../../utils/formatDate';
import ThreadDetailPane from './MessagesTabAdmin/ThreadDetailPane';
import {
  recipientLabel,
  type ThreadDetailResponse,
  type ThreadListResponse,
} from './MessagesTabAdmin/types';

export default function MessagesTab() {
  const queryClient = useQueryClient();
  const [composeOpen, setComposeOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [filesOnly, setFilesOnly] = useState(false);

  const listQueryKey = useMemo(
    () => ['training-admin-threads', { search, showArchived, unreadOnly, filesOnly }],
    [search, showArchived, unreadOnly, filesOnly]
  );

  const { data: list, isLoading: listLoading } = useQuery({
    queryKey: listQueryKey,
    queryFn: async (): Promise<ThreadListResponse> => {
      const params: Record<string, string | number | boolean> = { page_size: 100 };
      if (showArchived) params.archived = true;
      if (unreadOnly) params.unread_only = true;
      if (filesOnly) params.has_attachments = true;
      if (search.trim()) params.search = search.trim();
      const resp = await api.get<ThreadListResponse>('/trainings/messaging/threads', { params });
      return resp.data;
    },
    staleTime: 15_000,
  });

  // Auto-pick the first thread when one isn't already selected.
  useEffect(() => {
    if (selectedId == null && list?.items?.length) {
      setSelectedId(list.items[0].id);
    }
  }, [list, selectedId]);

  const { data: detail } = useQuery({
    queryKey: ['training-admin-thread', selectedId],
    queryFn: async (): Promise<ThreadDetailResponse> => {
      const resp = await api.get<ThreadDetailResponse>(
        `/trainings/messaging/threads/${selectedId}`
      );
      return resp.data;
    },
    enabled: !!selectedId,
    staleTime: 5_000,
  });

  // Mark-as-read whenever a thread is opened.
  useEffect(() => {
    if (!selectedId) return;
    api
      .post(`/trainings/messaging/threads/${selectedId}/read`)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['training-admin-threads'] });
      })
      .catch(() => {
        /* non-fatal */
      });
  }, [selectedId, queryClient]);

  const items = list?.items ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Messages{' '}
          <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
            ({list?.total ?? 0})
          </span>
        </h2>
        <button
          type="button"
          onClick={() => setComposeOpen(true)}
          className="inline-flex items-center gap-1 px-4 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md"
        >
          + Compose
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setShowArchived((v) => !v)}
          className={chipClass(showArchived)}
        >
          Archived
        </button>
        <button
          type="button"
          onClick={() => setFilesOnly((v) => !v)}
          className={chipClass(filesOnly)}
        >
          📎 Files
        </button>
        <button
          type="button"
          onClick={() => setUnreadOnly((v) => !v)}
          className={chipClass(unreadOnly)}
        >
          • Unread
        </button>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search messages…"
          className="ml-auto w-64 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      <div className="flex gap-0 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-900 min-h-[560px]">
        <div className="w-1/3 min-w-[260px] border-r border-gray-200 dark:border-gray-700 overflow-y-auto max-h-[calc(100vh-260px)]">
          {listLoading ? (
            <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">Loading…</div>
          ) : items.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">
              {showArchived ? 'No archived messages.' : 'No messages yet.'}
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {items.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(t.id)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                      selectedId === t.id
                        ? 'bg-blue-50 dark:bg-blue-900/30 border-l-2 border-l-blue-600'
                        : t.unread
                          ? 'bg-blue-50/40 dark:bg-blue-900/20'
                          : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span
                        className={`truncate text-sm ${
                          t.unread
                            ? 'font-semibold text-gray-900 dark:text-gray-100'
                            : 'text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {recipientLabel(t)}
                      </span>
                      <span className="text-[11px] text-gray-400 dark:text-gray-500 flex-shrink-0">
                        {formatDateTime(t.last_message_at)}
                      </span>
                    </div>
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {t.subject}
                      {t.has_attachments && (
                        <span className="ml-1 text-gray-400 dark:text-gray-500">📎</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {t.last_message_preview}
                    </div>
                    {t.domain_entity_name && (
                      <div className="text-[11px] text-gray-400 dark:text-gray-500 truncate mt-0.5">
                        {t.domain_entity_name}
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          {!selectedId || !detail ? (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-500 dark:text-gray-400 px-6 py-12">
              Select a message to view it.
            </div>
          ) : (
            <ThreadDetailPane detail={detail} />
          )}
        </div>
      </div>

      {composeOpen && (
        <TrainingComposePlacementDialog open={composeOpen} onClose={() => setComposeOpen(false)} />
      )}
    </div>
  );
}

function chipClass(active: boolean): string {
  return `text-xs px-2.5 py-1 rounded-full border ${
    active
      ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-300'
      : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
  }`;
}
