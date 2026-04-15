import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../../config/api';
import TrainerMonthCalendar from './TrainerMonthCalendar';

const MONTH_NAMES = [
  '',
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export interface ScheduleItem {
  assignment_id: string;
  placement_id: string;
  training_id: string;
  training_name: string;
  start_date: string;
  location_name: string | null;
  location_city: string | null;
  placement_type: string;
  customer_name: string | null;
  attendee_count: number;
  training_duration: number;
  training_color: string | null;
  training_slug: string | null;
  year: number;
  month: number;
}

/* ─── Trainer Schedule sub-component ─────────────────────────── */

const TrainerScheduleSection = React.memo(function TrainerScheduleSection({
  trainerId,
}: {
  trainerId: string;
}) {
  const [yearFilter, setYearFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');

  const { data: schedule = [], isLoading } = useQuery<ScheduleItem[]>({
    queryKey: ['trainer-schedule', trainerId, yearFilter],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (yearFilter) params.year = yearFilter;
      const res = await api.get(`/trainings/trainers/${trainerId}/schedule`, { params });
      return res.data;
    },
  });

  // Get unique years for the filter dropdown
  const availableYears = useMemo(() => {
    const years = new Set(schedule.map((s) => s.year));
    return [...years].sort((a, b) => b - a);
  }, [schedule]);

  // Apply search filter client-side
  const filtered = useMemo(() => {
    if (!search) return schedule;
    const q = search.toLowerCase();
    return schedule.filter(
      (s) =>
        s.training_name.toLowerCase().includes(q) ||
        s.location_name?.toLowerCase().includes(q) ||
        s.location_city?.toLowerCase().includes(q)
    );
  }, [schedule, search]);

  // Group by month
  const grouped = useMemo(() => {
    const groups: Record<string, ScheduleItem[]> = {};
    for (const item of filtered) {
      const key = `${item.year}-${String(item.month).padStart(2, '0')}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search trainings..."
          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm dark:bg-gray-800 dark:text-gray-100 focus:ring-primary-500 focus:border-primary-500"
        />
        {viewMode === 'list' && (
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="">All years</option>
            {availableYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        )}
        <div className="flex items-center border border-gray-300 dark:border-gray-600 rounded-md overflow-hidden">
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 ${
              viewMode === 'list'
                ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
            title="List view"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
              />
            </svg>
          </button>
          <button
            onClick={() => setViewMode('calendar')}
            className={`p-2 ${
              viewMode === 'calendar'
                ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
            title="Calendar view"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5m-9-6h.008v.008H12v-.008ZM12 15h.008v.008H12V15Zm0 2.25h.008v.008H12v-.008ZM9.75 15h.008v.008H9.75V15Zm0 2.25h.008v.008H9.75v-.008ZM7.5 15h.008v.008H7.5V15Zm0 2.25h.008v.008H7.5v-.008Zm6.75-4.5h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V15Zm0 2.25h.008v.008h-.008v-.008Zm2.25-4.5h.008v.008H16.5v-.008Zm0 2.25h.008v.008H16.5V15Z"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Calendar view */}
      {viewMode === 'calendar' ? (
        <TrainerMonthCalendar items={filtered} />
      ) : (
        <>
          {/* Schedule grouped by month */}
          {grouped.length === 0 ? (
            <div className="text-center py-8 text-gray-400 dark:text-gray-500">
              <p className="text-sm">No assigned trainings found.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {grouped.map(([key, items]) => {
                const [yr, mo] = key.split('-').map(Number);
                return (
                  <div key={key}>
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      {MONTH_NAMES[mo]} {yr}
                    </h4>
                    <div className="space-y-1.5">
                      {items.map((item) => (
                        <div
                          key={item.assignment_id}
                          className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-900 rounded-md"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate flex items-center gap-1.5">
                              {item.training_name}
                              {item.placement_type && item.placement_type !== 'open' && (
                                <span
                                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                    item.placement_type === 'inhouse'
                                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                                      : 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300'
                                  }`}
                                >
                                  {item.placement_type === 'inhouse' ? 'Inhouse' : 'Hybrid'}
                                </span>
                              )}
                              {item.customer_name && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                                  {item.customer_name}
                                </span>
                              )}
                              {item.attendee_count > 0 && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                                  {item.attendee_count}{' '}
                                  {item.attendee_count === 1 ? 'attendee' : 'attendees'}
                                </span>
                              )}
                            </p>
                            {(item.location_name || item.location_city) && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                {[item.location_name, item.location_city]
                                  .filter(Boolean)
                                  .join(', ')}
                              </p>
                            )}
                          </div>
                          <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0 ml-3 font-mono">
                            {new Date(item.start_date).toLocaleDateString('en-GB', {
                              day: '2-digit',
                              month: 'short',
                            })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-xs text-gray-400 dark:text-gray-500">
            {filtered.length} training{filtered.length !== 1 ? 's' : ''} assigned
          </p>
        </>
      )}
    </div>
  );
});

export default TrainerScheduleSection;
