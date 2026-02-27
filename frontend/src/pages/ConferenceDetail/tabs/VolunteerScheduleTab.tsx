import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../config/api';
import type { Conference } from '../../../types';
import type {
  VolunteerScheduleListResponse,
  UnassignedSessionsListResponse,
} from '../../../types/volunteer';
import { LoadingSpinner } from '../../../components/common/LoadingSpinner';

interface Props {
  conference: Conference;
  isAdmin: boolean;
}

export default function VolunteerScheduleTab({ conference }: Props) {
  const [expandedVolunteers, setExpandedVolunteers] = useState<Set<string>>(new Set());
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);

  // Fetch all schedules
  const { data: scheduleData, isLoading } = useQuery({
    queryKey: ['volunteer-schedule', conference.id],
    queryFn: async () => {
      const res = await api.get<VolunteerScheduleListResponse>(
        `/conferences/${conference.id}/volunteer-tasks/volunteer-schedule`
      );
      return res.data;
    },
  });

  // Fetch unassigned sessions
  const { data: unassignedData } = useQuery({
    queryKey: ['volunteer-schedule-unassigned', conference.id],
    queryFn: async () => {
      const res = await api.get<UnassignedSessionsListResponse>(
        `/conferences/${conference.id}/volunteer-tasks/volunteer-schedule/unassigned`
      );
      return res.data;
    },
  });

  const toggleVolunteer = (volunteerId: string) => {
    setExpandedVolunteers((prev) => {
      const next = new Set(prev);
      if (next.has(volunteerId)) next.delete(volunteerId);
      else next.add(volunteerId);
      return next;
    });
  };

  const downloadPdf = async (volunteerId: string) => {
    try {
      setDownloadingId(volunteerId);
      const response = await api.get(
        `/conferences/${conference.id}/volunteer-tasks/volunteer-schedule/${volunteerId}/pdf`,
        { responseType: 'blob' }
      );
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `volunteer_schedule.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Silently handle error
    } finally {
      setDownloadingId(null);
    }
  };

  const downloadAllPdfs = async () => {
    try {
      setDownloadingAll(true);
      const response = await api.get(
        `/conferences/${conference.id}/volunteer-tasks/volunteer-schedules-pdf`,
        { responseType: 'blob' }
      );
      const blob = new Blob([response.data], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `volunteer_schedules.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Silently handle error
    } finally {
      setDownloadingAll(false);
    }
  };

  if (isLoading) return <LoadingSpinner />;

  const schedules = scheduleData?.items ?? [];
  const unassigned = unassignedData?.items ?? [];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
            Volunteer Schedule
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            View each volunteer's assigned sessions and export schedules as PDF.
          </p>
        </div>
        {schedules.length > 0 && (
          <button
            onClick={downloadAllPdfs}
            disabled={downloadingAll}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm rounded-md hover:bg-primary-700 disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            {downloadingAll ? 'Downloading...' : 'Export All PDFs'}
          </button>
        )}
      </div>

      {schedules.length === 0 && unassigned.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <p className="text-lg font-medium">No volunteer schedules available</p>
          <p className="mt-1">Assign volunteers to tasks in the Volunteer Assignment tab first.</p>
        </div>
      ) : (
        <>
          {/* Volunteer list */}
          <div className="space-y-2 mb-6">
            {schedules.map((schedule) => {
              const isExpanded = expandedVolunteers.has(schedule.volunteer_id);

              // Group entries by day
              const dayGroups: Record<string, typeof schedule.entries> = {};
              for (const entry of schedule.entries) {
                const key = entry.day_name;
                if (!dayGroups[key]) dayGroups[key] = [];
                dayGroups[key].push(entry);
              }

              return (
                <div
                  key={schedule.volunteer_id}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                >
                  {/* Volunteer header */}
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800">
                    <button
                      onClick={() => toggleVolunteer(schedule.volunteer_id)}
                      className="flex items-center gap-3 flex-1"
                    >
                      <svg
                        className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                      <div
                        className="w-4 h-4 rounded-full border border-gray-300 dark:border-gray-500"
                        style={{ backgroundColor: schedule.volunteer_color || '#9CA3AF' }}
                      />
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {schedule.volunteer_name}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        ({schedule.entries.length} session{schedule.entries.length !== 1 ? 's' : ''}
                        )
                      </span>
                    </button>
                    <button
                      onClick={() => downloadPdf(schedule.volunteer_id)}
                      disabled={downloadingId === schedule.volunteer_id}
                      className="flex items-center gap-1 px-3 py-1 text-xs text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-md transition-colors"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                        />
                      </svg>
                      {downloadingId === schedule.volunteer_id ? 'Downloading...' : 'PDF'}
                    </button>
                  </div>

                  {/* Expanded schedule */}
                  {isExpanded && (
                    <div className="bg-white dark:bg-gray-800 px-4 py-3">
                      {schedule.entries.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                          No assignments yet.
                        </p>
                      ) : (
                        Object.entries(dayGroups).map(([dayName, entries]) => (
                          <div key={dayName} className="mb-4 last:mb-0">
                            <h5 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                              {dayName}
                            </h5>
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                                    <th className="pb-1 pr-4 font-medium">Time</th>
                                    <th className="pb-1 pr-4 font-medium">Session</th>
                                    <th className="pb-1 pr-4 font-medium">Track</th>
                                    <th className="pb-1 font-medium">Task</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {entries.map((entry, idx) => (
                                    <tr
                                      key={idx}
                                      className="border-b border-gray-100 dark:border-gray-700 last:border-0"
                                    >
                                      <td className="py-1.5 pr-4 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                                        {entry.start_time}&ndash;{entry.end_time}
                                      </td>
                                      <td className="py-1.5 pr-4 text-gray-900 dark:text-gray-100">
                                        {entry.session_title}
                                      </td>
                                      <td className="py-1.5 pr-4 text-gray-600 dark:text-gray-400">
                                        {entry.track_name || '\u2013'}
                                      </td>
                                      <td className="py-1.5">
                                        <span className="inline-flex px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                                          {entry.task_name}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Unassigned sessions */}
          {unassigned.length > 0 && (
            <div className="mt-6">
              <h4 className="text-sm font-semibold text-amber-600 dark:text-amber-400 mb-3 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                Unassigned Sessions ({unassigned.length})
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <thead>
                    <tr className="bg-amber-50 dark:bg-amber-900/10 text-left text-xs text-gray-600 dark:text-gray-400">
                      <th className="px-3 py-2 font-medium">Session</th>
                      <th className="px-3 py-2 font-medium">Day</th>
                      <th className="px-3 py-2 font-medium">Time</th>
                      <th className="px-3 py-2 font-medium">Track</th>
                      <th className="px-3 py-2 font-medium">Task</th>
                      <th className="px-3 py-2 font-medium">Volunteers</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {unassigned.map((item) => (
                      <tr
                        key={item.session_volunteer_task_id}
                        className="bg-white dark:bg-gray-800"
                      >
                        <td className="px-3 py-2 text-gray-900 dark:text-gray-100">
                          {item.session_title}
                        </td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-400">
                          {item.day_name}
                        </td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                          {item.start_time}&ndash;{item.end_time}
                        </td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-400">
                          {item.track_name || '\u2013'}
                        </td>
                        <td className="px-3 py-2">
                          <span className="inline-flex px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                            {item.task_name}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className="text-amber-600 dark:text-amber-400 font-medium">
                            {item.assigned_count}/{item.required_count}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
