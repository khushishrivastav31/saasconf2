/**
 * ParkingLotTab — Shows parked attendees waiting to be reassigned.
 * Reassignment: picks a future training → cancels old invoice + credit note → new invoice sent.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../config/api';
import { useToast } from '../../../components/Toast';

interface HistoryEvent {
  event_type: string;
  training_name: string;
  notes: string | null;
  created_at: string | null;
}

interface ParkedAttendee {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  status: string;
  notes: string | null;
  history: HistoryEvent[];
}

interface AvailablePlacement {
  id: string;
  training_name: string;
  start_date: string | null;
  placement_type: string;
  is_guaranteed: boolean;
  language: string | null;
}

const formatDate = (d: string | null) =>
  d
    ? new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—';

const formatPlacementDate = (d: string | null) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('de-DE') : '—';

export default function ParkingLotTab() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [reassignTarget, setReassignTarget] = useState<ParkedAttendee | null>(null);
  const [selectedPlacement, setSelectedPlacement] = useState('');
  const [placementSearch, setPlacementSearch] = useState('');
  const [filterGuaranteed, setFilterGuaranteed] = useState(false);
  const [filterType, setFilterType] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['training-attendees', { status: 'parked', per_page: '200' }],
    queryFn: async () => {
      const res = await api.get('/trainings/attendees', {
        params: { status: 'parked', per_page: '200' },
      });
      return res.data as { items: ParkedAttendee[]; total: number };
    },
    staleTime: 30_000,
  });

  const { data: placements } = useQuery({
    queryKey: ['available-placements-reassign'],
    queryFn: async () => {
      const res = await api.get('/trainings/attendees/available-placements');
      return res.data as AvailablePlacement[];
    },
    enabled: !!reassignTarget,
    staleTime: 60_000,
  });

  const reassignMutation = useMutation({
    mutationFn: ({ attendeeId, placementId }: { attendeeId: string; placementId: string }) =>
      api.post(`/trainings/attendees/${attendeeId}/reassign`, { placement_id: placementId }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['training-attendees'] });
      queryClient.invalidateQueries({ queryKey: ['training-registrations'] });
      queryClient.invalidateQueries({ queryKey: ['training-invoices'] });
      const d = res.data;
      const msg = d.new_invoice_id
        ? 'Attendee reassigned — old invoice cancelled, new invoice sent'
        : 'Attendee reassigned to new training';
      showToast(msg, 'success');
      setReassignTarget(null);
      setSelectedPlacement('');
    },
    onError: () => showToast('Failed to reassign attendee', 'error'),
  });

  const items = data?.items ?? [];

  if (isLoading) return <div className="text-center py-8 text-gray-400">Loading...</div>;
  if (isError)
    return (
      <div className="text-center py-8 text-red-500 dark:text-red-400">
        Failed to load data. Please try again.
      </div>
    );

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Parking Lot
          {items.length > 0 && (
            <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
              ({items.length})
            </span>
          )}
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Attendees waiting to be reassigned to a new training.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">
          No parked attendees. All attendees are currently assigned.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((att) => {
            const parkedEvent = att.history.find((h) => h.event_type === 'parked');
            const lastTraining = att.history.find(
              (h) =>
                h.event_type === 'registered' ||
                h.event_type === 'offer_assigned' ||
                h.event_type === 'reassigned'
            );

            return (
              <div
                key={att.id}
                className="border border-amber-200 dark:border-amber-800 rounded-lg p-4 bg-amber-50/50 dark:bg-amber-900/10"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {att.first_name} {att.last_name}
                    </h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{att.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                        Parked
                      </span>
                      {parkedEvent?.created_at && (
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          since {formatDate(parkedEvent.created_at)}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setReassignTarget(att);
                        setSelectedPlacement('');
                        setPlacementSearch('');
                        setFilterGuaranteed(false);
                        setFilterType('');
                      }}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors"
                    >
                      Reassign to Training
                    </button>
                  </div>
                </div>
                {parkedEvent?.notes && (
                  <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                    <span className="font-medium">Reason:</span> {parkedEvent.notes}
                  </p>
                )}
                {lastTraining && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Last training: {lastTraining.training_name}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Reassign modal with placement picker */}
      {reassignTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setReassignTarget(null);
          }}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6"
            role="dialog"
            aria-modal="true"
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
              Reassign Attendee
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              <strong>
                {reassignTarget.first_name} {reassignTarget.last_name}
              </strong>{' '}
              will be assigned to the selected training. The old invoice will be cancelled (credit
              note created) and a new invoice will be sent automatically.
            </p>

            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Select Training
            </label>
            <input
              type="text"
              placeholder="Search training name..."
              value={placementSearch}
              onChange={(e) => setPlacementSearch(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 dark:text-gray-100 mb-2"
            />
            <div className="flex gap-2 mb-2">
              <label className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={filterGuaranteed}
                  onChange={(e) => setFilterGuaranteed(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                />
                Guaranteed only
              </label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="px-2 py-0.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-100"
              >
                <option value="">All types</option>
                <option value="open">Open</option>
                <option value="inhouse">Inhouse</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>
            <div className="max-h-52 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-md divide-y divide-gray-100 dark:divide-gray-800 mb-4">
              {(() => {
                const filtered = (placements ?? []).filter((p) => {
                  if (
                    placementSearch &&
                    !p.training_name.toLowerCase().includes(placementSearch.toLowerCase())
                  )
                    return false;
                  if (filterGuaranteed && !p.is_guaranteed) return false;
                  if (filterType && p.placement_type !== filterType) return false;
                  return true;
                });
                return filtered.length === 0 ? (
                  <div className="px-3 py-4 text-sm text-gray-400 text-center">
                    No trainings found
                  </div>
                ) : (
                  filtered.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPlacement(p.id)}
                      className={`w-full text-left px-3 py-2.5 text-sm transition-colors ${
                        selectedPlacement === p.id
                          ? 'bg-primary-50 dark:bg-primary-900/20 border-l-2 border-primary-500'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {p.training_name}
                        </span>
                        {p.is_guaranteed && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                            Guaranteed
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {formatPlacementDate(p.start_date)}
                        </span>
                        <span className="text-[10px] text-gray-400 capitalize">
                          {p.placement_type}
                        </span>
                        {p.language && (
                          <span className="text-[10px] text-gray-400">{p.language}</span>
                        )}
                      </div>
                    </button>
                  ))
                );
              })()}
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setReassignTarget(null);
                  setSelectedPlacement('');
                  setPlacementSearch('');
                }}
                className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  reassignMutation.mutate({
                    attendeeId: reassignTarget.id,
                    placementId: selectedPlacement,
                  })
                }
                disabled={!selectedPlacement || reassignMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-40"
              >
                {reassignMutation.isPending ? 'Reassigning...' : 'Reassign & Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
