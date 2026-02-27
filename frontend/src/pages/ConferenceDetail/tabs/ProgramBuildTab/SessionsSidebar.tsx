import { useState, useMemo } from 'react';
import api from '../../../../config/api';
import { useToast } from '../../../../components/Toast';
import { parseApiError } from '../../../../utils/apiError';
import type { ProgramSession } from '../../../../types';

interface SessionsSidebarProps {
  conferenceId: string;
  sessions: ProgramSession[];
}

function SessionCard({ session }: { session: ProgramSession }) {
  const hasPaper = !!session.paper_id;

  return (
    <div className="p-2.5 hover:bg-gray-50 dark:hover:bg-gray-700">
      <div className="flex items-start gap-1.5">
        {/* Color indicator or paper status dot */}
        <span
          className="mt-1 flex-shrink-0 w-2.5 h-2.5 rounded-full border border-gray-200 dark:border-gray-700"
          style={{
            backgroundColor: session.color || (hasPaper ? '#22c55e' : '#d1d5db'),
          }}
          title={hasPaper ? 'Paper assigned' : 'No paper assigned'}
        />
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2 leading-tight">
            {session.title}
          </h4>

          {session.speaker_name && (
            <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5 truncate">
              {session.speaker_name}
            </p>
          )}

          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {session.session_type_name && (
              <span className="inline-block px-1.5 py-0.5 text-xs bg-primary-100 text-primary-700 rounded">
                {session.session_type_name}
              </span>
            )}
            {session.is_general_event && (
              <span className="inline-block px-1.5 py-0.5 text-xs bg-amber-100 text-amber-700 rounded">
                General
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SessionsSidebar({ conferenceId, sessions }: SessionsSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState('');
  const [paperOnly, setPaperOnly] = useState(false);
  const [exporting, setExporting] = useState(false);
  const { showToast } = useToast();

  // Filter sessions: show all by default, optionally filter to paper sessions only
  const visibleSessions = useMemo(() => {
    let filtered = sessions;

    if (paperOnly) {
      filtered = filtered.filter((s) => s.paper_id !== null);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter((s) => {
        const title = s.title.toLowerCase();
        const speaker = (s.speaker_name || '').toLowerCase();
        return title.includes(q) || speaker.includes(q);
      });
    }

    return filtered;
  }, [sessions, search, paperOnly]);

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const response = await api.get(`/conferences/${conferenceId}/program/sessions/export`, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'sessions.csv';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(url);
      showToast('CSV exported successfully', 'success');
    } catch (error) {
      showToast(parseApiError(error, 'Failed to export sessions'), 'error');
    } finally {
      setExporting(false);
    }
  };

  if (collapsed) {
    return (
      <div className="flex-shrink-0">
        <button
          onClick={() => setCollapsed(false)}
          className="p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700"
          title="Show sessions"
        >
          <svg
            className="w-5 h-5 text-gray-600 dark:text-gray-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 10h16M4 14h16M4 18h16"
            />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="flex-shrink-0 w-72 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm flex flex-col max-h-[calc(100vh-200px)]">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Sessions
          <span className="ml-1.5 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full">
            {visibleSessions.length}
          </span>
        </h3>
        <button
          onClick={() => setCollapsed(true)}
          className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 rounded"
          title="Collapse sidebar"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 5l7 7-7 7M5 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>

      {/* Search */}
      <div className="p-2 border-b border-gray-100 dark:border-gray-700 space-y-1.5">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search sessions..."
          className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-gray-100"
        />
        <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={paperOnly}
            onChange={(e) => setPaperOnly(e.target.checked)}
            className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 h-3.5 w-3.5"
          />
          Paper sessions only
        </label>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        {visibleSessions.length === 0 ? (
          <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
            {search.trim() ? 'No sessions match' : 'No sessions to display'}
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {visibleSessions.map((session) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </div>
        )}
      </div>

      {/* Export button */}
      <div className="p-2 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={handleExportCsv}
          disabled={exporting}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Export sessions to CSV"
        >
          {exporting ? (
            <div className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
          )}
          {exporting ? 'Exporting...' : 'Download CSV'}
        </button>
      </div>
    </div>
  );
}
