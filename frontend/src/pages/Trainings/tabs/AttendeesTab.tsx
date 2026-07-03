/**
 * AttendeesTab — Unified view of all training attendees with history.
 */
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../config/api';
import { useToast } from '../../../components/Toast';
import type { Attendee } from './attendeeShared';
import AttendeeRow from './AttendeeRow';

export default function AttendeesTab() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [parkDialog, setParkDialog] = useState<Attendee | null>(null);
  const [parkReason, setParkReason] = useState('');
  const [page, setPage] = useState(1);
  const [showPast, setShowPast] = useState(false);

  const params = useMemo(() => {
    const p: Record<string, string> = { page: String(page), per_page: '50' };
    if (search) p.search = search;
    if (statusFilter) p.status = statusFilter;
    return p;
  }, [search, statusFilter, page]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['training-attendees', params],
    queryFn: async () => {
      const res = await api.get('/trainings/attendees', { params });
      return res.data as { items: Attendee[]; total: number; page: number; per_page: number };
    },
    staleTime: 30_000,
  });

  const allItems = useMemo(() => data?.items ?? [], [data]);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const items = useMemo(
    () =>
      showPast
        ? allItems
        : allItems.filter(
            (att) =>
              // Always show parked attendees and those with no training date
              att.status === 'parked' ||
              !att.current_training_date ||
              att.current_training_date >= today
          ),
    [allItems, showPast, today]
  );
  const hiddenCount = allItems.length - items.length;
  const total = data?.total ?? 0;
  const totalPages = data ? Math.ceil(data.total / data.per_page) : 0;

  const parkMutation = useMutation({
    mutationFn: ({ attendeeId, reason }: { attendeeId: string; reason: string }) =>
      api.post(`/trainings/attendees/${attendeeId}/park`, {
        reason: reason || null,
        source_type: 'registration',
        source_id: attendeeId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-attendees'] });
      queryClient.invalidateQueries({ queryKey: ['training-registrations'] });
      showToast('Attendee parked', 'success');
      setParkDialog(null);
      setParkReason('');
    },
    onError: () => showToast('Failed to park attendee', 'error'),
  });

  const cancelMutation = useMutation({
    mutationFn: (attendeeId: string) => api.post(`/trainings/attendees/${attendeeId}/cancel`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-attendees'] });
      queryClient.invalidateQueries({ queryKey: ['training-registrations'] });
      queryClient.invalidateQueries({ queryKey: ['training-invoices'] });
      showToast('Booking cancelled — invoice voided, credit note sent.', 'success');
    },
    onError: (err: unknown) => {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail ??
        'Failed to cancel registration';
      showToast(detail, 'error');
    },
  });

  const handleCancel = (att: Attendee) => {
    if (
      window.confirm(
        `Cancel the booking for ${att.first_name} ${att.last_name}?\n\n` +
          'The invoice will be voided, a credit note will be sent to the customer, ' +
          'and the attendee will stay active but not tied to any training.'
      )
    ) {
      cancelMutation.mutate(att.id);
    }
  };

  const inputCls =
    'px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 dark:text-gray-100';

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Attendees
          {total > 0 && (
            <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
              ({total})
            </span>
          )}
        </h2>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by name, email..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className={`flex-1 min-w-50 ${inputCls}`}
        />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className={inputCls}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="parked">Parked</option>
        </select>
        <label className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showPast}
            onChange={(e) => setShowPast(e.target.checked)}
            className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
          />
          Show past{hiddenCount > 0 ? ` (${hiddenCount})` : ''}
        </label>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-gray-400">Loading...</div>
      ) : isError ? (
        <div className="text-center py-8 text-red-500 dark:text-red-400">
          Failed to load data. Please try again.
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">
          No attendees found.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <th className="px-3 py-2 w-8" />
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                    Name
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                    Email
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                    Status
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                    Current Training
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {items.map((att) => {
                  const isExpanded = expandedId === att.id;
                  return (
                    <AttendeeRow
                      onCancel={() => handleCancel(att)}
                      cancelling={cancelMutation.isPending}
                      key={att.id}
                      att={att}
                      expanded={isExpanded}
                      onToggle={() => setExpandedId(isExpanded ? null : att.id)}
                      onPark={() => setParkDialog(att)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="px-3 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="px-3 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Park dialog */}
      {parkDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setParkDialog(null);
              setParkReason('');
            }
          }}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-sm w-full p-6"
            role="dialog"
            aria-modal="true"
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Park Attendee
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              {parkDialog.first_name} {parkDialog.last_name} will be removed from their current
              training and placed in the parking lot.
            </p>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Reason (optional)
            </label>
            <textarea
              value={parkReason}
              onChange={(e) => setParkReason(e.target.value)}
              rows={2}
              className={`w-full ${inputCls}`}
              placeholder="e.g. Schedule conflict"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => {
                  setParkDialog(null);
                  setParkReason('');
                }}
                className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  parkMutation.mutate({ attendeeId: parkDialog.id, reason: parkReason })
                }
                disabled={parkMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg disabled:opacity-40"
              >
                {parkMutation.isPending ? 'Parking...' : 'Park Attendee'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
