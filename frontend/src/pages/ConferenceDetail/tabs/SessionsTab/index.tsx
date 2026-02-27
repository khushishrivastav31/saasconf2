import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../../config/api';
import type { Conference, EnrichedSession, EnrichedSessionsResponse } from '../../../../types';
import { LoadingSpinner } from '../../../../components/common/LoadingSpinner';
import { useToast } from '../../../../components/Toast';
import { parseApiError } from '../../../../utils/apiError';
import { buildColumns } from './columnDefs';
import { useColumnPreferences } from './useColumnPreferences';
import ColumnPicker from './ColumnPicker';

interface SessionsTabProps {
  conference: Conference;
  isAdmin: boolean;
}

export default function SessionsTab({ conference, isAdmin }: SessionsTabProps) {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'paper' | 'general'>('all');
  const [exporting, setExporting] = useState(false);
  const { showToast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['sessions-enriched', conference.id],
    queryFn: async () => {
      const response = await api.get<EnrichedSessionsResponse>(
        `/conferences/${conference.id}/program/sessions/enriched`
      );
      return response.data;
    },
  });

  const sessions = useMemo(() => data?.items ?? [], [data?.items]);
  const customFields = useMemo(() => data?.custom_fields ?? [], [data?.custom_fields]);

  // Build all available columns (builtin + custom form fields)
  const allColumns = useMemo(() => buildColumns(customFields), [customFields]);

  const { visibleKeys, toggleColumn, resetToDefaults } = useColumnPreferences(
    conference.id,
    allColumns
  );

  // Visible columns in order
  const visibleColumns = useMemo(
    () => allColumns.filter((c) => visibleKeys.includes(c.key)),
    [allColumns, visibleKeys]
  );

  // Apply filters
  const filteredSessions = useMemo(() => {
    let result = sessions;

    if (filterType === 'paper') {
      result = result.filter((s) => s.paper_id !== null);
    } else if (filterType === 'general') {
      result = result.filter((s) => s.is_general_event);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((s) => {
        // Search across all visible column values
        for (const col of visibleColumns) {
          const val = col.getValue(s);
          if (val && val !== '-' && val.toLowerCase().includes(q)) return true;
        }
        // Always search title and paper_title even if not visible
        if (s.title.toLowerCase().includes(q)) return true;
        if (s.paper_title?.toLowerCase().includes(q)) return true;
        return false;
      });
    }

    return result;
  }, [sessions, search, filterType, visibleColumns]);

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const response = await api.get(`/conferences/${conference.id}/program/sessions/export`, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `sessions-${conference.abbreviation || conference.name}.csv`;
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

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  const totalSessions = sessions.length;
  const paperSessions = sessions.filter((s) => s.paper_id).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Sessions</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {totalSessions} total session{totalSessions !== 1 ? 's' : ''}
            {paperSessions > 0 && (
              <span className="ml-1">
                ({paperSessions} with paper{paperSessions !== 1 ? 's' : ''} assigned)
              </span>
            )}
          </p>
        </div>
        {isAdmin && totalSessions > 0 && (
          <button
            onClick={handleExportCsv}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            {exporting ? (
              <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
            )}
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
        )}
      </div>

      {totalSessions === 0 ? (
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
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
            No Sessions Yet
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center max-w-md">
            Sessions will appear here once created in the Program Design tab.
          </p>
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search across visible columns..."
              className="flex-1 max-w-md px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-primary-500 focus:border-primary-500"
            />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as typeof filterType)}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="all">All Sessions</option>
              <option value="paper">With Paper</option>
              <option value="general">General Events</option>
            </select>
            <ColumnPicker
              columns={allColumns}
              visibleKeys={visibleKeys}
              onToggle={toggleColumn}
              onReset={resetToDefaults}
            />
          </div>

          {/* Sessions table */}
          <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  {visibleColumns.map((col) => (
                    <th
                      key={col.key}
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap"
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filteredSessions.map((session) => (
                  <tr key={session.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    {visibleColumns.map((col) => (
                      <td
                        key={col.key}
                        className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400"
                      >
                        {renderCell(col.key, session, col.getValue(session))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredSessions.length === 0 && (
            <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
              No sessions match your filters.
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Render cell content with special formatting for certain columns.
 */
function renderCell(key: string, session: EnrichedSession, value: string) {
  // Session title gets color dot + paper subtitle
  if (key === 'title') {
    return (
      <div className="flex items-center gap-2 max-w-xs">
        {session.color && (
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: session.color }}
          />
        )}
        <div className="min-w-0">
          <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{session.title}</p>
          {session.paper_title && session.paper_title !== session.title && (
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
              Paper: {session.paper_title}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Track column with badge for general events
  if (key === 'track' && session.is_general_event) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded whitespace-nowrap">
        All Tracks
      </span>
    );
  }

  // Day and time columns should not wrap
  if (
    key === 'day' ||
    key === 'time' ||
    key === 'type' ||
    key === 'speaker' ||
    key === 'level' ||
    key === 'paper_status'
  ) {
    return <span className="whitespace-nowrap">{value}</span>;
  }

  // Long text columns get truncation
  if (
    key === 'abstract' ||
    key === 'learning_objectives' ||
    key === 'importance' ||
    key === 'description' ||
    key === 'notes'
  ) {
    return (
      <div className="max-w-xs truncate" title={value !== '-' ? value : undefined}>
        {value}
      </div>
    );
  }

  return value;
}
