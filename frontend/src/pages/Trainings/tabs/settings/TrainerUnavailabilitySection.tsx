import React, { useState, useCallback, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import type { TrainerUnavailability } from '../../../../types/training';
import { parseApiError } from '../../../../utils/apiError';
import { ErrorBanner } from '../../../../components/common/ErrorBanner';

const QUERY_KEY = ['trainers'];

/* ─── Trainer Unavailability sub-component ────────────────────── */

const TrainerUnavailabilitySection = React.memo(function TrainerUnavailabilitySection({
  trainerId,
  entries,
}: {
  trainerId: string;
  entries: TrainerUnavailability[];
}) {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const isValid = startDate && endDate && endDate >= startDate;

  const createMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/trainings/trainers/${trainerId}/unavailability`, {
        start_date: startDate,
        end_date: endDate,
        description: description || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      setShowAdd(false);
      setStartDate('');
      setEndDate('');
      setDescription('');
      setError('');
    },
    onError: (err) => setError(parseApiError(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (entryId: string) => {
      await api.delete(`/trainings/trainers/${trainerId}/unavailability/${entryId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err) => setError(parseApiError(err)),
  });

  const handleDelete = useCallback(
    (entryId: string) => {
      deleteMutation.mutate(entryId);
    },
    [deleteMutation]
  );

  const sorted = useMemo(
    () => [...entries].sort((a, b) => a.start_date.localeCompare(b.start_date)),
    [entries]
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Blocked Date Ranges
        </h4>
        {!showAdd && (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Add
          </button>
        )}
      </div>

      {error && <ErrorBanner message={error} />}

      {/* Add form */}
      {showAdd && (
        <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 mb-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md px-2.5 py-1.5 text-sm focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate || undefined}
                className="block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md px-2.5 py-1.5 text-sm focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Vacation, Conference, Sick leave"
              maxLength={255}
              className="block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md px-2.5 py-1.5 text-sm focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          {startDate && endDate && endDate < startDate && (
            <p className="text-xs text-red-600 dark:text-red-400">
              End date must be on or after start date.
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => createMutation.mutate()}
              disabled={!isValid || createMutation.isPending}
              className="px-3 py-1.5 text-xs font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md disabled:opacity-50"
            >
              {createMutation.isPending ? 'Adding...' : 'Add'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAdd(false);
                setStartDate('');
                setEndDate('');
                setDescription('');
                setError('');
              }}
              className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Entries table */}
      {sorted.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400 italic">
          No unavailability entries.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400 text-xs">
                <th className="py-1.5 pr-3 font-medium">Start</th>
                <th className="py-1.5 pr-3 font-medium">End</th>
                <th className="py-1.5 pr-3 font-medium">Description</th>
                <th className="py-1.5 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((e) => (
                <tr key={e.id} className="border-b border-gray-100 dark:border-gray-700/50">
                  <td className="py-1.5 pr-3 text-gray-900 dark:text-gray-100 whitespace-nowrap text-xs">
                    {e.start_date}
                  </td>
                  <td className="py-1.5 pr-3 text-gray-900 dark:text-gray-100 whitespace-nowrap text-xs">
                    {e.end_date}
                  </td>
                  <td className="py-1.5 pr-3 text-gray-700 dark:text-gray-300 text-xs">
                    {e.description || <span className="text-gray-400 dark:text-gray-500">—</span>}
                  </td>
                  <td className="py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => handleDelete(e.id)}
                      className="text-gray-400 hover:text-red-500 dark:hover:text-red-400"
                      title="Delete"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
});

export default TrainerUnavailabilitySection;
