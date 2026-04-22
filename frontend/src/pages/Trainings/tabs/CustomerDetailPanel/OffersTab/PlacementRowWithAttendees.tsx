import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../../../config/api';
import { queryKeys } from '../../../../../config/queryKeys';
import type { OfferAttendee } from '../../../../../types/training';
import AttendeeRow from './AttendeeRow';
import { PLACEMENT_TYPE_COLORS } from './constants';

// ---------------------------------------------------------------------------
// Expandable placement row with attendees
// ---------------------------------------------------------------------------

const PlacementRowWithAttendees = React.memo(function PlacementRowWithAttendees({
  placement,
  offerId,
  offerStatus,
  offerAttendeeLimit,
  totalAttendeeCount,
  onRemove,
}: {
  placement: {
    id: string;
    training_name: string;
    training_slug: string | null;
    start_date: string;
    location_name: string | null;
    placement_type: string;
  };
  offerId: string;
  offerStatus: string;
  offerAttendeeLimit: number | null;
  totalAttendeeCount: number;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showNewRow, setShowNewRow] = useState(false);

  // Fetch available languages for exam language dropdown
  const { data: languagesData } = useQuery<{ items: Array<{ id: string; name: string }> }>({
    queryKey: ['training-languages'],
    queryFn: async () => {
      const res = await api.get('/trainings/languages');
      return res.data;
    },
    staleTime: 60_000,
  });
  const languages = useMemo(() => languagesData?.items ?? [], [languagesData]);

  const { data: attendeesData } = useQuery<OfferAttendee[]>({
    queryKey: queryKeys.offerAttendees(offerId, placement.id),
    queryFn: async () => {
      const res = await api.get(
        `/trainings/offers/${offerId}/attendees?placement_id=${placement.id}`
      );
      return res.data;
    },
    enabled: expanded,
    staleTime: 5_000,
  });
  const attendees = useMemo(() => attendeesData ?? [], [attendeesData]);

  return (
    <>
      <tr
        className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <td className="px-4 py-2 text-gray-400">
          <svg
            className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </td>
        <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">
          {placement.training_slug || placement.training_name}
          {attendees.length > 0 && (
            <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              {attendees.length} attendee{attendees.length !== 1 ? 's' : ''}
            </span>
          )}
        </td>
        <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
          {new Date(placement.start_date).toLocaleDateString()}
        </td>
        <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
          {placement.location_name || '-'}
        </td>
        <td className="px-4 py-2">
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${PLACEMENT_TYPE_COLORS[placement.placement_type] || PLACEMENT_TYPE_COLORS.open}`}
          >
            {placement.placement_type}
          </span>
        </td>
        <td className="px-4 py-2 text-right">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
            title="Remove from offer"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} className="px-0 py-0">
            <div className="bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700">
              {attendees.length > 0 || showNewRow ? (
                <table className="min-w-full">
                  <thead className="sr-only">
                    <tr>
                      <th colSpan={4}>Attendee</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {attendees.map((a) => (
                      <AttendeeRow
                        key={a.id}
                        attendee={a}
                        offerId={offerId}
                        offerStatus={offerStatus}
                        placementId={placement.id}
                        languages={languages}
                      />
                    ))}
                    {showNewRow && (
                      <AttendeeRow
                        attendee={null}
                        offerId={offerId}
                        offerStatus={offerStatus}
                        placementId={placement.id}
                        languages={languages}
                        isNew
                        onCancelNew={() => setShowNewRow(false)}
                      />
                    )}
                  </tbody>
                </table>
              ) : (
                <p className="text-xs text-gray-400 dark:text-gray-500 py-3 text-center">
                  No attendees yet.
                </p>
              )}
              <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowNewRow(true)}
                  disabled={showNewRow}
                  className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  + Add Attendee
                </button>
                {offerAttendeeLimit != null && totalAttendeeCount > offerAttendeeLimit && (
                  <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                    Warning: {totalAttendeeCount} attendees exceed the offer limit of{' '}
                    {offerAttendeeLimit}
                  </span>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
});

export default PlacementRowWithAttendees;
