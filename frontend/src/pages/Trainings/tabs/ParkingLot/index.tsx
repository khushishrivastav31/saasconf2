/**
 * ParkingLot — Shows parked attendees waiting to be reassigned.
 * Reassignment: picks a future training → cancels old invoice + credit note → new invoice sent.
 */
import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../../config/api';
import { ParkingLotRow } from './ParkingLotRow';
import { ParkingLotReassignModal } from './ParkingLotReassignModal';
import { useParkingLotMutations } from './useParkingLotMutations';
import type { AvailablePlacement, ParkedAttendee } from './types';

export default function ParkingLotTab() {
  const [reassignTarget, setReassignTarget] = useState<ParkedAttendee | null>(null);
  const [search, setSearch] = useState('');

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

  const { deactivate, reassign } = useParkingLotMutations(() => setReassignTarget(null));

  const handleReassign = useCallback((att: ParkedAttendee) => {
    setReassignTarget(att);
  }, []);

  const handleDeactivate = useCallback(
    (att: ParkedAttendee) => {
      if (
        window.confirm(
          `Deactivate ${att.first_name} ${att.last_name}? They will be removed from the parking lot and marked as Inactive. You can reactivate them later from the user view.`
        )
      ) {
        deactivate.mutate(att.id);
      }
    },
    [deactivate]
  );

  const items = data?.items ?? [];
  const q = search.trim().toLowerCase();
  const filteredItems = q
    ? items.filter((att) => {
        const lastTraining = att.history.find(
          (h) =>
            h.event_type === 'registered' ||
            h.event_type === 'offer_assigned' ||
            h.event_type === 'reassigned'
        );
        return (
          `${att.first_name} ${att.last_name}`.toLowerCase().includes(q) ||
          att.email.toLowerCase().includes(q) ||
          (lastTraining?.training_name?.toLowerCase().includes(q) ?? false)
        );
      })
    : items;

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
              {q ? `(${filteredItems.length} of ${items.length})` : `(${items.length})`}
            </span>
          )}
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Attendees waiting to be reassigned to a new training.
        </p>
      </div>

      {items.length > 0 && (
        <div className="mb-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or last training..."
            className="w-full max-w-md px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      )}

      {items.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">
          No parked attendees. All attendees are currently assigned.
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">
          No parked attendees match "{search}".
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((att) => (
            <ParkingLotRow
              key={att.id}
              attendee={att}
              onReassign={handleReassign}
              onDeactivate={handleDeactivate}
              deactivating={deactivate.isPending}
            />
          ))}
        </div>
      )}

      {reassignTarget && (
        <ParkingLotReassignModal
          target={reassignTarget}
          placements={placements ?? []}
          isSubmitting={reassign.isPending}
          onClose={() => setReassignTarget(null)}
          onSubmit={(placementId, keepInvoice) =>
            reassign.mutate({
              attendeeId: reassignTarget.id,
              placementId,
              keepInvoice,
            })
          }
        />
      )}
    </div>
  );
}
