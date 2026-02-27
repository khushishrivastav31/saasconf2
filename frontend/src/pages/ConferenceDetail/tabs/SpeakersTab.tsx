import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../config/api';
import { formatDate } from '../../../utils/formatDate';
import type { Conference, ProgramFullGrid } from '../../../types';
import { LoadingSpinner } from '../../../components/common/LoadingSpinner';

interface SpeakersTabProps {
  conference: Conference;
  isAdmin: boolean;
}

interface SpeakerInfo {
  name: string;
  sessions: {
    title: string;
    paperTitle: string | null;
    sessionType: string | null;
    dayName: string;
    time: string;
    trackName: string | null;
  }[];
}

export default function SpeakersTab({ conference }: SpeakersTabProps) {
  const [search, setSearch] = useState('');
  const [expandedSpeaker, setExpandedSpeaker] = useState<string | null>(null);

  const { data: gridData, isLoading } = useQuery({
    queryKey: ['program-full-grid', conference.id],
    queryFn: async () => {
      const response = await api.get<ProgramFullGrid>(`/conferences/${conference.id}/program/grid`);
      return response.data;
    },
  });

  // Aggregate unique speakers from sessions
  const speakers = useMemo(() => {
    if (!gridData?.days) return [];

    const speakerMap = new Map<string, SpeakerInfo>();

    for (const dayGrid of gridData.days) {
      const slotMap = new Map(dayGrid.slots.map((s) => [s.id, s]));
      const trackMap = new Map(dayGrid.tracks.map((t) => [t.id, t]));
      const sortedSlots = [...dayGrid.slots].sort((a, b) =>
        a.start_time.localeCompare(b.start_time)
      );

      for (const session of dayGrid.sessions) {
        if (!session.speaker_name) continue;

        const startSlot = slotMap.get(session.start_slot_id);
        let timeStr = '';
        if (startSlot) {
          const startIdx = sortedSlots.findIndex((s) => s.id === startSlot.id);
          const endIdx = Math.min(startIdx + session.slot_span - 1, sortedSlots.length - 1);
          const endSlot = sortedSlots[endIdx];
          timeStr = `${startSlot.start_time.slice(0, 5)} - ${endSlot?.end_time?.slice(0, 5) || ''}`;
        }

        const track = session.start_track_id ? trackMap.get(session.start_track_id) : null;

        const dayName = dayGrid.day.name || formatDate(dayGrid.day.date);

        const existing = speakerMap.get(session.speaker_name);
        const sessionInfo = {
          title: session.title,
          paperTitle: session.paper_title,
          sessionType: session.session_type_name,
          dayName,
          time: timeStr,
          trackName: track?.name || null,
        };

        if (existing) {
          existing.sessions.push(sessionInfo);
        } else {
          speakerMap.set(session.speaker_name, {
            name: session.speaker_name,
            sessions: [sessionInfo],
          });
        }
      }
    }

    // Sort by name
    return Array.from(speakerMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [gridData]);

  // Apply search filter
  const filteredSpeakers = useMemo(() => {
    if (!search.trim()) return speakers;
    const q = search.toLowerCase();
    return speakers.filter((s) => {
      if (s.name.toLowerCase().includes(q)) return true;
      return s.sessions.some(
        (sess) =>
          sess.title.toLowerCase().includes(q) || (sess.paperTitle || '').toLowerCase().includes(q)
      );
    });
  }, [speakers, search]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Speakers</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          {speakers.length} speaker{speakers.length !== 1 ? 's' : ''} with sessions assigned
        </p>
      </div>

      {speakers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 bg-gray-50 dark:bg-gray-900 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
          <svg
            className="w-12 h-12 text-gray-400 dark:text-gray-500 mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
            No Speakers Yet
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center max-w-md">
            Speakers will appear here once papers are assigned to sessions in the Program Build tab.
          </p>
        </div>
      ) : (
        <>
          {/* Search */}
          <div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by speaker name, session title, or paper..."
              className="w-full max-w-md px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          {/* Speakers list */}
          <div className="space-y-2">
            {filteredSpeakers.map((speaker) => {
              const isExpanded = expandedSpeaker === speaker.name;
              return (
                <div
                  key={speaker.name}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedSpeaker(isExpanded ? null : speaker.name)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-sm font-medium flex-shrink-0">
                        {speaker.name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .toUpperCase()
                          .slice(0, 2)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {speaker.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {speaker.sessions.length} session
                          {speaker.sessions.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    <svg
                      className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-4 py-3">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-gray-500 dark:text-gray-400 uppercase">
                            <th className="text-left pb-2 font-medium">Session</th>
                            <th className="text-left pb-2 font-medium">Day</th>
                            <th className="text-left pb-2 font-medium">Time</th>
                            <th className="text-left pb-2 font-medium">Track</th>
                            <th className="text-left pb-2 font-medium">Type</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                          {speaker.sessions.map((sess, idx) => (
                            <tr key={idx}>
                              <td className="py-2 pr-3">
                                <p className="font-medium text-gray-900 dark:text-gray-100">
                                  {sess.title}
                                </p>
                                {sess.paperTitle && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                    Paper: {sess.paperTitle}
                                  </p>
                                )}
                              </td>
                              <td className="py-2 pr-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                                {sess.dayName}
                              </td>
                              <td className="py-2 pr-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                                {sess.time}
                              </td>
                              <td className="py-2 pr-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                                {sess.trackName || '-'}
                              </td>
                              <td className="py-2 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                                {sess.sessionType || '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {filteredSpeakers.length === 0 && (
            <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
              No speakers match your search.
            </div>
          )}
        </>
      )}
    </div>
  );
}
